import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { can, type Ctx } from "../context";
import { addDays, todayIn } from "../commercial/dates";
import { Decimal } from "@/lib/commercial/calc";
import { and, BILLED_INVOICE, financeAll, invoiceWhere, OPEN_INVOICE } from "./access";
import { billingCandidates } from "./eligibility";
import { payrollPaidSummary } from "../hr/payroll";

/**
 * Finance dashboard, AR aging, attention and operational reports.
 * Every figure comes from the database, scoped by the caller's finance visibility, and only
 * amounts in the company currency are aggregated (other currencies are counted and listed
 * separately — no FX conversion exists). Terminology: invoiced = billed, payments = collected;
 * nothing here is "revenue".
 */

const D = (v: { toString(): string } | null | undefined) => new Decimal(v ? v.toString() : 0);
const s2 = (v: { toString(): string } | null | undefined) => D(v).toFixed(2);

export type Period = { from: Date; to: Date };
export function periodOf(raw: { from?: string; to?: string; preset?: string }, today: Date): Period & { preset: string } {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const preset = raw.preset ?? (raw.from || raw.to ? "custom" : "month");
  if (preset === "custom" && raw.from && raw.to) return { from: new Date(raw.from), to: new Date(raw.to), preset };
  if (preset === "quarter") return { from: new Date(Date.UTC(y, m - (m % 3), 1)), to: today, preset };
  if (preset === "year") return { from: new Date(Date.UTC(y, 0, 1)), to: today, preset };
  if (preset === "last_month") return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 0)), preset };
  return { from: new Date(Date.UTC(y, m, 1)), to: today, preset: "month" };
}

async function orgOf(ctx: Ctx) {
  return prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true, currency: true, invoiceDueSoonDays: true, largeOutstandingThreshold: true } });
}

export async function financeKpis(ctx: Ctx, p: Period) {
  const org = await orgOf(ctx);
  const today = todayIn(org.timezone);
  const iw = and<Prisma.InvoiceWhereInput>({ organizationId: ctx.organizationId, currency: org.currency }, await invoiceWhere(ctx));
  const inPeriod = { gte: p.from, lte: p.to };
  const canPay = can(ctx, "finance.payments.view") && financeAll(ctx);
  const canExp = can(ctx, "finance.expenses.view") && financeAll(ctx);
  const [issued, outstanding, overdue, collected, expenses, directCost, otherCurrency] = await Promise.all([
    prisma.invoice.aggregate({ where: and<Prisma.InvoiceWhereInput>(iw, { AND: [{ status: BILLED_INVOICE, issueDate: inPeriod }] }), _sum: { total: true }, _count: true }),
    prisma.invoice.aggregate({ where: and<Prisma.InvoiceWhereInput>(iw, { AND: [{ status: OPEN_INVOICE }] }), _sum: { balanceDue: true }, _count: true }),
    prisma.invoice.aggregate({ where: and<Prisma.InvoiceWhereInput>(iw, { AND: [{ status: OPEN_INVOICE, dueDate: { lt: today }, balanceDue: { gt: 0 } }] }), _sum: { balanceDue: true }, _count: true }),
    canPay
      ? prisma.paymentAllocation.aggregate({ where: { payment: { organizationId: ctx.organizationId, status: "RECORDED", currency: org.currency, paymentDate: inPeriod } }, _sum: { amount: true } })
      : Promise.resolve(null),
    canExp ? prisma.expense.aggregate({ where: { organizationId: ctx.organizationId, currency: org.currency, status: { in: ["APPROVED", "PAID"] }, date: inPeriod }, _sum: { total: true, amount: true }, _count: true }) : Promise.resolve(null),
    canExp ? prisma.expense.aggregate({ where: { organizationId: ctx.organizationId, currency: org.currency, status: { in: ["APPROVED", "PAID"] }, projectId: { not: null }, date: inPeriod }, _sum: { amount: true } }) : Promise.resolve(null),
    prisma.invoice.count({ where: and<Prisma.InvoiceWhereInput>({ organizationId: ctx.organizationId, currency: { not: org.currency }, status: BILLED_INVOICE }, await invoiceWhere(ctx)) })
  ]);
  // collection rate (period): collected on invoices issued in the period ÷ their total
  const cohort = await prisma.invoice.aggregate({ where: and<Prisma.InvoiceWhereInput>(iw, { AND: [{ status: BILLED_INVOICE, issueDate: inPeriod }] }), _sum: { total: true, paidAmount: true } });
  const cohortTotal = D(cohort._sum.total);
  // payroll is HR-owned: finance sees only the paid period totals, never employee-level lines
  const payroll = can(ctx, "finance.records.all") ? await payrollPaidSummary(ctx, p.from, p.to) : null;
  return {
    currency: org.currency,
    otherCurrencyInvoices: otherCurrency,
    invoicesIssued: issued._count,
    invoiced: s2(issued._sum.total),
    collected: collected ? s2(collected._sum.amount) : null,
    outstanding: s2(outstanding._sum.balanceDue),
    outstandingCount: outstanding._count,
    overdue: s2(overdue._sum.balanceDue),
    overdueCount: overdue._count,
    expenses: expenses ? s2(expenses._sum.total) : null,
    expensesNet: expenses ? s2(expenses._sum.amount) : null,
    directCost: directCost ? s2(directCost._sum.amount) : null,
    collectionRate: cohortTotal.gt(0) ? Number(D(cohort._sum.paidAmount).div(cohortTotal).mul(100).toFixed(1)) : null,
    payrollPaid: payroll ? payroll.net : null
  };
}

export const AGING_BUCKETS = ["current", "d1_30", "d31_60", "d61_90", "d90_plus"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];
export const bucketOf = (dueDate: Date, today: Date): AgingBucket => {
  const days = Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000);
  return days <= 0 ? "current" : days <= 30 ? "d1_30" : days <= 60 ? "d31_60" : days <= 90 ? "d61_90" : "d90_plus";
};

/** AR aging by remaining balance and days past due, per client and in total. */
export async function arAging(ctx: Ctx, opts: { clientId?: string } = {}) {
  const org = await orgOf(ctx);
  const today = todayIn(org.timezone);
  const rows = await prisma.invoice.findMany({
    where: and<Prisma.InvoiceWhereInput>({ organizationId: ctx.organizationId, status: OPEN_INVOICE, balanceDue: { gt: 0 }, currency: org.currency, ...(opts.clientId ? { clientId: opts.clientId } : {}) }, await invoiceWhere(ctx)),
    orderBy: { dueDate: "asc" },
    select: { id: true, number: true, dueDate: true, issueDate: true, balanceDue: true, total: true, status: true, nextFollowUpAt: true, lastReminderAt: true, client: { select: { id: true, displayName: true } } }
  });
  const zero = () => Object.fromEntries(AGING_BUCKETS.map((b) => [b, new Decimal(0)])) as Record<AgingBucket, InstanceType<typeof Decimal>>;
  const totals = zero();
  const byClient = new Map<string, { id: string; name: string; buckets: Record<AgingBucket, InstanceType<typeof Decimal>>; total: InstanceType<typeof Decimal> }>();
  const invoices = rows.map((r) => {
    const b = bucketOf(r.dueDate, today);
    totals[b] = totals[b].plus(r.balanceDue.toString());
    const c = byClient.get(r.client.id) ?? { id: r.client.id, name: r.client.displayName, buckets: zero(), total: new Decimal(0) };
    c.buckets[b] = c.buckets[b].plus(r.balanceDue.toString());
    c.total = c.total.plus(r.balanceDue.toString());
    byClient.set(r.client.id, c);
    return { ...r, bucket: b, daysPastDue: Math.max(0, Math.floor((today.getTime() - r.dueDate.getTime()) / 86_400_000)) };
  });
  const fmt = (x: Record<AgingBucket, InstanceType<typeof Decimal>>) => Object.fromEntries(AGING_BUCKETS.map((b) => [b, x[b].toFixed(2)])) as Record<AgingBucket, string>;
  return {
    currency: org.currency,
    today,
    totals: fmt(totals),
    total: AGING_BUCKETS.reduce((s, b) => s.plus(totals[b]), new Decimal(0)).toFixed(2),
    clients: [...byClient.values()].sort((a, b) => b.total.comparedTo(a.total)).map((c) => ({ id: c.id, name: c.name, buckets: fmt(c.buckets), total: c.total.toFixed(2) })),
    invoices
  };
}

export type FinanceAttention = { id: string; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; category: string; title: string; owner?: string | null; dueAt?: Date | null; href: string };

export async function financeAttention(ctx: Ctx): Promise<FinanceAttention[]> {
  const out: FinanceAttention[] = [];
  const org = await orgOf(ctx);
  const today = todayIn(org.timezone);
  if (can(ctx, "finance.invoices.view")) {
    const scope = await invoiceWhere(ctx);
    const base = { organizationId: ctx.organizationId, status: OPEN_INVOICE, balanceDue: { gt: 0 } } as Prisma.InvoiceWhereInput;
    const [overdue, dueSoon, large] = await Promise.all([
      prisma.invoice.findMany({ where: and<Prisma.InvoiceWhereInput>(base, scope, { AND: [{ dueDate: { lt: today } }] }), orderBy: { dueDate: "asc" }, take: 8, include: { client: { select: { displayName: true } } } }),
      prisma.invoice.findMany({ where: and<Prisma.InvoiceWhereInput>(base, scope, { AND: [{ dueDate: { gte: today, lte: addDays(today, org.invoiceDueSoonDays) } }] }), orderBy: { dueDate: "asc" }, take: 6, include: { client: { select: { displayName: true } } } }),
      prisma.invoice.groupBy({ by: ["clientId"], where: and<Prisma.InvoiceWhereInput>(base, scope, { AND: [{ currency: org.currency }] }), _sum: { balanceDue: true }, having: { balanceDue: { _sum: { gte: org.largeOutstandingThreshold } } } })
    ]);
    for (const i of overdue) out.push({ id: `inv-od-${i.id}`, priority: i.dueDate < addDays(today, -30) ? "URGENT" : "HIGH", category: "invoice_overdue", title: `${i.number} · ${i.client.displayName} · ${i.balanceDue.toFixed(2)} ${i.currency}`, dueAt: i.dueDate, href: `/app/finance/invoices/${i.id}` });
    for (const i of dueSoon) out.push({ id: `inv-ds-${i.id}`, priority: "MEDIUM", category: "invoice_due_soon", title: `${i.number} · ${i.client.displayName} · ${i.balanceDue.toFixed(2)} ${i.currency}`, dueAt: i.dueDate, href: `/app/finance/invoices/${i.id}` });
    if (large.length) {
      const names = await prisma.client.findMany({ where: { id: { in: large.map((l) => l.clientId) } }, select: { id: true, displayName: true } });
      for (const l of large) out.push({ id: `ar-big-${l.clientId}`, priority: "HIGH", category: "large_outstanding", title: `${names.find((n) => n.id === l.clientId)?.displayName} · ${s2(l._sum.balanceDue)} ${org.currency}`, href: `/app/crm/clients/${l.clientId}?tab=finance` });
    }
  }
  if (can(ctx, "finance.expenses.pay") && financeAll(ctx)) {
    const toPay = await prisma.expense.findMany({ where: { organizationId: ctx.organizationId, status: "APPROVED" }, orderBy: { approvedAt: "asc" }, take: 6 });
    for (const e of toPay) out.push({ id: `exp-pay-${e.id}`, priority: "MEDIUM", category: "expense_to_pay", title: `${e.number} · ${e.total.toFixed(2)} ${e.currency}`, dueAt: e.approvedAt, href: `/app/finance/expenses/${e.id}` });
  }
  // pending expense approvals are already listed by the approval engine (category "approval")
  if (can(ctx, "finance.invoices.create")) {
    const cands = (await billingCandidates(prisma, ctx)).filter((c) => c.eligible && (c.type === "CONTRACT_MILESTONE" || c.type === "PROJECT"));
    for (const c of cands.slice(0, 8))
      out.push({ id: `bill-${c.type}-${c.id}`, priority: "HIGH", category: c.type === "PROJECT" ? "project_not_invoiced" : "milestone_not_invoiced", title: `${c.ref} · ${c.label} · ${c.clientName}`, href: `/app/finance/invoices/new?type=${c.type}&id=${c.id}` });
  }
  return out;
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Operational reports (finance.reports.view). No P&L / balance sheet / ledger — not an accounting system. */
export async function financeReports(ctx: Ctx, p: Period) {
  const org = await orgOf(ctx);
  const iw = and<Prisma.InvoiceWhereInput>({ organizationId: ctx.organizationId, currency: org.currency }, await invoiceWhere(ctx));
  const inPeriod = { gte: p.from, lte: p.to };
  const showExp = can(ctx, "finance.expenses.view") && financeAll(ctx);
  const showPay = can(ctx, "finance.payments.view") && financeAll(ctx);
  const [invoices, allocations, outstanding, expenses, lines] = await Promise.all([
    prisma.invoice.findMany({ where: and<Prisma.InvoiceWhereInput>(iw, { AND: [{ status: BILLED_INVOICE, issueDate: inPeriod }] }), select: { issueDate: true, total: true } }),
    showPay ? prisma.payment.findMany({ where: { organizationId: ctx.organizationId, status: "RECORDED", currency: org.currency, paymentDate: inPeriod }, select: { paymentDate: true, amount: true } }) : Promise.resolve([]),
    prisma.invoice.groupBy({ by: ["clientId"], where: and<Prisma.InvoiceWhereInput>(iw, { AND: [{ status: OPEN_INVOICE }] }), _sum: { balanceDue: true }, orderBy: { _sum: { balanceDue: "desc" } }, take: 20 }),
    showExp ? prisma.expense.findMany({ where: { organizationId: ctx.organizationId, currency: org.currency, status: { in: ["APPROVED", "PAID"] }, date: inPeriod }, select: { amount: true, total: true, categoryId: true, projectId: true } }) : Promise.resolve([]),
    prisma.invoiceItem.findMany({ where: { invoice: and<Prisma.InvoiceWhereInput>(iw, { AND: [{ status: BILLED_INVOICE, issueDate: inPeriod }] }) }, select: { serviceId: true, subtotal: true } })
  ]);
  const byMonth = (rows: { d: Date; v: { toString(): string } }[]) => {
    const m = new Map<string, InstanceType<typeof Decimal>>();
    for (const r of rows) m.set(monthKey(r.d), (m.get(monthKey(r.d)) ?? new Decimal(0)).plus(r.v.toString()));
    return [...m.entries()].sort().map(([month, v]) => ({ month, value: v.toFixed(2) }));
  };
  const group = <T,>(rows: T[], key: (r: T) => string | null, val: (r: T) => { toString(): string }) => {
    const m = new Map<string, InstanceType<typeof Decimal>>();
    for (const r of rows) {
      const k = key(r) ?? "_none";
      m.set(k, (m.get(k) ?? new Decimal(0)).plus(val(r).toString()));
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, value: v.toFixed(2) })).sort((a, b) => Number(b.value) - Number(a.value));
  };
  const [clients, cats, projects, services] = await Promise.all([
    outstanding.length ? prisma.client.findMany({ where: { id: { in: outstanding.map((o) => o.clientId) } }, select: { id: true, displayName: true } }) : [],
    prisma.expenseCategory.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, nameAr: true, nameEn: true } }),
    showExp ? prisma.project.findMany({ where: { id: { in: [...new Set(expenses.map((e) => e.projectId).filter(Boolean))] as string[] } }, select: { id: true, number: true, name: true } }) : [],
    prisma.service.findMany({ where: { organizationId: ctx.organizationId, id: { in: [...new Set(lines.map((l) => l.serviceId).filter(Boolean))] as string[] } }, select: { id: true, nameAr: true, nameEn: true } })
  ]);
  return {
    currency: org.currency,
    invoicedByMonth: byMonth(invoices.map((i) => ({ d: i.issueDate, v: i.total }))),
    collectedByMonth: showPay ? byMonth(allocations.map((a) => ({ d: a.paymentDate, v: a.amount }))) : null,
    outstandingByClient: outstanding.map((o) => ({ id: o.clientId, name: clients.find((c) => c.id === o.clientId)?.displayName ?? "—", value: s2(o._sum.balanceDue) })),
    expensesByCategory: showExp ? group(expenses, (e) => e.categoryId, (e) => e.total).map((g) => ({ ...g, cat: cats.find((c) => c.id === g.key) ?? null })) : null,
    expensesByProject: showExp ? group(expenses.filter((e) => e.projectId), (e) => e.projectId, (e) => e.amount).map((g) => ({ ...g, project: projects.find((x) => x.id === g.key) ?? null })) : null,
    billedByService: group(lines, (l) => l.serviceId, (l) => l.subtotal).map((g) => ({ ...g, service: services.find((s) => s.id === g.key) ?? null }))
  };
}

