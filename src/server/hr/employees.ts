import { z } from "zod";
import type { EmploymentStatus, Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid } from "../errors";
import { unitOfWork } from "../events/bus";
import { optDate, optEmail, optId, optText, parseListParams, reqText } from "../crm/normalize";
import { nextNumber } from "../crm/sequence";
import { ymd } from "../commercial/dates";
import { employeeAccess, employeeWhere, maskEmail, maskPhone, may, myEmployee } from "./access";

/**
 * Employees — docs/HR.md. Employee = HR person; User = system account (optional link).
 *
 * Status transitions (server-enforced):
 *   PROBATION → ACTIVE | SUSPENDED | TERMINATED
 *   ACTIVE    → ON_LEAVE | SUSPENDED | TERMINATED
 *   ON_LEAVE  → ACTIVE | TERMINATED
 *   SUSPENDED → ACTIVE | TERMINATED
 *   TERMINATED → ARCHIVED
 * Manager changes are checked for cycles (service walk under an advisory lock + DB trigger).
 */

export const EMPLOYEE_TRANSITIONS: Record<EmploymentStatus, readonly EmploymentStatus[]> = {
  PROBATION: ["ACTIVE", "SUSPENDED", "TERMINATED"],
  ACTIVE: ["ON_LEAVE", "SUSPENDED", "TERMINATED"],
  ON_LEAVE: ["ACTIVE", "TERMINATED"],
  SUSPENDED: ["ACTIVE", "TERMINATED"],
  TERMINATED: ["ARCHIVED"],
  ARCHIVED: []
};

const baseSchema = {
  firstName: reqText(1, 80),
  lastName: reqText(1, 80),
  nameAr: optText(160),
  workEmail: optEmail,
  personalEmail: optEmail,
  workPhone: optText(30),
  personalPhone: optText(30),
  jobTitle: optText(120),
  departmentId: optId,
  managerId: optId,
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACTOR", "INTERN", "TEMPORARY"]).default("FULL_TIME"),
  joinDate: z.coerce.date(),
  probationEndDate: optDate,
  workLocation: optText(120),
  country: z.string().trim().length(2).toUpperCase().default("SA"),
  city: optText(80),
  nationality: optText(60),
  emergencyContactName: optText(120),
  emergencyContactPhone: optText(30)
};
const createSchema = z.object({ ...baseSchema, userId: optId });
const updateSchema = z.object(baseSchema).partial().extend({ joinDate: z.coerce.date().optional() });

async function checkRefs(tx: Tx, ctx: Ctx, input: { departmentId?: string | null; userId?: string | null }) {
  if (input.departmentId && !(await tx.department.findFirst({ where: { id: input.departmentId, organizationId: ctx.organizationId, deletedAt: null } }))) throw invalid("UNKNOWN_DEPARTMENT");
  if (input.userId) {
    const u = await tx.user.findFirst({ where: { id: input.userId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, employee: { select: { id: true } } } });
    if (!u) throw invalid("UNKNOWN_USER");
    if (u.employee) throw conflict("USER_ALREADY_LINKED");
  }
}

/**
 * Prevent cycles: walking up from the proposed manager must never reach the employee.
 * Serialised per organization with an advisory lock so two concurrent changes cannot build a loop.
 */
async function assertNoCycle(tx: Tx, ctx: Ctx, employeeId: string | null, managerId: string | null | undefined) {
  if (!managerId) return;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`hr:hierarchy:${ctx.organizationId}`}))::text AS locked`;
  const mgr = await tx.employee.findFirst({ where: { id: managerId, organizationId: ctx.organizationId }, select: { id: true, status: true } });
  if (!mgr) throw invalid("UNKNOWN_MANAGER");
  if (mgr.status === "TERMINATED" || mgr.status === "ARCHIVED") throw invalid("MANAGER_INACTIVE");
  if (!employeeId) return;
  if (managerId === employeeId) throw invalid("MANAGER_CYCLE");
  let cur: string | null = managerId;
  for (let hops = 0; cur && hops < 500; hops++) {
    if (cur === employeeId) throw invalid("MANAGER_CYCLE");
    cur = (await tx.employee.findUnique({ where: { id: cur }, select: { managerId: true } }))?.managerId ?? null;
  }
}

const nameOf = (i: { firstName: string; lastName: string }) => `${i.firstName.trim()} ${i.lastName.trim()}`;

export async function createEmployee(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "hr.employees.create");
  const input = createSchema.parse(raw);
  return unitOfWork(ctx, (tx, uow) => createEmployeeTx(tx, uow, ctx, input));
}

/** Also used by the hire conversion (recruitment). */
export async function createEmployeeTx(tx: Tx, uow: Parameters<Parameters<typeof unitOfWork>[1]>[1], ctx: Ctx, input: z.output<typeof createSchema>) {
  await checkRefs(tx, ctx, input);
  await assertNoCycle(tx, ctx, null, input.managerId);
  if (input.probationEndDate && input.probationEndDate < input.joinDate) throw invalid("PROBATION_BEFORE_JOIN");
  const number = await nextNumber(tx, ctx.organizationId, "EMP");
  const e = await tx.employee.create({
    data: {
      organizationId: ctx.organizationId,
      number,
      userId: input.userId ?? null,
      firstName: input.firstName,
      lastName: input.lastName,
      nameAr: input.nameAr ?? null,
      displayName: nameOf(input),
      workEmail: input.workEmail ?? null,
      personalEmail: input.personalEmail ?? null,
      workPhone: input.workPhone ?? null,
      personalPhone: input.personalPhone ?? null,
      jobTitle: input.jobTitle ?? null,
      departmentId: input.departmentId ?? null,
      managerId: input.managerId ?? null,
      employmentType: input.employmentType,
      status: input.probationEndDate ? "PROBATION" : "ACTIVE",
      joinDate: input.joinDate,
      probationEndDate: input.probationEndDate ?? null,
      workLocation: input.workLocation ?? null,
      country: input.country,
      city: input.city ?? null,
      nationality: input.nationality ?? null,
      emergencyContactName: input.emergencyContactName ?? null,
      emergencyContactPhone: input.emergencyContactPhone ?? null,
      createdById: ctx.userId || null
    }
  });
  // the audit trail never stores personal contact data in clear
  await uow.audit({ action: "employee.created", entityType: "Employee", entityId: e.id, after: { number, name: e.displayName, departmentId: e.departmentId, managerId: e.managerId, employmentType: e.employmentType, status: e.status, joinDate: ymd(e.joinDate), userId: e.userId } });
  uow.emit({ type: "employee.created", entityType: "Employee", entityId: e.id, payload: { employeeId: e.id, number, name: e.displayName, managerId: e.managerId, userId: e.userId }, activity: { entityLabel: `${number} · ${e.displayName}`, href: `/app/hr/employees/${e.id}`, visibility: "hr.employees.view" } });
  return { id: e.id, number };
}

export async function updateEmployee(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "hr.employees.edit");
  const input = updateSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const { rel } = await employeeAccess(tx, ctx, id, { lock: true });
    if (!rel.hr) throw forbidden("hr.employees.edit (HR scope)");
    const before = await tx.employee.findUniqueOrThrow({ where: { id } });
    if (input.departmentId !== undefined) await checkRefs(tx, ctx, { departmentId: input.departmentId });
    if (input.managerId !== undefined && input.managerId !== before.managerId) await assertNoCycle(tx, ctx, id, input.managerId);
    const joinDate = input.joinDate ?? before.joinDate;
    if (input.probationEndDate && input.probationEndDate < joinDate) throw invalid("PROBATION_BEFORE_JOIN");
    const data: Prisma.EmployeeUncheckedUpdateInput = { ...input };
    if (input.firstName || input.lastName) data.displayName = nameOf({ firstName: input.firstName ?? before.firstName, lastName: input.lastName ?? before.lastName });
    const after = await tx.employee.update({ where: { id }, data });
    const changed = Object.keys(input).filter((k) => String((before as Record<string, unknown>)[k] ?? "") !== String((after as Record<string, unknown>)[k] ?? ""));
    const personal = ["personalEmail", "personalPhone", "emergencyContactName", "emergencyContactPhone", "nationality"];
    await uow.audit({ action: "employee.updated", entityType: "Employee", entityId: id, after: { changed: changed.map((k) => (personal.includes(k) ? `${k} (personal)` : k)) } });
    if (input.managerId !== undefined && input.managerId !== before.managerId) {
      await uow.audit({ action: "employee.manager_changed", entityType: "Employee", entityId: id, before: { managerId: before.managerId }, after: { managerId: after.managerId } });
      uow.emit({ type: "employee.manager_changed", entityType: "Employee", entityId: id, payload: { employeeId: id, from: before.managerId, to: after.managerId } });
    }
    return { id };
  });
}

const statusSchema = z.object({ to: z.enum(["ACTIVE", "PROBATION", "ON_LEAVE", "SUSPENDED", "TERMINATED", "ARCHIVED"]), reason: optText(1000), terminationDate: optDate });

export async function changeEmployeeStatus(ctx: Ctx, id: string, raw: unknown) {
  const input = statusSchema.parse(raw);
  requirePermission(ctx, input.to === "ARCHIVED" ? "hr.employees.archive" : "hr.employees.edit");
  return unitOfWork(ctx, async (tx, uow) => {
    const { rel } = await employeeAccess(tx, ctx, id, { lock: true });
    if (!rel.hr) throw forbidden("hr.employees.edit (HR scope)");
    if (rel.self) throw forbidden("own employment status");
    const e = await tx.employee.findUniqueOrThrow({ where: { id } });
    if (!EMPLOYEE_TRANSITIONS[e.status].includes(input.to)) throw conflict(`EMPLOYEE_INVALID_TRANSITION:${e.status}`);
    if ((input.to === "TERMINATED" || input.to === "SUSPENDED") && (!input.reason || input.reason.trim().length < 3)) throw invalid("REASON_REQUIRED");
    if (input.to === "TERMINATED") {
      if (!input.terminationDate) throw invalid("TERMINATION_DATE_REQUIRED");
      const reports = await tx.employee.count({ where: { managerId: id, status: { notIn: ["TERMINATED", "ARCHIVED"] } } });
      if (reports) throw conflict(`HAS_DIRECT_REPORTS:${reports}`);
    }
    await tx.employee.update({
      where: { id },
      data: { status: input.to, ...(input.to === "TERMINATED" ? { terminationDate: input.terminationDate, terminationReason: input.reason } : {}), ...(input.to === "ARCHIVED" ? { archivedAt: new Date() } : {}) }
    });
    await uow.audit({ action: "employee.status_changed", entityType: "Employee", entityId: id, before: { status: e.status }, after: { status: input.to, reason: input.reason, terminationDate: ymd(input.terminationDate ?? null) } });
    const payload = { employeeId: id, number: e.number, from: e.status, to: input.to };
    uow.emit({ type: "employee.status_changed", entityType: "Employee", entityId: id, payload });
    if (input.to === "ACTIVE" && e.status === "PROBATION") uow.emit({ type: "employee.activated", entityType: "Employee", entityId: id, payload });
    if (input.to === "TERMINATED") uow.emit({ type: "employee.terminated", entityType: "Employee", entityId: id, payload, activity: { entityLabel: `${e.number} · ${e.displayName}`, href: `/app/hr/employees/${id}`, visibility: "hr.employees.view" } });
    return { id };
  });
}

/** Link an existing system account (or unlink with null). */
export async function linkUser(ctx: Ctx, id: string, userId: string | null) {
  requirePermission(ctx, "hr.employees.edit");
  if (userId) requirePermission(ctx, "admin.users.view");
  return unitOfWork(ctx, async (tx, uow) => {
    const { rel } = await employeeAccess(tx, ctx, id, { lock: true });
    if (!rel.hr) throw forbidden("hr.employees.edit (HR scope)");
    if (userId) await checkRefs(tx, ctx, { userId });
    const before = await tx.employee.findUniqueOrThrow({ where: { id }, select: { userId: true } });
    await tx.employee.update({ where: { id }, data: { userId } });
    await uow.audit({ action: "employee.user_linked", entityType: "Employee", entityId: id, before, after: { userId } });
    return { id };
  });
}

/** Explicit action: create a system account for the employee (admin.users.manage) and link it. */
export async function createSystemAccount(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "hr.employees.edit");
  requirePermission(ctx, "admin.users.manage");
  const { roleIds } = z.object({ roleIds: z.array(z.string().min(1)).min(1).max(5) }).parse(raw);
  const { rel } = await employeeAccess(prisma, ctx, id);
  if (!rel.hr) throw forbidden("hr.employees.edit (HR scope)");
  const e = await prisma.employee.findUniqueOrThrow({ where: { id } });
  if (e.userId) throw conflict("USER_ALREADY_LINKED");
  if (!e.workEmail) throw invalid("WORK_EMAIL_REQUIRED");
  const { createUser } = await import("../admin/users");
  const u = await createUser(ctx, { email: e.workEmail, name: e.displayName, nameAr: e.nameAr ?? "", jobTitle: e.jobTitle ?? "", departmentId: e.departmentId ?? "", roleIds });
  await linkUser(ctx, id, u.id);
  return u;
}

// ---------------------------------------------------------------------------
// Read — generic lists never return personal contact data or anything financial
// ---------------------------------------------------------------------------

export const EMPLOYEES_PAGE_SIZE = 30;
const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "PROBATION", "ON_LEAVE", "SUSPENDED", "TERMINATED", "ARCHIVED", "current"]).optional(),
  department: z.string().max(40).optional(),
  type: z.enum(["FULL_TIME", "PART_TIME", "CONTRACTOR", "INTERN", "TEMPORARY"]).optional(),
  manager: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1)
});

export const LIST_SELECT = {
  id: true, number: true, displayName: true, nameAr: true, jobTitle: true, workEmail: true, workPhone: true, status: true, employmentType: true, joinDate: true, userId: true,
  department: { select: { id: true, name: true, nameAr: true } },
  manager: { select: { id: true, displayName: true, nameAr: true } }
} satisfies Prisma.EmployeeSelect;

export async function listEmployees(ctx: Ctx, raw: unknown) {
  const f = parseListParams(listSchema, raw ?? {});
  const filters: Prisma.EmployeeWhereInput[] = [];
  if (f.q) filters.push({ OR: [{ displayName: { contains: f.q, mode: "insensitive" } }, { nameAr: { contains: f.q } }, { number: { contains: f.q.toUpperCase() } }, { jobTitle: { contains: f.q, mode: "insensitive" } }, { workEmail: { contains: f.q, mode: "insensitive" } }] });
  if (f.status === "current" || !f.status) filters.push({ status: { notIn: ["TERMINATED", "ARCHIVED"] } });
  else filters.push({ status: f.status });
  if (f.department) filters.push({ departmentId: f.department });
  if (f.type) filters.push({ employmentType: f.type });
  if (f.manager) filters.push({ managerId: f.manager === "me" ? ((await myEmployee(ctx))?.id ?? "__none__") : f.manager });
  const where: Prisma.EmployeeWhereInput = { AND: [{ organizationId: ctx.organizationId }, await employeeWhere(ctx), ...filters] };
  const [items, total] = await Promise.all([
    prisma.employee.findMany({ where, orderBy: [{ displayName: "asc" }], skip: (f.page - 1) * EMPLOYEES_PAGE_SIZE, take: EMPLOYEES_PAGE_SIZE, select: LIST_SELECT }),
    prisma.employee.count({ where })
  ]);
  return { items, total, page: f.page, pageSize: EMPLOYEES_PAGE_SIZE, filters: f };
}

/** Profile with personal fields masked unless the caller may see them (masking happens here, never in CSS). */
export async function getEmployee(ctx: Ctx, id: string) {
  const { rel } = await employeeAccess(prisma, ctx, id);
  const e = await prisma.employee.findUniqueOrThrow({
    where: { id },
    include: {
      department: { select: { id: true, name: true, nameAr: true } },
      manager: { select: { id: true, number: true, displayName: true, nameAr: true } },
      reports: { where: { status: { notIn: ["TERMINATED", "ARCHIVED"] } }, select: { id: true, number: true, displayName: true, nameAr: true, jobTitle: true }, orderBy: { displayName: "asc" } },
      user: { select: { id: true, email: true, status: true } }
    }
  });
  const personal = may.personal(ctx, rel);
  return {
    rel,
    personalVisible: personal,
    employee: {
      ...e,
      personalEmail: personal ? e.personalEmail : maskEmail(e.personalEmail),
      personalPhone: personal ? e.personalPhone : maskPhone(e.personalPhone),
      emergencyContactName: personal ? e.emergencyContactName : e.emergencyContactName ? "••••" : null,
      emergencyContactPhone: personal ? e.emergencyContactPhone : maskPhone(e.emergencyContactPhone),
      nationality: personal ? e.nationality : e.nationality ? "••" : null,
      terminationReason: rel.hr ? e.terminationReason : null
    },
    can: {
      edit: rel.hr && can(ctx, "hr.employees.edit"),
      archive: rel.hr && can(ctx, "hr.employees.archive"),
      compensation: may.compensation(ctx, rel),
      compensationManage: rel.hr && can(ctx, "hr.compensation.manage"),
      bank: may.bank(ctx, rel),
      bankManage: rel.hr && can(ctx, "hr.bank.manage"),
      attendance: may.attendance(ctx, rel),
      attendanceManage: rel.hr && can(ctx, "hr.attendance.manage"),
      leave: may.leave(ctx, rel),
      payroll: may.payroll(ctx, rel),
      performance: may.performance(ctx, rel),
      performanceManage: (rel.manager || rel.hr) && can(ctx, "hr.performance.manage")
    }
  };
}

/** Options for selects (directory scope; names only). */
export async function employeeOptions(ctx: Ctx, opts: { activeOnly?: boolean } = {}) {
  return prisma.employee.findMany({
    where: { AND: [{ organizationId: ctx.organizationId }, await employeeWhere(ctx), ...(opts.activeOnly !== false ? [{ status: { notIn: ["TERMINATED", "ARCHIVED"] as EmploymentStatus[] } }] : [])] },
    orderBy: { displayName: "asc" },
    select: { id: true, number: true, displayName: true, nameAr: true }
  });
}

export async function employeeActivity(ctx: Ctx, id: string) {
  const { rel } = await employeeAccess(prisma, ctx, id);
  if (!rel.hr && !rel.self) throw forbidden("hr.employees.view (HR scope)");
  // sensitive areas (compensation / bank / payroll) appear only to holders of those permissions
  const hide = [...(can(ctx, "hr.compensation.view") ? [] : ["compensation."]), ...(can(ctx, "hr.bank.view") ? [] : ["bank."]), ...(can(ctx, "hr.payroll.view") ? [] : ["payroll."])];
  const rows = await prisma.auditLog.findMany({ where: { organizationId: ctx.organizationId, entityId: id }, orderBy: { createdAt: "desc" }, take: 100, include: { actor: { select: { name: true, nameAr: true } } } });
  return rows.filter((r) => !hide.some((h) => r.action.startsWith(h))).map((r) => ({ id: r.id, action: r.action, createdAt: r.createdAt, actor: r.actor }));
}

export async function departmentsSummary(ctx: Ctx) {
  requirePermission(ctx, "hr.employees.view");
  const depts = await prisma.department.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, nameAr: true, active: true, manager: { select: { id: true, name: true, nameAr: true } }, _count: { select: { employees: { where: { status: { notIn: ["TERMINATED", "ARCHIVED"] } } } } } }
  });
  return depts;
}

