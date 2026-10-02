import { prisma } from "../db";
import { systemCtx } from "../context";
import { unitOfWork } from "../events/bus";
import { addDays, todayIn, ymd } from "../commercial/dates";
import { withLease } from "../jobs/lease";
import { OPEN_TICKET } from "./support";

/**
 * Operations sweep (`npm run operations:sweep`, also triggered lazily, throttled). JobLease `sweep:ops:{org}`;
 * every signal is CLAIMED once with a conditional update (…NotifiedAt / …WarnedAt / …BreachedAt), so concurrent
 * instances and repeated runs never emit twice; notifications also carry dedupe keys.
 *   · PO overdue (issued / partially received, expected delivery passed)
 *   · asset warranty expiring (within the category's alert window)
 *   · maintenance due (scheduled date today or past, still SCHEDULED)
 *   · unreturned assets of terminated employees (notified once per assignment via the employee.terminated subscriber)
 *   · ticket SLA: response / resolution warning at warnAtPercent, breach at the due time
 *   · knowledge articles waiting in REVIEW for more than 3 days → reviewer reminder
 */
export async function sweepOps(organizationId: string, now = new Date()) {
  const res = await withLease(`sweep:ops:${organizationId}`, 10 * 60_000, () => run(organizationId, now));
  return res ?? { skipped: true as const };
}

async function run(organizationId: string, now: Date) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
  const today = todayIn(org.timezone, now);
  const ctx = systemCtx(organizationId, { ip: "system", userAgent: "operations-sweep" });
  const out = { poOverdue: 0, warranty: 0, maintenanceDue: 0, slaWarnings: 0, slaBreaches: 0, knowledgeReminders: 0 };
  const claim = async (fn: (tx: Parameters<Parameters<typeof unitOfWork>[1]>[0], uow: Parameters<Parameters<typeof unitOfWork>[1]>[1]) => Promise<boolean>) => unitOfWork(ctx, fn);

  const late = await prisma.purchaseOrder.findMany({ where: { organizationId, status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] }, expectedDeliveryDate: { lt: today }, overdueNotifiedAt: null }, take: 500, include: { vendor: { select: { name: true } } } });
  for (const p of late)
    if (await claim(async (tx, uow) => {
      if ((await tx.purchaseOrder.updateMany({ where: { id: p.id, overdueNotifiedAt: null }, data: { overdueNotifiedAt: now } })).count !== 1) return false;
      uow.emit({ type: "purchase_order.overdue", entityType: "PurchaseOrder", entityId: p.id, payload: { orderId: p.id, number: p.number, vendor: p.vendor.name, expected: ymd(p.expectedDeliveryDate), createdById: p.createdById } });
      return true;
    })) out.poOverdue++;

  const cats = await prisma.assetCategory.findMany({ where: { organizationId }, select: { id: true, warrantyAlertDays: true } });
  for (const c of cats) {
    const soon = await prisma.asset.findMany({ where: { organizationId, categoryId: c.id, warrantyNotifiedAt: null, archivedAt: null, status: { notIn: ["RETIRED", "DISPOSED", "LOST"] }, warrantyEndDate: { gte: today, lte: addDays(today, c.warrantyAlertDays) } }, take: 500 });
    for (const a of soon)
      if (await claim(async (tx, uow) => {
        if ((await tx.asset.updateMany({ where: { id: a.id, warrantyNotifiedAt: null }, data: { warrantyNotifiedAt: now } })).count !== 1) return false;
        uow.emit({ type: "asset.warranty_expiring", entityType: "Asset", entityId: a.id, payload: { assetId: a.id, number: a.number, name: a.name, warrantyEnd: ymd(a.warrantyEndDate) } });
        return true;
      })) out.warranty++;
  }

  const due = await prisma.assetMaintenance.findMany({ where: { organizationId, status: "SCHEDULED", dueNotifiedAt: null, scheduledDate: { lte: today } }, take: 500, include: { asset: { select: { number: true, name: true } } } });
  for (const m of due)
    if (await claim(async (tx, uow) => {
      if ((await tx.assetMaintenance.updateMany({ where: { id: m.id, dueNotifiedAt: null }, data: { dueNotifiedAt: now } })).count !== 1) return false;
      uow.emit({ type: "asset.maintenance_due", entityType: "Asset", entityId: m.assetId, payload: { maintenanceId: m.id, assetId: m.assetId, number: m.asset.number, name: m.asset.name, scheduled: ymd(m.scheduledDate) } });
      return true;
    })) out.maintenanceDue++;

  // SLA — elapsed time; paused tickets are skipped for the resolution clock
  const tickets = await prisma.supportTicket.findMany({ where: { organizationId, status: { in: OPEN_TICKET }, OR: [{ firstResponseAt: null, firstResponseDueAt: { not: null } }, { resolutionDueAt: { not: null } }] }, include: { slaPolicy: { select: { warnAtPercent: true } } }, take: 2000 });
  for (const t of tickets) {
    const warnPct = t.slaPolicy?.warnAtPercent ?? 80;
    const crossed = (due: Date) => now.getTime() - t.createdAt.getTime() >= ((due.getTime() - t.createdAt.getTime()) * warnPct) / 100;
    const signals: { field: "responseWarnedAt" | "responseBreachedAt" | "slaWarnedAt" | "slaBreachedAt"; type: string; kind: string }[] = [];
    if (!t.firstResponseAt && t.firstResponseDueAt) {
      if (now > t.firstResponseDueAt && !t.responseBreachedAt) signals.push({ field: "responseBreachedAt", type: "ticket.sla_breached", kind: "response" });
      else if (now <= t.firstResponseDueAt && crossed(t.firstResponseDueAt) && !t.responseWarnedAt) signals.push({ field: "responseWarnedAt", type: "ticket.sla_warning", kind: "response" });
    }
    if (t.resolutionDueAt && !t.pausedAt) {
      if (now > t.resolutionDueAt && !t.slaBreachedAt) signals.push({ field: "slaBreachedAt", type: "ticket.sla_breached", kind: "resolution" });
      else if (now <= t.resolutionDueAt && crossed(t.resolutionDueAt) && !t.slaWarnedAt) signals.push({ field: "slaWarnedAt", type: "ticket.sla_warning", kind: "resolution" });
    }
    for (const s of signals)
      if (await claim(async (tx, uow) => {
        if ((await tx.supportTicket.updateMany({ where: { id: t.id, [s.field]: null }, data: { [s.field]: now } })).count !== 1) return false;
        await uow.audit({ action: s.type, entityType: "SupportTicket", entityId: t.id, after: { kind: s.kind, due: s.kind === "response" ? t.firstResponseDueAt : t.resolutionDueAt } });
        uow.emit({ type: s.type, entityType: "SupportTicket", entityId: t.id, payload: { ticketId: t.id, number: t.number, subject: t.subject, kind: s.kind, assigneeId: t.assignedToId } });
        return true;
      })) s.type.endsWith("breached") ? out.slaBreaches++ : out.slaWarnings++;
  }

  const waiting = await prisma.knowledgeArticle.findMany({ where: { organizationId, status: "REVIEW", reviewNotifiedAt: null, reviewRequestedAt: { lte: addDays(now, -3) } }, take: 200 });
  for (const a of waiting)
    if (await claim(async (tx, uow) => {
      if ((await tx.knowledgeArticle.updateMany({ where: { id: a.id, reviewNotifiedAt: null }, data: { reviewNotifiedAt: now } })).count !== 1) return false;
      uow.emit({ type: "knowledge.review_reminder", entityType: "KnowledgeArticle", entityId: a.id, payload: { articleId: a.id, number: a.number, title: a.titleEn } });
      return true;
    })) out.knowledgeReminders++;

  return out;
}

const last = new Map<string, number>();
export async function sweepOpsIfDue(organizationId: string, everyMs = 5 * 60_000) {
  const t = last.get(organizationId) ?? 0;
  if (Date.now() - t < everyMs) return;
  last.set(organizationId, Date.now());
  await sweepOps(organizationId).catch((e) => console.error("[ops sweep]", e));
}
