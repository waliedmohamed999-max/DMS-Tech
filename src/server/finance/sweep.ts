import { prisma } from "../db";
import { systemCtx } from "../context";
import { unitOfWork } from "../events/bus";
import { addDays, todayIn } from "../commercial/dates";
import { withLease } from "../jobs/lease";
import { recomputeInvoiceTx } from "./invoices";
import { billingCandidates } from "./eligibility";

/**
 * Finance sweep — docs/FINANCE.md:
 *   · open invoices past their due date → OVERDUE (status recomputed under the row lock; emits invoice.overdue once)
 *   · invoices due within org.invoiceDueSoonDays → invoice.due_soon (claimed once: dueSoonNotifiedAt)
 *   · eligible contract milestones / completed projects not yet invoiced → *.billing_ready (once per source)
 *   · APPROVED expenses unpaid for 3+ days → expense.payment_due (claimed once: payReminderAt)
 * Multi-instance safe: JobLease (one runner per org) + conditional claims + notification dedupeKeys.
 * It never mutates projects, contracts or quotations, and never creates invoices.
 */
export async function sweepFinance(organizationId: string, now = new Date()) {
  const res = await withLease(`sweep:finance:${organizationId}`, 10 * 60_000, () => runSweep(organizationId, now));
  return res ?? { skipped: true as const };
}

async function runSweep(organizationId: string, now: Date) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true, invoiceDueSoonDays: true } });
  const today = todayIn(org.timezone, now);
  const ctx = systemCtx(organizationId, { ip: "system", userAgent: "finance-sweep" });
  const out = { overdue: 0, dueSoon: 0, billingReady: 0, expensePayReminders: 0 };

  const late = await prisma.invoice.findMany({ where: { organizationId, status: { in: ["ISSUED", "SENT", "PARTIALLY_PAID"] }, balanceDue: { gt: 0 }, dueDate: { lt: today } }, select: { id: true }, take: 1000 });
  for (const i of late) {
    await unitOfWork(ctx, async (tx, uow) => {
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${i.id} FOR UPDATE`;
      await recomputeInvoiceTx(tx, uow, i.id, today);
    });
  }
  // one invoice.overdue per invoice, ever (also for invoices issued already past due)
  const overdue = await prisma.invoice.findMany({ where: { organizationId, status: "OVERDUE", overdueNotifiedAt: null }, take: 1000, include: { client: { select: { displayName: true } } } });
  for (const i of overdue) {
    await unitOfWork(ctx, async (tx, uow) => {
      const r = await tx.invoice.updateMany({ where: { id: i.id, overdueNotifiedAt: null, status: "OVERDUE" }, data: { overdueNotifiedAt: now } });
      if (r.count !== 1) return;
      await uow.audit({ action: "invoice.overdue", entityType: "Invoice", entityId: i.id, after: { number: i.number, dueDate: i.dueDate.toISOString().slice(0, 10), balance: i.balanceDue.toFixed(2) } });
      uow.emit({ type: "invoice.overdue", entityType: "Invoice", entityId: i.id, payload: { invoiceId: i.id, number: i.number, clientName: i.client.displayName, balance: i.balanceDue.toFixed(2), currency: i.currency, dueDate: i.dueDate.toISOString().slice(0, 10), ownerId: i.createdById } });
      out.overdue++;
    });
  }

  const soon = await prisma.invoice.findMany({ where: { organizationId, status: { in: ["ISSUED", "SENT", "PARTIALLY_PAID"] }, balanceDue: { gt: 0 }, dueDate: { gte: today, lte: addDays(today, org.invoiceDueSoonDays) }, dueSoonNotifiedAt: null }, take: 1000, include: { client: { select: { displayName: true } } } });
  for (const i of soon) {
    await unitOfWork(ctx, async (tx, uow) => {
      const r = await tx.invoice.updateMany({ where: { id: i.id, dueSoonNotifiedAt: null }, data: { dueSoonNotifiedAt: now } });
      if (r.count !== 1) return;
      uow.emit({ type: "invoice.due_soon", entityType: "Invoice", entityId: i.id, payload: { invoiceId: i.id, number: i.number, clientName: i.client.displayName, balance: i.balanceDue.toFixed(2), currency: i.currency, dueDate: i.dueDate.toISOString().slice(0, 10), ownerId: i.createdById } });
      out.dueSoon++;
    });
  }

  // billing readiness: announced once per source (DomainEvent history is the claim; notifications are deduped too)
  const cands = (await billingCandidates(prisma, ctx)).filter((c) => c.eligible && (c.type === "CONTRACT_MILESTONE" || c.type === "PROJECT"));
  for (const c of cands) {
    const type = c.type === "PROJECT" ? "project.billing_ready" : "contract_milestone.billing_ready";
    if (await prisma.domainEvent.findFirst({ where: { organizationId, type, entityId: c.id }, select: { id: true } })) continue;
    await unitOfWork(ctx, async (_tx, uow) => {
      uow.emit({ type, entityType: c.type === "PROJECT" ? "Project" : "ContractMilestone", entityId: c.id, payload: { sourceType: c.type, sourceId: c.id, ref: c.ref, label: c.label, clientName: c.clientName, amount: c.amount, currency: c.currency } });
    });
    out.billingReady++;
  }

  const unpaid = await prisma.expense.findMany({ where: { organizationId, status: "APPROVED", approvedAt: { lt: addDays(now, -3) }, payReminderAt: null }, take: 500 });
  for (const e of unpaid) {
    await unitOfWork(ctx, async (tx, uow) => {
      const r = await tx.expense.updateMany({ where: { id: e.id, payReminderAt: null, status: "APPROVED" }, data: { payReminderAt: now } });
      if (r.count !== 1) return;
      uow.emit({ type: "expense.payment_due", entityType: "Expense", entityId: e.id, payload: { expenseId: e.id, number: e.number, total: e.total.toFixed(2), currency: e.currency } });
      out.expensePayReminders++;
    });
  }
  return out;
}

const last = new Map<string, number>();
/** In-process throttle for the lazy trigger (pages); the scheduler calls sweepFinance directly. */
export async function sweepFinanceIfDue(organizationId: string, everyMs = 5 * 60_000) {
  const t = last.get(organizationId) ?? 0;
  if (Date.now() - t < everyMs) return null;
  last.set(organizationId, Date.now());
  return sweepFinance(organizationId);
}
