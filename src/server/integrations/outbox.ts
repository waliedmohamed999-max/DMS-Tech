import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { IntegrationOutbox, IntegrationProvider, Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, systemCtx, type Ctx } from "../context";
import { conflict, forbidden, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { optText } from "../crm/normalize";
import { IntegrationError } from "./http";
import { markConnectionFailed, recordExecution } from "./registry";
import { sanitizeError } from "./secrets";

/**
 * Transactional outbox (docs/INTEGRATIONS.md#outbox).
 *   business transaction → enqueue() in the SAME transaction (idempotency key unique per organization)
 *   → commit → worker claims rows (FOR UPDATE SKIP LOCKED, lease per row) → calls the provider OUTSIDE any transaction
 *   → SUCCEEDED | FAILED (retry later, exponential backoff) | DEAD_LETTER (permanent 4xx / attempts exhausted)
 * A provider failure never rolls back the business transaction that queued the work.
 */

export type OutboxItem = { provider: IntegrationProvider; eventType: string; idempotencyKey: string; connectionId?: string | null; entityType?: string; entityId?: string; payload: Record<string, unknown>; maxAttempts?: number; notBefore?: Date };
type Handler = (item: IntegrationOutbox) => Promise<{ externalReference?: string | null } | void>;
const handlers = new Map<string, Handler>();
export const registerOutboxHandler = (eventType: string, h: Handler) => handlers.set(eventType, h);

/** Enqueue inside the caller's transaction. Returns the row (existing one if the key was already queued). */
export async function enqueue(tx: Tx, organizationId: string, item: OutboxItem) {
  await tx.integrationOutbox.createMany({
    data: [{ organizationId, provider: item.provider, eventType: item.eventType, idempotencyKey: item.idempotencyKey, connectionId: item.connectionId ?? null, entityType: item.entityType ?? null, entityId: item.entityId ?? null, payload: item.payload as Prisma.InputJsonValue, maxAttempts: item.maxAttempts ?? 6, nextAttemptAt: item.notBefore ?? new Date() }],
    skipDuplicates: true
  });
  return tx.integrationOutbox.findUniqueOrThrow({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: item.idempotencyKey } } });
}

/** 30 s, 1 min, 2 min, … capped at 1 h */
export const backoffMs = (attempt: number) => Math.min(3600_000, 30_000 * 2 ** Math.max(0, attempt - 1));
const STALE_LOCK_MS = 10 * 60_000;

/** Claim and deliver due work. Safe to run on several instances at once (row-level SKIP LOCKED claims). */
export async function processOutbox(opts: { organizationId?: string; limit?: number; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const worker = `w-${randomUUID().slice(0, 8)}`;
  // crashed workers: give their rows back
  await prisma.integrationOutbox.updateMany({ where: { status: "PROCESSING", lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) } }, data: { status: "PENDING", lockedAt: null, lockedBy: null } });
  const org = opts.organizationId ?? null;
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "IntegrationOutbox" SET "status" = 'PROCESSING', "lockedAt" = ${now}, "lockedBy" = ${worker}, "attempts" = "attempts" + 1, "updatedAt" = ${now}
    WHERE "id" IN (
      SELECT "id" FROM "IntegrationOutbox"
      WHERE "status" IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= ${now} AND (${org}::text IS NULL OR "organizationId" = ${org})
      ORDER BY "nextAttemptAt" ASC LIMIT ${opts.limit ?? 25}
      FOR UPDATE SKIP LOCKED
    ) RETURNING "id"`;
  const out = { succeeded: 0, retrying: 0, dead: 0 };
  for (const { id } of claimed) {
    const item = await prisma.integrationOutbox.findUniqueOrThrow({ where: { id } });
    const r = await deliver(item, now);
    out[r]++;
  }
  return out;
}

async function deliver(item: IntegrationOutbox, now: Date): Promise<"succeeded" | "retrying" | "dead"> {
  const started = new Date();
  const h = handlers.get(item.eventType);
  let result: { externalReference?: string | null } | void = undefined;
  let error: IntegrationError | null = null;
  try {
    if (!h) throw new IntegrationError("NO_HANDLER", `no handler for ${item.eventType}`, false);
    result = await h(item);
  } catch (e) {
    error = e instanceof IntegrationError ? e : new IntegrationError("UNEXPECTED_ERROR", (e as Error)?.message ?? String(e), true);
  }
  const ctx = systemCtx(item.organizationId, { ip: "system", userAgent: "integrations-worker" });
  return unitOfWork(ctx, async (tx, uow) => {
    await recordExecution(tx, { organizationId: item.organizationId, connectionId: item.connectionId, provider: item.provider, direction: "OUTBOUND", action: item.eventType, ok: !error, externalReference: (result && result.externalReference) || null, errorCode: error?.code ?? null, error: error?.message, attempts: item.attempts, outboxId: item.id, startedAt: started, metadata: { status: error?.status ?? null } });
    if (!error) {
      await tx.integrationOutbox.update({ where: { id: item.id }, data: { status: "SUCCEEDED", completedAt: new Date(), lockedAt: null, lockedBy: null, lastErrorCode: null, lastError: null } });
      return "succeeded" as const;
    }
    if (error.code === "AUTH_FAILED" && item.connectionId) await markConnectionFailed(tx, uow, item.connectionId, error.code, error.message);
    const dead = !error.retryable || item.attempts >= item.maxAttempts;
    await tx.integrationOutbox.update({
      where: { id: item.id },
      data: dead
        ? { status: "DEAD_LETTER", deadAt: new Date(), lockedAt: null, lockedBy: null, lastErrorCode: error.code, lastError: sanitizeError(error.message) }
        : { status: "FAILED", nextAttemptAt: new Date(now.getTime() + backoffMs(item.attempts)), lockedAt: null, lockedBy: null, lastErrorCode: error.code, lastError: sanitizeError(error.message) }
    });
    await failureHook.get(item.eventType)?.(tx, item, error, dead);
    if (dead) uow.emit({ type: "integration.dead_letter", entityType: "IntegrationOutbox", entityId: item.id, payload: { outboxId: item.id, provider: item.provider, eventType: item.eventType, code: error.code } });
    return dead ? ("dead" as const) : ("retrying" as const);
  });
}

/** Per-event-type reaction to a failed delivery (e.g. mark the WhatsApp message / campaign recipient failed). */
const failureHook = new Map<string, (tx: Tx, item: IntegrationOutbox, error: IntegrationError, dead: boolean) => Promise<void>>();
export const registerFailureHook = (eventType: string, fn: (tx: Tx, item: IntegrationOutbox, error: IntegrationError, dead: boolean) => Promise<void>) => failureHook.set(eventType, fn);

// --- operator actions -------------------------------------------------------------------------

export async function retryOutbox(ctx: Ctx, id: string) {
  requirePermission(ctx, "integrations.manage");
  return unitOfWork(ctx, async (tx, uow) => {
    const r = await tx.integrationOutbox.updateMany({ where: { id, organizationId: ctx.organizationId, status: { in: ["DEAD_LETTER", "FAILED"] } }, data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), deadAt: null } });
    if (r.count !== 1) throw conflict("OUTBOX_NOT_RETRYABLE");
    await uow.audit({ action: "integration.retry_requested", entityType: "IntegrationOutbox", entityId: id });
  });
}

export async function dismissOutbox(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "integrations.manage");
  const { reason } = z.object({ reason: optText(500) }).parse(raw ?? {});
  return unitOfWork(ctx, async (tx, uow) => {
    const r = await tx.integrationOutbox.updateMany({ where: { id, organizationId: ctx.organizationId, status: { in: ["DEAD_LETTER", "FAILED"] } }, data: { status: "DISMISSED", dismissedAt: new Date(), dismissedById: ctx.userId || null } });
    if (r.count !== 1) throw conflict("OUTBOX_NOT_DISMISSIBLE");
    await uow.audit({ action: "integration.dismissed", entityType: "IntegrationOutbox", entityId: id, after: { reason } });
  });
}

const LOG_VIEWS = ["failed", "retrying", "succeeded", "webhooks", "dead"] as const;

/** Sanitized observability — never payload secrets or headers (payloads are shown only as their key names). */
export async function listIntegrationLogs(ctx: Ctx, raw: unknown) {
  if (!can(ctx, "integrations.logs.view")) throw forbidden("integrations.logs.view");
  const { view, provider } = z.object({ view: z.enum(LOG_VIEWS).default("failed"), provider: z.string().max(30).optional() }).parse(raw ?? {});
  const o = ctx.organizationId;
  const prov = provider ? { provider: provider as IntegrationProvider } : {};
  const [failed, retrying, succeeded, webhooks, dead] = await Promise.all([
    view === "failed" ? prisma.integrationExecution.findMany({ where: { organizationId: o, status: "FAILED", ...prov }, orderBy: { startedAt: "desc" }, take: 100 }) : null,
    view === "retrying" ? prisma.integrationOutbox.findMany({ where: { organizationId: o, status: { in: ["FAILED", "PENDING", "PROCESSING"] }, ...prov }, orderBy: { nextAttemptAt: "asc" }, take: 100 }) : null,
    view === "succeeded" ? prisma.integrationExecution.findMany({ where: { organizationId: o, status: "SUCCEEDED", ...prov }, orderBy: { startedAt: "desc" }, take: 100 }) : null,
    view === "webhooks" ? prisma.webhookEvent.findMany({ where: { organizationId: o, ...prov }, orderBy: { receivedAt: "desc" }, take: 100 }) : null,
    view === "dead" ? prisma.integrationOutbox.findMany({ where: { organizationId: o, status: "DEAD_LETTER", ...prov }, orderBy: { deadAt: "desc" }, take: 100 }) : null
  ]);
  const shape = (x: IntegrationOutbox) => ({ ...x, payload: undefined, payloadKeys: Object.keys((x.payload ?? {}) as object) });
  const counts = Object.fromEntries(
    await Promise.all([
      ["failed", prisma.integrationExecution.count({ where: { organizationId: o, status: "FAILED" } })],
      ["retrying", prisma.integrationOutbox.count({ where: { organizationId: o, status: { in: ["FAILED", "PENDING", "PROCESSING"] } } })],
      ["succeeded", prisma.integrationExecution.count({ where: { organizationId: o, status: "SUCCEEDED" } })],
      ["webhooks", prisma.webhookEvent.count({ where: { organizationId: o, status: { in: ["REJECTED", "FAILED"] } } })],
      ["dead", prisma.integrationOutbox.count({ where: { organizationId: o, status: "DEAD_LETTER" } })]
    ].map(async ([k, p]) => [k, await p] as const))
  ) as Record<(typeof LOG_VIEWS)[number], number>;
  return { view, failed, retrying: retrying?.map(shape) ?? null, succeeded, webhooks, dead: dead?.map(shape) ?? null, counts, canManage: can(ctx, "integrations.manage") };
}

export async function getOutboxItem(ctx: Ctx, id: string) {
  if (!can(ctx, "integrations.logs.view")) throw forbidden("integrations.logs.view");
  const x = await prisma.integrationOutbox.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!x) throw notFound("IntegrationOutbox");
  const executions = await prisma.integrationExecution.findMany({ where: { outboxId: id }, orderBy: { startedAt: "asc" } });
  return { item: { ...x, payload: undefined, payloadKeys: Object.keys((x.payload ?? {}) as object) }, executions };
}
