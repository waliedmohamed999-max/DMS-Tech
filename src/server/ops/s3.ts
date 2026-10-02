import { createHash, createHmac } from "node:crypto";
import type { DocumentStorageAdapter } from "./storage";

/**
 * S3-compatible storage adapter (AWS S3, MinIO, Cloudflare R2, …) using AWS Signature V4 directly — no SDK.
 * It only moves bytes: authorisation stays in the documents service, which decides who may read what.
 * Objects carry `x-amz-meta-sha256`; `checksum()` returns it so integrity can be verified without a download.
 */
export type S3Config = { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; forcePathStyle?: boolean };

const sha256hex = (d: Buffer | string) => createHash("sha256").update(d).digest("hex");
const hmac = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d).digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export class S3StorageAdapter implements DocumentStorageAdapter {
  readonly kind = "s3";
  constructor(private cfg: S3Config, private fetchImpl: typeof fetch = fetch) {}

  private url(key?: string) {
    const base = new URL(this.cfg.endpoint);
    const path = key ? "/" + key.split("/").map(enc).join("/") : "/";
    if (this.cfg.forcePathStyle !== false) return new URL(`${base.origin}/${enc(this.cfg.bucket)}${key ? path : ""}`);
    return new URL(`${base.protocol}//${this.cfg.bucket}.${base.host}${path}`);
  }

  /** AWS SigV4 (header auth, signed payload hash). */
  sign(method: string, url: URL, headers: Record<string, string>, body: Buffer | string = "", now = new Date()) {
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = amzDate.slice(0, 8);
    const payloadHash = sha256hex(body);
    const h: Record<string, string> = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim()])), host: url.host, "x-amz-date": amzDate, "x-amz-content-sha256": payloadHash };
    const names = Object.keys(h).sort();
    const canonicalQuery = [...url.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${enc(k)}=${enc(v)}`).join("&");
    const canonical = [method, url.pathname, canonicalQuery, names.map((n) => `${n}:${h[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
    const scope = `${date}/${this.cfg.region}/s3/aws4_request`;
    const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonical)].join("\n");
    const kDate = hmac("AWS4" + this.cfg.secretAccessKey, date);
    const kSigning = hmac(hmac(hmac(kDate, this.cfg.region), "s3"), "aws4_request");
    const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
    return { ...h, authorization: `AWS4-HMAC-SHA256 Credential=${this.cfg.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` };
  }

  private async req(method: string, key: string | undefined, body?: Buffer, extra: Record<string, string> = {}) {
    const url = this.url(key);
    const headers = this.sign(method, url, extra, body ?? "");
    return this.fetchImpl(url, { method, headers, body: body ? new Uint8Array(body) : undefined });
  }

  async put(key: string, data: Buffer) {
    // never overwrite: versions are immutable
    if (await this.exists(key)) throw new Error("object already exists");
    const r = await this.req("PUT", key, data, { "content-type": "application/octet-stream", "x-amz-meta-sha256": sha256hex(data) });
    if (!r.ok) throw new Error(`S3 PUT failed: HTTP ${r.status}`);
  }
  async get(key: string) {
    const r = await this.req("GET", key);
    if (!r.ok) throw new Error(`S3 GET failed: HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  async exists(key: string) {
    const r = await this.req("HEAD", key);
    if (r.status === 404) return false;
    if (!r.ok) throw new Error(`S3 HEAD failed: HTTP ${r.status}`);
    return true;
  }
  /** sha256 recorded at upload (object metadata), or null */
  async checksum(key: string) {
    const r = await this.req("HEAD", key);
    return r.ok ? r.headers.get("x-amz-meta-sha256") : null;
  }
  /** Used only to clean up an object nothing references (failed upload). Documents are never deleted by policy. */
  async remove(key: string) {
    await this.req("DELETE", key).catch(() => undefined);
  }
  /** health: HEAD bucket */
  async ping() {
    const r = await this.req("HEAD", undefined);
    return r.status;
  }
}
