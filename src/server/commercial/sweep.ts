import { prisma } from "../db";
import { systemCtx } from "../context";
import { unitOfWork } from "../events/bus";
import { systemActivity } from "../crm/activities";
import { addDays, todayIn } from "./dates";
import { withLease } from "../jobs/lease";

/**
 * Time-based commercial transitions, evaluated on the SERVER (never in the browser):
 *   - SENT / VIEWED quotation whose validUntil < today (org timezone) → EXPIRED
 *   - SENT / VIEWED quotation expiring within quoteExpiryWarningDays → one-time quotation.expiring event
 *   - ACTIVE contract whose endDate is within contractExpiryWarningDays → EXPIRING (+ contract.expiring)
 *   - ACTIVE / EXPIRING contract whose endDate < today → EXPIRED
 *
 * Idempotent and safe to run concurrently (each row is re-checked under a conditional update).
 * Triggered lazily (throttled) from commercial pages and the Command Center, and by
 * `npm run commercial:sweep` for a scheduler (cron) in production.
 */
export async function sweepCommercial(organizationId: string, now = new Date()) {
  // one runner per organization across instances (rows are still claimed with conditional updates)
  const r = await withLease(`sweep:commercial:${organizationId}`, 10 * 60_000, () => runCommercialSweep(organizationId, now));
  return r ?? { quotesExpired: 0, quotesExpiring: 0, contractsExpiring: 0, contractsExpired: 0, skipped: true };
}

async function runCommercialSweep(organizationId: string, now: Date) {
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const today = todayIn(o.timezone, now);
  const ctx = systemCtx(organizationId, { ip: "system", userAgent: "commercial-sweep" });
  const out = { quotesExpired: 0, quotesExpiring: 0, contractsExpiring: 0, contractsExpired: 0 };

  const expired = await prisma.quotationVersion.findMany({ where: { organizationId, status: { in: ["SENT", "VIEWED"] }, validUntil: { lt: today } }, include: { quotation: true }, take: 200 });
  for (const v of expired) {
    await unitOfWork(ctx, async (tx, uow) => {
      const r = await tx.quotationVersion.updateMany({ where: { id: v.id, status: { in: ["SENT", "VIEWED"] } }, data: { status: "EXPIRED", expiredAt: now } });
      if (r.count !== 1) return;
      await tx.quotation.updateMany({ where: { id: v.quotationId, currentVersionId: v.id }, data: { status: "EXPIRED" } });
      await uow.audit({ action: "quotation.expired", entityType: "Quotation", entityId: v.quotationId, before: { status: v.status }, after: { version: v.versionNumber, validUntil: v.validUntil.toISOString().slice(0, 10) } });
      uow.emit({ type: "quotation.expired", entityType: "Quotation", entityId: v.quotationId, payload: { number: v.quotation.number, version: v.versionNumber, ownerId: v.quotation.ownerId }, activity: { entityLabel: `${v.quotation.number} V${v.versionNumber}`, href: `/app/sales/quotations/${v.quotationId}`, visibility: "sales.quotations.view" } });
      await systemActivity(tx, ctx, { entityType: v.quotation.opportunityId ? "OPPORTUNITY" : "CLIENT", entityId: v.quotation.opportunityId ?? v.quotation.clientId, clientId: v.quotation.clientId, type: "STATUS_CHANGE", title: "quotation.expired", metadata: { quotationId: v.quotationId, quotationNumber: v.quotation.number, version: v.versionNumber } });
      out.quotesExpired++;
    });
  }

  const soon = await prisma.quotationVersion.findMany({ where: { organizationId, status: { in: ["SENT", "VIEWED"] }, expiringNotifiedAt: null, validUntil: { gte: today, lte: addDays(today, o.quoteExpiryWarningDays) } }, include: { quotation: true }, take: 200 });
  for (const v of soon) {
    await unitOfWork(ctx, async (tx, uow) => {
      const r = await tx.quotationVersion.updateMany({ where: { id: v.id, expiringNotifiedAt: null }, data: { expiringNotifiedAt: now } });
      if (r.count !== 1) return;
      uow.emit({ type: "quotation.expiring", entityType: "Quotation", entityId: v.quotationId, payload: { number: v.quotation.number, version: v.versionNumber, validUntil: v.validUntil.toISOString().slice(0, 10), ownerId: v.quotation.ownerId } });
      out.quotesExpiring++;
    });
  }

  const ending = await prisma.contract.findMany({ where: { organizationId, status: "ACTIVE", endDate: { gte: today, lte: addDays(today, o.contractExpiryWarningDays) } }, take: 200 });
  for (const c of ending) {
    await unitOfWork(ctx, async (tx, uow) => {
      const r = await tx.contract.updateMany({ where: { id: c.id, status: "ACTIVE" }, data: { status: "EXPIRING", expiringNotifiedAt: now } });
      if (r.count !== 1) return;
      await uow.audit({ action: "contract.expiring", entityType: "Contract", entityId: c.id, before: { status: "ACTIVE" }, after: { status: "EXPIRING", endDate: c.endDate?.toISOString().slice(0, 10) } });
      uow.emit({ type: "contract.expiring", entityType: "Contract", entityId: c.id, payload: { number: c.number, endDate: c.endDate?.toISOString().slice(0, 10), ownerId: c.ownerId }, activity: { entityLabel: `${c.number} · ${c.title}`, href: `/app/sales/contracts/${c.id}`, visibility: "sales.contracts.view" } });
      out.contractsExpiring++;
    });
  }

  const ended = await prisma.contract.findMany({ where: { organizationId, status: { in: ["ACTIVE", "EXPIRING"] }, endDate: { lt: today } }, take: 200 });
  for (const c of ended) {
    await unitOfWork(ctx, async (tx, uow) => {
      const r = await tx.contract.updateMany({ where: { id: c.id, status: { in: ["ACTIVE", "EXPIRING"] } }, data: { status: "EXPIRED", expiredAt: now } });
      if (r.count !== 1) return;
      await uow.audit({ action: "contract.expired", entityType: "Contract", entityId: c.id, before: { status: c.status }, after: { status: "EXPIRED", endDate: c.endDate?.toISOString().slice(0, 10) } });
      uow.emit({ type: "contract.expired", entityType: "Contract", entityId: c.id, payload: { number: c.number, ownerId: c.ownerId }, activity: { entityLabel: `${c.number} · ${c.title}`, href: `/app/sales/contracts/${c.id}`, visibility: "sales.contracts.view" } });
      out.contractsExpired++;
    });
  }
  return out;
}

/** In-process throttle for the lazy trigger (pages); the scheduled script calls sweepCommercial directly. */
const last = new Map<string, number>();
export async function sweepIfDue(organizationId: string, everyMs = 5 * 60_000) {
  const t = last.get(organizationId) ?? 0;
  if (Date.now() - t < everyMs) return null;
  last.set(organizationId, Date.now());
  try {
    return await sweepCommercial(organizationId);
  } catch (e) {
    last.delete(organizationId);
    console.error("[commercial-sweep]", e);
    return null;
  }
}
