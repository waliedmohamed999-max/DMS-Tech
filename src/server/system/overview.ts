import { prisma } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { metricsSnapshot } from "../obs/metrics";
import { errorReporterStatus } from "../obs/errors";
import { buildInfo } from "./buildinfo";
import { readiness } from "./health";
import { jobHealth } from "./jobs";
import { evaluateAlerts } from "./alerts";
import { POLICIES, KEEP, daysFor } from "./retention";
import { validateConfig } from "./config";

/** /app/admin/system-health data — every number comes from the database / a live check (system.health.view). */
export async function systemOverview(ctx: Ctx) {
  requirePermission(ctx, "system.health.view");
  const o = ctx.organizationId;
  const [ready, jobs, outbox, events, automation, integrations, backups, alerts] = await Promise.all([
    readiness({ fresh: true }),
    jobHealth(),
    prisma.integrationOutbox.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.domainEvent.groupBy({ by: ["status"], where: { organizationId: o }, _count: { _all: true } }),
    prisma.automationExecution.groupBy({ by: ["status"], where: { organizationId: o }, _count: { _all: true } }),
    prisma.integrationConnection.groupBy({ by: ["status"], where: { organizationId: o }, _count: { _all: true } }),
    can(ctx, "system.backups.view") ? prisma.backupRecord.findMany({ orderBy: { startedAt: "desc" }, take: 10 }) : Promise.resolve(null),
    evaluateAlerts().catch(() => [])
  ]);
  const by = (rows: { status: string; _count: { _all: number } }[]) => Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Record<string, number>;
  const oldestPending = await prisma.integrationOutbox.findFirst({ where: { status: { in: ["PENDING", "FAILED"] } }, orderBy: { nextAttemptAt: "asc" }, select: { nextAttemptAt: true } });
  const stalePending = await prisma.domainEvent.count({ where: { organizationId: o, status: "PENDING", createdAt: { lt: new Date(Date.now() - 2 * 60_000) } } });
  const lastBackup = backups?.find((b) => b.status === "COMPLETED" || b.status === "VERIFIED") ?? null;
  const lastVerified = backups?.find((b) => b.status === "VERIFIED") ?? null;
  return {
    build: buildInfo(),
    ready,
    config: validateConfig(),
    jobs,
    queues: { outbox: by(outbox), oldestDueAt: oldestPending?.nextAttemptAt ?? null },
    events: { ...by(events), stalePending },
    automation: by(automation),
    integrations: by(integrations),
    backups: backups?.map((b) => ({ ...b, sizeBytes: b.sizeBytes ? Number(b.sizeBytes) : null })) ?? null,
    lastBackup: lastBackup ? { at: lastBackup.startedAt, status: lastBackup.status } : null,
    lastVerified: lastVerified?.verifiedAt ?? null,
    alerts,
    metrics: metricsSnapshot(),
    reporter: errorReporterStatus(),
    retention: POLICIES.map((p) => ({ key: p.key, label: p.label, days: daysFor(p) })),
    keep: KEEP,
    canRetryEvents: can(ctx, "system.events.retry"),
    canManageJobs: can(ctx, "system.jobs.manage"),
    canBackups: can(ctx, "system.backups.view")
  };
}

/** Unified dead-letter view: integration outbox, automation executions, domain events (each keeps its own table). */
export async function deadLetters(ctx: Ctx) {
  requirePermission(ctx, "system.health.view");
  const o = ctx.organizationId;
  const [outbox, executions, events] = await Promise.all([
    prisma.integrationOutbox.findMany({ where: { organizationId: o, status: { in: ["DEAD_LETTER", "FAILED"] } }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, provider: true, eventType: true, status: true, attempts: true, lastErrorCode: true, lastError: true, updatedAt: true } }),
    prisma.automationExecution.findMany({ where: { organizationId: o, status: { in: ["DEAD_LETTER", "FAILED"] } }, orderBy: { createdAt: "desc" }, take: 50, include: { rule: { select: { name: true } } } }),
    prisma.domainEvent.findMany({ where: { organizationId: o, status: { in: ["DEAD_LETTER", "FAILED"] } }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, type: true, status: true, attempts: true, error: true, createdAt: true, handlersDone: true } })
  ]);
  return {
    items: [
      ...outbox.map((x) => ({ source: "integration" as const, id: x.id, title: `${x.provider} · ${x.eventType}`, status: x.status, attempts: x.attempts, error: x.lastErrorCode ? `${x.lastErrorCode}: ${x.lastError ?? ""}` : null, at: x.updatedAt })),
      ...executions.map((x) => ({ source: "automation" as const, id: x.id, title: `${x.rule.name} · ${x.eventType}`, status: x.status, attempts: x.attempts, error: x.error, at: x.createdAt })),
      ...events.map((x) => ({ source: "event" as const, id: x.id, title: x.type, status: x.status, attempts: x.attempts, error: x.error, at: x.createdAt }))
    ].sort((a, b) => b.at.getTime() - a.at.getTime()),
    can: { integration: can(ctx, "integrations.manage"), automation: can(ctx, "automation.executions.retry"), event: can(ctx, "system.events.retry") }
  };
}
