import { z } from "zod";
import type { PayrollStatus, Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, canAny, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { optText, reqText } from "../crm/normalize";
import { addDays, todayIn, ymd } from "../commercial/dates";
import { cancelApprovalTx, registerApprovalHandler, requestApprovalTx } from "../approvals/service";
import { Decimal } from "@/lib/commercial/calc";
import { myEmployee } from "./access";
import { policyOf, workingDaysBetween } from "./attendance";

/**
 * Payroll — HR domain (docs/HR.md). Not related to Finance expenses or UserCostRate.
 *
 *   DRAFT ─calculate─► REVIEW ─submit─► (Approval PAYROLL, hr.payroll.approve; approver ≠ preparer) ─► APPROVED ─pay─► PAID ─close─► CLOSED
 *   REVIEW: recalculate any time before submission; adjustments after a calculation require a recalculation.
 *   Rejection keeps REVIEW (comment stored). CALCULATING exists in the enum for long-running batch use; the
 *   current calculation runs in one transaction so it is never observable.
 * Calculation (server-only, never from the browser):
 *   fixed pay  = compensation active at period end (base + housing + transport + other fixed)
 *                × (active calendar days / period days) when policy.payrollProrate and the employee joined / left inside the period
 *   adjustments = approved-with-the-period BONUS / COMMISSION → bonuses; OVERTIME / OTHER_ALLOWANCE → other earnings;
 *                 DEDUCTION / OTHER_DEDUCTION → deductions
 *   unpaid leave = only when policy.payrollDeductUnpaidLeave: approved unpaid-leave working days in the period
 *                 × base ÷ period calendar days → deduction
 *   net = gross − deductions (must be ≥ 0)
 * The entry is a snapshot (names, compensation id, lines, meta) and is frozen by the DB once APPROVED.
 */

export const DEFAULT_COMPONENTS: [string, string, string, "EARNING" | "DEDUCTION", boolean][] = [
  ["BASE_SALARY", "الراتب الأساسي", "Base salary", "EARNING", true],
  ["HOUSING_ALLOWANCE", "بدل السكن", "Housing allowance", "EARNING", true],
  ["TRANSPORT_ALLOWANCE", "بدل النقل", "Transport allowance", "EARNING", true],
  ["OTHER_ALLOWANCE", "بدلات أخرى", "Other allowance", "EARNING", true],
  ["BONUS", "مكافأة", "Bonus", "EARNING", true],
  ["COMMISSION", "عمولة", "Commission", "EARNING", true],
  ["OVERTIME", "عمل إضافي", "Overtime", "EARNING", true],
  ["DEDUCTION", "خصم", "Deduction", "DEDUCTION", true],
  ["OTHER_DEDUCTION", "خصومات أخرى", "Other deduction", "DEDUCTION", true],
  ["UNPAID_LEAVE", "خصم إجازة بدون راتب", "Unpaid leave", "DEDUCTION", true]
];
const FIXED = new Set(["BASE_SALARY", "HOUSING_ALLOWANCE", "TRANSPORT_ALLOWANCE", "UNPAID_LEAVE"]);

export async function ensurePayrollComponents(organizationId: string) {
  await prisma.payrollComponent.createMany({ data: DEFAULT_COMPONENTS.map(([key, nameAr, nameEn, kind, system], i) => ({ organizationId, key, nameAr, nameEn, kind, system, sortOrder: i * 10 })), skipDuplicates: true });
}

export const listComponents = (organizationId: string) => prisma.payrollComponent.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } });

const D = (v: { toString(): string } | number | string | null | undefined) => new Decimal(v === null || v === undefined ? 0 : v.toString());
const r2 = (d: InstanceType<typeof Decimal>) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const daysIncl = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;

// --- periods -------------------------------------------------------------------

const periodSchema = z.object({ name: optText(80), periodStart: z.coerce.date(), periodEnd: z.coerce.date(), payDate: z.coerce.date() });

export async function createPeriod(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "hr.payroll.prepare");
  const input = periodSchema.parse(raw);
  if (input.periodEnd < input.periodStart) throw invalid("END_BEFORE_START");
  return unitOfWork(ctx, async (tx, uow) => {
    const overlap = await tx.payrollPeriod.findFirst({ where: { organizationId: ctx.organizationId, periodStart: { lte: input.periodEnd }, periodEnd: { gte: input.periodStart } } });
    if (overlap) throw conflict(`PERIOD_OVERLAP:${overlap.name}`);
    const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { currency: true } });
    const name = input.name ?? `${ymd(input.periodStart)!.slice(0, 7)}`;
    const p = await tx.payrollPeriod.create({ data: { organizationId: ctx.organizationId, name, periodStart: input.periodStart, periodEnd: input.periodEnd, payDate: input.payDate, currency: org.currency, preparedById: ctx.userId || null } });
    await uow.audit({ action: "payroll.period_created", entityType: "PayrollPeriod", entityId: p.id, after: { name, start: ymd(p.periodStart), end: ymd(p.periodEnd), payDate: ymd(p.payDate) } });
    return { id: p.id };
  });
}

async function lockPeriod(tx: Tx, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM "PayrollPeriod" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const p = await tx.payrollPeriod.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!p) throw notFound("PayrollPeriod");
  return p;
}

const pendingApproval = async (tx: Tx, p: { approvalId: string | null }) => (p.approvalId ? (await tx.approval.findUnique({ where: { id: p.approvalId }, select: { status: true } }))?.status === "PENDING" : false);

export async function calculatePeriod(ctx: Ctx, id: string) {
  requirePermission(ctx, "hr.payroll.prepare");
  return unitOfWork(ctx, async (tx, uow) => {
    const p = await lockPeriod(tx, ctx, id);
    if (p.status !== "DRAFT" && p.status !== "REVIEW") throw conflict(`PAYROLL_INVALID_TRANSITION:${p.status}`);
    if (await pendingApproval(tx, p)) throw conflict("PAYROLL_IN_APPROVAL");
    const policy = await policyOf(tx, ctx.organizationId);
    const components = await tx.payrollComponent.findMany({ where: { organizationId: ctx.organizationId } });
    const byId = new Map(components.map((c) => [c.id, c]));
    const byKey = new Map(components.map((c) => [c.key, c]));
    await tx.payrollEntry.deleteMany({ where: { periodId: id } });
    const employees = await tx.employee.findMany({
      where: { organizationId: ctx.organizationId, status: { not: "ARCHIVED" }, joinDate: { lte: p.periodEnd }, OR: [{ terminationDate: null }, { terminationDate: { gte: p.periodStart } }] },
      include: { department: { select: { name: true, nameAr: true } } },
      orderBy: { number: "asc" }
    });
    const periodDays = daysIncl(p.periodStart, p.periodEnd);
    let gross = new Decimal(0);
    let ded = new Decimal(0);
    let count = 0;
    const skipped: string[] = [];
    for (const e of employees) {
      const comp = await tx.employeeCompensation.findFirst({ where: { employeeId: e.id, effectiveFrom: { lte: p.periodEnd }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: p.periodStart } }] }, orderBy: { effectiveFrom: "desc" } });
      if (!comp) {
        skipped.push(e.number);
        continue;
      }
      if (comp.currency !== p.currency) throw invalid(`CURRENCY_MISMATCH:${e.number}`);
      const start = e.joinDate > p.periodStart ? e.joinDate : p.periodStart;
      const end = e.terminationDate && e.terminationDate < p.periodEnd ? e.terminationDate : p.periodEnd;
      const activeDays = daysIncl(start, end);
      const factor = policy.payrollProrate ? new Decimal(activeDays).div(periodDays) : new Decimal(1);
      const fx = (v: { toString(): string }) => r2(D(v).mul(factor));
      const base = fx(comp.baseSalary);
      const housing = fx(comp.housingAllowance);
      const transport = fx(comp.transportAllowance);
      const otherFixed = fx(comp.otherFixedAllowance);
      const adjustments = await tx.payrollAdjustment.findMany({ where: { periodId: id, employeeId: e.id } });
      let bonuses = new Decimal(0);
      let otherEarnings = new Decimal(0);
      let deductions = new Decimal(0);
      const lines: { key: string; nameAr: string; nameEn: string; kind: string; amount: string; reason?: string }[] = [];
      const line = (key: string, amount: InstanceType<typeof Decimal>, reason?: string) => {
        const c = byKey.get(key)!;
        if (amount.gt(0)) lines.push({ key, nameAr: c.nameAr, nameEn: c.nameEn, kind: c.kind, amount: amount.toFixed(2), ...(reason ? { reason } : {}) });
      };
      line("BASE_SALARY", base);
      line("HOUSING_ALLOWANCE", housing);
      line("TRANSPORT_ALLOWANCE", transport);
      line("OTHER_ALLOWANCE", otherFixed);
      for (const a of adjustments) {
        const c = byId.get(a.componentId)!;
        const amt = D(a.amount);
        if (c.kind === "DEDUCTION") deductions = deductions.plus(amt);
        else if (c.key === "BONUS" || c.key === "COMMISSION") bonuses = bonuses.plus(amt);
        else otherEarnings = otherEarnings.plus(amt);
        lines.push({ key: c.key, nameAr: c.nameAr, nameEn: c.nameEn, kind: c.kind, amount: amt.toFixed(2), reason: a.reason });
      }
      let unpaidDays = 0;
      if (policy.payrollDeductUnpaidLeave) {
        const unpaid = await tx.leaveRequest.findMany({ where: { employeeId: e.id, status: "APPROVED", leaveType: { paid: false }, startDate: { lte: p.periodEnd }, endDate: { gte: p.periodStart } } });
        for (const l of unpaid) {
          const { days } = await workingDaysBetween(tx, ctx.organizationId, l.startDate > p.periodStart ? l.startDate : p.periodStart, l.endDate < p.periodEnd ? l.endDate : p.periodEnd);
          unpaidDays += days.length;
        }
        if (unpaidDays) {
          const amt = r2(D(comp.baseSalary).div(periodDays).mul(unpaidDays));
          deductions = deductions.plus(amt);
          line("UNPAID_LEAVE", amt, `${unpaidDays}d`);
        }
      }
      const g = base.plus(housing).plus(transport).plus(otherFixed).plus(bonuses).plus(otherEarnings);
      const net = g.minus(deductions);
      if (net.lt(0)) throw invalid(`NET_NEGATIVE:${e.number}`);
      await tx.payrollEntry.create({
        data: {
          organizationId: ctx.organizationId, periodId: id, employeeId: e.id, employeeNumber: e.number, employeeName: e.displayName, employeeNameAr: e.nameAr, jobTitle: e.jobTitle, departmentName: e.department?.name ?? null, departmentNameAr: e.department?.nameAr ?? null,
          compensationId: comp.id, currency: comp.currency, baseSalary: base.toFixed(2), housingAllowance: housing.toFixed(2), transportAllowance: transport.toFixed(2), otherFixedAllowance: otherFixed.toFixed(2),
          bonuses: bonuses.toFixed(2), otherEarnings: otherEarnings.toFixed(2), deductions: deductions.toFixed(2), grossPay: g.toFixed(2), totalDeductions: deductions.toFixed(2), netPay: net.toFixed(2),
          lines, calculationMeta: { activeDays, periodDays, prorated: policy.payrollProrate && activeDays < periodDays, unpaidLeaveDays: unpaidDays, deductUnpaidLeave: policy.payrollDeductUnpaidLeave, compensationFrom: ymd(comp.effectiveFrom) }
        }
      });
      gross = gross.plus(g);
      ded = ded.plus(deductions);
      count++;
    }
    await tx.payrollPeriod.update({ where: { id }, data: { status: "REVIEW", grossTotal: gross.toFixed(2), deductionTotal: ded.toFixed(2), netTotal: gross.minus(ded).toFixed(2), employeeCount: count, calculatedAt: new Date(), calculatedById: ctx.userId || null, preparedById: p.preparedById ?? (ctx.userId || null), rejectionComment: null } });
    await uow.audit({ action: "payroll.calculated", entityType: "PayrollPeriod", entityId: id, before: { status: p.status, net: p.netTotal.toFixed(2) }, after: { status: "REVIEW", employees: count, gross: gross.toFixed(2), deductions: ded.toFixed(2), net: gross.minus(ded).toFixed(2), skippedWithoutCompensation: skipped } });
    uow.emit({ type: "payroll.calculated", entityType: "PayrollPeriod", entityId: id, payload: { periodId: id, name: p.name, employees: count } });
    return { employees: count, skipped };
  });
}

// --- adjustments -----------------------------------------------------------------

const adjSchema = z.object({ employeeId: z.string().min(1), componentKey: z.string().min(1), amount: z.preprocess((v) => String(v ?? "").replace(/[,\s]/g, ""), z.string().regex(/^\d+(\.\d{1,2})?$/, "AMOUNT_INVALID")), reason: reqText(3, 500), source: optText(120) });

export async function addAdjustment(ctx: Ctx, periodId: string, raw: unknown) {
  requirePermission(ctx, "hr.payroll.prepare");
  const input = adjSchema.parse(raw);
  if (!D(input.amount).gt(0)) throw invalid("AMOUNT_INVALID");
  return unitOfWork(ctx, async (tx, uow) => {
    const p = await lockPeriod(tx, ctx, periodId);
    if (p.status !== "DRAFT" && p.status !== "REVIEW") throw conflict(`PAYROLL_FROZEN:${p.status}`);
    if (await pendingApproval(tx, p)) throw conflict("PAYROLL_IN_APPROVAL");
    const me = await myEmployee(ctx);
    if (me?.id === input.employeeId) throw forbidden("own payroll adjustment");
    const c = await tx.payrollComponent.findFirst({ where: { organizationId: ctx.organizationId, key: input.componentKey, active: true } });
    if (!c || FIXED.has(c.key)) throw invalid("COMPONENT_NOT_ADJUSTABLE");
    if (!(await tx.employee.findFirst({ where: { id: input.employeeId, organizationId: ctx.organizationId } }))) throw invalid("UNKNOWN_EMPLOYEE");
    const a = await tx.payrollAdjustment.create({ data: { organizationId: ctx.organizationId, periodId, employeeId: input.employeeId, componentId: c.id, amount: input.amount, reason: input.reason, source: input.source ?? null, createdById: ctx.userId || null } });
    await uow.audit({ action: "payroll.adjustment_changed", entityType: "PayrollPeriod", entityId: periodId, after: { op: "added", adjustmentId: a.id, employeeId: input.employeeId, component: c.key, amount: input.amount, reason: input.reason } });
    return { id: a.id };
  });
}

export async function removeAdjustment(ctx: Ctx, adjustmentId: string) {
  requirePermission(ctx, "hr.payroll.prepare");
  return unitOfWork(ctx, async (tx, uow) => {
    const a = await tx.payrollAdjustment.findFirst({ where: { id: adjustmentId, organizationId: ctx.organizationId }, include: { component: true } });
    if (!a) throw notFound("PayrollAdjustment");
    const p = await lockPeriod(tx, ctx, a.periodId);
    if (p.status !== "DRAFT" && p.status !== "REVIEW") throw conflict(`PAYROLL_FROZEN:${p.status}`);
    if (await pendingApproval(tx, p)) throw conflict("PAYROLL_IN_APPROVAL");
    await tx.payrollAdjustment.delete({ where: { id: adjustmentId } });
    await uow.audit({ action: "payroll.adjustment_changed", entityType: "PayrollPeriod", entityId: a.periodId, before: { op: "removed", adjustmentId, employeeId: a.employeeId, component: a.component.key, amount: a.amount.toFixed(2), reason: a.reason } });
  });
}

// --- approval / payment ------------------------------------------------------------

export async function submitPayroll(ctx: Ctx, id: string) {
  requirePermission(ctx, "hr.payroll.prepare");
  return unitOfWork(ctx, async (tx, uow) => {
    const p = await lockPeriod(tx, ctx, id);
    if (p.status !== "REVIEW") throw conflict(`PAYROLL_INVALID_TRANSITION:${p.status}`);
    if (await pendingApproval(tx, p)) throw conflict("PAYROLL_IN_APPROVAL");
    if (!p.employeeCount) throw invalid("PAYROLL_EMPTY");
    const newest = await tx.payrollAdjustment.findFirst({ where: { periodId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    const removed = await tx.auditLog.findFirst({ where: { entityId: id, action: "payroll.adjustment_changed" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    const lastChange = [newest?.createdAt, removed?.createdAt].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];
    if (!p.calculatedAt || (lastChange && lastChange > p.calculatedAt)) throw conflict("PAYROLL_STALE_RECALCULATE");
    const a = await requestApprovalTx(tx, uow, ctx, {
      type: "PAYROLL",
      entityType: "PayrollPeriod",
      entityId: id,
      title: `Payroll ${p.name} · ${p.employeeCount} · ${p.netTotal.toFixed(2)} ${p.currency}`,
      payload: { periodId: id, calculatedAt: p.calculatedAt.toISOString(), net: p.netTotal.toFixed(2) },
      requiredPermission: "hr.payroll.approve",
      priority: "HIGH",
      amount: Number(p.netTotal),
      currency: p.currency
    });
    await tx.payrollPeriod.update({ where: { id }, data: { approvalId: a.id, submittedById: ctx.userId || null, rejectionComment: null } });
    await uow.audit({ action: "payroll.submitted", entityType: "PayrollPeriod", entityId: id, after: { approvalId: a.id, net: p.netTotal.toFixed(2), employees: p.employeeCount } });
    return { approvalId: a.id };
  });
}

export async function withdrawPayroll(ctx: Ctx, id: string) {
  requirePermission(ctx, "hr.payroll.prepare");
  return unitOfWork(ctx, async (tx, uow) => {
    const p = await lockPeriod(tx, ctx, id);
    if (!p.approvalId || !(await pendingApproval(tx, p))) throw conflict("PAYROLL_NOT_IN_APPROVAL");
    await cancelApprovalTx(tx, uow, ctx, p.approvalId, { allowNonRequester: true, runHook: false });
    await tx.payrollPeriod.update({ where: { id }, data: { approvalId: null } });
    await uow.audit({ action: "payroll.withdrawn", entityType: "PayrollPeriod", entityId: id });
  });
}

registerApprovalHandler("PAYROLL", {
  async onApproved(tx, uow, approval, ctx) {
    const p = approval.payload as { periodId: string; calculatedAt: string };
    await tx.$queryRaw`SELECT id FROM "PayrollPeriod" WHERE id = ${p.periodId} FOR UPDATE`;
    const period = await tx.payrollPeriod.findUniqueOrThrow({ where: { id: p.periodId } });
    if (period.status !== "REVIEW" || period.approvalId !== approval.id || period.calculatedAt?.toISOString() !== p.calculatedAt) throw conflict("PAYROLL_STALE_APPROVAL");
    // the preparer / calculator / submitter can never approve their own payroll
    if ([period.preparedById, period.calculatedById, period.submittedById].includes(ctx.userId)) throw forbidden("self-approval (payroll preparer)");
    // conflict of interest: an approver cannot approve a payroll carrying a discretionary bonus / deduction
    // for themselves (their regular salary comes from HR-managed compensation and is expected to be included)
    const own = await tx.payrollAdjustment.findFirst({ where: { periodId: period.id, employee: { userId: ctx.userId } }, select: { id: true } });
    if (own) throw forbidden("self-approval (own adjustment in payroll)");
    await tx.payrollAdjustment.updateMany({ where: { periodId: period.id }, data: { approvedById: ctx.userId } });
    const res = await tx.payrollPeriod.updateMany({ where: { id: period.id, status: "REVIEW" }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: ctx.userId } });
    if (res.count !== 1) throw conflict("PAYROLL_ALREADY_DECIDED");
    await uow.audit({ action: "payroll.approved", entityType: "PayrollPeriod", entityId: period.id, before: { status: "REVIEW" }, after: { status: "APPROVED", net: period.netTotal.toFixed(2), employees: period.employeeCount } });
    uow.emit({ type: "payroll.approved", entityType: "PayrollPeriod", entityId: period.id, payload: { periodId: period.id, name: period.name, preparedById: period.preparedById, submittedById: period.submittedById } });
  },
  async onRejected(tx, uow, approval) {
    const p = approval.payload as { periodId: string };
    const period = await tx.payrollPeriod.findUniqueOrThrow({ where: { id: p.periodId } });
    if (period.approvalId !== approval.id) throw conflict("PAYROLL_STALE_APPROVAL");
    await tx.payrollPeriod.update({ where: { id: period.id }, data: { approvalId: null, rejectionComment: approval.decisionComment ?? null } });
    await uow.audit({ action: "payroll.rejected", entityType: "PayrollPeriod", entityId: period.id, after: { comment: approval.decisionComment } });
  },
  async onCancelled(tx, _uow, approval) {
    const p = approval.payload as { periodId: string };
    await tx.payrollPeriod.updateMany({ where: { id: p.periodId, approvalId: approval.id }, data: { approvalId: null } });
  }
});

const paySchema = z.object({ paidDate: z.coerce.date().optional(), paymentReference: optText(120) });

/** Authorised finance marks the approved payroll paid (conditional update — cannot happen twice). */
export async function markPayrollPaid(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "hr.payroll.pay");
  const input = paySchema.parse(raw ?? {});
  return unitOfWork(ctx, async (tx, uow) => {
    const p = await lockPeriod(tx, ctx, id);
    if (p.status === "PAID" || p.status === "CLOSED") throw conflict("PAYROLL_ALREADY_PAID");
    if (p.status !== "APPROVED") throw conflict(`PAYROLL_NOT_APPROVED:${p.status}`);
    const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });
    if (input.paidDate && input.paidDate > todayIn(org.timezone)) throw invalid("PAYMENT_DATE_IN_FUTURE");
    const res = await tx.payrollPeriod.updateMany({ where: { id, status: "APPROVED" }, data: { status: "PAID", paidAt: input.paidDate ?? new Date(), paidById: ctx.userId || null, paymentReference: input.paymentReference ?? null } });
    if (res.count !== 1) throw conflict("PAYROLL_ALREADY_PAID");
    await uow.audit({ action: "payroll.paid", entityType: "PayrollPeriod", entityId: id, before: { status: "APPROVED" }, after: { status: "PAID", net: p.netTotal.toFixed(2), employees: p.employeeCount, reference: input.paymentReference } });
    // finance receives a summary only (totals) — never employee-level lines
    uow.emit({ type: "payroll.paid", entityType: "PayrollPeriod", entityId: id, payload: { periodId: id, name: p.name, currency: p.currency, net: p.netTotal.toFixed(2), gross: p.grossTotal.toFixed(2), employees: p.employeeCount }, activity: { entityLabel: `Payroll ${p.name}`, href: `/app/hr/payroll/${id}`, visibility: "hr.payroll.pay" } });
  });
}

export async function closePeriod(ctx: Ctx, id: string) {
  if (!canAny(ctx, "hr.payroll.prepare", "hr.payroll.pay")) throw forbidden("hr.payroll.prepare");
  return unitOfWork(ctx, async (tx, uow) => {
    const p = await lockPeriod(tx, ctx, id);
    if (p.status !== "PAID") throw conflict(`PAYROLL_INVALID_TRANSITION:${p.status}`);
    await tx.payrollPeriod.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() } });
    await uow.audit({ action: "payroll.closed", entityType: "PayrollPeriod", entityId: id });
  });
}

// --- read ------------------------------------------------------------------------------

const anyPayroll = (ctx: Ctx) => canAny(ctx, "hr.payroll.view", "hr.payroll.prepare", "hr.payroll.approve", "hr.payroll.pay");

/** Period list with totals (any payroll permission). Employee-level data is never part of this. */
export async function listPeriods(ctx: Ctx) {
  if (!anyPayroll(ctx)) throw forbidden("hr.payroll.view");
  return prisma.payrollPeriod.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { periodStart: "desc" }, take: 60 });
}

/** Period detail. Entries / adjustments only with hr.payroll.view (or prepare, which needs to see what it prepares). */
export async function getPeriod(ctx: Ctx, id: string) {
  if (!anyPayroll(ctx)) throw forbidden("hr.payroll.view");
  const p = await prisma.payrollPeriod.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!p) throw notFound("PayrollPeriod");
  const lines = canAny(ctx, "hr.payroll.view", "hr.payroll.prepare");
  const [entries, adjustments, approval] = await Promise.all([
    lines ? prisma.payrollEntry.findMany({ where: { periodId: id }, orderBy: { employeeNumber: "asc" } }) : Promise.resolve(null),
    lines ? prisma.payrollAdjustment.findMany({ where: { periodId: id }, orderBy: { createdAt: "asc" }, include: { component: true, employee: { select: { number: true, displayName: true, nameAr: true } } } }) : Promise.resolve(null),
    p.approvalId ? prisma.approval.findUnique({ where: { id: p.approvalId }, select: { id: true, status: true, decisionComment: true } }) : Promise.resolve(null)
  ]);
  const ids = [p.preparedById, p.approvedById, p.paidById, p.calculatedById].filter(Boolean) as string[];
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, nameAr: true } }) : [];
  return { period: p, entries, adjustments, approval, people, canLines: lines };
}

/** Payslips of the signed-in employee (paid / closed periods only). */
export async function myPayslips(ctx: Ctx) {
  const me = await myEmployee(ctx);
  if (!me) return [];
  return prisma.payrollEntry.findMany({ where: { employeeId: me.id, period: { status: { in: ["PAID", "CLOSED"] } } }, orderBy: { period: { periodStart: "desc" } }, include: { period: { select: { name: true, periodStart: true, periodEnd: true, payDate: true, status: true } } } });
}

/** Payslip access: the employee (paid periods), or hr.payroll.view. Finance without hr.payroll.view never gets lines. */
export async function payslipEntry(ctx: Ctx, entryId: string) {
  const e = await prisma.payrollEntry.findFirst({ where: { id: entryId, organizationId: ctx.organizationId }, include: { period: true, employee: { select: { userId: true } } } });
  if (!e) throw notFound("PayrollEntry");
  const self = e.employee.userId === ctx.userId;
  if (self) {
    if (!["PAID", "CLOSED"].includes(e.period.status)) throw forbidden("payslip not yet available");
  } else if (!can(ctx, "hr.payroll.view")) throw forbidden("hr.payroll.view");
  return e;
}

/** Finance summary (totals only): paid payroll in a date range. */
export async function payrollPaidSummary(ctx: Ctx, from: Date, to: Date) {
  if (!(can(ctx, "finance.records.all") || anyPayroll(ctx))) return null;
  const agg = await prisma.payrollPeriod.aggregate({ where: { organizationId: ctx.organizationId, status: { in: ["PAID", "CLOSED"] }, paidAt: { gte: from, lte: addDays(to, 1) } }, _sum: { netTotal: true, grossTotal: true }, _count: true });
  return { periods: agg._count, net: (agg._sum.netTotal ?? 0).toFixed(2), gross: (agg._sum.grossTotal ?? 0).toFixed(2) };
}

export const PAYROLL_STATUS_ORDER: PayrollStatus[] = ["DRAFT", "CALCULATING", "REVIEW", "APPROVED", "PAID", "CLOSED"];
export type PeriodWhere = Prisma.PayrollPeriodWhereInput;
