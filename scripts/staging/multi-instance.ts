/**
 * STAGING multi-instance test (Phase 10). Runs against TWO web instances (127.0.0.1:3200 / :3201) and TWO workers.
 * Verifies: sessions valid across instances, shared rate limits, website leads → events → rule executions → outbox
 * deliveries with NO duplicates (a local signed-webhook receiver counts every delivery), leases / job registry.
 *   node scripts/staging/with-env.mjs . npx tsx scripts/staging/multi-instance.ts
 */
import "dotenv/config";
import http from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import { prisma } from "../../src/server/db";
import "../../src/server/handlers";
import { appEnv } from "../../src/server/system/environment";
import { isPermission } from "../../src/server/rbac/permissions";
import type { Ctx } from "../../src/server/context";
import { configureConnection, testConnection } from "../../src/server/integrations/registry";
import { createRule, setRuleEnabled } from "../../src/server/automation/engine";

const A = "http://127.0.0.1:3200";
const Bi = "http://127.0.0.1:3201";
const results: Record<string, unknown> = {};

async function ctxFor(email: string): Promise<Ctx> {
  const u = await prisma.user.findFirstOrThrow({ where: { email }, include: { roles: { include: { role: { include: { permissions: true } } } } } });
  return { organizationId: u.organizationId, userId: u.id, userName: u.name, roleKeys: u.roles.map((r) => r.role.key), permissions: new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission)).filter(isPermission)) };
}

async function loginVia(base: string, email: string, password: string) {
  const html = await (await fetch(`${base}/app/login`)).text();
  const fd = new FormData();
  const un = (v: string) => v.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  for (const [tag] of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    if (name?.startsWith("$ACTION")) fd.append(un(name), un(/value="([^"]*)"/.exec(tag)?.[1] ?? ""));
  }
  fd.append("email", email);
  fd.append("password", password);
  fd.append("next", "/app");
  const r = await fetch(`${base}/app/login`, { method: "POST", body: fd, redirect: "manual", headers: { origin: base, "x-forwarded-for": `10.77.${Math.floor(Math.random() * 250)}.9` } });
  return { status: r.status, cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] };
}

async function main() {
  if (appEnv() === "production") throw new Error("refused in production");
  const smokePw = process.env.SMOKE_PASSWORD!;
  // 1. sessions: issued by instance A, accepted by instance B (DB-backed sessions); logout on B revokes for A
  const s = await loginVia(A, "smoke.automation@dmstech.sa", smokePw);
  const onB = await fetch(`${Bi}/app`, { headers: { cookie: s.cookie }, redirect: "manual" });
  results.sessionAcrossInstances = { issuedBy: "3200", login: s.status, dashboardOn3201: onB.status };

  // 2. shared rate limit: wrong passwords for ONE (non-existent) e-mail, alternating instances → limit is global
  const probe = `ratelimit.${randomBytes(3).toString("hex")}@dmstech.sa`;
  const outcomes: string[] = [];
  for (let i = 0; i < 12; i++) {
    const r = await loginVia(i % 2 ? Bi : A, probe, "wrong-password-123");
    outcomes.push(`${i % 2 ? "B" : "A"}:${r.status}`);
  }
  const rl = await prisma.rateLimit.findUnique({ where: { key: `login:email:${probe}` } });
  results.sharedRateLimit = { outcomes, attempts: 12, counterInDb: rl?.count ?? 0, limit: 10, note: "one DB counter serves both instances" };

  // 3. outbox / automation / events across instances
  const received = new Map<string, number>();
  const secret = randomBytes(24).toString("hex");
  let badSig = 0;
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const sig = String(req.headers["x-dms-signature"] ?? "");
      const m = /^t=(\d+),v1=([0-9a-f]+)$/.exec(sig);
      const ok = m && createHmac("sha256", secret).update(`${m[1]}.`).update(body).digest("hex") === m[2];
      if (!ok) badSig++;
      const id = String(req.headers["x-dms-delivery"] ?? "");
      if (!id.startsWith("ping")) received.set(id, (received.get(id) ?? 0) + 1);
      res.writeHead(200).end("ok");
    });
  });
  await new Promise<void>((r) => srv.listen(9911, "127.0.0.1", r));
  const admin = await ctxFor("it.backup@dmstech.sa");
  const conn = await prisma.integrationConnection.findFirstOrThrow({ where: { organizationId: admin.organizationId, provider: "CUSTOM" } });
  await configureConnection(admin, conn.id, { environment: "SANDBOX", config: { endpointUrl: "http://127.0.0.1:9911/hook", events: "lead.created" }, secrets: { signingSecret: secret } });
  const t = await testConnection(admin, conn.id);
  results.customConnection = t.status;
  const rule = await createRule(admin, { name: `Multi-instance rule ${Date.now()}`, triggerEvent: "lead.created", actions: [{ type: "outbound_webhook", connectionId: conn.id }] });
  await setRuleEnabled(admin, rule.id, true);
  const N = 24;
  const run = randomBytes(3).toString("hex");
  const t0 = Date.now();
  await Promise.all(Array.from({ length: N }, (_, i) =>
    fetch(`${i % 2 ? Bi : A}/api/leads`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.88.${i}.${run.charCodeAt(0) % 250}` }, body: JSON.stringify({ name: `MI Lead ${run} ${i}`, email: `mi.${run}.${i}@customer-staging.sa`, phone: `055${String(parseInt(run, 16) % 10000).padStart(4, "0")}${String(100 + i)}`, service: "web-development", message: "multi-instance test", source: "quote", locale: "en", elapsed: 9000 }) }).then((r) => r.status)
  )).then((st) => (results.leadPosts = { total: N, ok: st.filter((x) => x === 200).length }));
  // wait for both workers to drain the outbox
  for (let i = 0; i < 60; i++) {
    const pending = await prisma.integrationOutbox.count({ where: { idempotencyKey: { startsWith: "automation:" }, status: { in: ["PENDING", "PROCESSING", "FAILED"] } } });
    if (!pending && received.size >= 2 * N) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const leads = await prisma.lead.findMany({ where: { name: { startsWith: `MI Lead ${run}` } }, select: { id: true } });
  const events = await prisma.domainEvent.findMany({ where: { type: "lead.created", entityId: { in: leads.map((l) => l.id) } }, select: { status: true, attempts: true } });
  const execs = await prisma.automationExecution.findMany({ where: { ruleId: rule.id }, select: { status: true, domainEventId: true } });
  const outbox = await prisma.integrationOutbox.findMany({ where: { idempotencyKey: { startsWith: "automation:" }, entityId: { in: leads.map((l) => l.id) } }, select: { status: true, attempts: true, correlationId: true } });
  const dupDeliveries = [...received.values()].filter((n) => n > 1).length;
  results.pipeline = {
    leads: leads.length,
    events: { total: events.length, processed: events.filter((e) => e.status === "PROCESSED").length, maxAttempts: Math.max(0, ...events.map((e) => e.attempts)) },
    ruleExecutions: { total: execs.length, uniqueEvents: new Set(execs.map((e) => e.domainEventId)).size, succeeded: execs.filter((e) => e.status === "SUCCEEDED").length },
    outbox: { total: outbox.length, succeeded: outbox.filter((o) => o.status === "SUCCEEDED").length, withCorrelationId: outbox.filter((o) => o.correlationId).length },
    deliveriesReceived: received.size,
    duplicateDeliveries: dupDeliveries,
    badSignatures: badSig,
    seconds: Math.round((Date.now() - t0) / 1000)
  };
  await setRuleEnabled(admin, rule.id, false);
  srv.close();
  // 4. job registry: two workers, one lease holder at a time
  const jobs = await prisma.systemJob.findMany({ where: { key: { in: ["system:events", "system:automation", "integrations:outbox:all"] } }, select: { key: true, runCount: true, failCount: true, status: true } });
  results.jobs = jobs;
  console.log(JSON.stringify(results, null, 2));
  const p = results.pipeline as { leads: number; events: { processed: number }; ruleExecutions: { total: number; uniqueEvents: number }; duplicateDeliveries: number; deliveriesReceived: number };
  const ok = p.leads === N && (results.sessionAcrossInstances as { dashboardOn3201: number }).dashboardOn3201 === 200 && (rl?.count ?? 0) >= 12 && p.events.processed === p.leads && p.ruleExecutions.total === p.leads && p.ruleExecutions.uniqueEvents === p.leads && p.duplicateDeliveries === 0 && p.deliveriesReceived === 2 * p.leads; // connection subscription (custom:) + rule action (automation:)
  console.log(ok ? "MULTI-INSTANCE: PASS" : "MULTI-INSTANCE: FAIL");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
