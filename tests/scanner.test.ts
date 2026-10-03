import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import net from "node:net";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/server/db";
import { createDocument, addVersion, downloadDocument, getDocument } from "@/server/ops/documents";
import { LocalStorageForTests, setDocumentStorage } from "@/server/ops/storage";
import { clamdScanner, configuredScanner, downloadBlockedBy, EICAR, effectiveScanStatus, httpScanner, runScan, scanPendingDocuments, setDocumentScanner, testEicarScanner, type DocumentScanner, type ScanVerdict } from "@/server/ops/scanner";
import { validateConfig } from "@/server/system/config";
import { goLiveChecks } from "@/server/system/golive";
import { setLogSink } from "@/server/obs/log";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

/** Phase 11 (P11-C) — malware-scanning boundary. No real antivirus here: adapters are exercised against local
 *  protocol stubs (clamd INSTREAM / HTTP contract); the deterministic test adapter is NOT an antivirus. */
let orgId: string;
let storageDir: string;
beforeAll(() => {
  storageDir = mkdtempSync(path.join(tmpdir(), "dms-scan-"));
  setDocumentStorage(new LocalStorageForTests(storageDir));
});
afterAll(() => {
  setDocumentStorage(null);
  rmSync(storageDir, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
});
afterEach(() => {
  setDocumentScanner(undefined);
  delete process.env.DOCUMENT_SCAN_POLICY;
  delete process.env.DOCUMENT_SCAN_INLINE;
  delete process.env.DOCUMENT_SCAN_MAX_ATTEMPTS;
});

const code = (re: RegExp) => ({ message: expect.stringMatching(re) });
const PDF = (s = "x") => Buffer.from(`%PDF-1.4\n% test ${s}\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n`);
const pdf = (s = "x") => ({ name: `f-${s}.pdf`, type: "application/pdf", data: PDF(s) });
const admin = async () => ctxFor((await makeUser(orgId, "docs@x.test", ["super_admin"])).id);
const meta = { title: "Policy", classification: "INTERNAL" as const, tags: "" };
const scripted = (seq: ScanVerdict[]): DocumentScanner => ({ name: "scripted", isAntivirus: true, scan: async () => seq.shift() ?? { result: "CLEAN" }, health: async () => ({ ok: true, detail: "ok" }) });
const storedFiles = () => readdirSync(storageDir, { recursive: true }).filter((f) => String(f).split(path.sep).length >= 3).length;

describe("policy", () => {
  it("INFECTED is never served; `required` serves CLEAN only (fail-safe); `optional` serves everything else", () => {
    for (const p of ["required", "optional"] as const) expect(downloadBlockedBy("INFECTED", p)).toBe("FILE_INFECTED");
    expect(downloadBlockedBy("CLEAN", "required")).toBeNull();
    for (const s of ["PENDING", "FAILED", "NOT_CONFIGURED"] as const) {
      expect(downloadBlockedBy(s, "required")).toBe(`SCAN_REQUIRED:${s}`);
      expect(downloadBlockedBy(s, "optional")).toBeNull();
    }
    expect(effectiveScanStatus(null, "NOT_SCANNED")).toBe("NOT_CONFIGURED"); // legacy rows
    expect(effectiveScanStatus({ status: "INFECTED" }, "CLEAN")).toBe("INFECTED"); // the live row wins
  });

  it("configuration: unknown adapters, the test adapter outside dev/test and incomplete adapters are refused", () => {
    expect(() => configuredScanner({ DOCUMENT_SCANNER: "test-eicar", APP_ENV: "staging" })).toThrow(/refused/);
    expect(() => configuredScanner({ DOCUMENT_SCANNER: "mcafee" })).toThrow(/not supported/);
    expect(configuredScanner({ DOCUMENT_SCANNER: "" })).toBeNull();
    const crit = (env: Record<string, string>) => validateConfig({ DATABASE_URL: "postgresql://a/b", ...env }).issues.filter((i) => i.level === "critical").map((i) => `${i.key}:${i.code}`);
    expect(crit({ DOCUMENT_SCANNER: "test-eicar", APP_ENV: "production" })).toContain("DOCUMENT_SCANNER:TEST_ADAPTER_NOT_ALLOWED");
    expect(crit({ DOCUMENT_SCANNER: "clamd" })).toContain("CLAMD_HOST:MISSING");
    expect(crit({ DOCUMENT_SCANNER: "http", APP_ENV: "production", DOCUMENT_SCANNER_URL: "http://scan.internal" })).toContain("DOCUMENT_SCANNER_URL:HTTPS_REQUIRED");
    expect(crit({ DOCUMENT_SCAN_POLICY: "sometimes" })).toContain("DOCUMENT_SCAN_POLICY:INVALID");
    expect(validateConfig({ DATABASE_URL: "postgresql://a/b", DOCUMENT_SCAN_POLICY: "required" }).issues).toContainEqual(expect.objectContaining({ key: "DOCUMENT_SCAN_POLICY", code: "NO_SCANNER_ALL_DOWNLOADS_BLOCKED" }));
  });
});

describe("upload + download", () => {
  it("without a scanner: NOT_CONFIGURED, nothing claims a scan happened, downloads follow the policy", async () => {
    setDocumentScanner(null);
    const u = await admin();
    const d = await createDocument(u, meta, pdf());
    expect((await getDocument(u, d.id)).versions[0].scanStatus).toBe("NOT_CONFIGURED");
    expect(await prisma.documentVersionScan.count()).toBe(0);
    expect((await downloadDocument(u, d.id)).data.equals(PDF())).toBe(true);
    process.env.DOCUMENT_SCAN_POLICY = "required";
    await expect(downloadDocument(u, d.id)).rejects.toMatchObject(code(/SCAN_REQUIRED:NOT_CONFIGURED/));
  });

  it("an infected upload is refused before the bytes are stored (detection by content, not file name) and audited", async () => {
    setDocumentScanner(testEicarScanner);
    const u = await admin();
    const before = storedFiles();
    await expect(createDocument(u, meta, { name: "invoice.txt", type: "text/plain", data: Buffer.from(EICAR, "latin1") })).rejects.toMatchObject(code(/FILE_REJECTED_BY_SCANNER/));
    expect(storedFiles()).toBe(before);
    expect(await prisma.document.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "document.upload_rejected_infected" } })).toBe(1);
    // magic-byte validation still runs first: an EICAR string named .pdf is a content mismatch, never scanned
    await expect(createDocument(u, meta, { name: "x.pdf", type: "application/pdf", data: Buffer.from(EICAR, "latin1") })).rejects.toMatchObject(code(/FILE_CONTENT_MISMATCH/));
  });

  it("a clean upload is recorded CLEAN and served under the required policy", async () => {
    setDocumentScanner(testEicarScanner);
    process.env.DOCUMENT_SCAN_POLICY = "required";
    const u = await admin();
    const d = await createDocument(u, meta, pdf());
    expect((await getDocument(u, d.id)).versions[0].scanStatus).toBe("CLEAN");
    expect((await downloadDocument(u, d.id)).data.equals(PDF())).toBe(true);
  });

  it("scanner failure / timeout at upload → PENDING (blocked when required) → the worker scans it → CLEAN → served", async () => {
    setDocumentScanner(scripted([{ result: "FAILED", code: "SCANNER_TIMEOUT" }, { result: "CLEAN" }]));
    process.env.DOCUMENT_SCAN_POLICY = "required";
    const u = await admin();
    const d = await createDocument(u, meta, pdf());
    await expect(downloadDocument(u, d.id)).rejects.toMatchObject(code(/SCAN_REQUIRED:PENDING/));
    expect(await scanPendingDocuments(new Date())).toMatchObject({ claimed: 1, clean: 1 });
    expect((await downloadDocument(u, d.id)).data.equals(PDF())).toBe(true);
  });

  it("malware found later by the worker is never served (any policy), audited, and the verdict is final in the database", async () => {
    process.env.DOCUMENT_SCAN_INLINE = "0";
    setDocumentScanner(scripted([{ result: "INFECTED", signature: "Win.Test.Dropper" }]));
    const u = await admin();
    const d = await createDocument(u, meta, pdf("late"));
    expect(await scanPendingDocuments(new Date())).toMatchObject({ infected: 1 });
    await expect(downloadDocument(u, d.id)).rejects.toMatchObject(code(/FILE_INFECTED/));
    expect(await prisma.auditLog.count({ where: { action: "document.scan_infected", entityId: d.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "document.download_blocked", entityId: d.id } })).toBe(1);
    await expect(prisma.documentVersionScan.updateMany({ data: { status: "CLEAN" } })).rejects.toThrow(/DOCUMENT_SCAN_INFECTED_FINAL/);
    await expect(prisma.documentVersionScan.deleteMany({})).rejects.toThrow(/DOCUMENT_SCAN_IMMUTABLE/);
    // a new clean version is the way forward
    setDocumentScanner(testEicarScanner);
    delete process.env.DOCUMENT_SCAN_INLINE;
    await addVersion(u, d.id, pdf("fixed"), {});
    expect((await downloadDocument(u, d.id)).data.equals(PDF("fixed"))).toBe(true);
  });

  it("repeated scanner failures stop after DOCUMENT_SCAN_MAX_ATTEMPTS: FAILED, audited, still blocked when required", async () => {
    process.env.DOCUMENT_SCAN_INLINE = "0";
    process.env.DOCUMENT_SCAN_MAX_ATTEMPTS = "2";
    process.env.DOCUMENT_SCAN_POLICY = "required";
    setDocumentScanner(scripted([{ result: "FAILED", code: "SCANNER_UNAVAILABLE" }, { result: "FAILED", code: "SCANNER_UNAVAILABLE" }]));
    const u = await admin();
    const d = await createDocument(u, meta, pdf());
    const t0 = new Date();
    await scanPendingDocuments(t0);
    await scanPendingDocuments(new Date(t0.getTime() + 3600_000)); // after the backoff
    expect(await scanPendingDocuments(new Date(t0.getTime() + 7200_000))).toMatchObject({ claimed: 0 });
    const row = await prisma.documentVersionScan.findFirstOrThrow();
    expect(row).toMatchObject({ status: "FAILED", attempts: 2, lastErrorCode: "SCANNER_UNAVAILABLE" });
    expect(await prisma.auditLog.count({ where: { action: "document.scan_failed" } })).toBe(1);
    await expect(downloadDocument(u, d.id)).rejects.toMatchObject(code(/SCAN_REQUIRED:FAILED/));
  });

  it("files uploaded before a scanner existed are queued and scanned once one is configured; a tampered file is never CLEAN", async () => {
    setDocumentScanner(null);
    const u = await admin();
    const a = await createDocument(u, meta, pdf("old-a"));
    const b = await createDocument(u, meta, pdf("old-b"));
    // tamper with b's stored bytes
    const vb = await prisma.documentVersion.findFirstOrThrow({ where: { documentId: b.id } });
    const store = new LocalStorageForTests(storageDir);
    await store.remove(vb.storageKey);
    await store.put(vb.storageKey, PDF("tampered"));
    setDocumentScanner(testEicarScanner);
    const r = await scanPendingDocuments(new Date());
    expect(r).toMatchObject({ claimed: 2, clean: 1, failed: 1 });
    expect((await getDocument(u, a.id)).versions[0].scanStatus).toBe("CLEAN");
    expect(await prisma.documentVersionScan.findFirstOrThrow({ where: { versionId: vb.id } })).toMatchObject({ status: "FAILED", lastErrorCode: "HASH_MISMATCH" });
  });

  it("logs and audit carry ids / verdict / detection name only — never file contents", async () => {
    const lines: string[] = [];
    setLogSink((l) => lines.push(l), true);
    try {
      setDocumentScanner(testEicarScanner);
      const u = await admin();
      await createDocument(u, meta, { name: "secret.txt", type: "text/plain", data: Buffer.from("TOP-SECRET-CONTENT-42 " + EICAR, "latin1") }).catch(() => undefined);
      await createDocument(u, meta, { name: "ok.txt", type: "text/plain", data: Buffer.from("PAYROLL-ROW-SECRET-77") });
    } finally {
      setLogSink(null);
    }
    const all = lines.join("\n") + JSON.stringify(await prisma.auditLog.findMany());
    expect(lines.some((l) => l.includes("document_scanned"))).toBe(true);
    expect(all).not.toMatch(/TOP-SECRET-CONTENT-42|PAYROLL-ROW-SECRET-77|EICAR-STANDARD/);
  });
});

describe("adapters (against local protocol stubs — not a real antivirus)", () => {
  it("timeouts are FAILED (SCANNER_TIMEOUT), never CLEAN", async () => {
    const hang: DocumentScanner = { name: "hang", isAntivirus: true, scan: (_d, signal) => new Promise((resolve) => signal.addEventListener("abort", () => resolve({ result: "FAILED", code: "SCANNER_TIMEOUT" }))), health: async () => ({ ok: true, detail: "" }) };
    expect(await runScan(hang, Buffer.from("x"), 1000)).toEqual({ result: "FAILED", code: "SCANNER_TIMEOUT" });
    const thrower: DocumentScanner = { ...hang, scan: async () => { throw new Error("boom"); } };
    expect(await runScan(thrower, Buffer.from("x"))).toEqual({ result: "FAILED", code: "SCANNER_EXCEPTION" });
  });

  it("clamd INSTREAM protocol: OK / FOUND / size-limit error / unreachable / PING", async () => {
    let mode = "ok";
    let received = Buffer.alloc(0);
    const srv = net.createServer((s) => {
      let buf = Buffer.alloc(0);
      s.on("data", (d) => {
        buf = Buffer.concat([buf, Buffer.from(d)]);
        if (buf.subarray(0, 6).toString() === "zPING\0") return s.end("PONG\0");
        if (buf.length >= 14 && buf.subarray(buf.length - 4).readUInt32BE() === 0) {
          // decode chunks after "zINSTREAM\0"
          let i = 10;
          const parts: Buffer[] = [];
          while (i + 4 <= buf.length) {
            const n = buf.readUInt32BE(i);
            if (!n) break;
            parts.push(buf.subarray(i + 4, i + 4 + n));
            i += 4 + n;
          }
          received = Buffer.concat(parts);
          s.end(mode === "ok" ? "stream: OK\0" : mode === "found" ? "stream: Eicar-Test-Signature FOUND\0" : "INSTREAM size limit exceeded. ERROR\0");
        }
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as net.AddressInfo).port;
    const c = clamdScanner("127.0.0.1", port);
    const big = Buffer.alloc(150 * 1024, 7); // > one 64 KiB chunk
    expect(await c.scan(big, AbortSignal.timeout(5000))).toEqual({ result: "CLEAN" });
    expect(received.equals(big)).toBe(true);
    mode = "found";
    expect(await c.scan(Buffer.from("x"), AbortSignal.timeout(5000))).toEqual({ result: "INFECTED", signature: "Eicar-Test-Signature" });
    mode = "limit";
    expect(await c.scan(Buffer.from("x"), AbortSignal.timeout(5000))).toEqual({ result: "FAILED", code: "SCANNER_SIZE_LIMIT" });
    expect(await c.health(AbortSignal.timeout(5000))).toEqual({ ok: true, detail: "PONG" });
    await new Promise<void>((r) => srv.close(() => r()));
    expect(await c.scan(Buffer.from("x"), AbortSignal.timeout(5000))).toEqual({ result: "FAILED", code: "SCANNER_UNAVAILABLE" });
  });

  it("HTTP contract: clean / infected / 5xx / 401 / malformed / slow", async () => {
    let reply: { status: number; body: string; delay?: number } = { status: 200, body: '{"result":"clean"}' };
    let auth = "";
    const srv = http.createServer((q, s) => {
      auth = String(q.headers.authorization ?? "");
      q.resume();
      q.on("end", () => setTimeout(() => s.writeHead(reply.status, { "content-type": "application/json" }).end(reply.body), reply.delay ?? 0));
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(srv.address() as net.AddressInfo).port}/scan`;
    const h = httpScanner(url, "tok");
    const scan = () => h.scan(Buffer.from("x"), AbortSignal.timeout(800));
    expect(await scan()).toEqual({ result: "CLEAN" });
    expect(auth).toBe("Bearer tok");
    reply = { status: 200, body: '{"result":"infected","signature":"Trojan.X <script>"}' };
    expect(await scan()).toEqual({ result: "INFECTED", signature: "Trojan.X script" });
    reply = { status: 503, body: "" };
    expect(await scan()).toEqual({ result: "FAILED", code: "SCANNER_HTTP_503" });
    reply = { status: 401, body: "" };
    expect(await scan()).toEqual({ result: "FAILED", code: "SCANNER_AUTH" });
    reply = { status: 200, body: '{"ok":true}' };
    expect(await scan()).toEqual({ result: "FAILED", code: "SCANNER_BAD_RESPONSE" });
    reply = { status: 200, body: '{"result":"clean"}', delay: 2000 };
    expect(await scan()).toEqual({ result: "FAILED", code: "SCANNER_TIMEOUT" });
    srv.closeAllConnections();
    await new Promise<void>((r) => srv.close(() => r()));
  });
});

describe("go-live", () => {
  const av = async (env: Record<string, string | undefined>) => (await goLiveChecks({ target: "staging", probeUrl: false, env: { ...process.env, ...env } })).find((c) => c.key === "antivirus")!;
  it("test adapter never counts; no scanner + accepted risk = WARN; no decision = BLOCK; reachable scanner + required = PASS", async () => {
    setDocumentScanner(testEicarScanner);
    expect((await av({})).level).toBe("BLOCK");
    setDocumentScanner(null);
    expect((await av({ ANTIVIRUS_DECISION: "NOT_SCANNED_ACCEPTED" })).level).toBe("WARN");
    expect((await av({ ANTIVIRUS_DECISION: undefined })).level).toBe("BLOCK");
    setDocumentScanner({ ...scripted([]), name: "clamd(test)" });
    expect((await av({ DOCUMENT_SCAN_POLICY: "required" })).level).toBe("PASS");
    expect((await av({ DOCUMENT_SCAN_POLICY: "optional" })).level).toBe("WARN");
    setDocumentScanner({ ...scripted([]), health: async () => ({ ok: false, detail: "ECONNREFUSED" }) });
    expect((await av({ DOCUMENT_SCAN_POLICY: "required" })).level).toBe("BLOCK");
  });
});
