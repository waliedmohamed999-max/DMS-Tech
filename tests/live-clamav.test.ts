import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/server/db";
import { createDocument, downloadDocument } from "@/server/ops/documents";
import { LocalStorageForTests, setDocumentStorage } from "@/server/ops/storage";
import { clamdScanner, EICAR, runScan, scanPendingDocuments, setDocumentScanner } from "@/server/ops/scanner";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

/**
 * Phase 12 (P12-06) — malware scanning against a REAL ClamAV daemon. Skipped unless LIVE_CLAMD_HOST is set
 * (LIVE_CLAMD_PORT default 3310). Uses only the industry-standard EICAR test string — never real malware.
 */
const host = process.env.LIVE_CLAMD_HOST;
const port = Number(process.env.LIVE_CLAMD_PORT ?? 3310);
const PDF = (s: string) => Buffer.from(`%PDF-1.4\n% clam ${s}\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n`);
const code = (re: RegExp) => ({ message: expect.stringMatching(re) });

describe.skipIf(!host)("live ClamAV (clamd INSTREAM)", () => {
  let orgId: string;
  let dir: string;
  const clam = clamdScanner(host ?? "", port);
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "dms-clam-"));
    setDocumentStorage(new LocalStorageForTests(dir));
  });
  afterAll(() => {
    setDocumentStorage(null);
    rmSync(dir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await resetDb();
    orgId = (await setupOrg()).id;
  });
  afterEach(() => {
    setDocumentScanner(undefined);
    delete process.env.DOCUMENT_SCAN_POLICY;
    delete process.env.DOCUMENT_SCAN_INLINE;
  });

  it("the real engine answers PING, passes a clean file and detects the EICAR test string", async () => {
    expect(await clam.health(AbortSignal.timeout(5000))).toEqual({ ok: true, detail: "PONG" });
    expect(await runScan(clam, PDF("clean"))).toEqual({ result: "CLEAN" });
    const v = await runScan(clam, Buffer.from(EICAR, "latin1"));
    expect(v.result).toBe("INFECTED");
    expect(v.result === "INFECTED" && v.signature).toMatch(/eicar/i);
  });

  it("upload: EICAR refused before storage; clean file CLEAN and downloadable under the required policy", async () => {
    setDocumentScanner(clam);
    process.env.DOCUMENT_SCAN_POLICY = "required";
    const u = await ctxFor((await makeUser(orgId, "docs@x.test", ["super_admin"])).id);
    await expect(createDocument(u, { title: "x", classification: "INTERNAL", tags: "" }, { name: "note.txt", type: "text/plain", data: Buffer.from(`notes ${EICAR}`, "latin1") })).rejects.toMatchObject(code(/FILE_REJECTED_BY_SCANNER/));
    expect(await prisma.document.count()).toBe(0);
    const d = await createDocument(u, { title: "Clean", classification: "INTERNAL", tags: "" }, pdf("ok"));
    expect((await prisma.documentVersionScan.findFirstOrThrow()).status).toBe("CLEAN");
    expect((await downloadDocument(u, d.id)).data.equals(PDF("ok"))).toBe(true);
  });

  it("scanner unavailable / timeout → never CLEAN; the required policy fails closed until a real scan passes", async () => {
    const down = clamdScanner(host ?? "", 1); // nothing listens on port 1
    expect((await runScan(down, PDF("x"))).result).toBe("FAILED");
    expect((await runScan(clam, Buffer.alloc(30 * 1024 * 1024, 1), 1)).result).toBe("FAILED"); // 1 ms budget
    setDocumentScanner(down);
    process.env.DOCUMENT_SCAN_POLICY = "required";
    const u = await ctxFor((await makeUser(orgId, "docs@x.test", ["super_admin"])).id);
    const d = await createDocument(u, { title: "Pending", classification: "INTERNAL", tags: "" }, pdf("p"));
    await expect(downloadDocument(u, d.id)).rejects.toMatchObject(code(/SCAN_REQUIRED:PENDING/));
    // the real engine comes back → the worker scans → CLEAN → served
    setDocumentScanner(clam);
    expect(await scanPendingDocuments(new Date())).toMatchObject({ claimed: 1, clean: 1 });
    expect((await downloadDocument(u, d.id)).data.equals(PDF("p"))).toBe(true);
  });
});

const pdf = (s: string) => ({ name: `${s}.pdf`, type: "application/pdf", data: PDF(s) });
