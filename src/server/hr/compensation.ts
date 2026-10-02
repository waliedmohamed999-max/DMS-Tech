import { z } from "zod";
import { prisma } from "../db";
import { requirePermission, type Ctx } from "../context";
import { forbidden, invalid } from "../errors";
import { unitOfWork } from "../events/bus";
import { optText, reqText } from "../crm/normalize";
import { addDays, ymd } from "../commercial/dates";
import { Decimal } from "@/lib/commercial/calc";
import { employeeAccess, maskIban, may } from "./access";

/**
 * Compensation & bank details — the most sensitive HR data (docs/HR.md).
 *  · history only: a new row closes the open one (effectiveTo = day before); rows are never edited or
 *    deleted (DB trigger effective_history_guard + one open row per employee + no overlap)
 *  · compensation: hr.compensation.view (read, HR scope) / hr.compensation.manage (write); the employee sees their own
 *  · bank: masked for hr.bank.view and the employee; the full IBAN only via revealBankAccount (hr.bank.manage, audited)
 *  · NOT related to UserCostRate (Phase 5 internal costing metadata), which is never read as salary.
 */

const money = z.preprocess((v) => (v === null || v === undefined || v === "" ? "0" : String(v).replace(/[,\s]/g, "")), z.string().regex(/^\d+(\.\d{1,2})?$/, "AMOUNT_INVALID"));
const compSchema = z.object({
  baseSalary: money,
  housingAllowance: money,
  transportAllowance: money,
  otherFixedAllowance: money,
  currency: z.string().trim().length(3).toUpperCase().default("SAR"),
  effectiveFrom: z.coerce.date(),
  notes: optText(1000)
});

export async function addCompensation(ctx: Ctx, employeeId: string, raw: unknown) {
  requirePermission(ctx, "hr.compensation.manage");
  const input = compSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const { rel } = await employeeAccess(tx, ctx, employeeId, { lock: true });
    if (!rel.hr) throw forbidden("hr.compensation.manage (HR scope)");
    if (rel.self) throw forbidden("own compensation");
    const emp = await tx.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { joinDate: true } });
    if (input.effectiveFrom < emp.joinDate) throw invalid("EFFECTIVE_BEFORE_JOIN");
    const later = await tx.employeeCompensation.findFirst({ where: { employeeId, effectiveFrom: { gte: input.effectiveFrom } } });
    if (later) throw invalid("EFFECTIVE_DATE_NOT_AFTER_CURRENT");
    const open = await tx.employeeCompensation.findFirst({ where: { employeeId, effectiveTo: null } });
    if (open) await tx.employeeCompensation.update({ where: { id: open.id }, data: { effectiveTo: addDays(input.effectiveFrom, -1) } });
    const c = await tx.employeeCompensation.create({ data: { organizationId: ctx.organizationId, employeeId, ...input, notes: input.notes ?? null, createdById: ctx.userId || null } });
    const total = (x: { baseSalary: { toString(): string }; housingAllowance: { toString(): string }; transportAllowance: { toString(): string }; otherFixedAllowance: { toString(): string } }) =>
      new Decimal(x.baseSalary.toString()).plus(x.housingAllowance.toString()).plus(x.transportAllowance.toString()).plus(x.otherFixedAllowance.toString()).toFixed(2);
    await uow.audit({
      action: open ? "compensation.changed" : "compensation.created",
      entityType: "Employee",
      entityId: employeeId,
      before: open ? { compensationId: open.id, monthlyTotal: total(open), from: ymd(open.effectiveFrom) } : null,
      after: { compensationId: c.id, monthlyTotal: total(input), currency: input.currency, from: ymd(input.effectiveFrom) }
    });
    return { id: c.id };
  });
}

export async function compensationHistory(ctx: Ctx, employeeId: string) {
  const { rel } = await employeeAccess(prisma, ctx, employeeId);
  if (!may.compensation(ctx, rel)) throw forbidden("hr.compensation.view");
  return prisma.employeeCompensation.findMany({ where: { employeeId }, orderBy: { effectiveFrom: "desc" } });
}

/** Active compensation on a date (payroll). */
export async function compensationOn(db: typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0], employeeId: string, date: Date) {
  return db.employeeCompensation.findFirst({ where: { employeeId, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] }, orderBy: { effectiveFrom: "desc" } });
}

// ---------------------------------------------------------------------------
// Bank
// ---------------------------------------------------------------------------

const bankSchema = z.object({
  bankName: reqText(2, 120),
  iban: z.preprocess((v) => String(v ?? "").replace(/\s+/g, "").toUpperCase(), z.string().regex(/^[A-Z]{2}[0-9A-Z]{13,32}$/, "IBAN_INVALID")),
  accountName: reqText(2, 160),
  effectiveFrom: z.coerce.date()
});

export async function setBankAccount(ctx: Ctx, employeeId: string, raw: unknown) {
  requirePermission(ctx, "hr.bank.manage");
  const input = bankSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const { rel } = await employeeAccess(tx, ctx, employeeId, { lock: true });
    if (!rel.hr) throw forbidden("hr.bank.manage (HR scope)");
    if (rel.self) throw forbidden("own bank details");
    const later = await tx.employeeBankAccount.findFirst({ where: { employeeId, effectiveFrom: { gte: input.effectiveFrom } } });
    if (later) throw invalid("EFFECTIVE_DATE_NOT_AFTER_CURRENT");
    const open = await tx.employeeBankAccount.findFirst({ where: { employeeId, effectiveTo: null } });
    if (open) await tx.employeeBankAccount.update({ where: { id: open.id }, data: { effectiveTo: addDays(input.effectiveFrom, -1) } });
    const b = await tx.employeeBankAccount.create({ data: { organizationId: ctx.organizationId, employeeId, ...input, createdById: ctx.userId || null } });
    // the audit log stores masked IBANs only
    await uow.audit({ action: "bank.changed", entityType: "Employee", entityId: employeeId, before: open ? { bank: open.bankName, iban: maskIban(open.iban) } : null, after: { bank: b.bankName, iban: maskIban(b.iban), from: ymd(b.effectiveFrom) } });
    return { id: b.id };
  });
}

/** Masked list (hr.bank.view in HR scope, or the employee). */
export async function bankAccounts(ctx: Ctx, employeeId: string) {
  const { rel } = await employeeAccess(prisma, ctx, employeeId);
  if (!may.bank(ctx, rel)) throw forbidden("hr.bank.view");
  const rows = await prisma.employeeBankAccount.findMany({ where: { employeeId }, orderBy: { effectiveFrom: "desc" } });
  return rows.map((r) => ({ id: r.id, bankName: r.bankName, accountName: r.accountName, iban: maskIban(r.iban), effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo }));
}

/** Full IBAN for payment preparation — hr.bank.manage only, every reveal audited. */
export async function revealBankAccount(ctx: Ctx, bankAccountId: string) {
  requirePermission(ctx, "hr.bank.manage");
  const b = await prisma.employeeBankAccount.findFirst({ where: { id: bankAccountId, organizationId: ctx.organizationId } });
  if (!b) throw invalid("UNKNOWN_BANK_ACCOUNT");
  const { rel } = await employeeAccess(prisma, ctx, b.employeeId);
  if (!rel.hr) throw forbidden("hr.bank.manage (HR scope)");
  await prisma.auditLog.create({ data: { organizationId: ctx.organizationId, actorId: ctx.userId, action: "bank.revealed", entityType: "Employee", entityId: b.employeeId, after: { bankAccountId: b.id, iban: maskIban(b.iban) } } });
  return { iban: b.iban };
}

