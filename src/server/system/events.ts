import { z } from "zod";
import { prisma } from "../db";
import { requirePermission, type Ctx } from "../context";
import { conflict, notFound } from "../errors";
import { redispatch, unitOfWork } from "../events/bus";
import { reqText } from "../crm/normalize";

/**
 * Domain-event recovery (docs/OBSERVABILITY.md#domain-events):
 *  · PENDING older than 2 min  → the process died between commit and dispatch → re-dispatch;
 *  · FAILED                   → automatic retry with backoff (2, 4, 8, 16 min); handlers that already succeeded are skipped;
 *  · after MAX_EVENT_ATTEMPTS  → DEAD_LETTER — only an operator retries or dismisses it (audited).
 * Nothing is lost silently: every state is visible on /app/admin/system-health.
 */
export async function recoverEvents(now = new Date(), limit = 100) {
  const out = { pending: 0, retried: 0, recovered: 0, stillFailing: 0 };
  // a re-dispatch that crashed mid-way leaves PROCESSING behind
  out.recovered = (await prisma.domainEvent.updateMany({ where: { status: "PROCESSING", lastAttemptAt: { lt: new Date(now.getTime() - 10 * 60_000) } }, data: { status: "FAILED" } })).count;
  const stale = await prisma.domainEvent.findMany({ where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - 2 * 60_000) } }, orderBy: { createdAt: "asc" }, take: limit, select: { id: true } });
  for (const { id } of stale) {
    const ok = await redispatch(id, { from: ["PENDING"], olderThan: new Date(now.getTime() - 2 * 60_000) });
    if (ok !== null) out.pending++;
  }
  const failed = await prisma.domainEvent.findMany({ where: { status: "FAILED" }, orderBy: { lastAttemptAt: "asc" }, take: limit, select: { id: true, attempts: true, lastAttemptAt: true } });
  for (const f of failed) {
    const wait = 60_000 * 2 ** Math.max(1, f.attempts);
    if (f.lastAttemptAt && now.getTime() - f.lastAttemptAt.getTime() < wait) continue;
    const ok = await redispatch(f.id, { from: ["FAILED"] });
    if (ok === null) continue;
    out.retried++;
    if (!ok) out.stillFailing++;
  }
  return out;
}

export async function listProblemEvents(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "system.health.view");
  const { view } = z.object({ view: z.enum(["failed", "dead", "pending"]).default("failed") }).parse(raw ?? {});
  const status = view === "dead" ? "DEAD_LETTER" : view === "pending" ? "PENDING" : "FAILED";
  return prisma.domainEvent.findMany({
    where: { organizationId: ctx.organizationId, status, ...(view === "pending" ? { createdAt: { lt: new Date(Date.now() - 2 * 60_000) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    // the payload is shown as key names only
    select: { id: true, type: true, entityType: true, entityId: true, status: true, error: true, attempts: true, createdAt: true, lastAttemptAt: true, handlersDone: true, correlationId: true, depth: true }
  });
}

/** Operator retry: one more dispatch of the handlers that have not succeeded yet. */
export async function retryEvent(ctx: Ctx, id: string) {
  requirePermission(ctx, "system.events.retry");
  const e = await prisma.domainEvent.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { status: true, attempts: true, type: true } });
  if (!e) throw notFound("DomainEvent");
  if (e.status !== "FAILED" && e.status !== "DEAD_LETTER") throw conflict("EVENT_NOT_RETRYABLE");
  await unitOfWork(ctx, async (_tx, uow) => {
    await uow.audit({ action: "system.event_retried", entityType: "DomainEvent", entityId: id, before: { status: e.status, attempts: e.attempts, type: e.type } });
  });
  const ok = await redispatch(id, { from: ["FAILED", "DEAD_LETTER"] });
  if (ok === null) throw conflict("EVENT_NOT_RETRYABLE");
  return { ok };
}

export async function dismissEvent(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "system.events.retry");
  const { reason } = z.object({ reason: reqText(3, 500) }).parse(raw ?? {});
  return unitOfWork(ctx, async (tx, uow) => {
    const r = await tx.domainEvent.updateMany({ where: { id, organizationId: ctx.organizationId, status: { in: ["FAILED", "DEAD_LETTER"] } }, data: { status: "DISMISSED", dismissedAt: new Date(), dismissedById: ctx.userId, dismissReason: reason } });
    if (r.count !== 1) throw conflict("EVENT_NOT_DISMISSIBLE");
    await uow.audit({ action: "system.event_dismissed", entityType: "DomainEvent", entityId: id, after: { reason } });
  });
}
