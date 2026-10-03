import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { prisma } from "@/server/db";
import { systemCtx } from "@/server/context";
import { createLead, updateLead } from "@/server/crm/leads";
import { subscribe, unitOfWork, redispatch } from "@/server/events/bus";
import { createRule, updateRule, setRuleEnabled, processExecution, retryExecution, dismissExecution, onEvent, listRules, MAX_DEPTH } from "@/server/automation/engine";
import { validateConditions, evaluate } from "@/server/automation/conditions";
import { AUTOMATION_DENIED_PERMISSIONS, HIGH_RISK_ACTIONS } from "@/server/automation/actions";
import { withLease } from "@/server/jobs/lease";
import { jobHealth } from "@/server/system/jobs";
import { checkDatabase, readiness, liveness } from "@/server/system/health";
import { validateConfig } from "@/server/system/config";
import { retryEvent, dismissEvent, recoverEvents } from "@/server/system/events";
import { systemOverview, deadLetters } from "@/server/system/overview";
import { backupDir, createBackup, restoreBackup, sha256File, verifyBackup } from "@/server/system/backup";
import { purgeOperationalData } from "@/server/system/retention";
import { log, setLogSink } from "@/server/obs/log";
import { redact } from "@/server/obs/redact";
import { apiErrorBody, classifyError } from "@/server/obs/errors";
import { runWithObs } from "@/server/obs/context";
import { isSameOrigin } from "@/server/security/csrf";
import { enforceLimit, LIMITS } from "@/server/security/limits";
import { sessionCookieOptions } from "@/lib/os/constants";
import { assertProductionAccountSafe, ensureSuperAdmin, DEMO_PASSWORD } from "@/server/bootstrap";
import { createClient } from "@/server/crm/clients";
import { createDocument, downloadDocument } from "@/server/ops/documents";
import { LocalStorageForTests, setDocumentStorage } from "@/server/ops/storage";
import { headerRules } from "../security-headers.mjs";
import { migrateTo } from "../scripts/_backup-shared";
import { ctxFor, makeUser, resetDb, roleId, setupOrg } from "./helpers";
import "@/server/handlers";

/**
 * Phase 9 — business rules, idempotency / versioning / recursion, jobs & leases, health / readiness, logging redaction,
 * error model, backups (real logical backup + restore verification), configuration, demo-data protection, headers,
 * CSRF, rate limits, domain-event and dead-letter recovery, document-owner regression.
 */
let orgId: string;
let storageDir: string;
let backupTmp: string;
beforeAll(() => {
  storageDir = mkdtempSync(path.join(tmpdir(), "dms-p9-docs-"));
  backupTmp = mkdtempSync(path.join(tmpdir(), "dms-p9-backup-"));
  setDocumentStorage(new LocalStorageForTests(storageDir));
});
afterAll(() => {
  setDocumentStorage(null);
  rmSync(storageDir, { recursive: true, force: true });
  rmSync(backupTmp, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
});

const code = (re: RegExp) => ({ message: expect.stringMatching(re) });
const users = async () => ({
  admin: await ctxFor((await makeUser(orgId, "admin@x.test", ["super_admin"])).id),
  ceo: await ctxFor((await makeUser(orgId, "ceo@x.test", ["ceo"])).id),
  sm: await ctxFor((await makeUser(orgId, "sm@x.test", ["sales_manager"])).id),
  rep: await ctxFor((await makeUser(orgId, "rep@x.test", ["sales_rep"])).id),
  emp: await ctxFor((await makeUser(orgId, "emp@x.test", ["employee"])).id)
});
type U = Awaited<ReturnType<typeof users>>;
const notifyOwner = (message = "New web lead") => [{ type: "notify", to: "owner", priority: "HIGH", message }];
const leadRule = async (u: U, conditions: unknown = { all: [] }, actions: unknown = notifyOwner(), trigger = "lead.created") => {
  const { id } = await createRule(u.admin, { name: "Rule under test", triggerEvent: trigger, conditions, actions });
  await setRuleEnabled(u.admin, id, true);
  return id;
};
const autoNotifs = () => prisma.notification.count({ where: { category: "AUTOMATION" } });

describe("business rules", () => {
  it("1–3. an enabled rule runs exactly once per event; a duplicate delivery never re-runs it; a disabled rule never runs", async () => {
    const u = await users();
    const id = await leadRule(u);
    const lead = await createLead(u.sm, { name: "Rule Lead", phone: "0551112233", source: "WEBSITE", ownerId: u.rep.userId });
    const ex = await prisma.automationExecution.findMany({ where: { ruleId: id } });
    expect(ex).toHaveLength(1);
    expect(ex[0]).toMatchObject({ status: "SUCCEEDED", entityId: lead.id, conditionResult: true });
    expect(await prisma.notification.findMany({ where: { category: "AUTOMATION" }, select: { userId: true } })).toEqual([{ userId: u.rep.userId }]);
    // the same event delivered again (recovery re-dispatch / direct re-invocation) — no second execution, no second notification
    const ev = await prisma.domainEvent.findFirstOrThrow({ where: { type: "lead.created", entityId: lead.id } });
    await onEvent({ id: ev.id, organizationId: orgId, actorId: null, type: ev.type, entityType: ev.entityType!, entityId: ev.entityId!, payload: {}, correlationId: ev.correlationId, causationId: null, depth: 0 });
    await prisma.domainEvent.update({ where: { id: ev.id }, data: { status: "FAILED", handlersDone: [] } });
    await redispatch(ev.id, { from: ["FAILED"] });
    expect(await prisma.automationExecution.count({ where: { ruleId: id } })).toBe(1);
    expect(await autoNotifs()).toBe(1);
    // DB constraint is the guarantee
    await expect(prisma.automationExecution.create({ data: { organizationId: orgId, ruleId: id, ruleVersionId: ex[0].ruleVersionId, domainEventId: ev.id, eventType: "lead.created" } })).rejects.toThrow();
    // disabled → nothing
    await setRuleEnabled(u.admin, id, false);
    await createLead(u.sm, { name: "Second Lead", phone: "0551112234", source: "WEBSITE", ownerId: u.rep.userId });
    expect(await prisma.automationExecution.count({ where: { ruleId: id } })).toBe(1);
    // a new rule is always created disabled
    const r2 = await createRule(u.admin, { name: "Fresh", triggerEvent: "lead.created", actions: notifyOwner() });
    expect((await prisma.automationRule.findUniqueOrThrow({ where: { id: r2.id } })).enabled).toBe(false);
  });

  it("4–5. AND / OR conditions are evaluated against the current record", async () => {
    const u = await users();
    const and = await leadRule(u, { all: [{ field: "lead.source", op: "eq", value: "WEBSITE" }, { field: "lead.priority", op: "eq", value: "HIGH" }] });
    const or = await leadRule(u, { any: [{ field: "lead.city", op: "eq", value: "Jeddah" }, { field: "lead.budgetMax", op: "gte", value: 50000 }] }, notifyOwner("OR rule"));
    await createLead(u.sm, { name: "Medium Web", phone: "0551110001", source: "WEBSITE", priority: "MEDIUM", ownerId: u.rep.userId });
    await createLead(u.sm, { name: "High Web Riyadh", phone: "0551110002", source: "WEBSITE", priority: "HIGH", city: "Riyadh", ownerId: u.rep.userId });
    await createLead(u.sm, { name: "Big Budget", phone: "0551110003", source: "PHONE", budgetMax: "80000", ownerId: u.rep.userId });
    const st = async (rule: string) => (await prisma.automationExecution.findMany({ where: { ruleId: rule }, orderBy: { createdAt: "asc" } })).map((x) => x.status);
    expect(await st(and)).toEqual(["SKIPPED", "SUCCEEDED", "SKIPPED"]);
    expect(await st(or)).toEqual(["SKIPPED", "SKIPPED", "SUCCEEDED"]);
    expect((await prisma.automationExecution.findFirstOrThrow({ where: { ruleId: and, status: "SKIPPED" } })).skipReason).toBe("CONDITIONS_NOT_MET");
    // pure evaluator
    const g = validateConditions({ any: [{ all: [{ field: "invoice.balanceDue", op: "gt", value: 0 }, { field: "client.country", op: "eq", value: "SA" }] }, { field: "invoice.daysOverdue", op: "gte", value: 30 }] }, "invoice");
    expect(evaluate(g, { "invoice.balanceDue": 10, "client.country": "sa", "invoice.daysOverdue": 1 })).toBe(true);
    expect(evaluate(g, { "invoice.balanceDue": 0, "client.country": "SA", "invoice.daysOverdue": 31 })).toBe(true);
    expect(evaluate(g, { "invoice.balanceDue": 0, "client.country": "SA", "invoice.daysOverdue": 1 })).toBe(false);
    expect(evaluate(g, { "invoice.balanceDue": null, "client.country": null, "invoice.daysOverdue": null })).toBe(false);
  });

  it("6–7. invalid conditions and high-risk / unknown actions are rejected; automation never holds high-risk permissions", async () => {
    const u = await users();
    const bad = async (conditions: unknown, actions: unknown = notifyOwner(), trigger = "lead.created") => createRule(u.admin, { name: "Bad rule", triggerEvent: trigger, conditions, actions });
    await expect(bad({ all: [{ field: "lead.password", op: "eq", value: "x" }] })).rejects.toMatchObject(code(/CONDITION_INVALID:unknown_field/));
    await expect(bad({ all: [{ field: "lead.budgetMax", op: "contains", value: "1" }] })).rejects.toMatchObject(code(/CONDITION_INVALID:op/));
    await expect(bad({ all: [{ field: "lead.budgetMax", op: "gt", value: "1000; DROP TABLE" }] })).rejects.toMatchObject(code(/CONDITION_INVALID:number/));
    await expect(bad({ all: [{ field: "lead.source", op: "eq", value: "HACKER" }] })).rejects.toMatchObject(code(/CONDITION_INVALID:option/));
    await expect(bad({ all: [{ all: [{ all: [{ all: [{ field: "lead.city", op: "eq", value: "x" }] }] }] }] })).rejects.toMatchObject(code(/too_deep/));
    await expect(bad({ all: [{ field: "lead.city", op: "eq", value: "x", code: "process.exit()" }] })).rejects.toMatchObject(code(/CONDITION_INVALID:shape/));
    await expect(bad({ $where: "1" })).rejects.toMatchObject(code(/CONDITION_INVALID/));
    await expect(bad({ all: [] }, [], "lead.created")).rejects.toMatchObject(code(/ACTIONS_REQUIRED/));
    await expect(bad({ all: [] }, notifyOwner(), "user.created")).rejects.toMatchObject(code(/UNKNOWN_TRIGGER/));
    for (const type of ["approve_expense", "pay_invoice", "mark_payroll_paid", "change_salary", "delete_client", "terminate_employee", "send_campaign", "issue_contract", "approve_quotation"])
      await expect(bad({ all: [] }, [{ type }])).rejects.toMatchObject(code(/HIGH_RISK_ACTION/));
    await expect(bad({ all: [] }, [{ type: "eval", code: "1" }])).rejects.toMatchObject(code(/UNKNOWN_ACTION/));
    await expect(bad({ all: [] }, [{ type: "project_task", title: "x x", inDays: 1 }])).rejects.toMatchObject(code(/ACTION_NOT_FOR_TRIGGER/));
    expect(HIGH_RISK_ACTIONS.length).toBeGreaterThan(10);
    for (const p of ["approvals.decide", "finance.payments.create", "hr.payroll.pay", "hr.compensation.manage", "sales.contracts.activate", "whatsapp.campaigns.create", "finance.expenses.approve"] as const) expect(AUTOMATION_DENIED_PERMISSIONS).toContain(p);
    // only trusted roles manage rules
    for (const who of [u.sm, u.rep, u.emp]) await expect(createRule(who, { name: "Nope", triggerEvent: "lead.created", actions: notifyOwner() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listRules(u.emp, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("8. recursion protection: a rule never re-fires in its own causal chain; depth is capped", async () => {
    const u = await users();
    // lead.assigned → assign owner to the sales manager → emits lead.assigned again (same correlation, depth 1)
    const id = await leadRule(u, { all: [] }, [{ type: "assign_owner", userId: u.sm.userId }], "lead.assigned");
    const lead = await createLead(u.sm, { name: "Loop Lead", phone: "0551113000", source: "WEBSITE", ownerId: u.sm.userId });
    await updateLead(u.sm, { id: lead.id, ownerId: u.rep.userId });
    const ex = await prisma.automationExecution.findMany({ where: { ruleId: id }, orderBy: { createdAt: "asc" } });
    expect(ex.map((x) => [x.status, x.skipReason, x.depth])).toEqual([["SUCCEEDED", null, 0], ["SKIPPED", "RECURSION_CYCLE", 1]]);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).ownerId).toBe(u.sm.userId);
    const chain = await prisma.domainEvent.findMany({ where: { type: "lead.assigned", entityId: lead.id }, orderBy: { createdAt: "asc" } });
    expect(chain[1].causationId).toBe(chain[0].id);
    expect(chain[1].correlationId).toBe(chain[0].correlationId);
    // an event already at the maximum depth never runs rules
    const deep = { ...systemCtx(orgId), trace: { correlationId: "deep-chain", causationId: "x", depth: MAX_DEPTH } };
    const id2 = await leadRule(u, { all: [] }, notifyOwner("deep"), "lead.created");
    await unitOfWork(deep, async (_tx, uow) => uow.emit({ type: "lead.created", entityType: "Lead", entityId: lead.id }));
    expect((await prisma.automationExecution.findFirstOrThrow({ where: { ruleId: id2 } })).skipReason).toBe("RECURSION_DEPTH");
  });

  it("9. rule versions are immutable snapshots; executions keep the version they ran with", async () => {
    const u = await users();
    const id = await leadRule(u, { all: [] }, notifyOwner("v1 message"));
    await createLead(u.sm, { name: "First", phone: "0551114000", source: "WEBSITE", ownerId: u.rep.userId });
    await updateRule(u.admin, id, { name: "Rule under test", triggerEvent: "lead.created", conditions: { all: [] }, actions: notifyOwner("v2 message") });
    await createLead(u.sm, { name: "Second", phone: "0551114001", source: "WEBSITE", ownerId: u.rep.userId });
    const ex = await prisma.automationExecution.findMany({ where: { ruleId: id }, orderBy: { createdAt: "asc" }, include: { ruleVersion: true } });
    expect(ex.map((x) => x.ruleVersion.version)).toEqual([1, 2]);
    expect((ex[0].ruleVersion.actions as { message: string }[])[0].message).toBe("v1 message");
    const titles = (await prisma.notification.findMany({ where: { category: "AUTOMATION" }, orderBy: { createdAt: "asc" } })).map((n) => n.title);
    expect(titles[0]).toMatch(/^v1 message/);
    expect(titles[1]).toMatch(/^v2 message/);
    await expect(prisma.automationRuleVersion.update({ where: { id: ex[0].ruleVersionId }, data: { actions: [] } })).rejects.toThrow(/RULE_VERSION_IMMUTABLE/);
    await expect(prisma.automationRuleVersion.delete({ where: { id: ex[0].ruleVersionId } })).rejects.toThrow(/RULE_VERSION_IMMUTABLE/);
    // a pure rename does not create a version
    await updateRule(u.admin, id, { name: "Renamed rule", triggerEvent: "lead.created", conditions: { all: [] }, actions: notifyOwner("v2 message") });
    expect((await prisma.automationRule.findUniqueOrThrow({ where: { id } })).version).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: { in: ["automation.created", "automation.enabled", "automation.updated"] } } })).toBe(4);
  });

  it("10–11. an action failure is recorded; the retry completes only the missing action (no duplicate effects)", async () => {
    const u = await users();
    await prisma.integrationConnection.create({ data: { id: "conn_custom_test_01", organizationId: orgId, provider: "CUSTOM", name: "qa", status: "CONNECTED", config: { endpointUrl: "https://hooks.example.test/in", events: "*" } } });
    const id = await leadRule(u, { all: [] }, [...notifyOwner("Two-step"), { type: "outbound_webhook", connectionId: "conn_custom_test_01" }]);
    // the connection disappears after the rule was validated → the 2nd action fails
    await prisma.integrationConnection.delete({ where: { id: "conn_custom_test_01" } });
    await createLead(u.sm, { name: "Fail Lead", phone: "0551115000", source: "WEBSITE", ownerId: u.rep.userId });
    const x = await prisma.automationExecution.findFirstOrThrow({ where: { ruleId: id } });
    expect(x.status).toBe("FAILED");
    expect(x.error).toMatch(/outbound_webhook: CONNECTION_MISSING/);
    expect(x.actionResults).toEqual([expect.objectContaining({ i: 0, type: "notify", status: "done" }), expect.objectContaining({ i: 1, type: "outbound_webhook", status: "failed" })]);
    expect(await autoNotifs()).toBe(1);
    // fix the cause, let the worker retry: only the webhook runs now
    await prisma.integrationConnection.create({ data: { id: "conn_custom_test_01", organizationId: orgId, provider: "CUSTOM", name: "qa", status: "CONNECTED", config: { endpointUrl: "https://hooks.example.test/in", events: "*" } } });
    expect(await processExecution(x.id, new Date(Date.now() + 3600_000))).toBe("SUCCEEDED");
    expect(await autoNotifs()).toBe(1);
    expect(await prisma.integrationOutbox.count({ where: { idempotencyKey: `automation:${x.id}:1` } })).toBe(1);
    expect(await processExecution(x.id, new Date(Date.now() + 7200_000))).toBeNull(); // nothing left to claim
    await expect(retryExecution(u.admin, x.id)).rejects.toMatchObject(code(/EXECUTION_NOT_RETRYABLE/));
  });
});

describe("jobs, leases, health", () => {
  it("12–13. a lease prevents double execution; a stale lease recovers; runs are recorded with heartbeats", async () => {
    let calls = 0;
    const slow = () => new Promise<string>((r) => setTimeout(() => (calls++, r("done")), 300));
    const [a, b] = await Promise.all([withLease("test:job", 5000, slow), withLease("test:job", 5000, slow)]);
    expect([a, b].filter((x) => x === "done")).toHaveLength(1);
    expect([a, b]).toContain(null);
    expect(calls).toBe(1);
    expect(await prisma.systemJob.findUniqueOrThrow({ where: { key: "test:job" } })).toMatchObject({ status: "SUCCEEDED", runCount: 1, failCount: 0 });
    // a crashed holder: lease left locked in the past, registry left RUNNING with an old heartbeat
    await prisma.jobLease.update({ where: { key: "test:job" }, data: { holder: "dead-process", lockedUntil: new Date(Date.now() - 1000) } });
    await prisma.systemJob.create({ data: { key: "sweep:ops:cdeadorg0000000000000000", name: "sweep:ops", status: "RUNNING", heartbeatAt: new Date(Date.now() - 3600_000), lastStartedAt: new Date(Date.now() - 3600_000) } });
    expect((await jobHealth()).find((j) => j.name === "sweep:ops")?.state).toBe("STUCK");
    expect(await withLease("test:job", 5000, async () => "recovered")).toBe("recovered");
    // failures are recorded (sanitized) and counted
    await expect(withLease("test:fail", 5000, async () => { throw new Error("boom password=hunter2"); })).rejects.toThrow();
    const f = await prisma.systemJob.findUniqueOrThrow({ where: { key: "test:fail" } });
    expect(f).toMatchObject({ status: "FAILED", failCount: 1, failStreak: 1 });
    expect(f.lastError).not.toContain("hunter2");
    // heartbeat renews the lease while a long job runs; a timeout marks the run failed
    const before = Date.now();
    await withLease("test:long", 1500, async () => {
      await new Promise((r) => setTimeout(r, 1300));
      const l = await prisma.jobLease.findUniqueOrThrow({ where: { key: "test:long" } });
      expect(l.lockedUntil.getTime()).toBeGreaterThan(before + 1500);
    }, { timeoutMs: 5000 });
    await expect(withLease("test:timeout", 1000, () => new Promise((r) => setTimeout(r, 3000)), { timeoutMs: 200 })).rejects.toThrow(/TIMEOUT/);
    expect((await prisma.systemJob.findUniqueOrThrow({ where: { key: "test:timeout" } })).status).toBe("FAILED");
  });

  it("14–16. /api/health is I/O-free; readiness fails without a database or with invalid production config; optional integrations never make it unready", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", version: expect.any(String) });
    expect(liveness().status).toBe("ok");
    const dead = new PrismaClient({ adapter: new PrismaPg({ connectionString: "postgresql://nobody:x@127.0.0.1:1/none" }) });
    expect((await checkDatabase(dead)).status).toBe("fail");
    const r = await readiness({ db: dead });
    expect(r).toMatchObject({ ready: false });
    expect(r.checks.find((c) => c.name === "database")).toMatchObject({ status: "fail", detail: "unreachable" });
    expect(JSON.stringify(r)).not.toMatch(/nobody|127\.0\.0\.1:1/);
    await dead.$disconnect().catch(() => undefined);
    // invalid production configuration → critical
    const cfg = validateConfig({ NODE_ENV: "production", DATABASE_URL: "postgresql://a/b", ALLOW_DEMO_SEED: "1", INTEGRATION_MASTER_KEY: "c2hvcnQ=", DOCUMENT_STORAGE: "s3" });
    expect(cfg.ok).toBe(false);
    expect(cfg.issues.filter((i) => i.level === "critical").map((i) => `${i.key}:${i.code}`)).toEqual(expect.arrayContaining(["NEXT_PUBLIC_SITE_URL:MISSING", "ALLOW_DEMO_SEED:FORBIDDEN_IN_PRODUCTION", "INTEGRATION_MASTER_KEY:INVALID_LENGTH", "S3_BUCKET:MISSING"]));
    expect(JSON.stringify(cfg)).not.toContain("postgresql://a/b");
    expect(validateConfig({ NODE_ENV: "production", APP_ENV: "production", DATABASE_URL: "postgresql://a/b", NEXT_PUBLIC_SITE_URL: "https://os.example.com", DOCUMENT_STORAGE_DIR: "/srv/docs", HR_FIELD_KEY: Buffer.alloc(32, 2).toString("base64") }).ok).toBe(true);
    // a broken optional integration (WhatsApp in ERROR, NOVA misconfigured) never makes the app unready
    process.env.DOCUMENT_STORAGE_DIR = storageDir;
    const prevNova = process.env.NOVA_URL;
    process.env.NOVA_URL = "not a url";
    await prisma.integrationConnection.upsert({ where: { organizationId_provider_name: { organizationId: orgId, provider: "WHATSAPP", name: "default" } }, create: { organizationId: orgId, provider: "WHATSAPP", name: "default", status: "ERROR" }, update: { status: "ERROR", lastErrorCode: "AUTH_FAILED" } });
    const ok = await readiness({ fresh: true });
    expect(ok.checks.find((c) => c.name === "database")?.status).toBe("ok");
    expect(ok.checks.find((c) => c.name === "migrations")?.status).toBe("ok");
    expect(ok.ready).toBe(true);
    if (prevNova === undefined) delete process.env.NOVA_URL;
    else process.env.NOVA_URL = prevNova;
  });
});

describe("logging & errors", () => {
  it("17–19. logs redact secrets, payroll / bank data and document contents; error responses hide internals", () => {
    const lines: string[] = [];
    setLogSink((l) => lines.push(l), true);
    try {
      runWithObs({ requestId: "req-123", actorId: "u1", organizationId: "o1", module: "test", operation: "op" }, () => {
        log.info("probe", {
          password: "hunter2", token: "tok_live_123456", authorization: "Bearer abcdefghijklmnop", nested: { accessToken: "EAAqwertyuiopasdfgh", signingSecret: "whsec_1" },
          note: "client said Bearer zzzzzzzzzzzz and token=qwerty123", url: "postgresql://dms:pw@db:5432/x",
          employee: { name: "Eyad", baseSalary: 18000, iban: "SA0380000000608010167519", netPay: 15000 }, comment: "IBAN SA0380000000608010167519 attached",
          file: Buffer.from("%PDF secret contract body"), data: "x".repeat(500)
        });
      });
    } finally {
      setLogSink(null);
    }
    const line = lines[0];
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({ level: "info", msg: "probe", requestId: "req-123", actorId: "u1", organizationId: "o1", module: "test", operation: "op" });
    for (const secret of ["hunter2", "tok_live_123456", "abcdefghijklmnop", "EAAqwertyuiop", "whsec_1", "zzzzzzzzzzzz", "qwerty123", "dms:pw", "18000", "15000", "SA0380000000608010167519", "secret contract body"]) expect(line).not.toContain(secret);
    expect(parsed.employee).toMatchObject({ name: "Eyad", baseSalary: "[private]", iban: "[private]" });
    expect(parsed.file).toMatch(/^\[binary \d+ bytes\]$/);
    // audit mode keeps business values but never secrets
    expect(redact({ password: "x", total: "100.00", baseSalary: 5000 }, "audit")).toEqual({ password: "[redacted]", total: "100.00", baseSalary: 5000 });
    // error model
    const sqlish = Object.assign(new Error('relation "User" does not exist — SELECT passwordHash FROM "User"'), { code: "42P01" });
    expect(classifyError(sqlish)).toMatchObject({ category: "INTERNAL_ERROR", expected: false });
    const silent: string[] = [];
    setLogSink((l) => silent.push(l), true);
    const body = runWithObs({ requestId: "req-err" }, () => apiErrorBody(sqlish, "test"));
    setLogSink(null);
    expect(body).toEqual({ status: 500, body: { error: "INTERNAL_ERROR", code: "INTERNAL_ERROR", ref: "req-err" } });
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|SELECT|relation/);
    // the server log keeps the diagnostic (with the reference) — it is the UI / API body that never sees it
    expect(silent.join("")).toContain('"requestId":"req-err"');
    expect(classifyError(Object.assign(new Error("Can't reach database server"), { code: "P1001" })).category).toBe("DEPENDENCY_UNAVAILABLE");
    expect(classifyError(Object.assign(new Error("unique"), { code: "P2002" })).category).toBe("CONFLICT");
    expect(classifyError(Object.assign(new Error("x"), { name: "IntegrationError", code: "AUTH_FAILED" })).category).toBe("EXTERNAL_PROVIDER_ERROR");
  });
});

describe("backups", () => {
  it("20–22. unsafe destinations are refused; a backup has a checksum + metadata; verification restores for real and detects tampering", async () => {
    expect(() => backupDir({ BACKUP_DIR: "public/backups" })).toThrow(/BACKUP_DIR_UNSAFE/);
    expect(() => backupDir({ BACKUP_DIR: "src/x" })).toThrow(/BACKUP_DIR_UNSAFE/);
    expect(() => backupDir({ NODE_ENV: "production" })).toThrow(/BACKUP_DIR_REQUIRED/);
    const u = await users();
    await createLead(u.sm, { name: "Backup Lead", phone: "0551116000", source: "WEBSITE" });
    const url = process.env.DATABASE_URL!;
    const b = await createBackup(url, { dir: backupTmp, engine: "logical" });
    expect(b.sizeBytes).toBeGreaterThan(0);
    expect(readFileSync(`${b.file}.sha256`, "utf8").split(/\s+/)[0]).toBe(await sha256File(b.file));
    const meta = readFileSync(`${b.file}.json`, "utf8");
    expect(meta).not.toMatch(/dms_local_only|password|localhost/);
    expect(JSON.parse(meta)).toMatchObject({ format: "dms-logical-1", rowCounts: expect.objectContaining({ Lead: 1, Organization: 1 }) });
    // real restore into a temporary database, integrity checks, temp database dropped
    const v = await verifyBackup(b.file, { serverUrl: url, appDatabaseUrl: url, migrate: migrateTo });
    expect(v.ok).toBe(true);
    expect(v.steps.map((s) => s.step)).toEqual(["size", "checksum", "structure", "temp_database", "restore", "migrations", "row_counts", "integrity", "cleanup"]);
    const leftovers = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_database WHERE datname LIKE 'dms_verify_%'`;
    expect(leftovers[0].n).toBe(0);
    // tampering / truncation / empty file are detected
    const bad = path.join(backupTmp, "tampered.ndjson.gz");
    const buf = readFileSync(b.file);
    buf[buf.length - 5] ^= 0xff;
    writeFileSync(bad, buf);
    writeFileSync(`${bad}.sha256`, readFileSync(`${b.file}.sha256`));
    expect((await verifyBackup(bad, { serverUrl: url, migrate: migrateTo })).steps.at(-1)).toMatchObject({ step: "checksum", ok: false });
    const empty = path.join(backupTmp, "empty.ndjson.gz");
    writeFileSync(empty, "");
    expect((await verifyBackup(empty, { serverUrl: url, migrate: migrateTo })).steps.at(-1)).toMatchObject({ step: "size", ok: false });
    const garbage = path.join(backupTmp, "garbage.ndjson.gz");
    writeFileSync(garbage, "not gzip at all");
    writeFileSync(`${garbage}.sha256`, `${await sha256File(garbage)}  garbage.ndjson.gz\n`);
    expect((await verifyBackup(garbage, { serverUrl: url, migrate: migrateTo })).steps.at(-1)).toMatchObject({ step: "structure", ok: false });
    // restore refuses the application database and requires an explicit confirmation
    await expect(restoreBackup(b.file, { targetUrl: url, appDatabaseUrl: url, confirm: "dms_os_test", migrate: migrateTo })).rejects.toThrow(/RESTORE_REFUSED/);
    await expect(restoreBackup(b.file, { targetUrl: url, confirm: "wrong", migrate: migrateTo })).rejects.toThrow(/CONFIRMATION_MISMATCH/);
  }, 240_000);
});

describe("production protection & security", () => {
  it("23–24. demo seed and dev cleanup refuse production; production never provisions demo accounts or the demo password", async () => {
    const env = { ...process.env, NODE_ENV: "production", ALLOW_DEMO_SEED: "1" } as NodeJS.ProcessEnv;
    const seed = spawnSync("npx tsx prisma/seed.ts", [], { shell: true, encoding: "utf8", env });
    expect(seed.status).toBe(1);
    expect(seed.stderr).toMatch(/Demo seed refused/);
    const seed2 = spawnSync("npx tsx prisma/seed.ts", [], { shell: true, encoding: "utf8", env: { ...process.env, ALLOW_DEMO_SEED: "" } });
    expect(seed2.status).toBe(1);
    const cleanup = spawnSync("npx tsx scripts/dev-cleanup-qa.ts", [], { shell: true, encoding: "utf8", env });
    expect(cleanup.status).toBe(1);
    expect(cleanup.stderr).toMatch(/refused/);
    const prod = { NODE_ENV: "production" };
    expect(() => assertProductionAccountSafe("admin@dms.test", "Strong-Passw0rd!x", prod)).toThrow(/demo e-mail/);
    expect(() => assertProductionAccountSafe("owner@company.sa", DEMO_PASSWORD, prod)).toThrow(/demo password/);
    expect(() => assertProductionAccountSafe("admin@dms.test", DEMO_PASSWORD, { NODE_ENV: "development" })).not.toThrow();
    const prev = process.env.NODE_ENV;
    const prevApp = process.env.APP_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.APP_ENV = "production"; // Phase 10: deployment environment is APP_ENV (vitest otherwise resolves to "test")
    try {
      await expect(ensureSuperAdmin(orgId, { email: "admin@dms.test", name: "Demo", password: "Strong-Passw0rd!x" })).rejects.toThrow(/demo e-mail/);
      const real = await ensureSuperAdmin(orgId, { email: "it@company.sa", name: "IT", password: "Very-Strong-Passw0rd!2026" });
      expect(real.mustChangePassword).toBe(true); // bootstrap password is temporary in production
      expect(await prisma.auditLog.count({ where: { action: "system.bootstrap_admin_created", entityId: real.id } })).toBe(1);
      await makeUser(orgId, "sales@dms.test", ["sales_rep"]);
      const { checkDemoAccounts } = await import("@/server/system/health");
      expect((await checkDemoAccounts()).status).toBe("fail");
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
      if (prevApp === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevApp;
    }
  }, 120_000);

  it("25–27. security headers, CSRF same-origin guard, session cookie attributes, rate limits", async () => {
    const prod = headerRules(true);
    const page = prod.find((r) => r.source.startsWith("/:path((?!"))!;
    const h = Object.fromEntries(page.headers.map((x) => [x.key, x.value]));
    expect(h["Content-Security-Policy"]).toMatch(/default-src 'self'/);
    expect(h["Content-Security-Policy"]).toMatch(/frame-ancestors 'none'/);
    expect(h["Content-Security-Policy"]).toMatch(/object-src 'none'/);
    expect(h["Content-Security-Policy"]).not.toMatch(/unsafe-eval/);
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=31536000/);
    expect(h).toMatchObject({ "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" });
    const files = prod.find((r) => r.source.includes("(?:pdf|download|payslip))"))!;
    expect(files.headers.some((x) => x.key === "Content-Security-Policy")).toBe(false); // PDF viewer keeps working; routes set `sandbox`
    expect(headerRules(false)[1].headers.some((x) => x.key === "Strict-Transport-Security")).toBe(false);
    // CSRF
    const H = (o: Record<string, string>) => new Headers({ host: "os.example.com", ...o });
    expect(isSameOrigin(H({ origin: "https://os.example.com", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOrigin(H({ origin: "https://evil.example", "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOrigin(H({ origin: "https://evil.example" }))).toBe(false);
    expect(isSameOrigin(H({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(isSameOrigin(H({ origin: "null" }))).toBe(false);
    expect(isSameOrigin(H({}))).toBe(true); // non-browser client: no ambient cookies, no CSRF
    // cookie
    const c = sessionCookieOptions(new Date(Date.now() + 1000), true);
    expect(c).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(sessionCookieOptions(new Date(), false).secure).toBe(false);
    // rate limits (sensitive operations)
    for (let i = 0; i < LIMITS.integrationTest.limit; i++) await enforceLimit("integrationTest", "user-x");
    await expect(enforceLimit("integrationTest", "user-x")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await enforceLimit("integrationTest", "user-y"); // per actor
  });
});

describe("recovery", () => {
  it("28. a failed domain event is retried without repeating handlers that succeeded; poison events dead-letter; dismiss needs a reason", async () => {
    const u = await users();
    let flaky = 0;
    let good = 0;
    let poison = 0;
    subscribe("test.flaky", async () => void good++, "test-good");
    subscribe("test.flaky", async () => {
      flaky++;
      if (flaky === 1) throw new Error("transient");
    }, "test-flaky");
    subscribe("test.poison", async () => {
      poison++;
      throw new Error("always broken");
    }, "test-poison");
    await unitOfWork(systemCtx(orgId), async (_tx, uow) => uow.emit({ type: "test.flaky", entityType: "Test", entityId: "1" }));
    const ev = await prisma.domainEvent.findFirstOrThrow({ where: { type: "test.flaky" } });
    expect(ev).toMatchObject({ status: "FAILED", attempts: 1 });
    expect(ev.handlersDone).toEqual(expect.arrayContaining(["test-good"]));
    await expect(retryEvent(u.emp, ev.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(retryEvent(u.ceo, ev.id)).rejects.toMatchObject({ code: "FORBIDDEN" }); // infra operations stay with the system admin
    expect(await retryEvent(u.admin, ev.id)).toEqual({ ok: true });
    expect(await prisma.domainEvent.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject({ status: "PROCESSED", attempts: 2 });
    expect(good).toBe(1);
    expect(flaky).toBe(2);
    await expect(retryEvent(u.admin, ev.id)).rejects.toMatchObject(code(/EVENT_NOT_RETRYABLE/));
    // poison: retried by the recovery job with backoff until DEAD_LETTER
    await unitOfWork(systemCtx(orgId), async (_tx, uow) => uow.emit({ type: "test.poison", entityType: "Test", entityId: "2" }));
    const p = await prisma.domainEvent.findFirstOrThrow({ where: { type: "test.poison" } });
    for (let i = 1; i <= 6; i++) await recoverEvents(new Date(Date.now() + i * 3600_000));
    expect(await prisma.domainEvent.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ status: "DEAD_LETTER", attempts: 5 });
    expect(poison).toBe(5);
    expect((await deadLetters(u.admin)).items.some((x) => x.source === "event" && x.id === p.id)).toBe(true);
    await expect(dismissEvent(u.admin, p.id, {})).rejects.toThrow();
    await dismissEvent(u.admin, p.id, { reason: "handler removed in next release" });
    expect((await prisma.domainEvent.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("DISMISSED");
    expect(await prisma.auditLog.count({ where: { action: { in: ["system.event_retried", "system.event_dismissed"] } } })).toBe(2);
    // an event left PENDING (process died after commit) is re-dispatched
    const orphan = await prisma.domainEvent.create({ data: { organizationId: orgId, type: "test.flaky", payload: {}, createdAt: new Date(Date.now() - 10 * 60_000) } });
    await recoverEvents();
    expect((await prisma.domainEvent.findUniqueOrThrow({ where: { id: orphan.id } })).status).toBe("PROCESSED");
    const ov = await systemOverview(u.admin);
    expect(ov.ready.checks.length).toBeGreaterThan(3);
    await expect(systemOverview(u.emp)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("29. a dead-lettered rule execution is retried once more safely and audited", async () => {
    const u = await users();
    const ownerUser = await makeUser(orgId, "auto@x.test", ["super_admin"]);
    const owner = await ctxFor(ownerUser.id);
    const { id } = await createRule(owner, { name: "Owner rule", triggerEvent: "lead.created", actions: notifyOwner("Dead then alive") });
    await setRuleEnabled(owner, id, true);
    await prisma.user.update({ where: { id: ownerUser.id }, data: { status: "DISABLED" } });
    await createLead(u.sm, { name: "Dead Letter Lead", phone: "0551117000", source: "WEBSITE", ownerId: u.rep.userId });
    const x = await prisma.automationExecution.findFirstOrThrow({ where: { ruleId: id } });
    expect(x.status).toBe("DEAD_LETTER");
    expect(x.error).toMatch(/RUN_AS_USER_INACTIVE/);
    expect(await prisma.notification.count({ where: { category: "AUTOMATION", dedupeKey: `automation.failed:${x.id}` } })).toBeGreaterThan(0);
    await prisma.user.update({ where: { id: ownerUser.id }, data: { status: "ACTIVE" } });
    expect(await retryExecution(u.admin, x.id)).toEqual({ status: "SUCCEEDED" });
    expect(await prisma.notification.count({ where: { category: "AUTOMATION", title: { startsWith: "Dead then alive" } } })).toBe(1);
    await expect(retryExecution(u.admin, x.id)).rejects.toMatchObject(code(/EXECUTION_NOT_RETRYABLE/));
    await expect(dismissExecution(u.admin, x.id, { reason: "done" })).rejects.toMatchObject(code(/EXECUTION_NOT_DISMISSIBLE/));
    expect(await prisma.auditLog.count({ where: { action: "automation.execution_retried", entityId: x.id } })).toBe(1);
  });

  it("30. document-owner regression stays secure (former owner loses access with the record)", async () => {
    const u = await users();
    const repUser = await prisma.user.findFirstOrThrow({ where: { id: u.rep.userId } });
    const client = await createClient(u.sm, { displayName: "Owned Client" });
    await prisma.client.update({ where: { id: client.id }, data: { ownerId: repUser.id } });
    const doc = await createDocument(u.rep, { title: "Signed proposal", entityType: "CLIENT", entityId: client.id }, { name: "p.pdf", type: "application/pdf", data: Buffer.from("%PDF-1.4\n% p\n%%EOF\n") });
    expect((await downloadDocument(u.rep, doc.id)).data.length).toBeGreaterThan(0);
    await prisma.userRole.deleteMany({ where: { userId: repUser.id } });
    await prisma.userRole.create({ data: { userId: repUser.id, roleId: await roleId(orgId, "employee") } });
    await expect(downloadDocument(await ctxFor(repUser.id), doc.id)).rejects.toMatchObject({ code: expect.stringMatching(/NOT_FOUND|FORBIDDEN/) });
  });

  it("retention purges only operational data and never business records", async () => {
    const u = await users();
    const lead = await createLead(u.sm, { name: "Kept Lead", phone: "0551118000", source: "WEBSITE" });
    const old = new Date(Date.now() - 400 * 86_400_000);
    await prisma.notification.create({ data: { organizationId: orgId, userId: u.sm.userId, category: "SYSTEM", title: "old read", readAt: old, createdAt: old } });
    await prisma.session.create({ data: { id: "s-old", userId: u.sm.userId, expiresAt: old } });
    const dry = await purgeOperationalData({ dryRun: true });
    expect(dry.results.find((r) => r.key === "NOTIFICATIONS")?.rows).toBe(1);
    expect(await prisma.notification.count({ where: { title: "old read" } })).toBe(1);
    await purgeOperationalData({ dryRun: false });
    expect(await prisma.notification.count({ where: { title: "old read" } })).toBe(0);
    expect(await prisma.session.count({ where: { id: "s-old" } })).toBe(0);
    expect(await prisma.lead.count({ where: { id: lead.id } })).toBe(1);
    expect(await prisma.auditLog.count()).toBeGreaterThan(0);
  });
});
