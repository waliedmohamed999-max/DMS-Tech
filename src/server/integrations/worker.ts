import { prisma } from "../db";
import { systemCtx } from "../context";
import { unitOfWork } from "../events/bus";
import { withLease } from "../jobs/lease";
import { ymd } from "../commercial/dates";
import { campaignTick } from "../marketing/campaigns";
import { processOutbox } from "./outbox";
import { applyHealth, healthToResult } from "./registry";
// outbox handlers register themselves on import
import "../whatsapp/service";
import "./subscribers";

/**
 * Integrations worker (`npm run integrations:worker` — once, or `-- --loop` every 30 s; also lazily from pages, throttled).
 *   1. campaigns: queue the next batch of every RUNNING campaign (rate-limited per minute)
 *   2. outbox: deliver due rows (provider calls outside transactions, retry with backoff, dead-letter)
 *   3. health: re-check live connections every 30 min; warn 7 days before credentials expire
 * Each step is lease-guarded; correctness never depends on the lease (idempotency keys + row claims).
 */
const HEALTH_EVERY_MS = 30 * 60_000;

export async function integrationsTick(now = new Date(), organizationId?: string) {
  const scope = organizationId ?? "all";
  const campaigns = (await withLease(`integrations:campaigns:${scope}`, 2 * 60_000, () => campaignTick(now, organizationId))) ?? { skipped: true };
  const outbox = (await withLease(`integrations:outbox:${scope}`, 5 * 60_000, () => processOutbox({ organizationId, now, limit: 100 }))) ?? { skipped: true };
  const health = (await withLease(`integrations:health:${scope}`, 10 * 60_000, () => healthSweep(now, organizationId))) ?? { skipped: true };
  return { campaigns, outbox, health };
}

async function healthSweep(now: Date, organizationId?: string) {
  const due = await prisma.integrationConnection.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      provider: { in: ["WHATSAPP", "CUSTOM", "S3", "GOOGLE", "GMAIL", "GOOGLE_CALENDAR", "GOOGLE_DRIVE"] },
      status: { in: ["CONNECTED", "DEGRADED", "ERROR"] },
      OR: [{ lastHealthCheckAt: null }, { lastHealthCheckAt: { lt: new Date(now.getTime() - HEALTH_EVERY_MS) } }]
    },
    take: 20
  });
  let checked = 0;
  for (const c of due) {
    const started = new Date();
    const h = await healthToResult(c); // provider call outside the transaction
    await unitOfWork(systemCtx(c.organizationId, { ip: "system", userAgent: "integrations-worker" }), async (tx, uow) => {
      const fresh = await tx.integrationConnection.findUniqueOrThrow({ where: { id: c.id } });
      if (fresh.status === "DISABLED") return;
      await applyHealth(tx, uow, fresh, h, started);
    });
    checked++;
  }
  const expiring = await prisma.integrationConnection.findMany({ where: { ...(organizationId ? { organizationId } : {}), status: { not: "DISABLED" }, credentialsExpireAt: { gte: now, lte: new Date(now.getTime() + 7 * 86_400_000) } } });
  for (const c of expiring)
    await unitOfWork(systemCtx(c.organizationId, { ip: "system", userAgent: "integrations-worker" }), async (_tx, uow) => {
      // notification dedupe key = connection + expiry date → one warning per credential
      uow.emit({ type: "integration.credentials_expiring", entityType: "IntegrationConnection", entityId: c.id, payload: { provider: c.provider, expiresAt: ymd(c.credentialsExpireAt) } });
    });
  return { checked, expiring: expiring.length };
}

const last = new Map<string, number>();
/** Lazy trigger from pages (throttled per organization) — the scheduled worker remains the primary runner. */
export async function integrationsTickIfDue(organizationId: string, everyMs = 60_000) {
  const t = last.get(organizationId) ?? 0;
  if (Date.now() - t < everyMs) return;
  last.set(organizationId, Date.now());
  try {
    await integrationsTick(new Date(), organizationId);
  } catch (e) {
    console.error("[integrations tick]", (e as Error)?.message);
  }
}
