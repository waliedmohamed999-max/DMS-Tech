import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import type { Ctx } from "../context";
import type { Permission } from "../rbac/permissions";

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
 * Subscribers (notifications, activity, and later automations) run after commit;
 * their outcome is recorded on the DomainEvent row (PROCESSED / FAILED + error).
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

type StoredEvent = DomainEventInput & { id: string; organizationId: string; actorId: string | null };
type Subscriber = (event: StoredEvent) => Promise<void>;

const subscribers = new Map<string, Subscriber[]>();

/** Register a handler for an event type ("*" = all events). */
export function subscribe(type: string, fn: Subscriber) {
  subscribers.set(type, [...(subscribers.get(type) ?? []), fn]);
}

// never persist secrets into audit/event JSON
const REDACT = new Set(["passwordHash", "password", "token", "secret"]);
export function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (k, v) => (REDACT.has(k) ? "[redacted]" : typeof v === "bigint" ? v.toString() : v))
  ) as Prisma.InputJsonValue;
}

export type Uow = {
  audit(input: AuditInput): Promise<void>;
  emit(event: DomainEventInput): void;
};

export async function unitOfWork<T>(ctx: Ctx, fn: (tx: Tx, uow: Uow) => Promise<T>): Promise<T> {
  const pending: DomainEventInput[] = [];
  const stored: StoredEvent[] = [];

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
          payload: sanitize({ ...e.payload, activity: e.activity }) ?? {}
        }
      });
      stored.push({ ...e, id: row.id, organizationId: ctx.organizationId, actorId: ctx.userId || null });
    }
    return out;
  });

  await dispatch(stored);
  return result;
}

async function dispatch(events: StoredEvent[]) {
  for (const e of events) {
    const handlers = [...(subscribers.get(e.type) ?? []), ...(subscribers.get("*") ?? [])];
    try {
      for (const h of handlers) await h(e);
      await prisma.domainEvent.update({ where: { id: e.id }, data: { status: "PROCESSED", processedAt: new Date() } });
    } catch (err) {
      // the business change is already committed; record the failure for retry/inspection
      await prisma.domainEvent.update({
        where: { id: e.id },
        data: { status: "FAILED", error: String(err instanceof Error ? err.message : err).slice(0, 2000), processedAt: new Date() }
      });
    }
  }
}
