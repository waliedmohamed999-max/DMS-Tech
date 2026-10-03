import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { prisma } from "@/server/db";
import { addVersion, createDocument, downloadDocument } from "@/server/ops/documents";
import { setDocumentStorage } from "@/server/ops/storage";
import { S3StorageAdapter, type S3Config } from "@/server/ops/s3";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

/**
 * Phase 12 (P12-05) — document storage against a REAL S3-compatible service. Skipped unless LIVE_S3_* is set:
 *   LIVE_S3_ENDPOINT LIVE_S3_REGION LIVE_S3_BUCKET LIVE_S3_ACCESS_KEY_ID LIVE_S3_SECRET_ACCESS_KEY [LIVE_S3_FORCE_PATH_STYLE=false]
 * The bucket must already be private, versioned and encrypted — this test VERIFIES that, it never configures it.
 * Runs unchanged against MinIO (local) and a hosted provider.
 */
const e = process.env;
const live = Boolean(e.LIVE_S3_ENDPOINT && e.LIVE_S3_BUCKET && e.LIVE_S3_ACCESS_KEY_ID && e.LIVE_S3_SECRET_ACCESS_KEY);
const cfg: S3Config = { endpoint: e.LIVE_S3_ENDPOINT ?? "", region: e.LIVE_S3_REGION ?? "us-east-1", bucket: e.LIVE_S3_BUCKET ?? "", accessKeyId: e.LIVE_S3_ACCESS_KEY_ID ?? "", secretAccessKey: e.LIVE_S3_SECRET_ACCESS_KEY ?? "", forcePathStyle: e.LIVE_S3_FORCE_PATH_STYLE !== "false" };
const s3 = new S3StorageAdapter(cfg);
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const PDF = (s: string) => Buffer.from(`%PDF-1.4\n% live s3 ${s}\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n`);
const code = (re: RegExp) => ({ message: expect.stringMatching(re) });

/** raw signed request (bucket configuration checks, simulated tampering) — bypasses the application adapter */
async function raw(method: string, path: string, query = "", body?: Buffer) {
  const base = new URL(cfg.endpoint);
  const url = new URL(cfg.forcePathStyle !== false ? `${base.origin}/${cfg.bucket}${path}${query}` : `${base.protocol}//${cfg.bucket}.${base.host}${path}${query}`);
  const headers = s3.sign(method, url, body ? { "content-type": "application/octet-stream" } : {}, body ?? "");
  return fetch(url, { method, headers, body: body ? new Uint8Array(body) : undefined });
}

describe.skipIf(!live)("live S3-compatible storage", () => {
  let orgId: string;
  const prevDriver = e.DOCUMENT_STORAGE;
  beforeAll(() => {
    setDocumentStorage(s3, "s3");
    e.DOCUMENT_STORAGE = "s3";
  });
  afterAll(() => {
    setDocumentStorage(null, "s3");
    if (prevDriver === undefined) delete e.DOCUMENT_STORAGE;
    else e.DOCUMENT_STORAGE = prevDriver;
  });
  beforeEach(async () => {
    await resetDb();
    orgId = (await setupOrg()).id;
  });

  it("bucket is private, versioned and server-side encrypted (verified, not configured)", async () => {
    const versioning = await (await raw("GET", "/", "?versioning")).text();
    expect(versioning).toMatch(/<Status>Enabled<\/Status>/);
    const enc = await raw("GET", "/", "?encryption");
    expect(enc.status).toBe(200);
    expect(await enc.text()).toMatch(/SSEAlgorithm>(AES256|aws:kms)</);
    // anonymous access is refused (no public bucket / no public objects)
    const anonList = await fetch(cfg.forcePathStyle !== false ? `${new URL(cfg.endpoint).origin}/${cfg.bucket}/` : `${new URL(cfg.endpoint).protocol}//${cfg.bucket}.${new URL(cfg.endpoint).host}/`);
    expect(anonList.status).toBe(403);
  });

  it("upload → versions → download with checksum → RBAC → tamper / missing detection → recovery from bucket versioning", async () => {
    const admin = await ctxFor((await makeUser(orgId, "docs@x.test", ["super_admin"])).id);
    const emp = await ctxFor((await makeUser(orgId, "emp@x.test", ["employee"])).id);
    const d = await createDocument(admin, { title: "Live S3 contract", classification: "CONFIDENTIAL", tags: "" }, { name: "c.pdf", type: "application/pdf", data: PDF("v1") });
    await addVersion(admin, d.id, { name: "c2.pdf", type: "application/pdf", data: PDF("v2") }, {});
    const [v1, v2] = await prisma.documentVersion.findMany({ where: { documentId: d.id }, orderBy: { versionNumber: "asc" } });
    expect([v1.storageDriver, v2.storageDriver]).toEqual(["s3", "s3"]);
    expect(sha((await downloadDocument(admin, d.id, 1)).data)).toBe(v1.sha256);
    expect(sha((await downloadDocument(admin, d.id)).data)).toBe(v2.sha256);
    // the object itself is private and carries its checksum
    const anon = await fetch(new URL(`${cfg.bucket}/${v1.storageKey}`, new URL(cfg.endpoint).origin + "/"));
    expect(anon.status).toBe(403);
    expect(await s3.checksum?.(v1.storageKey)).toBe(v1.sha256);
    // RBAC: an employee cannot see a CONFIDENTIAL company document (no existence leak)
    await expect(downloadDocument(emp, d.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // the application never overwrites an object
    await expect(s3.put(v1.storageKey, PDF("again"))).rejects.toThrow(/already exists/);
    // tampering outside the application (direct overwrite) is detected on download …
    expect((await raw("PUT", `/${v1.storageKey}`, "", PDF("tampered"))).ok).toBe(true);
    await expect(downloadDocument(admin, d.id, 1)).rejects.toMatchObject(code(/HASH_MISMATCH/));
    // … and bucket versioning still holds the original bytes (recovery path)
    const versions = await (await raw("GET", "/", `?versions&prefix=${encodeURIComponent(v1.storageKey)}`)).text();
    const ids = [...versions.matchAll(/<VersionId>([^<]+)<\/VersionId>/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    let original: Buffer | null = null;
    for (const id of ids) {
      const b = Buffer.from(await (await raw("GET", `/${v1.storageKey}`, `?versionId=${encodeURIComponent(id)}`)).arrayBuffer());
      if (sha(b) === v1.sha256) original = b;
    }
    expect(original).not.toBeNull();
    // a deleted object → NOT_FOUND (no crash, no stale bytes)
    expect((await raw("DELETE", `/${v2.storageKey}`)).status).toBeLessThan(300);
    await expect(downloadDocument(admin, d.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  }, 60_000);
});
