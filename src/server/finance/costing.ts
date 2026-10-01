import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { forbidden, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { addDays, ymd } from "../commercial/dates";
import { projectAccess } from "../projects/access";
import { Decimal } from "@/lib/commercial/calc";
import { and, BILLED_INVOICE, invoiceWhere, OPEN_INVOICE } from "./access";
import { billingCandidates } from "./eligibility";

/**
 * Costing & profitability — operational estimates, NOT revenue recognition or accounting.
 *
 *   Billed      = Σ issued (non-void) invoice totals incl. VAT; Billed (net) = excl. VAT
 *   Collected   = Σ paid amounts on those invoices (non-reversed allocations)
 *   Outstanding = Σ balance of open invoices
 *   Direct cost = Σ APPROVED + PAID project expenses, net of VAT
 *   Time cost   = Σ approved time × the person's hourly cost rate valid on that date — ONLY where a
 *                 rate exists (coverage % shown; no salary is ever assumed)
 *   Margin est. = Billed (net) − Direct cost − Time cost
 * Contract / quotation values are commercial commitments and are labelled as such, never revenue.
 * Cost rates (UserCostRate) are restricted: finance.cost_rates.view / .manage.
 */

const r2 = (d: InstanceType<typeof Decimal>) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const D = (v: { toString(): string } | null | undefined) => new Decimal(v ? v.toString() : 0);

// ---------------------------------------------------------------------------
// Cost rates
// ---------------------------------------------------------------------------

const rateSchema = z.object({
  userId: z.string().min(1),
  hourlyCost: z.preprocess((v) => String(v ?? "").replace(/[,\s]/g, ""), z.string().regex(/^\d+(\.\d{1,2})?$/, "AMOUNT_INVALID")),
  currency: z.string().trim().length(3).toUpperCase().default("SAR"),
  effectiveFrom: z.coerce.date()
});

/** New rate from a date; the previously open rate is closed the day before (history kept). */
export async function setCostRate(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "finance.cost_rates.manage");
  const input = rateSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const user = await tx.user.findFirst({ where: { id: input.userId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true } });
    if (!user) throw invalid("UNKNOWN_USER");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`costrate:${input.userId}`}))::text AS locked`;
    const later = await tx.userCostRate.findFirst({ where: { organizationId: ctx.organizationId, userId: input.userId, effectiveFrom: { gte: input.effectiveFrom } } });
    if (later) throw invalid("RATE_PERIOD_OVERLAP");
    const open = await tx.userCostRate.findFirst({ where: { organizationId: ctx.organizationId, userId: input.userId, effectiveTo: null }, orderBy: { effectiveFrom: "desc" } });
    if (open) await tx.userCostRate.update({ where: { id: open.id }, data: { effectiveTo: addDays(input.effectiveFrom, -1) } });
    const rate = await tx.userCostRate.create({ data: { organizationId: ctx.organizationId, userId: input.userId, hourlyCost: input.hourlyCost, currency: input.currency, effectiveFrom: input.effectiveFrom, createdById: ctx.userId || null } });
    await uow.audit({ action: "cost_rate.changed", entityType: "UserCostRate", entityId: rate.id, before: open ? { hourlyCost: open.hourlyCost.toFixed(2), from: ymd(open.effectiveFrom) } : null, after: { userId: input.userId, hourlyCost: input.hourlyCost, currency: input.currency, from: ymd(input.effectiveFrom) } });
    return { id: rate.id };
  });
}

export async function listCostRates(ctx: Ctx) {
  requirePermission(ctx, "finance.cost_rates.view");
  return prisma.userCostRate.findMany({ where: { organizationId: ctx.organizationId }, orderBy: [{ userId: "asc" }, { effectiveFrom: "desc" }], include: { user: { select: { id: true, name: true, nameAr: true, jobTitle: true } } } });
}

type Rate = { userId: string; hourlyCost: Prisma.Decimal; effectiveFrom: Date; effectiveTo: Date | null };
const rateOn = (rates: Rate[], userId: string, date: Date) => rates.find((r) => r.userId === userId && r.effectiveFrom <= date && (!r.effectiveTo || r.effectiveTo >= date));

// ---------------------------------------------------------------------------
// Project finance
// ---------------------------------------------------------------------------

async function projectNumbers(organizationId: string, projectIds: string[]) {
  const [inv, exp, time, rates] = await Promise.all([
    prisma.invoice.groupBy({ by: ["projectId"], where: { organizationId, projectId: { in: projectIds }, status: BILLED_INVOICE }, _sum: { total: true, subtotal: true, discountTotal: true, paidAmount: true, balanceDue: true } }),
    prisma.expense.groupBy({ by: ["projectId"], where: { organizationId, projectId: { in: projectIds }, status: { in: ["APPROVED", "PAID"] } }, _sum: { amount: true, total: true } }),
    prisma.timeEntry.findMany({ where: { organizationId, projectId: { in: projectIds }, status: "APPROVED" }, select: { projectId: true, userId: true, date: true, minutes: true } }),
    prisma.userCostRate.findMany({ where: { organizationId }, select: { userId: true, hourlyCost: true, effectiveFrom: true, effectiveTo: true } })
  ]);
  return projectIds.map((pid) => {
    const i = inv.find((x) => x.projectId === pid)?._sum;
    const e = exp.find((x) => x.projectId === pid)?._sum;
    let minutes = 0;
    let costed = 0;
    let timeCost = new Decimal(0);
    for (const t of time.filter((x) => x.projectId === pid)) {
      minutes += t.minutes;
      const r = rateOn(rates, t.userId, t.date);
      if (r) {
        costed += t.minutes;
        timeCost = timeCost.plus(new Decimal(t.minutes).div(60).mul(r.hourlyCost.toString()));
      }
    }
    const billed = D(i?.total);
    const billedNet = D(i?.subtotal).minus(D(i?.discountTotal));
    const directCost = D(e?.amount);
    const tc = r2(timeCost);
    const margin = billedNet.minus(directCost).minus(tc);
    return {
      projectId: pid,
      billed: billed.toFixed(2),
      billedNet: billedNet.toFixed(2),
      collected: D(i?.paidAmount).toFixed(2),
      outstanding: D(i?.balanceDue).toFixed(2),
      directCost: directCost.toFixed(2),
      directCostGross: D(e?.total).toFixed(2),
      timeMinutes: minutes,
      costedMinutes: costed,
      timeCost: tc.toFixed(2),
      timeCostCoverage: minutes ? Math.round((costed / minutes) * 100) : null,
      margin: margin.toFixed(2),
      marginPct: billedNet.gt(0) ? Number(margin.div(billedNet).mul(100).toFixed(1)) : null
    };
  });
}

/**
 * Project → Finance tab. Each section is gated separately:
 *   billing   finance.invoices.view (+ invoice scope) — invoices, billed, collected, outstanding
 *   sources   finance.invoices.create — what can be invoiced now
 *   expenses  finance.expenses.view + finance.records.all
 *   profit    finance.profitability.view — cost, margin, time cost (cost rates never exposed)
 */
export async function projectFinance(ctx: Ctx, projectId: string) {
  const a = await projectAccess(prisma, ctx, projectId);
  const p = a.project;
  const canBilling = can(ctx, "finance.invoices.view");
  const canProfit = can(ctx, "finance.profitability.view");
  const canExpenses = can(ctx, "finance.expenses.view") && can(ctx, "finance.records.all");
  if (!canBilling && !canProfit && !canExpenses) throw forbidden("finance.invoices.view");
  const invoices = canBilling
    ? await prisma.invoice.findMany({ where: and<Prisma.InvoiceWhereInput>({ organizationId: ctx.organizationId, projectId }, await invoiceWhere(ctx)), orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, sourceType: true, issueDate: true, dueDate: true, total: true, paidAmount: true, balanceDue: true, currency: true } })
    : [];
  const billedRows = invoices.filter((i) => ["ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"].includes(i.status));
  const billing = canBilling
    ? {
        billed: billedRows.reduce((s, i) => s.plus(i.total.toString()), new Decimal(0)).toFixed(2),
        collected: billedRows.reduce((s, i) => s.plus(i.paidAmount.toString()), new Decimal(0)).toFixed(2),
        outstanding: billedRows.reduce((s, i) => s.plus(i.balanceDue.toString()), new Decimal(0)).toFixed(2),
        overdue: billedRows.filter((i) => i.status === "OVERDUE").reduce((s, i) => s.plus(i.balanceDue.toString()), new Decimal(0)).toFixed(2)
      }
    : null;
  const sources = can(ctx, "finance.invoices.create") ? await billingCandidates(prisma, ctx, { projectId }) : null;
  const expenses = canExpenses
    ? await prisma.expense.findMany({ where: { organizationId: ctx.organizationId, projectId, status: { notIn: ["CANCELLED"] } }, orderBy: { date: "desc" }, take: 50, include: { category: { select: { nameAr: true, nameEn: true } }, vendor: { select: { name: true } } } })
    : null;
  const profit = canProfit ? (await projectNumbers(ctx.organizationId, [projectId]))[0] : null;
  const commercial = canProfit || can(ctx, "sales.contracts.view") || can(ctx, "sales.quotations.view")
    ? { budgetAmount: p.budgetAmount?.toFixed(2) ?? null, currency: p.currency, contract: p.contractId ? await prisma.contract.findUnique({ where: { id: p.contractId }, select: { id: true, number: true, contractValue: true, currency: true, status: true } }) : null }
    : null;
  return { project: { id: p.id, number: p.number, name: p.name, status: p.status, type: p.type }, billing, invoices, sources, expenses, profit, commercial, canCreate: can(ctx, "finance.invoices.create") };
}

/** Profitability across projects (finance.profitability.view). */
export async function profitabilityReport(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "finance.profitability.view");
  const f = z.object({ status: z.enum(["all", "open", "COMPLETED"]).default("all") }).parse(raw ?? {});
  const projects = await prisma.project.findMany({
    where: { organizationId: ctx.organizationId, type: "CLIENT", ...(f.status === "open" ? { status: { notIn: ["COMPLETED", "CANCELLED", "ARCHIVED"] } } : f.status === "COMPLETED" ? { status: "COMPLETED" } : { status: { not: "CANCELLED" } }) },
    orderBy: { number: "desc" },
    take: 200,
    select: { id: true, number: true, name: true, status: true, budgetAmount: true, currency: true, client: { select: { displayName: true } } }
  });
  const nums = await projectNumbers(ctx.organizationId, projects.map((p) => p.id));
  return projects.map((p, i) => ({ ...p, budgetAmount: p.budgetAmount?.toFixed(2) ?? null, ...nums[i] }));
}

// ---------------------------------------------------------------------------
// Client finance (Client 360 → Finance)
// ---------------------------------------------------------------------------

export async function clientFinance(ctx: Ctx, clientId: string) {
  requirePermission(ctx, "finance.invoices.view");
  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!client) throw notFound("Client");
  const where = and<Prisma.InvoiceWhereInput>({ organizationId: ctx.organizationId, clientId }, await invoiceWhere(ctx));
  const [invoices, billed, open, overdue] = await Promise.all([
    prisma.invoice.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, number: true, status: true, issueDate: true, dueDate: true, total: true, paidAmount: true, balanceDue: true, currency: true, project: { select: { id: true, number: true } } } }),
    prisma.invoice.aggregate({ where: and<Prisma.InvoiceWhereInput>(where, { AND: [{ status: BILLED_INVOICE }] }), _sum: { total: true, paidAmount: true } }),
    prisma.invoice.aggregate({ where: and<Prisma.InvoiceWhereInput>(where, { AND: [{ status: OPEN_INVOICE }] }), _sum: { balanceDue: true } }),
    prisma.invoice.aggregate({ where: and<Prisma.InvoiceWhereInput>(where, { AND: [{ status: "OVERDUE" }] }), _sum: { balanceDue: true }, _count: true })
  ]);
  const payments = can(ctx, "finance.payments.view")
    ? await prisma.payment.findMany({ where: { organizationId: ctx.organizationId, clientId, ...(can(ctx, "finance.records.all") ? {} : { allocations: { some: { invoice: where } } }) }, orderBy: { paymentDate: "desc" }, take: 50, select: { id: true, number: true, paymentDate: true, amount: true, currency: true, method: true, status: true } })
    : null;
  return {
    totals: {
      invoiced: D(billed._sum.total).toFixed(2),
      paid: D(billed._sum.paidAmount).toFixed(2),
      outstanding: D(open._sum.balanceDue).toFixed(2),
      overdue: D(overdue._sum.balanceDue).toFixed(2),
      overdueCount: overdue._count
    },
    invoices,
    payments
  };
}

