/**
 * STAGING inbound-webhook test over public HTTPS (Phase 10): signature, timestamp tolerance, replay / idempotency,
 * schema, rate limit, logs. Uses the WEBHOOK connection with a fresh signing secret; never runs in production.
 *   node scripts/staging/with-env.mjs . NODE_EXTRA_CA_CERTS=.local/staging/tls/ca.crt npx tsx scripts/staging/webhook-https.ts
 */
import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../../src/server/db";
import { appEnv } from "../../src/server/system/environment";
import { isPermission } from "../../src/server/rbac/permissions";
import type { Ctx } from "../../src/server/context";
import { configureConnection } from "../../src/server/integrations/registry";
import { signPayload } from "../../src/server/integrations/adapters";

const BASE = process.env.WEBHOOK_BASE ?? "https://staging.127.0.0.1.nip.io:8443";
const res: Record<string, unknown> = {};
const checks: [string, boolean][] = [];

async function ctxFor(email: string): Promise<Ctx> {
  const u = await prisma.user.findFirstOrThrow({ where: { email }, include: { roles: { include: { role: { include: { permissions: true } } } } } });
  return { organizationId: u.organizationId, userId: u.id, userName: u.name, roleKeys: u.roles.map((r) => r.role.key), permissions: new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission)).filter(isPermission)) };
}

async function main() {
  if (appEnv() === "production") throw new Error("refused in production");
  const admin = await ctxFor("it.backup@dmstech.sa");
  const conn = await prisma.integrationConnection.findFirstOrThrow({ where: { organizationId: admin.organizationId, provider: "WEBHOOK" } });
  const secret = randomBytes(24).toString("hex");
  await configureConnection(admin, conn.id, { environment: "SANDBOX", config: { allowedEvents: "lead.created" }, secrets: { signingSecret: secret } });
  const url = `${BASE}/api/integrations/webhooks/${conn.id}`;
  const post = async (body: string, headers: Record<string, string>) => {
    const r = await fetch(url, { method: "POST", body, headers: { "content-type": "application/json", ...headers } });
    return { status: r.status, body: (await r.text()).slice(0, 80), rid: r.headers.get("x-request-id"), hsts: r.headers.get("strict-transport-security") };
  };
  const sign = (body: string, ts = Math.floor(Date.now() / 1000), s = secret) => `t=${ts},v1=${signPayload(s, ts, body)}`;
  const run = randomBytes(3).toString("hex");
  const delivery = `stg-${run}`;
  const body = JSON.stringify({ event: "lead.created", data: { name: `Webhook Lead ${run}`, email: `wh.${run}@partner-staging.sa`, phone: `056${String(parseInt(run, 16) % 10000000).padStart(7, "0")}` } });

  const valid = await post(body, { "x-dms-signature": sign(body), "x-dms-delivery": delivery });
  res.valid = valid;
  checks.push(["valid signed delivery → 200", valid.status === 200]);
  checks.push(["HTTPS response carries HSTS", !!valid.hsts]);
  const replay = await post(body, { "x-dms-signature": sign(body), "x-dms-delivery": delivery });
  res.replay = replay;
  checks.push(["replayed delivery id → 200, not processed twice", replay.status === 200]);
  const bad = await post(body, { "x-dms-signature": sign(body, undefined, "wrong-secret"), "x-dms-delivery": `${delivery}-bad` });
  checks.push(["wrong secret → 401", bad.status === 401]);
  const tampered = await post(body.replace("Webhook Lead", "Tampered Lead"), { "x-dms-signature": sign(body), "x-dms-delivery": `${delivery}-t` });
  checks.push(["tampered body → 401", tampered.status === 401]);
  const stale = await post(body, { "x-dms-signature": sign(body, Math.floor(Date.now() / 1000) - 600), "x-dms-delivery": `${delivery}-old` });
  checks.push(["timestamp 10 min old → 401", stale.status === 401]);
  const missing = await post(body, { "x-dms-delivery": `${delivery}-m` });
  checks.push(["missing signature → 401", missing.status === 401]);
  const badJson = "{not json";
  const bj = await post(badJson, { "x-dms-signature": sign(badJson) });
  checks.push(["signed bad JSON → 400", bj.status === 400]);
  const otherEv = JSON.stringify({ event: "invoice.paid", data: {} });
  const ig = await post(otherEv, { "x-dms-signature": sign(otherEv), "x-dms-delivery": `${delivery}-ig` });
  checks.push(["signed non-allowed event → 200 (IGNORED)", ig.status === 200]);
  const unknownConn = await fetch(`${BASE}/api/integrations/webhooks/doesnotexist000`, { method: "POST", body, headers: { "content-type": "application/json", "x-dms-signature": sign(body) } });
  checks.push(["unknown connection → 404", unknownConn.status === 404]);
  const big = await fetch(url, { method: "POST", body: "x".repeat(300 * 1024), headers: { "content-type": "application/json" } });
  checks.push(["300 KB body → 413", big.status === 413]);

  // DB side: exactly one lead, one PROCESSED event with duplicateCount 1, rejections recorded without raw payloads
  const leads = await prisma.lead.count({ where: { name: `Webhook Lead ${run}` } });
  const ev = await prisma.webhookEvent.findFirst({ where: { connectionId: conn.id, externalEventId: delivery } });
  const rejected = await prisma.webhookEvent.groupBy({ by: ["error"], where: { connectionId: conn.id, status: "REJECTED", receivedAt: { gte: new Date(Date.now() - 5 * 60_000) } }, _count: true }).catch(() => []);
  res.db = { leads, event: ev && { status: ev.status, duplicateCount: ev.duplicateCount, signatureValid: ev.signatureValid }, rejectedByReason: rejected };
  checks.push(["exactly one lead created", leads === 1]);
  checks.push(["event PROCESSED with duplicateCount 1", ev?.status === "PROCESSED" && ev.duplicateCount === 1]);
  const rowJson = JSON.stringify(await prisma.webhookEvent.findMany({ where: { connectionId: conn.id, receivedAt: { gte: new Date(Date.now() - 5 * 60_000) } } }));
  checks.push(["no raw payload / secret stored in webhook log", !rowJson.includes(`wh.${run}@`) && !rowJson.includes(secret)]);

  // rate limit: 600/min per connection, counted before signature work
  const statuses: number[] = [];
  const t0 = Date.now();
  for (let batch = 0; batch < 32; batch++) {
    const r = await Promise.all(Array.from({ length: 20 }, () => fetch(url, { method: "POST", body: "{}", headers: { "content-type": "application/json", "x-dms-delivery": randomUUID() } }).then((x) => x.status)));
    statuses.push(...r);
    if (Date.now() - t0 > 55_000) break;
  }
  res.rateLimit = { sent: statuses.length, seconds: Math.round((Date.now() - t0) / 1000), s401: statuses.filter((s) => s === 401).length, s429: statuses.filter((s) => s === 429).length };
  checks.push(["rate limit → 429 after the per-minute budget", statuses.includes(429)]);
  const after = await post(body, { "x-dms-signature": sign(body), "x-dms-delivery": `${delivery}-after` });
  checks.push(["valid delivery during limit window also 429 (connection budget)", after.status === 429]);
  res.requestIdHeader = valid.rid;

  console.log(JSON.stringify(res, null, 2));
  for (const [k, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${k}`);
  const failed = checks.filter(([, ok]) => !ok).length;
  console.log(failed ? `WEBHOOK-HTTPS: ${failed} FAILED` : `WEBHOOK-HTTPS: PASS (${checks.length} checks)`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
