import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, type Ctx } from "../context";
import { forbidden, notFound } from "../errors";

/**
 * People visibility — docs/HR.md. Stricter than CRM / projects and enforced in every HR query.
 *
 * Directory scope (who can be seen at all):
 *   ALL          hr.employees.view + hr.records.all
 *   DEPARTMENT   hr.employees.view + hr.records.department → employees of my department
 *   always       myself and my DIRECT reports (Employee.managerId = me)
 * Being a project manager / project member grants nothing here.
 *
 * Data areas on top of that (each its own permission, never implied by the directory):
 *   personal (personal email/phone, nationality, emergency contact)  self · hr.employees.sensitive within HR scope
 *   compensation                                                       self (own) · hr.compensation.view within HR scope
 *   bank                                                               self (masked) · hr.bank.view (masked) · full IBAN only via audited reveal (hr.bank.manage)
 *   attendance / leave                                                 self · direct manager · hr.attendance.view / hr.leave.view within HR scope
 *   payroll lines / payslips                                           self (own, approved+) · hr.payroll.view
 *   performance                                                        self (completed reviews, goals) · direct manager · reviewer · hr.performance.view within HR scope
 * "HR scope" = hr.records.all, or hr.records.department and the employee is in my department.
 */

export type EmployeeLite = { id: string; departmentId: string | null; managerId: string | null; userId: string | null };

const meMemo = new WeakMap<Ctx, Promise<{ id: string; departmentId: string | null } | null>>();
/** The Employee record linked to the signed-in user (null if the account is not an employee). */
export function myEmployee(ctx: Ctx) {
  let p = meMemo.get(ctx);
  if (!p) {
    p = prisma.employee.findFirst({ where: { organizationId: ctx.organizationId, userId: ctx.userId }, select: { id: true, departmentId: true } });
    meMemo.set(ctx, p);
  }
  return p;
}

/** Covered by HR-office scope (not by self / manager relation). */
export async function hrCovers(ctx: Ctx, e: { departmentId: string | null }) {
  if (can(ctx, "hr.records.all")) return true;
  if (!can(ctx, "hr.records.department")) return false;
  const me = await myEmployee(ctx);
  return Boolean(me?.departmentId && e.departmentId === me.departmentId);
}

/** `where` for the employee directory. AND-wrapped so callers' OR filters cannot widen it. */
export async function employeeWhere(ctx: Ctx): Promise<Prisma.EmployeeWhereInput> {
  if (can(ctx, "hr.employees.view") && can(ctx, "hr.records.all")) return {};
  const me = await myEmployee(ctx);
  const ors: Prisma.EmployeeWhereInput[] = [];
  if (me) ors.push({ id: me.id }, { managerId: me.id });
  if (can(ctx, "hr.employees.view") && can(ctx, "hr.records.department") && me?.departmentId) ors.push({ departmentId: me.departmentId });
  return ors.length ? { AND: [{ OR: ors }] } : { id: "__none__" };
}

export type Relation = { self: boolean; manager: boolean; hr: boolean };

export async function relationTo(ctx: Ctx, e: EmployeeLite): Promise<Relation> {
  const me = await myEmployee(ctx);
  return { self: Boolean(me && me.id === e.id), manager: Boolean(me && e.managerId === me.id), hr: await hrCovers(ctx, e) };
}

/** Load a visible employee (NOT_FOUND otherwise) plus the caller's relation to it. */
export async function employeeAccess(db: Tx | typeof prisma, ctx: Ctx, id: string, opts: { lock?: boolean } = {}) {
  if (opts.lock) await (db as Tx).$queryRaw`SELECT id FROM "Employee" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const e = await db.employee.findFirst({ where: { AND: [{ id, organizationId: ctx.organizationId }, await employeeWhere(ctx)] }, select: { id: true, departmentId: true, managerId: true, userId: true, status: true } });
  if (!e) throw notFound("Employee");
  return { employee: e, rel: await relationTo(ctx, e) };
}

export const may = {
  personal: (ctx: Ctx, r: Relation) => r.self || (r.hr && can(ctx, "hr.employees.sensitive")),
  compensation: (ctx: Ctx, r: Relation) => r.self || (r.hr && can(ctx, "hr.compensation.view")),
  bank: (ctx: Ctx, r: Relation) => r.self || (r.hr && can(ctx, "hr.bank.view")),
  attendance: (ctx: Ctx, r: Relation) => r.self || (r.manager && can(ctx, "hr.attendance.view")) || (r.hr && can(ctx, "hr.attendance.view")),
  leave: (ctx: Ctx, r: Relation) => r.self || r.manager || (r.hr && can(ctx, "hr.leave.view")),
  payroll: (ctx: Ctx, r: Relation) => r.self || can(ctx, "hr.payroll.view"),
  performance: (ctx: Ctx, r: Relation) => r.self || r.manager || (r.hr && can(ctx, "hr.performance.view"))
};

export function ensure(ok: boolean, perm: string) {
  if (!ok) throw forbidden(perm);
}

// ---------------------------------------------------------------------------
// Masking — done on the server; masked values never reach the browser.
// ---------------------------------------------------------------------------

export const maskIban = (iban: string) => (iban.length <= 8 ? "••••" : `${iban.slice(0, 4)} •••• •••• ${iban.slice(-4)}`);
export const maskEmail = (e: string | null) => {
  if (!e) return null;
  const [u, d] = e.split("@");
  return `${u.slice(0, 1)}•••@${d ?? ""}`;
};
export const maskPhone = (p: string | null) => (p ? `${p.slice(0, 3)} ••• ${p.slice(-2)}` : null);
