import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { S3StorageAdapter } from "./s3";

/**
 * Document storage (docs/OPERATIONS.md#file-security).
 *
 * Files never live under public/ or any static folder. The application addresses them by an opaque
 * storage key (`<org>/<yyyy>/<uuid>`); the key is never sent to the browser, and every download goes
 * through an authorised route handler. The local adapter is for development / single-server installs;
 * an S3-compatible adapter can implement the same interface later (not configured — not faked).
 */
export interface DocumentStorageAdapter {
  readonly kind: string;
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

const KEY_RE = /^[a-z0-9]{6,40}\/\d{4}\/[0-9a-f-]{36}$/;

class LocalSecureStorage implements DocumentStorageAdapter {
  readonly kind = "local";
  constructor(private root: string) {}
  private file(key: string) {
    // the key format is fixed server-side; this also blocks any traversal attempt
    if (!KEY_RE.test(key)) throw new Error("invalid storage key");
    return path.join(this.root, ...key.split("/"));
  }
  async put(key: string, data: Buffer) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    // "wx": never overwrite an existing object (versions are immutable)
    await writeFile(f, data, { flag: "wx", mode: 0o600 });
  }
  get(key: string) {
    return readFile(this.file(key));
  }
  async remove(key: string) {
    await unlink(this.file(key)).catch(() => undefined);
  }
}

const adapters = new Map<string, DocumentStorageAdapter>();
/** Driver for NEW uploads: DOCUMENT_STORAGE = local (default) | s3. Existing versions keep the driver they were written with. */
export const activeDriver = () => (process.env.DOCUMENT_STORAGE ?? "local").trim().toLowerCase();

/** Adapter by driver name. S3 needs S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (env / secret manager). */
export function storageFor(driver = activeDriver()): DocumentStorageAdapter {
  const hit = adapters.get(driver);
  if (hit) return hit;
  let a: DocumentStorageAdapter;
  if (driver === "local") a = new LocalSecureStorage(process.env.DOCUMENT_STORAGE_DIR ?? path.join(process.cwd(), ".local", "storage", "documents"));
  else if (driver === "s3") {
    const e = process.env;
    if (!e.S3_ENDPOINT || !e.S3_REGION || !e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) throw new Error("S3 document storage is not configured (S3_* environment variables)");
    a = new S3StorageAdapter({ endpoint: e.S3_ENDPOINT, region: e.S3_REGION, bucket: e.S3_BUCKET, accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY, forcePathStyle: e.S3_FORCE_PATH_STYLE !== "false" });
  } else throw new Error(`Document storage driver "${driver}" is not supported`);
  adapters.set(driver, a);
  return a;
}
export const documentStorage = () => storageFor();
/** tests: point a driver at a test adapter (null resets) */
export const setDocumentStorage = (a: DocumentStorageAdapter | null, driver = "local") => (a ? adapters.set(driver, a) : adapters.delete(driver));
export const LocalStorageForTests = LocalSecureStorage;

export const newStorageKey = (organizationId: string) => `${organizationId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40)}/${new Date().getUTCFullYear()}/${randomUUID()}`;
export const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

// Malware scanning: see ./scanner.ts (Phase 11 boundary — adapters, policy, worker job).

// --- upload validation ------------------------------------------------------------------------

type Rule = { mime: string; sniff: (b: Buffer) => boolean };
const startsWith = (b: Buffer, sig: number[]) => sig.every((x, i) => b[i] === x);
const zip = (b: Buffer) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]);
const text = (b: Buffer) => !b.includes(0) && Buffer.from(b.toString("utf8"), "utf8").equals(b);

/** Allow-list (no HTML, SVG, scripts, archives or executables). */
export const ALLOWED_TYPES: Record<string, Rule> = {
  pdf: { mime: "application/pdf", sniff: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  png: { mime: "image/png", sniff: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  jpg: { mime: "image/jpeg", sniff: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  jpeg: { mime: "image/jpeg", sniff: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  webp: { mime: "image/webp", sniff: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sniff: zip },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sniff: zip },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", sniff: zip },
  txt: { mime: "text/plain", sniff: text },
  csv: { mime: "text/csv", sniff: text }
};
export const MAX_DOCUMENT_BYTES = Number(process.env.DOCUMENT_MAX_BYTES ?? 10 * 1024 * 1024);
export const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

export function validateUpload(originalName: string, declaredMime: string, data: Buffer) {
  const base = path.basename(originalName.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "").trim().slice(0, 200);
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  const rule = ALLOWED_TYPES[ext];
  if (!rule) return { error: "FILE_TYPE_NOT_ALLOWED" as const };
  if (!data.length) return { error: "FILE_EMPTY" as const };
  if (data.length > MAX_DOCUMENT_BYTES) return { error: "FILE_TOO_LARGE" as const };
  // the browser's MIME is advisory; when it is specific it must agree with the extension
  const d = (declaredMime || "").toLowerCase();
  if (d && d !== "application/octet-stream" && d !== rule.mime && !(ext === "csv" && (d === "application/vnd.ms-excel" || d === "text/plain"))) return { error: "FILE_TYPE_MISMATCH" as const };
  if (!rule.sniff(data)) return { error: "FILE_CONTENT_MISMATCH" as const };
  return { ok: true as const, name: base || `file.${ext}`, ext, mime: rule.mime };
}
