import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/server/db";
import { systemCtx } from "@/server/context";
import { unitOfWork } from "@/server/events/bus";
import { createEmployee } from "@/server/hr/employees";
import { bankAccounts, revealBankAccount, setBankAccount } from "@/server/hr/compensation";
import { encryptLegacyIbans } from "@/server/hr/ibanMigration";
import { open, seal, ibanAad } from "@/server/security/fieldcrypto";
import { appEnv, checkLocalStorageMarker, outboundAllowed } from "@/server/system/environment";
import { checkEnvironment } from "@/server/system/health";
import { enqueue, processOutbox } from "@/server/integrations/outbox";
import { complianceStatus, assertInvoiceIssuingAllowed } from "@/server/finance/zatca";
import { createClient } from "@/server/crm/clients";
import { createInvoice, issueInvoice } from "@/server/finance/invoices";
import { demoArtifacts, goLiveChecks, verdict, companyReadiness } from "@/server/system/golive";
import { provisionSuperAdmin, temporaryPassword } from "@/server/admin/provision";
import { verifyPassword } from "@/server/auth/password";
import { sentryReporter, webhookReporter } from "@/server/obs/reporters";
import { reportError, setErrorReporter, errorReporterStatus } from "@/server/obs/errors";
import { runWithObs } from "@/server/obs/context";
import { setLogSink } from "@/server/obs/log";
import { validateConfig } from "@/server/system/config";
import { createRule, setRuleEnabled } from "@/server/automation/engine";
import { captureWebsiteLead } from "@/server/crm/website";
import { osCsp } from "@/lib/os/csp";
import { createBackup, verifyBackup } from "@/server/system/backup";
import { migrateTo } from "../scripts/_backup-shared";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";
import "@/server/handlers";

/** Phase 10 — go-live hardening: field encryption, environment separation, ZATCA gate, go-live / demo checks,
 *  admin provisioning, error-tracking adapters, request correlation, nonce CSP, config, real pg_dump / pg_restore. */
let orgId: string;
let backupTmp: string;
const PG_BIN = path.resolve(".local/pgtools/pgsql/bin");
const hasPgTools = existsSync(path.join(PG_BIN, "pg_dump.exe")) || existsSync(path.join(PG_BIN, "pg_dump"));

beforeAll(() => {
  backupTmp = mkdtempSync(path.join(tmpdir(), "dms-p10-"));
});
afterAll(() => rmSync(backupTmp, { recursive: true, force: true }));
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
  process.env.OS_ORG_SLUG = "test-org";
});

const withEnv = async <T,>(vars: Record<string, string | undefined>, fn: () => Promise<T> | T) => {
  const prev = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k];
  else process.env[k] = v;
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
};
const code = (re: RegExp) => ({ message: expect.stringMatching(re) });

describe("IBAN field encryption", () => {
  it("encrypts on write, masks without decrypting, decrypts only after authorisation, detects tampering and row swaps", async () => {
    const hr = await ctxFor((await makeUser(orgId, "hr@x.test", ["hr_manager"])).id);
    const ceo = await ctxFor((await makeUser(orgId, "ceo@x.test", ["ceo"])).id);
    const a = await createEmployee(hr, { firstName: "Aisha", lastName: "One", joinDate: "2026-01-01" });
    const b = await createEmployee(hr, { firstName: "Bader", lastName: "Two", joinDate: "2026-01-01" });
    await setBankAccount(hr, a.id, { bankName: "Riyad Bank", iban: "SA0380000000608010167519", accountName: "Aisha One", effectiveFrom: "2026-01-01" });
    await setBankAccount(hr, b.id, { bankName: "SNB", iban: "SA4420000001234567891234", accountName: "Bader Two", effectiveFrom: "2026-01-01" });
    const ra = await prisma.employeeBankAccount.findFirstOrThrow({ where: { employeeId: a.id } });
    expect(ra).toMatchObject({ iban: null, ibanLast4: "7519", ibanKeyVersion: 1 });
    expect(ra.ibanCiphertext).not.toContain("SA03");
    expect((await bankAccounts(hr, a.id))[0].iban).toBe("•••• •••• •••• 7519");
    await expect(revealBankAccount(ceo, ra.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await revealBankAccount(hr, ra.id)).iban).toBe("SA0380000000608010167519");
    // tampered ciphertext / tag → authentication failure, never garbage
    const sealed = { ciphertext: ra.ibanCiphertext!, iv: ra.ibanIv!, tag: ra.ibanTag!, keyVersion: 1 };
    const flipped = Buffer.from(sealed.ciphertext, "base64");
    flipped[0] ^= 1;
    expect(() => open({ ...sealed, ciphertext: flipped.toString("base64") }, ibanAad(a.id))).toThrow(/FIELD_DECRYPTION_FAILED/);
    // the same ciphertext presented for another employee fails (associated data)
    expect(() => open(sealed, ibanAad(b.id))).toThrow(/FIELD_DECRYPTION_FAILED/);
    // a wrong key fails
    await withEnv({ HR_FIELD_KEY: Buffer.alloc(32, 9).toString("base64") }, () => expect(() => open(sealed, ibanAad(a.id))).toThrow(/FIELD_DECRYPTION_FAILED/));
    // no key → nothing is stored in clear instead
    await withEnv({ HR_FIELD_KEY: undefined }, () => expect(() => seal("SA00", "x")).toThrow(/FIELD_KEY_NOT_CONFIGURED/));
    // the history guard still forbids ordinary edits and plaintext deletion
    await expect(prisma.employeeBankAccount.update({ where: { id: ra.id }, data: { bankName: "Other" } })).rejects.toThrow(/HISTORY_IMMUTABLE/);
    await expect(prisma.employeeBankAccount.update({ where: { id: ra.id }, data: { ibanCiphertext: null, ibanIv: null, ibanTag: null } })).rejects.toThrow();
    await expect(prisma.employeeBankAccount.delete({ where: { id: ra.id } })).rejects.toThrow(/HISTORY_IMMUTABLE/);
    // audit / logs hold masks only
    expect(JSON.stringify(await prisma.auditLog.findMany({ where: { action: { startsWith: "bank." } } }))).not.toMatch(/SA0380000000608010167519|SA4420000001234567891234/);
  });

  it("migrates legacy plaintext rows only after verification; rotation re-encrypts with the new key; wrong last-4 is refused by the DB", async () => {
    const hr = await ctxFor((await makeUser(orgId, "hr@x.test", ["hr_manager"])).id);
    const e = await createEmployee(hr, { firstName: "Legacy", lastName: "Row", joinDate: "2026-01-01" });
    await prisma.$executeRaw`INSERT INTO "EmployeeBankAccount" ("id","organizationId","employeeId","bankName","iban","accountName","effectiveFrom") VALUES ('legacy_bank_row_1', ${orgId}, ${e.id}, 'Old Bank', 'SA0380000000608010167519', 'Legacy Row', '2025-01-01')`;
    expect((await bankAccounts(hr, e.id))[0].iban).toMatch(/7519$/); // masked from plaintext until migrated
    const dry = await encryptLegacyIbans({ apply: false });
    expect(dry).toMatchObject({ candidates: 1, processed: 1, plaintextRemaining: 1 });
    // the DB refuses an "encryption" whose last-4 does not match the plaintext
    const s = seal("SA0380000000608010167519", ibanAad(e.id));
    await expect(prisma.employeeBankAccount.update({ where: { id: "legacy_bank_row_1" }, data: { ibanCiphertext: s.ciphertext, ibanIv: s.iv, ibanTag: s.tag, ibanKeyVersion: 1, ibanLast4: "0000", iban: null } })).rejects.toThrow(/HISTORY_IMMUTABLE/);
    const r = await encryptLegacyIbans({ apply: true });
    expect(r).toMatchObject({ processed: 1, failed: 0, plaintextRemaining: 0 });
    const row = await prisma.employeeBankAccount.findUniqueOrThrow({ where: { id: "legacy_bank_row_1" } });
    expect(row).toMatchObject({ iban: null, ibanLast4: "7519" });
    expect((await revealBankAccount(hr, row.id)).iban).toBe("SA0380000000608010167519");
    expect(await prisma.auditLog.findFirst({ where: { action: "hr.iban_encrypted" } })).toMatchObject({ after: { rows: 1, failed: 0, keyVersion: 1 } });
    // key rotation: v2 key, previous key kept for decryption
    const oldKey = process.env.HR_FIELD_KEY!;
    await withEnv({ HR_FIELD_KEY: Buffer.alloc(32, 3).toString("base64"), HR_FIELD_KEY_PREVIOUS: oldKey, HR_FIELD_KEY_VERSION: "2" }, async () => {
      expect(await encryptLegacyIbans({ apply: true, rotate: true })).toMatchObject({ processed: 1, failed: 0 });
      const rotated = await prisma.employeeBankAccount.findUniqueOrThrow({ where: { id: "legacy_bank_row_1" } });
      expect(rotated.ibanKeyVersion).toBe(2);
      expect((await revealBankAccount(hr, rotated.id)).iban).toBe("SA0380000000608010167519");
    });
  });
});

describe("environment separation", () => {
  it("APP_ENV drives the markers; staging never delivers through PRODUCTION connections; mismatches fail readiness", async () => {
    expect(appEnv({ NODE_ENV: "production", APP_ENV: "staging" })).toBe("staging");
    expect(appEnv({ NODE_ENV: "production" })).toBe("production");
    expect(appEnv({ NODE_ENV: "development" })).toBe("development");
    expect(outboundAllowed("PRODUCTION", "staging")).toBe(false);
    expect(outboundAllowed("SANDBOX", "staging")).toBe(true);
    expect(outboundAllowed("SANDBOX", "production")).toBe(false);
    expect(outboundAllowed("PRODUCTION", "production")).toBe(true);
    // marker written by bootstrap (test DB → "test"), immutable
    expect((await prisma.deploymentMarker.findUniqueOrThrow({ where: { id: 1 } })).environment).toBe("test");
    await expect(prisma.deploymentMarker.update({ where: { id: 1 }, data: { environment: "production" } })).rejects.toThrow(/DEPLOYMENT_MARKER_IMMUTABLE/);
    await expect(prisma.deploymentMarker.create({ data: { id: 2, environment: "staging" } })).rejects.toThrow();
    // a staging app pointed at this database → not ready
    const dir = mkdtempSync(path.join(tmpdir(), "dms-p10-store-"));
    await withEnv({ APP_ENV: "staging", DOCUMENT_STORAGE_DIR: dir }, async () => {
      expect(await checkEnvironment()).toMatchObject({ status: "fail", detail: expect.stringMatching(/ENVIRONMENT_MISMATCH: app=staging database=test/) });
    });
    // storage marker: first use writes it, another environment is refused
    expect(checkLocalStorageMarker(dir, "test")).toEqual({ ok: true, marker: "test" });
    expect(checkLocalStorageMarker(dir, "production")).toEqual({ ok: false, marker: "test" });
    rmSync(dir, { recursive: true, force: true });
    // outbox: a staging worker refuses a PRODUCTION connection (dead letter, nothing sent)
    const conn = await prisma.integrationConnection.findFirstOrThrow({ where: { organizationId: orgId, provider: "CUSTOM" } });
    await prisma.integrationConnection.update({ where: { id: conn.id }, data: { status: "CONNECTED", environment: "PRODUCTION" } });
    await prisma.$transaction((tx) => enqueue(tx, orgId, { provider: "CUSTOM", connectionId: conn.id, eventType: "custom.deliver", idempotencyKey: "env-guard-1", payload: { event: "x", deliveryId: "d1", data: {} } }));
    await withEnv({ APP_ENV: "staging" }, () => processOutbox({ organizationId: orgId }));
    expect(await prisma.integrationOutbox.findFirstOrThrow({ where: { idempotencyKey: "env-guard-1" } })).toMatchObject({ status: "DEAD_LETTER", lastErrorCode: "ENVIRONMENT_BLOCKED" });
  });
});

describe("ZATCA decision gate", () => {
  it("never claims compliance; production issuing is blocked until a decision is recorded", async () => {
    expect(complianceStatus({}).status).toBe("NOT_CONFIGURED");
    expect(complianceStatus({ ZATCA_STATUS: "NOT_REQUIRED" }).status).toBe("NOT_CONFIGURED"); // decision reference required
    expect(complianceStatus({ ZATCA_STATUS: "NOT_REQUIRED", ZATCA_DECISION_REF: "Board minute 2026-10 #4" }).status).toBe("NOT_REQUIRED");
    expect(complianceStatus({ ZATCA_STATUS: "READY" }).status).toBe("REQUIRED_NOT_READY"); // no adapter installed
    const fm = await ctxFor((await makeUser(orgId, "fm@x.test", ["finance_manager"])).id);
    const sm = await ctxFor((await makeUser(orgId, "sm@x.test", ["sales_manager"])).id);
    const client = await createClient(sm, { displayName: "Gate Client" });
    const { id } = await createInvoice(fm, { clientId: client.id, items: [{ description: "Consulting", quantity: "1", unitPrice: "1000" }] });
    await withEnv({ APP_ENV: "production", ZATCA_STATUS: undefined }, async () => {
      await expect(assertInvoiceIssuingAllowed()).rejects.toThrow(/ZATCA_NOT_READY:NOT_CONFIGURED/);
      await expect(issueInvoice(fm, id)).rejects.toMatchObject(code(/ZATCA_NOT_READY/));
    });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id } })).status).toBe("DRAFT");
    await withEnv({ APP_ENV: "production", ZATCA_STATUS: "NOT_REQUIRED", ZATCA_DECISION_REF: "Tax advisor letter 2026-10-01" }, () => issueInvoice(fm, id));
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id } })).status).toBe("ISSUED");
  });
});

describe("go-live checks", () => {
  it("demo artefacts, plaintext IBANs, missing backups, non-TLS DB and open decisions all BLOCK", async () => {
    await makeUser(orgId, "sales@dms.test", ["sales_rep"]);
    const hr = await ctxFor((await makeUser(orgId, "hr@x.test", ["hr_manager"])).id);
    const e = await createEmployee(hr, { firstName: "Plain", lastName: "Text", joinDate: "2026-01-01" });
    await prisma.$executeRaw`INSERT INTO "EmployeeBankAccount" ("id","organizationId","employeeId","bankName","iban","accountName","effectiveFrom") VALUES ('legacy_bank_row_2', ${orgId}, ${e.id}, 'Demo Bank', 'SA0380000000608010167519', 'Plain Text', '2025-01-01')`;
    await prisma.lead.create({ data: { organizationId: orgId, number: "LEAD-900001", name: "QA Lead 123456", email: "qa@client.test", source: "MANUAL" } });
    const demo = await demoArtifacts();
    expect(demo.clean).toBe(false);
    expect(demo.findings).toMatchObject({ demoUsers: 1, demoPasswordUsers: 0, qaFixtures: 1, fakeEmailDomains: 1, demoBankAccounts: 1 });
    expect((await companyReadiness()).missing).toEqual(expect.arrayContaining(["legalName", "vatNumber", "crNumber", "address", "invoicePaymentInstructions"]));
    const r = await goLiveChecks({ target: "production", probeUrl: false, env: { ...process.env, APP_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://localhost:3100" } });
    const level = (k: string) => r.find((x) => x.key === k)?.level;
    for (const k of ["demo_data", "iban_encryption", "database_backup", "zatca", "antivirus", "db_encryption_at_rest", "database_tls", "company_data", "environment_marker", "https_health"]) expect([k, level(k)]).toEqual([k, "BLOCK"]);
    expect(verdict(r)).toBe("BLOCK");
    // a VERIFIED backup made with the logical engine does not satisfy production
    await prisma.backupRecord.create({ data: { status: "VERIFIED", fileName: "x.ndjson.gz", metadata: { engine: "logical" }, verifiedAt: new Date() } });
    const r2 = await goLiveChecks({ target: "production", probeUrl: false });
    expect(r2.find((x) => x.key === "database_backup")).toMatchObject({ level: "BLOCK", detail: expect.stringMatching(/must be pg_dump/) });
  });
});

describe("administrator provisioning", () => {
  it("one-time temporary password, forced change, audited; demo identities refused in production; recovery revokes sessions", async () => {
    const t = temporaryPassword();
    expect(t.length).toBeGreaterThanOrEqual(24);
    expect(temporaryPassword()).not.toBe(t);
    const r = await provisionSuperAdmin(orgId, { email: "IT.Lead@Company.sa", name: "IT Lead" });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: r.userId }, include: { roles: { include: { role: true } } } });
    expect(u).toMatchObject({ email: "it.lead@company.sa", mustChangePassword: true });
    expect(u.roles.map((x) => x.role.key)).toEqual(["super_admin"]);
    expect(await verifyPassword(u.passwordHash, r.temporaryPassword)).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "system.admin_provisioned", entityId: u.id } });
    expect(JSON.stringify(audit)).not.toContain(r.temporaryPassword);
    await expect(provisionSuperAdmin(orgId, { email: "it.lead@company.sa", name: "x" })).rejects.toThrow(/already exists/);
    await withEnv({ APP_ENV: "production" }, async () => {
      await expect(provisionSuperAdmin(orgId, { email: "admin@dms.test", name: "Demo" })).rejects.toThrow(/demo e-mail/);
    });
    await prisma.session.create({ data: { id: "s-admin-1", userId: u.id, expiresAt: new Date(Date.now() + 3600_000) } });
    const reset = await provisionSuperAdmin(orgId, { email: "it.lead@company.sa", reset: true });
    expect(reset.temporaryPassword).not.toBe(r.temporaryPassword);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: "s-admin-1" } })).revokedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "system.admin_recovery_reset" } })).toBe(1);
    const other = await makeUser(orgId, "plain@x.test", ["employee"]);
    await expect(provisionSuperAdmin(orgId, { email: other.email, reset: true })).rejects.toThrow(/Super Admin recovery/);
  });
});

describe("observability adapters & correlation", () => {
  it("Sentry / webhook reporters send redacted events tagged with the request reference", async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => (sent.push({ url, init }), new Response("{}"))) as unknown as typeof fetch;
    const silent: string[] = [];
    setLogSink((l) => silent.push(l), true);
    try {
      setErrorReporter(sentryReporter("https://publickey123@o1.ingest.sentry.example/4242", fake));
      expect(errorReporterStatus()).toMatchObject({ name: "sentry", configured: true });
      const ref = runWithObs({ requestId: "req-sentry-1" }, () => reportError(new Error("boom password=hunter2 Bearer abcdefghijklmnopq SA0380000000608010167519"), "test", { iban: "SA0380000000608010167519", baseSalary: 9000 }));
      expect(ref).toBe("req-sentry-1");
      await new Promise((r) => setTimeout(r, 20));
      expect(sent[0].url).toBe("https://o1.ingest.sentry.example/api/4242/envelope/");
      expect((sent[0].init.headers as Record<string, string>)["x-sentry-auth"]).toMatch(/sentry_key=publickey123/);
      const body = String(sent[0].init.body);
      expect(body).toContain('"ref":"req-sentry-1"');
      for (const s of ["hunter2", "abcdefghijklmnopq", "SA0380000000608010167519", "9000"]) expect(body).not.toContain(s);
      setErrorReporter(webhookReporter("https://alerts.example/hook", "tok", fake));
      runWithObs({ requestId: "req-hook-1" }, () => reportError(new Error("db exploded"), "test"));
      await new Promise((r) => setTimeout(r, 20));
      expect(JSON.parse(String(sent[1].init.body))).toMatchObject({ ref: "req-hook-1", category: "INTERNAL_ERROR" });
    } finally {
      setErrorReporter(null);
      setLogSink(null);
    }
    expect(validateConfig({ SENTRY_DSN: "not a dsn" }).issues).toEqual(expect.arrayContaining([expect.objectContaining({ key: "SENTRY_DSN", code: "INVALID" })]));
  });

  it("one request id traces website lead → domain event → rule execution → integration outbox", async () => {
    const admin = await ctxFor((await makeUser(orgId, "admin@x.test", ["super_admin"])).id);
    const conn = await prisma.integrationConnection.findFirstOrThrow({ where: { organizationId: orgId, provider: "CUSTOM" } });
    await prisma.integrationConnection.update({ where: { id: conn.id }, data: { status: "CONNECTED", environment: "SANDBOX" } });
    const { id } = await createRule(admin, { name: "Trace rule", triggerEvent: "lead.created", actions: [{ type: "outbound_webhook", connectionId: conn.id }] });
    await setRuleEnabled(admin, id, true);
    await runWithObs({ requestId: "req-trace-0001", correlationId: "req-trace-0001", module: "public" }, () => captureWebsiteLead({ name: "Trace Visitor", phone: "0551239999", service: "web-development", elapsed: 9000 }, { ip: "1.2.3.4", userAgent: "t" }));
    const ev = await prisma.domainEvent.findFirstOrThrow({ where: { type: "lead.created" } });
    const ex = await prisma.automationExecution.findFirstOrThrow({ where: { ruleId: id } });
    const ob = await prisma.integrationOutbox.findFirstOrThrow({ where: { idempotencyKey: `automation:${ex.id}:0` } });
    expect([ev.correlationId, ex.correlationId, ob.correlationId]).toEqual(["req-trace-0001", "req-trace-0001", "req-trace-0001"]);
  });
});

describe("CSP & configuration", () => {
  it("the /app CSP uses a per-request nonce with strict-dynamic and no unsafe-inline scripts", () => {
    const c = osCsp("abc123==", false);
    const script = c.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toBe("script-src 'self' 'nonce-abc123==' 'strict-dynamic'");
    expect(c).toMatch(/frame-ancestors 'none'/);
    expect(osCsp("x", true)).toMatch(/'unsafe-eval'/); // development only
  });

  it("production builds need APP_ENV, a public https origin and a separate HR field key", () => {
    const base = { NODE_ENV: "production", DATABASE_URL: "postgresql://a/b", DOCUMENT_STORAGE_DIR: "/srv/docs", HR_FIELD_KEY: Buffer.alloc(32, 1).toString("base64") };
    const crit = (env: Record<string, string>) => validateConfig(env).issues.filter((i) => i.level === "critical").map((i) => `${i.key}:${i.code}`);
    expect(crit({ ...base, NEXT_PUBLIC_SITE_URL: "https://os.example.sa" })).toContain("APP_ENV:REQUIRED_FOR_PRODUCTION_BUILD");
    expect(crit({ ...base, APP_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://localhost:8443" })).toContain("NEXT_PUBLIC_SITE_URL:LOCALHOST_NOT_ALLOWED");
    expect(crit({ ...base, APP_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://os.example.sa", INTEGRATION_MASTER_KEY: base.HR_FIELD_KEY })).toContain("HR_FIELD_KEY:MUST_DIFFER_FROM_INTEGRATION_MASTER_KEY");
    expect(crit({ ...base, APP_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://os.example.sa", HR_FIELD_KEY: "" })).toContain("HR_FIELD_KEY:MISSING");
    expect(crit({ ...base, APP_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://os.example.sa" })).toEqual([]);
  });
});

describe.skipIf(!hasPgTools)("pg_dump / pg_restore (real client tools)", () => {
  it("creates a custom-format pg_dump backup and verifies it by a real pg_restore into a temporary database", async () => {
    await withEnv({ PG_DUMP_PATH: path.join(PG_BIN, process.platform === "win32" ? "pg_dump.exe" : "pg_dump"), PG_RESTORE_PATH: path.join(PG_BIN, process.platform === "win32" ? "pg_restore.exe" : "pg_restore") }, async () => {
      const sm = await ctxFor((await makeUser(orgId, "sm@x.test", ["sales_manager"])).id);
      await createClient(sm, { displayName: "Dump Client" });
      const url = process.env.DATABASE_URL!;
      const b = await createBackup(url, { dir: backupTmp, engine: "pg_dump" });
      expect(b.file).toMatch(/\.dump$/);
      expect(b.metadata).toMatchObject({ format: "pg_dump-custom", rowCounts: expect.objectContaining({ Client: 1 }) });
      const v = await verifyBackup(b.file, { serverUrl: url, appDatabaseUrl: url, migrate: migrateTo });
      expect(v.steps.map((s) => `${s.step}:${s.ok}`)).toEqual(["size:true", "checksum:true", "structure:true", "temp_database:true", "restore:true", "migrations:true", "row_counts:true", "integrity:true", "cleanup:true"]);
      // a truncated archive fails the structure check (pg_restore --list)
      const bad = path.join(backupTmp, "truncated.dump");
      const { readFileSync } = await import("node:fs");
      writeFileSync(bad, readFileSync(b.file).subarray(0, 2000));
      const { sha256File } = await import("@/server/system/backup");
      writeFileSync(`${bad}.sha256`, `${await sha256File(bad)}  truncated.dump\n`);
      const vb = await verifyBackup(bad, { serverUrl: url, migrate: migrateTo });
      expect(vb.ok).toBe(false);
    });
  }, 240_000);
});

describe("worker-independent unit of work", () => {
  it("system context events still carry correlation in workers", async () => {
    await runWithObs({ requestId: "job-req-1", correlationId: "job-req-1", job: "x" }, () => unitOfWork(systemCtx(orgId), async (_tx, uow) => uow.emit({ type: "test.ping" })));
    expect((await prisma.domainEvent.findFirstOrThrow({ where: { type: "test.ping" } })).correlationId).toBe("job-req-1");
  });
});
