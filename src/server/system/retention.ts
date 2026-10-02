import { prisma } from "../db";

/**
 * Data retention (docs/DATA-CLASSIFICATION.md#retention). Only OPERATIONAL / TRANSIENT data is ever purged.
 * Defaults can be lengthened (or shortened) per category with RETENTION_<KEY>_DAYS. A category is never purged
 * below its minimum. Legal / commercial / payroll / audit records are listed in KEEP and have no purge code at all.
 */
export type Policy = { key: string; label: string; days: number; minDays: number; purge: (before: Date, dryRun: boolean) => Promise<number> };

const del = async (dryRun: boolean, count: () => Promise<number>, remove: () => Promise<{ count: number }>) => (dryRun ? count() : (await remove()).count);

export const POLICIES: Policy[] = [
  {
    key: "SESSIONS", label: "Expired / revoked sessions", days: 30, minDays: 1,
    purge: (b, d) => {
      const where = { OR: [{ expiresAt: { lt: b } }, { revokedAt: { lt: b } }] };
      return del(d, () => prisma.session.count({ where }), () => prisma.session.deleteMany({ where }));
    }
  },
  {
    key: "RATE_LIMITS", label: "Rate-limit windows", days: 2, minDays: 1,
    purge: (b, d) => del(d, () => prisma.rateLimit.count({ where: { windowStart: { lt: b } } }), () => prisma.rateLimit.deleteMany({ where: { windowStart: { lt: b } } }))
  },
  {
    key: "JOB_LEASES", label: "Expired job leases", days: 7, minDays: 1,
    purge: (b, d) => del(d, () => prisma.jobLease.count({ where: { lockedUntil: { lt: b }, updatedAt: { lt: b } } }), () => prisma.jobLease.deleteMany({ where: { lockedUntil: { lt: b }, updatedAt: { lt: b } } }))
  },
  {
    key: "INTEGRATION_LOGS", label: "Successful integration executions", days: 90, minDays: 30,
    purge: (b, d) => del(d, () => prisma.integrationExecution.count({ where: { status: "SUCCEEDED", startedAt: { lt: b } } }), () => prisma.integrationExecution.deleteMany({ where: { status: "SUCCEEDED", startedAt: { lt: b } } }))
  },
  {
    key: "INTEGRATION_FAILURES", label: "Failed integration executions", days: 180, minDays: 60,
    purge: (b, d) => del(d, () => prisma.integrationExecution.count({ where: { status: "FAILED", startedAt: { lt: b } } }), () => prisma.integrationExecution.deleteMany({ where: { status: "FAILED", startedAt: { lt: b } } }))
  },
  {
    key: "WEBHOOK_METADATA", label: "Webhook delivery metadata (processed / ignored / rejected)", days: 90, minDays: 30,
    purge: (b, d) => {
      const where = { status: { in: ["PROCESSED", "IGNORED", "REJECTED"] as ("PROCESSED" | "IGNORED" | "REJECTED")[] }, receivedAt: { lt: b } };
      return del(d, () => prisma.webhookEvent.count({ where }), () => prisma.webhookEvent.deleteMany({ where }));
    }
  },
  {
    key: "OUTBOX_DONE", label: "Delivered / dismissed outbox rows", days: 90, minDays: 30,
    purge: (b, d) => {
      const where = { status: { in: ["SUCCEEDED", "DISMISSED"] as ("SUCCEEDED" | "DISMISSED")[] }, updatedAt: { lt: b } };
      return del(d, () => prisma.integrationOutbox.count({ where }), () => prisma.integrationOutbox.deleteMany({ where }));
    }
  },
  {
    key: "NOTIFICATIONS", label: "Read notifications", days: 180, minDays: 30,
    purge: (b, d) => del(d, () => prisma.notification.count({ where: { readAt: { lt: b } } }), () => prisma.notification.deleteMany({ where: { readAt: { lt: b } } }))
  },
  {
    key: "DOMAIN_EVENTS", label: "Processed / dismissed domain events", days: 180, minDays: 60,
    purge: (b, d) => {
      const where = { status: { in: ["PROCESSED", "DISMISSED"] as ("PROCESSED" | "DISMISSED")[] }, createdAt: { lt: b } };
      return del(d, () => prisma.domainEvent.count({ where }), () => prisma.domainEvent.deleteMany({ where }));
    }
  },
  {
    key: "AUTOMATION_EXECUTIONS", label: "Succeeded / skipped automation executions", days: 180, minDays: 60,
    purge: (b, d) => {
      const where = { status: { in: ["SUCCEEDED", "SKIPPED", "DISMISSED"] as ("SUCCEEDED" | "SKIPPED" | "DISMISSED")[] }, createdAt: { lt: b } };
      return del(d, () => prisma.automationExecution.count({ where }), () => prisma.automationExecution.deleteMany({ where }));
    }
  }
];

/** Never purged automatically (no code path exists); a future explicit legal retention policy would be a separate change. */
export const KEEP = [
  "AuditLog (append-only, DB-protected)", "Invoices, payments, allocations", "Quotations, contracts", "Payroll runs, payslips, compensation history, bank data",
  "Employees, leave, attendance", "Documents and every document version", "Expenses, purchase orders, receipts", "Consent history, attribution touches",
  "Campaign recipient snapshots", "Backup records", "Failed / dead-letter items (until an operator resolves them)"
];

export const daysFor = (p: Policy, env: Record<string, string | undefined> = process.env) => {
  const v = Number(env[`RETENTION_${p.key}_DAYS`]);
  return Number.isFinite(v) && v > 0 ? Math.max(p.minDays, Math.floor(v)) : p.days;
};

/** dryRun (default) counts only. */
export async function purgeOperationalData(opts: { dryRun?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun ?? true;
  const out: { key: string; days: number; rows: number }[] = [];
  for (const p of POLICIES) {
    const days = daysFor(p);
    out.push({ key: p.key, days, rows: await p.purge(new Date(now.getTime() - days * 86_400_000), dryRun) });
  }
  return { dryRun, results: out };
}
