import { connect } from "node:net";
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { systemCtx } from "../context";
import { unitOfWork } from "../events/bus";
import { log } from "../obs/log";
import { metrics } from "../obs/metrics";
import { appEnv } from "../system/environment";
import { sha256, storageFor } from "./storage";

/**
 * Phase 11 (P11-C) — document malware-scanning BOUNDARY (docs/OPERATIONS.md#malware-scanning).
 *
 * No antivirus is installed by this application. A real scanner is plugged in by configuration:
 *   DOCUMENT_SCANNER=clamd       → ClamAV daemon over TCP (INSTREAM protocol; CLAMD_HOST, CLAMD_PORT=3310)
 *   DOCUMENT_SCANNER=http        → any scanning service with the JSON contract below (DOCUMENT_SCANNER_URL, _TOKEN)
 *   DOCUMENT_SCANNER=test-eicar  → DETERMINISTIC TEST ADAPTER, development / test only — NOT an antivirus: it only
 *                                  recognises the standard EICAR test string. Refused in staging / production.
 *   (unset)                      → NOT_CONFIGURED: nothing claims a scan happened.
 *
 * Status per DocumentVersion (DocumentVersion itself is immutable — results live in DocumentVersionScan):
 *   PENDING (queued / retrying) · CLEAN · INFECTED · FAILED (scanner error / timeout, retried up to
 *   DOCUMENT_SCAN_MAX_ATTEMPTS) · NOT_CONFIGURED (no scanner when uploaded, no scan row)
 * Download policy (DOCUMENT_SCAN_POLICY): INFECTED is NEVER served. `required` → only CLEAN is served (fail-safe:
 * PENDING / FAILED / NOT_CONFIGURED are refused). `optional` (default) → everything except INFECTED.
 * The decision never uses the file name; magic-byte / size validation (storage.ts) still runs first.
 * Logs / audit / metrics carry ids, status, engine and detection name only — never file contents.
 */
export type ScanStatus = "PENDING" | "CLEAN" | "INFECTED" | "FAILED" | "NOT_CONFIGURED";
export type ScanVerdict = { result: "CLEAN" } | { result: "INFECTED"; signature: string } | { result: "FAILED"; code: string };

export interface DocumentScanner {
  readonly name: string;
  /** true only for real malware engines (false for the test adapter) */
  readonly isAntivirus: boolean;
  scan(data: Buffer, signal: AbortSignal): Promise<ScanVerdict>;
  health(signal: AbortSignal): Promise<{ ok: boolean; detail: string }>;
}

const clean = (s: string) => s.replace(/[^\w .:/()+-]/g, "").slice(0, 200);
export const scanTimeoutMs = (env = process.env) => Math.max(1000, Number(env.DOCUMENT_SCAN_TIMEOUT_MS ?? 30_000));
export const scanMaxAttempts = (env = process.env) => Math.max(1, Number(env.DOCUMENT_SCAN_MAX_ATTEMPTS ?? 5));

// --- adapters -----------------------------------------------------------------------------------

/** ClamAV clamd INSTREAM: "zINSTREAM\0", chunks of <uint32 BE length><bytes>, terminated by a zero-length chunk. */
export function clamdScanner(host: string, port: number): DocumentScanner {
  const talk = (payload: (sock: import("node:net").Socket) => void, signal: AbortSignal) =>
    new Promise<string>((resolve, reject) => {
      const sock = connect({ host, port });
      let reply = "";
      const fail = (e: Error) => {
        sock.destroy();
        reject(e);
      };
      signal.addEventListener("abort", () => fail(new Error("TIMEOUT")), { once: true });
      sock.on("connect", () => payload(sock));
      sock.on("data", (d) => (reply += d.toString("utf8")));
      sock.on("end", () => resolve(reply.replace(/\0+$/, "").trim()));
      sock.on("error", (e) => fail(new Error(`CONNECTION:${(e as NodeJS.ErrnoException).code ?? "ERROR"}`)));
    });
  return {
    name: `clamd(${host}:${port})`,
    isAntivirus: true,
    async scan(data, signal) {
      try {
        const reply = await talk((s) => {
          s.write("zINSTREAM\0");
          for (let i = 0; i < data.length; i += 64 * 1024) {
            const chunk = data.subarray(i, i + 64 * 1024);
            const len = Buffer.alloc(4);
            len.writeUInt32BE(chunk.length);
            s.write(len);
            s.write(chunk);
          }
          s.end(Buffer.alloc(4));
        }, signal);
        if (/:\s*OK$/.test(reply)) return { result: "CLEAN" };
        const found = /:\s*(.+)\s+FOUND$/.exec(reply);
        if (found) return { result: "INFECTED", signature: clean(found[1]) };
        return { result: "FAILED", code: /size limit/i.test(reply) ? "SCANNER_SIZE_LIMIT" : "SCANNER_ERROR" };
      } catch (e) {
        return { result: "FAILED", code: String((e as Error).message).startsWith("TIMEOUT") ? "SCANNER_TIMEOUT" : "SCANNER_UNAVAILABLE" };
      }
    },
    async health(signal) {
      try {
        const r = await talk((s) => s.end("zPING\0"), signal);
        return { ok: r === "PONG", detail: r === "PONG" ? "PONG" : `unexpected reply` };
      } catch (e) {
        return { ok: false, detail: String((e as Error).message) };
      }
    }
  };
}

/**
 * Generic HTTP scanning service. Contract: POST <url> with the raw bytes (application/octet-stream),
 * optional `Authorization: Bearer <token>` → 200 {"result":"clean"} | {"result":"infected","signature":"…"}.
 * Anything else (status, shape, timeout) is FAILED — never CLEAN. GET <url> must answer 2xx for health.
 */
export function httpScanner(url: string, token?: string, fetchImpl: typeof fetch = fetch): DocumentScanner {
  const headers = (extra: Record<string, string> = {}) => ({ ...extra, ...(token ? { authorization: `Bearer ${token}` } : {}) });
  return {
    name: `http(${new URL(url).host})`,
    isAntivirus: true,
    async scan(data, signal) {
      try {
        const r = await fetchImpl(url, { method: "POST", body: new Uint8Array(data), headers: headers({ "content-type": "application/octet-stream" }), signal });
        if (!r.ok) return { result: "FAILED", code: r.status === 401 || r.status === 403 ? "SCANNER_AUTH" : `SCANNER_HTTP_${r.status}` };
        const j = (await r.json().catch(() => null)) as { result?: string; signature?: string } | null;
        if (j?.result === "clean") return { result: "CLEAN" };
        if (j?.result === "infected") return { result: "INFECTED", signature: clean(j.signature ?? "unknown") };
        return { result: "FAILED", code: "SCANNER_BAD_RESPONSE" };
      } catch (e) {
        return { result: "FAILED", code: (e as Error).name === "AbortError" || (e as Error).name === "TimeoutError" ? "SCANNER_TIMEOUT" : "SCANNER_UNAVAILABLE" };
      }
    },
    async health(signal) {
      try {
        const r = await fetchImpl(url, { method: "GET", headers: headers(), signal });
        return { ok: r.ok, detail: `HTTP ${r.status}` };
      } catch (e) {
        return { ok: false, detail: (e as Error).name };
      }
    }
  };
}

/** The industry-standard EICAR anti-virus test string (harmless). */
export const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
/** Deterministic adapter for development / tests. It is NOT an antivirus and is refused outside development / test. */
export const testEicarScanner: DocumentScanner = {
  name: "test-eicar (NOT an antivirus)",
  isAntivirus: false,
  async scan(data) {
    return data.includes(Buffer.from(EICAR, "latin1")) ? { result: "INFECTED", signature: "EICAR-Test-Signature" } : { result: "CLEAN" };
  },
  async health() {
    return { ok: true, detail: "test adapter" };
  }
};

let override: DocumentScanner | null | undefined;
/** tests: install a scanner (null = force NOT_CONFIGURED, undefined = back to configuration) */
export const setDocumentScanner = (s: DocumentScanner | null | undefined) => (override = s);

/** The configured scanner, or null (NOT_CONFIGURED). Throws on an invalid configuration (config validation reports it first). */
export function configuredScanner(env: Record<string, string | undefined> = process.env): DocumentScanner | null {
  if (override !== undefined) return override;
  const kind = (env.DOCUMENT_SCANNER ?? "").trim().toLowerCase();
  if (!kind || kind === "none") return null;
  if (kind === "clamd") return clamdScanner(env.CLAMD_HOST ?? "", Number(env.CLAMD_PORT ?? 3310));
  if (kind === "http") return httpScanner(env.DOCUMENT_SCANNER_URL ?? "", env.DOCUMENT_SCANNER_TOKEN);
  if (kind === "test-eicar") {
    const e = appEnv(env);
    if (e !== "development" && e !== "test") throw new Error("DOCUMENT_SCANNER=test-eicar is a test adapter and is refused outside development / test");
    return testEicarScanner;
  }
  throw new Error(`DOCUMENT_SCANNER "${kind}" is not supported (clamd | http | test-eicar)`);
}

export type ScanPolicy = "required" | "optional";
export const scanPolicy = (env: Record<string, string | undefined> = process.env): ScanPolicy =>
  env.REQUIRE_SCAN_BEFORE_DOWNLOAD === "true" || (env.DOCUMENT_SCAN_POLICY ?? "").trim().toLowerCase() === "required" ? "required" : "optional";

/** Effective status: the scan row when present, else the status recorded at upload (legacy NOT_SCANNED = NOT_CONFIGURED). */
export function effectiveScanStatus(scan: { status: string } | null | undefined, atUpload: string): ScanStatus {
  if (scan) return scan.status as ScanStatus;
  return atUpload === "CLEAN" || atUpload === "INFECTED" || atUpload === "PENDING" || atUpload === "FAILED" ? (atUpload as ScanStatus) : "NOT_CONFIGURED";
}

/** null = may be served; otherwise the error code. INFECTED is refused under every policy. */
export function downloadBlockedBy(status: ScanStatus, policy: ScanPolicy = scanPolicy()): string | null {
  if (status === "INFECTED") return "FILE_INFECTED";
  if (policy === "required" && status !== "CLEAN") return `SCAN_REQUIRED:${status}`;
  return null;
}

export async function runScan(scanner: DocumentScanner, data: Buffer, timeoutMs = scanTimeoutMs()): Promise<ScanVerdict> {
  const t0 = Date.now();
  const v = await scanner.scan(data, AbortSignal.timeout(timeoutMs)).catch((): ScanVerdict => ({ result: "FAILED", code: "SCANNER_EXCEPTION" }));
  metrics.count("document_scan", { result: v.result, scanner: scanner.isAntivirus ? "antivirus" : "test" });
  log.info("document_scanned", { scanner: scanner.name, result: v.result, ms: Date.now() - t0, ...(v.result === "FAILED" ? { code: v.code } : {}), ...(v.result === "INFECTED" ? { signature: v.signature } : {}) });
  return v;
}

const backoffMs = (attempts: number) => Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));

/**
 * Worker job (documents:scan, lease-guarded by the caller): enqueue versions that have no scan row yet (a scanner
 * configured after files were uploaded), then claim due PENDING / FAILED rows (SKIP LOCKED) and scan them.
 * The stored bytes are hash-verified before scanning — a mismatching file is never marked CLEAN.
 */
export async function scanPendingDocuments(now = new Date(), opts: { limit?: number } = {}) {
  const scanner = configuredScanner();
  if (!scanner) return { skipped: "NOT_CONFIGURED" as const };
  const backlog = await prisma.documentVersion.findMany({ where: { scan: null }, select: { id: true, organizationId: true }, take: 200 });
  if (backlog.length) await prisma.documentVersionScan.createMany({ data: backlog.map((v) => ({ organizationId: v.organizationId, versionId: v.id, status: "PENDING", nextAttemptAt: now })), skipDuplicates: true });
  const worker = `scan-${randomUUID().slice(0, 8)}`;
  const max = scanMaxAttempts();
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "DocumentVersionScan" SET "lockedAt" = ${now}, "lockedBy" = ${worker}, "attempts" = "attempts" + 1, "updatedAt" = ${now}
    WHERE "id" IN (
      SELECT "id" FROM "DocumentVersionScan"
      WHERE "status" IN ('PENDING', 'FAILED') AND "attempts" < ${max} AND "nextAttemptAt" <= ${now}
        AND ("lockedAt" IS NULL OR "lockedAt" < ${new Date(now.getTime() - 10 * 60_000)})
      ORDER BY "nextAttemptAt" ASC LIMIT ${opts.limit ?? 20}
      FOR UPDATE SKIP LOCKED
    ) RETURNING "id"`;
  const out = { claimed: claimed.length, clean: 0, infected: 0, failed: 0 };
  for (const { id } of claimed) {
    const row = await prisma.documentVersionScan.findUniqueOrThrow({ where: { id }, include: { version: { select: { id: true, documentId: true, storageDriver: true, storageKey: true, sha256: true } } } });
    const data = await storageFor(row.version.storageDriver).get(row.version.storageKey).catch(() => null);
    const verdict: ScanVerdict = !data ? { result: "FAILED", code: "FILE_MISSING" } : sha256(data) !== row.version.sha256 ? { result: "FAILED", code: "HASH_MISMATCH" } : await runScan(scanner, data);
    await recordVerdict(row.organizationId, row.id, row.version.id, row.version.documentId, row.attempts, verdict, scanner.name, now, worker);
    out[verdict.result === "CLEAN" ? "clean" : verdict.result === "INFECTED" ? "infected" : "failed"]++;
  }
  return out;
}

async function recordVerdict(organizationId: string, scanId: string, versionId: string, documentId: string, attempts: number, v: ScanVerdict, scannerName: string, now: Date, worker: string) {
  const ctx = systemCtx(organizationId, { ip: "system", userAgent: "document-scanner" });
  await unitOfWork(ctx, async (tx, uow) => {
    const r = await tx.documentVersionScan.updateMany({
      where: { id: scanId, lockedBy: worker },
      data: {
        status: v.result === "FAILED" ? "FAILED" : v.result,
        scanner: scannerName,
        lastErrorCode: v.result === "FAILED" ? v.code : null,
        signature: v.result === "INFECTED" ? v.signature : null,
        scannedAt: v.result === "FAILED" ? null : now,
        nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)),
        lockedAt: null,
        lockedBy: null
      }
    });
    if (r.count !== 1) return; // lost the lock (stale-lock recovery by another worker) — that worker records
    if (v.result === "INFECTED") {
      await uow.audit({ action: "document.scan_infected", entityType: "Document", entityId: documentId, after: { versionId, scanner: scannerName, signature: v.signature } });
      uow.emit({ type: "document.infected", entityType: "Document", entityId: documentId, payload: { documentId, versionId, signature: v.signature }, activity: { href: `/app/documents/${documentId}`, visibility: "documents.manage" } });
      log.warn("document_infected", { documentId, versionId, scanner: scannerName, signature: v.signature });
    } else if (v.result === "FAILED" && attempts >= scanMaxAttempts()) {
      await uow.audit({ action: "document.scan_failed", entityType: "Document", entityId: documentId, after: { versionId, scanner: scannerName, code: v.code, attempts } });
      log.warn("document_scan_failed", { documentId, versionId, code: v.code, attempts });
    }
  });
}
