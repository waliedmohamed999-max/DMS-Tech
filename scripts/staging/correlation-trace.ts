/**
 * STAGING correlation trace (Phase 10): one x-request-id from a public HTTPS request must reach the lead.created
 * DomainEvent, the outbox item and the worker's structured log line for a (deliberately) failing delivery.
 * The failing endpoint is a closed local port; the item is dismissed and the connection disabled afterwards.
 *   node scripts/staging/with-env.mjs . NODE_EXTRA_CA_CERTS=.local/staging/tls/ca.crt npx tsx scripts/staging/correlation-trace.ts
 */
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import http from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../../src/server/db";
import { appEnv } from "../../src/server/system/environment";
import { isPermission } from "../../src/server/rbac/permissions";
import type { Ctx } from "../../src/server/context";
import { configureConnection, setConnectionDisabled, testConnection } from "../../src/server/integrations/registry";
import { dismissOutbox } from "../../src/server/integrations/outbox";

const BASE = "https://staging.127.0.0.1.nip.io:8443";

async function ctxFor(email: string): Promise<Ctx> {
  const u = await prisma.user.findFirstOrThrow({ where: { email }, include: { roles: { include: { role: { include: { permissions: true } } } } } });
  return { organizationId: u.organizationId, userId: u.id, userName: u.name, roleKeys: u.roles.map((r) => r.role.key), permissions: new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission)).filter(isPermission)) };
}

async function main() {
  if (appEnv() === "production") throw new Error("refused in production");
  const admin = await ctxFor("it.backup@dmstech.sa");
  const conn = await prisma.integrationConnection.findFirstOrThrow({ where: { organizationId: admin.organizationId, provider: "CUSTOM" } });
  if (conn.status === "DISABLED") await setConnectionDisabled(admin, conn.id, false);
  // the subscription only fans out for a CONNECTED connection: pass the test against a temporary receiver, then close it
  const srv = http.createServer((_q, s) => s.writeHead(200).end("ok"));
  await new Promise<void>((x) => srv.listen(9913, "127.0.0.1", x));
  await configureConnection(admin, conn.id, { environment: "SANDBOX", config: { endpointUrl: "http://127.0.0.1:9913/hook", events: "lead.created" }, secrets: { signingSecret: randomBytes(24).toString("hex") } });
  const tested = await testConnection(admin, conn.id);
  await new Promise<void>((x) => srv.close(() => x()));
  if (tested.status !== "CONNECTED") throw new Error(`connection test: ${tested.status}`);
  const rid = randomUUID();
  const run = randomBytes(3).toString("hex");
  const r = await fetch(`${BASE}/api/leads`, { method: "POST", headers: { "content-type": "application/json", "x-request-id": rid, "x-forwarded-for": `10.99.1.${parseInt(run, 16) % 250}` }, body: JSON.stringify({ name: `Trace Lead ${run}`, email: `trace.${run}@customer-staging.sa`, phone: `057${String(parseInt(run, 16) % 10000000).padStart(7, "0")}`, service: "web-development", message: "correlation trace", source: "quote", locale: "en", elapsed: 9000 }) });
  const echoed = r.headers.get("x-request-id");
  const lead = await prisma.lead.findFirstOrThrow({ where: { name: `Trace Lead ${run}` } });
  const ev = await prisma.domainEvent.findFirstOrThrow({ where: { type: "lead.created", entityId: lead.id } });
  let ob = null;
  for (let i = 0; i < 45; i++) {
    ob = await prisma.integrationOutbox.findFirst({ where: { entityId: lead.id, idempotencyKey: { startsWith: "custom:" } } });
    if (ob && ob.attempts >= 1 && ob.status !== "PROCESSING" && ob.status !== "PENDING") break;
    await new Promise((x) => setTimeout(x, 2000));
  }
  await new Promise((x) => setTimeout(x, 1500)); // async file sink
  const dir = process.env.LOG_DIR!;
  const lines = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).flatMap((f) => readFileSync(path.join(dir, f), "utf8").split("\n")).filter((l) => l.includes(rid));
  const trace = {
    requestId: rid,
    responseStatus: r.status,
    responseHeaderEchoed: echoed === rid,
    domainEvent: ev.correlationId,
    outbox: ob && { status: ob.status, attempts: ob.attempts, lastErrorCode: ob.lastErrorCode, correlationId: ob.correlationId },
    logLines: lines.map((l) => { const j = JSON.parse(l); return { msg: j.msg, level: j.level, module: j.module, correlationId: j.correlationId, code: j.code }; })
  };
  console.log(JSON.stringify(trace, null, 2));
  // clean up: dismiss the failed item, disable the test connection
  if (ob && (ob.status === "FAILED" || ob.status === "DEAD_LETTER")) await dismissOutbox(admin, ob.id, { reason: "staging correlation trace (deliberate failure)" });
  await setConnectionDisabled(admin, conn.id, true);
  const ok = r.status === 200 && echoed === rid && ev.correlationId === rid && ob?.correlationId === rid && lines.some((l) => l.includes("outbox_delivery_failed"));
  console.log(ok ? "CORRELATION-TRACE: PASS" : "CORRELATION-TRACE: FAIL");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
