import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import type { Ctx } from "../context";
import type { Permission } from "../rbac/permissions";
import { redact } from "../obs/redact";
import { currentObs } from "../obs/context";
import { log } from "../obs/log";
import { metrics, METRIC } from "../obs/metrics";

/**
 * Domain events + unit of work.
 *
 *   await unitOfWork(ctx, async (tx, uow) => {
 *     const user = await tx.user.create(...)
 *     await uow.audit({ action: "user.created", entityType: "User", entityId: user.id, after: user })
 *     uow.emit({ type: "user.created", entityType: "User", entityId: user.id, activity: {...} })
 *   })
 *
 * Audit rows and DomainEvent rows are written in the same transaction as the change.
 * Subscribers (notifications, activity, automation) run after commit; the outcome is recorded on the DomainEvent row.
 *
 * Phase 9 reliability (docs/OBSERVABILITY.md#domain-events):
 *  · every handler has a stable key; all handlers run even if one fails, and the keys that succeeded are stored
 *    (`handlersDone`) so a retry never repeats them;
 *  · a failed event is retried by the recovery job / an operator; after MAX_EVENT_ATTEMPTS it becomes DEAD_LETTER;
 *  · an event left PENDING (process died between commit and dispatch) is re-dispatched by the recovery job;
 *  · events carry correlationId / causationId / depth (automation recursion protection).
 */

export type DomainEventInput = {
  type: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  /** When present, the event also appears in the company activity feed. */
  activity?: { entityLabel?: string; href?: string; visibility?: Permission | null };
};

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

export type StoredEvent = DomainEventInput & { id: string; organizationId: string; actorId: string | null; correlationId: string | null; causationId: string | null; depth: number };
type Subscriber = (event: StoredEvent) => Promise<void>;
type Registered = { key: string; fn: Subscriber };

export const MAX_EVENT_ATTEMPTS = 5;
const subscribers = new Map<string, Registered[]>();

/**
 * Register a handler for an event type ("*" = all events). `name` makes the handler key stable across releases;
 * without it the key is `<type>#<n>` (registration order, deterministic within one build).
 */
export function subscribe(type: string, fn: Subscriber, name?: string) {
  const list = subscribers.get(type) ?? [];
  const key = name ?? `${type}#${list.length}`;
  if (list.some((r) => r.key === key)) throw new Error(`duplicate subscriber key ${key}`);
  subscribers.set(type, [...list, { key, fn }]);
}

/** Audit / event JSON never holds credentials (central SECRET key list; business values are kept for history). */
export function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(redact(value, "audit"), (_k, v) => (typeof v === "bigint" ? v.toString() : v))) as Prisma.InputJsonValue;
}

export type Uow = {
  audit(input: AuditInput): Promise<void>;
  emit(event: DomainEventInput): void;
};

export async function unitOfWork<T>(ctx: Ctx, fn: (tx: Tx, uow: Uow) => Promise<T>): Promise<T> {
  const pending: DomainEventInput[] = [];
  const stored: StoredEvent[] = [];
  const obs = currentObs();
  // one causal chain per unit of work: inherited from automation (ctx.trace) or the request / job context
  const correlationId = ctx.trace?.correlationId ?? obs?.correlationId ?? obs?.requestId ?? randomUUID();
  const causationId = ctx.trace?.causationId ?? null;
  const depth = ctx.trace?.depth ?? 0;

  const result = await prisma.$transaction(async (tx) => {
    const uow: Uow = {
      async audit(a) {
        await tx.auditLog.create({
          data: {
            organizationId: ctx.organizationId,
            actorId: ctx.userId || null,
            action: a.action,
            entityType: a.entityType,
            entityId: a.entityId ?? null,
            before: sanitize(a.before),
            after: sanitize(a.after),
            ip: ctx.meta?.ip ?? null,
            userAgent: ctx.meta?.userAgent?.slice(0, 300) ?? null
          }
        });
      },
      emit(e) {
        pending.push(e);
      }
    };
    const out = await fn(tx, uow);
    for (const e of pending) {
      const row = await tx.domainEvent.create({
        data: {
          organizationId: ctx.organizationId,
          type: e.type,
          actorId: ctx.userId || null,
          entityType: e.entityType,
          entityId: e.entityId,
          payload: sanitize({ ...e.payload, activity: e.activity }) ?? {},
          correlationId,
          causationId,
          depth
        }
      });
      stored.push({ ...e, id: row.id, organizationId: ctx.organizationId, actorId: ctx.userId || null, correlationId, causationId, depth });
    }
    return out;
  });

  for (const e of stored) await dispatchOne(e, []);
  return result;
}

const handlersFor = (type: string) => [...(subscribers.get(type) ?? []), ...(subscribers.get("*") ?? [])];

/** Run every handler not yet done; record attempts, done keys and the outcome. Never throws. */
async function dispatchOne(e: StoredEvent, done: string[], previousAttempts = 0) {
  const ok = new Set(done);
  const errors: string[] = [];
  for (const h of handlersFor(e.type)) {
    if (ok.has(h.key)) continue;
    try {
      await h.fn(e);
      ok.add(h.key);
    } catch (err) {
      errors.push(`${h.key}: ${String(err instanceof Error ? err.message : err)}`);
    }
  }
  const attempts = previousAttempts + 1;
  try {
    if (!errors.length) {
      await prisma.domainEvent.update({ where: { id: e.id }, data: { status: "PROCESSED", processedAt: new Date(), attempts, lastAttemptAt: new Date(), error: null, handlersDone: [...ok] } });
      return true;
    }
    const dead = attempts >= MAX_EVENT_ATTEMPTS;
    metrics.count(METRIC.eventFailure, { type: e.type });
    log.warn("domain_event_failed", { eventId: e.id, type: e.type, attempts, dead, errors: errors.map((x) => x.slice(0, 300)) });
    // the business change is already committed; record the failure for retry / inspection
    await prisma.domainEvent.update({
      where: { id: e.id },
      data: { status: dead ? "DEAD_LETTER" : "FAILED", error: errors.join(" | ").slice(0, 2000), processedAt: new Date(), attempts, lastAttemptAt: new Date(), handlersDone: [...ok] }
    });
  } catch (err) {
    log.error("domain_event_status_write_failed", { eventId: e.id, error: String((err as Error)?.message ?? err) });
  }
  return false;
}

/**
 * Re-dispatch a stored event (recovery job / operator retry). Claimed with a conditional update so two workers
 * never run the same event at once; handlers that already succeeded are skipped.
 */
export async function redispatch(eventId: string, opts: { from: ("PENDING" | "FAILED" | "DEAD_LETTER")[]; olderThan?: Date } = { from: ["FAILED"] }) {
  const claim = await prisma.domainEvent.updateMany({
    where: { id: eventId, status: { in: opts.from }, ...(opts.olderThan ? { createdAt: { lt: opts.olderThan } } : {}) },
    data: { status: "PROCESSING", lastAttemptAt: new Date() }
  });
  if (claim.count !== 1) return null;
  const r = await prisma.domainEvent.findUniqueOrThrow({ where: { id: eventId } });
  const { activity, ...payload } = (r.payload ?? {}) as Record<string, unknown> & { activity?: DomainEventInput["activity"] };
  const e: StoredEvent = { id: r.id, organizationId: r.organizationId, actorId: r.actorId, type: r.type, entityType: r.entityType ?? undefined, entityId: r.entityId ?? undefined, payload, activity, correlationId: r.correlationId, causationId: r.causationId, depth: r.depth };
  return dispatchOne(e, Array.isArray(r.handlersDone) ? (r.handlersDone as string[]) : [], r.attempts);
}

/** For the system-health page / tests. */
export const subscriberKeys = () => [...subscribers.entries()].flatMap(([t, list]) => list.map((r) => `${t} → ${r.key}`));
