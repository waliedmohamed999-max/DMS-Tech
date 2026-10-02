import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork, type Uow } from "../events/bus";
import { optId, optText, parseListParams, reqText } from "../crm/normalize";
import { todayIn, ymd } from "../commercial/dates";
import { cancelApprovalTx, registerApprovalHandler, requestApprovalTx } from "../approvals/service";
import { usersWithAll } from "../events/subscribers";
import { Decimal } from "@/lib/commercial/calc";
import { employeeAccess, hrCovers, myEmployee } from "./access";
import { policyOf, workingDaysBetween } from "./attendance";

/**
 * Leave — docs/HR.md.
 *   DRAFT → SUBMITTED → (Approval LEAVE: direct manager, then HR when policy.leaveRequiresHrApproval) → APPROVED | REJECTED (reason)
 *   SUBMITTED / APPROVED (not started, or by HR) → CANCELLED (reversal written to the ledger)
 * Days = configured working days between start and end, minus company holidays.
 * Balances are an append-only ledger (OPENING / ACCRUAL / USAGE / ADJUSTMENT / REVERSAL); a balance is
 * tracked only for types with a configured yearly default or explicit ledger entries — nothing statutory is assumed.
 * Approved leave can mark attendance ON_LEAVE (policy), and never rewrites payroll that is already approved.
 */

export const DEFAULT_LEAVE_TYPES: [string, string, string, { paid: boolean; requiresAttachment?: boolean; requiresApproval?: boolean }][] = [
  ["annual", "إجازة سنوية", "Annual leave", { paid: true }],
  ["sick", "إجازة مرضية", "Sick leave", { paid: true, requiresAttachment: true }],
  ["unpaid", "إجازة بدون راتب", "Unpaid leave", { paid: false }],
  ["emergency", "إجازة اضطرارية", "Emergency leave", { paid: true }],
  ["other", "أخرى", "Other", { paid: true }]
];

/** Idempotent (bootstrap): creates missing default types; balances stay unconfigured (null) until HR sets them. */
export async function ensureLeaveTypes(organizationId: string) {
  await prisma.leaveType.createMany({
    data: DEFAULT_LEAVE_TYPES.map(([key, nameAr, nameEn, o], i) => ({ organizationId, key, nameAr, nameEn, paid: o.paid, requiresAttachment: o.requiresAttachment ?? false, requiresApproval: o.requiresApproval ?? true, sortOrder: i * 10 })),
    skipDuplicates: true
  });
}

const typeSchema = z.object({
  id: optId,
  key: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  nameAr: reqText(2, 80),
  nameEn: reqText(2, 80),
  paid: z.boolean(),
  requiresAttachment: z.boolean().default(false),
  requiresApproval: z.boolean().default(true),
  defaultBalanceDays: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().min(0).max(365).nullable()),
  active: z.boolean().default(true)
});

export async function saveLeaveType(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "hr.leave.manage");
  const input = typeSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const data = { nameAr: input.nameAr, nameEn: input.nameEn, paid: input.paid, requiresAttachment: input.requiresAttachment, requiresApproval: input.requiresApproval, defaultBalanceDays: input.defaultBalanceDays, active: input.active };
    if (input.id) {
      const before = await tx.leaveType.findFirst({ where: { id: input.id, organizationId: ctx.organizationId } });
      if (!before) throw notFound("LeaveType");
      const after = await tx.leaveType.update({ where: { id: input.id }, data });
      await uow.audit({ action: "leave.type_updated", entityType: "LeaveType", entityId: after.id, before, after });
      return { id: after.id };
    }
    const key = input.key ?? input.nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    if (await tx.leaveType.findFirst({ where: { organizationId: ctx.organizationId, key } })) throw invalid("LEAVE_TYPE_KEY_TAKEN");
    const t = await tx.leaveType.create({ data: { ...data, organizationId: ctx.organizationId, key, sortOrder: 1000 } });
    await uow.audit({ action: "leave.type_created", entityType: "LeaveType", entityId: t.id, after: t });
    return { id: t.id };
  });
}

export const listLeaveTypes = (organizationId: string, all = false) => prisma.leaveType.findMany({ where: { organizationId, ...(all ? {} : { active: true }) }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] });

// --- balances (ledger) ---------------------------------------------------------

export async function balanceOf(db: Tx | typeof prisma, employeeId: string, leaveTypeId: string, year: number) {
  const rows = await db.leaveLedgerEntry.groupBy({ by: ["kind"], where: { employeeId, leaveTypeId, year }, _sum: { days: true } });
  const get = (k: string) => new Decimal((rows.find((r) => r.kind === k)?._sum.days ?? 0).toString());
  const total = rows.reduce((s, r) => s.plus((r._sum.days ?? 0).toString()), new Decimal(0));
  return { opening: get("OPENING").toFixed(2), accrual: get("ACCRUAL").toFixed(2), usage: get("USAGE").abs().toFixed(2), adjustment: get("ADJUSTMENT").toFixed(2), reversal: get("REVERSAL").toFixed(2), remaining: total.toFixed(2), tracked: rows.length > 0 };
}

export async function balances(ctx: Ctx, employeeId: string, year: number) {
  const { rel } = await employeeAccess(prisma, ctx, employeeId).catch(async () => {
    const me = await myEmployee(ctx);
    if (me?.id === employeeId) return { rel: { self: true, manager: false, hr: false } };
    throw forbidden("hr.leave.view");
  });
  if (!rel.self && !rel.manager && !(rel.hr && can(ctx, "hr.leave.view"))) throw forbidden("hr.leave.view");
  const types = await listLeaveTypes(ctx.organizationId);
  const out = [];
  for (const t of types) out.push({ type: t, ...(await balanceOf(prisma, employeeId, t.id, year)) });
  return out;
}

/** Grant the configured yearly default (OPENING) to every current employee once per year and type — idempotent. */
export async function grantOpeningBalances(ctx: Ctx, year: number) {
  requirePermission(ctx, "hr.leave.manage");
  if (!can(ctx, "hr.records.all")) throw forbidden("hr.records.all");
  return unitOfWork(ctx, async (tx, uow) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`hr:opening:${ctx.organizationId}:${year}`}))::text AS locked`;
    const types = await tx.leaveType.findMany({ where: { organizationId: ctx.organizationId, active: true, defaultBalanceDays: { not: null } } });
    const emps = await tx.employee.findMany({ where: { organizationId: ctx.organizationId, status: { notIn: ["TERMINATED", "ARCHIVED"] } }, select: { id: true } });
    let created = 0;
    for (const t of types)
      for (const e of emps) {
        if (await tx.leaveLedgerEntry.findFirst({ where: { employeeId: e.id, leaveTypeId: t.id, year, kind: "OPENING" }, select: { id: true } })) continue;
        await tx.leaveLedgerEntry.create({ data: { organizationId: ctx.organizationId, employeeId: e.id, leaveTypeId: t.id, year, kind: "OPENING", days: t.defaultBalanceDays!, reason: `Opening balance ${year}`, createdById: ctx.userId || null } });
        created++;
      }
    await uow.audit({ action: "leave.opening_granted", entityType: "LeaveType", entityId: null, after: { year, entries: created } });
    return { created };
  });
}

const adjustSchema = z.object({ employeeId: z.string().min(1), leaveTypeId: z.string().min(1), year: z.coerce.number().int().min(2000).max(2100), days: z.coerce.number().refine((n) => n !== 0 && Math.abs(n) <= 365, "DAYS_INVALID"), kind: z.enum(["ADJUSTMENT", "ACCRUAL"]).default("ADJUSTMENT"), reason: reqText(3, 500) });

export async function adjustBalance(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "hr.leave.manage");
  const input = adjustSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const { rel } = await employeeAccess(tx, ctx, input.employeeId, { lock: true });
    if (!rel.hr) throw forbidden("hr.leave.manage (HR scope)");
    if (rel.self) throw forbidden("own leave balance");
    const e = await tx.leaveLedgerEntry.create({ data: { organizationId: ctx.organizationId, employeeId: input.employeeId, leaveTypeId: input.leaveTypeId, year: input.year, kind: input.kind, days: input.days.toFixed(2), reason: input.reason, createdById: ctx.userId || null } });
    await uow.audit({ action: "leave.balance_adjusted", entityType: "Employee", entityId: input.employeeId, after: { leaveTypeId: input.leaveTypeId, year: input.year, kind: input.kind, days: input.days, reason: input.reason } });
    return { id: e.id };
  });
}

// --- requests -----------------------------------------------------------------

const requestSchema = z.object({ employeeId: optId, leaveTypeId: z.string().min(1), startDate: z.coerce.date(), endDate: z.coerce.date(), reason: optText(1000), submit: z.boolean().default(true) });

async function reservedDays(tx: Tx, employeeId: string, leaveTypeId: string, year: number, excludeId?: string) {
  const pending = await tx.leaveRequest.aggregate({ where: { employeeId, leaveTypeId, status: "SUBMITTED", startDate: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) }, ...(excludeId ? { id: { not: excludeId } } : {}) }, _sum: { days: true } });
  return new Decimal((pending._sum.days ?? 0).toString());
}

export async function createLeaveRequest(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "hr.leave.request");
  const input = requestSchema.parse(raw);
  const me = await myEmployee(ctx);
  const employeeId = input.employeeId ?? me?.id;
  if (!employeeId) throw forbidden("not an employee");
  if (employeeId !== me?.id) requirePermission(ctx, "hr.leave.manage");
  if (input.endDate < input.startDate) throw invalid("END_BEFORE_START");
  return unitOfWork(ctx, async (tx, uow) => {
    const { rel } = await employeeAccess(tx, ctx, employeeId, { lock: true });
    if (!rel.self && !rel.hr) throw forbidden("hr.leave.manage (HR scope)");
    const type = await tx.leaveType.findFirst({ where: { id: input.leaveTypeId, organizationId: ctx.organizationId, active: true } });
    if (!type) throw invalid("UNKNOWN_LEAVE_TYPE");
    if (input.startDate.getUTCFullYear() !== input.endDate.getUTCFullYear()) throw invalid("LEAVE_SPANS_YEARS");
    const { days } = await workingDaysBetween(tx, ctx.organizationId, input.startDate, input.endDate);
    if (!days.length) throw invalid("NO_WORKING_DAYS");
    const overlap = await tx.leaveRequest.findFirst({ where: { employeeId, status: { in: ["SUBMITTED", "APPROVED"] }, startDate: { lte: input.endDate }, endDate: { gte: input.startDate } } });
    if (overlap) throw conflict("LEAVE_OVERLAP");
    const lr = await tx.leaveRequest.create({ data: { organizationId: ctx.organizationId, employeeId, leaveTypeId: type.id, startDate: input.startDate, endDate: input.endDate, days: days.length, reason: input.reason ?? null, createdById: ctx.userId || null } });
    await uow.audit({ action: "leave.created", entityType: "Employee", entityId: employeeId, after: { leaveRequestId: lr.id, type: type.key, start: ymd(lr.startDate), end: ymd(lr.endDate), days: days.length } });
    if (input.submit) await submitTx(tx, uow, ctx, lr.id);
    return { id: lr.id, days: days.length };
  });
}

/** Route to the direct manager (if they can approve), otherwise to HR (hr.leave.manage). */
async function requestStage(tx: Tx, uow: Uow, ctx: Ctx, lr: { id: string; employeeId: string; days: Prisma.Decimal; startDate: Date; endDate: Date }, stage: "MANAGER" | "HR") {
  const emp = await tx.employee.findUniqueOrThrow({ where: { id: lr.employeeId }, select: { displayName: true, manager: { select: { userId: true } } } });
  let assigneeId: string | undefined;
  let requiredPermission: "hr.leave.approve" | "hr.leave.manage" = "hr.leave.manage";
  if (stage === "MANAGER" && emp.manager?.userId) {
    const approvers = await usersWithAll(ctx.organizationId, ["approvals.decide", "hr.leave.approve"]);
    if (approvers.includes(emp.manager.userId) && emp.manager.userId !== ctx.userId) {
      assigneeId = emp.manager.userId;
      requiredPermission = "hr.leave.approve";
    }
  }
  const a = await requestApprovalTx(tx, uow, ctx, {
    type: "LEAVE",
    entityType: "LeaveRequest",
    entityId: lr.id,
    title: `${emp.displayName} · ${ymd(lr.startDate)} → ${ymd(lr.endDate)} (${lr.days.toString()}d)`,
    payload: { leaveRequestId: lr.id, employeeId: lr.employeeId, stage },
    requiredPermission,
    assigneeId,
    priority: "MEDIUM"
  });
  await tx.leaveRequest.update({ where: { id: lr.id }, data: { stage: assigneeId ? "MANAGER" : "HR", approvalId: a.id } });
  return a;
}

async function submitTx(tx: Tx, uow: Uow, ctx: Ctx, id: string) {
  const lr = await tx.leaveRequest.findUniqueOrThrow({ where: { id }, include: { leaveType: true } });
  if (lr.status !== "DRAFT") throw conflict(`LEAVE_INVALID_TRANSITION:${lr.status}`);
  if (lr.leaveType.defaultBalanceDays !== null || (await tx.leaveLedgerEntry.count({ where: { employeeId: lr.employeeId, leaveTypeId: lr.leaveTypeId, year: lr.startDate.getUTCFullYear() } })) > 0) {
    const bal = await balanceOf(tx, lr.employeeId, lr.leaveTypeId, lr.startDate.getUTCFullYear());
    const available = new Decimal(bal.remaining).minus(await reservedDays(tx, lr.employeeId, lr.leaveTypeId, lr.startDate.getUTCFullYear(), lr.id));
    if (available.lt(lr.days.toString())) throw conflict(`INSUFFICIENT_BALANCE:${available.toFixed(2)}`);
  }
  await tx.leaveRequest.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
  await uow.audit({ action: "leave.submitted", entityType: "Employee", entityId: lr.employeeId, after: { leaveRequestId: id, days: lr.days.toString(), start: ymd(lr.startDate), end: ymd(lr.endDate) } });
  uow.emit({ type: "leave.submitted", entityType: "LeaveRequest", entityId: id, payload: { leaveRequestId: id, employeeId: lr.employeeId, days: lr.days.toString(), start: ymd(lr.startDate), end: ymd(lr.endDate) } });
  if (!lr.leaveType.requiresApproval) return approveFinal(tx, uow, ctx, id, "auto");
  await requestStage(tx, uow, ctx, lr, "MANAGER");
}

export async function submitLeaveRequest(ctx: Ctx, id: string) {
  requirePermission(ctx, "hr.leave.request");
  return unitOfWork(ctx, async (tx, uow) => {
    await tx.$queryRaw`SELECT id FROM "LeaveRequest" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    const lr = await tx.leaveRequest.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!lr) throw notFound("LeaveRequest");
    const me = await myEmployee(ctx);
    if (lr.employeeId !== me?.id && !can(ctx, "hr.leave.manage")) throw forbidden("own leave only");
    await submitTx(tx, uow, ctx, id);
  });
}

/** Final approval: ledger usage, attendance ON_LEAVE (policy), events. */
async function approveFinal(tx: Tx, uow: Uow, ctx: Ctx, id: string, how: "auto" | "approval") {
  const lr = await tx.leaveRequest.findUniqueOrThrow({ where: { id }, include: { leaveType: true } });
  const res = await tx.leaveRequest.updateMany({ where: { id, status: "SUBMITTED" }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: ctx.userId || lr.createdById, stage: null } });
  if (res.count !== 1) throw conflict("LEAVE_ALREADY_DECIDED");
  await tx.leaveLedgerEntry.create({ data: { organizationId: lr.organizationId, employeeId: lr.employeeId, leaveTypeId: lr.leaveTypeId, year: lr.startDate.getUTCFullYear(), kind: "USAGE", days: new Decimal(lr.days.toString()).neg().toFixed(2), leaveRequestId: id, reason: lr.leaveType.nameEn, createdById: ctx.userId || null } });
  const policy = await policyOf(tx, lr.organizationId);
  let marked = 0;
  if (policy.leaveMarksAttendance) {
    const { days } = await workingDaysBetween(tx, lr.organizationId, lr.startDate, lr.endDate);
    for (const d of days) {
      const existing = await tx.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: lr.employeeId, date: d } } });
      if (existing && !["MISSING", "ABSENT"].includes(existing.status)) continue; // never overwrite real attendance
      if (existing) await tx.attendanceRecord.update({ where: { id: existing.id }, data: { status: "ON_LEAVE", source: "LEAVE", notes: lr.leaveType.nameEn } });
      else await tx.attendanceRecord.create({ data: { organizationId: lr.organizationId, employeeId: lr.employeeId, date: d, status: "ON_LEAVE", source: "LEAVE", notes: lr.leaveType.nameEn } });
      marked++;
    }
  }
  await uow.audit({ action: "leave.approved", entityType: "Employee", entityId: lr.employeeId, before: { status: "SUBMITTED" }, after: { leaveRequestId: id, status: "APPROVED", days: lr.days.toString(), how, attendanceMarked: marked } });
  const emp = await tx.employee.findUniqueOrThrow({ where: { id: lr.employeeId }, select: { userId: true, displayName: true } });
  uow.emit({ type: "leave.approved", entityType: "LeaveRequest", entityId: id, payload: { leaveRequestId: id, employeeId: lr.employeeId, userId: emp.userId, name: emp.displayName, start: ymd(lr.startDate), end: ymd(lr.endDate) } });
}

/** The decider must be the employee's direct manager (stage MANAGER) or HR covering the employee — never the employee. */
async function assertDecider(tx: Tx, ctx: Ctx, employeeId: string, stage: string) {
  const emp = await tx.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { userId: true, managerId: true, departmentId: true } });
  if (emp.userId === ctx.userId) throw forbidden("self-approval");
  const me = await tx.employee.findFirst({ where: { organizationId: ctx.organizationId, userId: ctx.userId }, select: { id: true } });
  const isManager = Boolean(me && emp.managerId === me.id);
  const isHr = can(ctx, "hr.leave.manage") && (await hrCovers(ctx, emp));
  if (stage === "HR" ? !isHr : !(isManager || isHr)) throw forbidden(stage === "HR" ? "hr.leave.manage" : "direct manager or HR");
}

registerApprovalHandler("LEAVE", {
  async onApproved(tx, uow, approval, ctx) {
    const p = approval.payload as { leaveRequestId: string; employeeId: string; stage: "MANAGER" | "HR" };
    const lr = await tx.leaveRequest.findUnique({ where: { id: p.leaveRequestId } });
    if (!lr || lr.status !== "SUBMITTED" || lr.approvalId !== approval.id) throw conflict("LEAVE_ALREADY_DECIDED");
    await assertDecider(tx, ctx, lr.employeeId, p.stage);
    const policy = await policyOf(tx, lr.organizationId);
    if (p.stage === "MANAGER" && policy.leaveRequiresHrApproval) {
      await uow.audit({ action: "leave.manager_approved", entityType: "Employee", entityId: lr.employeeId, after: { leaveRequestId: lr.id } });
      await requestStage(tx, uow, ctx, lr, "HR");
      return;
    }
    await approveFinal(tx, uow, ctx, lr.id, "approval");
  },
  async onRejected(tx, uow, approval, ctx) {
    const p = approval.payload as { leaveRequestId: string; stage: string };
    const lr = await tx.leaveRequest.findUnique({ where: { id: p.leaveRequestId } });
    if (!lr || lr.status !== "SUBMITTED" || lr.approvalId !== approval.id) throw conflict("LEAVE_ALREADY_DECIDED");
    await assertDecider(tx, ctx, lr.employeeId, p.stage);
    const reason = (approval.decisionComment ?? "").trim();
    if (!reason) throw invalid("REJECTION_REASON_REQUIRED");
    await tx.leaveRequest.update({ where: { id: lr.id }, data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: reason, stage: null } });
    await uow.audit({ action: "leave.rejected", entityType: "Employee", entityId: lr.employeeId, after: { leaveRequestId: lr.id, reason } });
    const emp = await tx.employee.findUniqueOrThrow({ where: { id: lr.employeeId }, select: { userId: true } });
    uow.emit({ type: "leave.rejected", entityType: "LeaveRequest", entityId: lr.id, payload: { leaveRequestId: lr.id, userId: emp.userId, reason, start: ymd(lr.startDate) } });
  },
  async onCancelled(tx, _uow, approval) {
    const p = approval.payload as { leaveRequestId: string };
    await tx.leaveRequest.updateMany({ where: { id: p.leaveRequestId, status: "SUBMITTED" }, data: { status: "CANCELLED", cancelledAt: new Date(), stage: null } });
  }
});

/** Employee: own request while SUBMITTED, or APPROVED before it starts. HR (hr.leave.manage): any time. Approved leave is reversed in the ledger. */
export async function cancelLeaveRequest(ctx: Ctx, id: string, raw: unknown) {
  const { reason } = z.object({ reason: optText(500) }).parse(raw ?? {});
  return unitOfWork(ctx, async (tx, uow) => {
    await tx.$queryRaw`SELECT id FROM "LeaveRequest" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    const lr = await tx.leaveRequest.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!lr) throw notFound("LeaveRequest");
    const me = await myEmployee(ctx);
    const own = lr.employeeId === me?.id;
    const emp = await tx.employee.findUniqueOrThrow({ where: { id: lr.employeeId }, select: { departmentId: true } });
    const hr = can(ctx, "hr.leave.manage") && (await hrCovers(ctx, emp));
    if (!own && !hr) throw forbidden("hr.leave.manage");
    const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });
    const today = todayIn(org.timezone);
    if (lr.status === "APPROVED" && !hr && lr.startDate <= today) throw conflict("LEAVE_ALREADY_STARTED");
    if (!["DRAFT", "SUBMITTED", "APPROVED"].includes(lr.status)) throw conflict(`LEAVE_INVALID_TRANSITION:${lr.status}`);
    if (lr.status === "SUBMITTED" && lr.approvalId) await cancelApprovalTx(tx, uow, ctx, lr.approvalId, { allowNonRequester: true, runHook: false });
    await tx.leaveRequest.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason ?? null, stage: null } });
    if (lr.status === "APPROVED") {
      await tx.leaveLedgerEntry.create({ data: { organizationId: lr.organizationId, employeeId: lr.employeeId, leaveTypeId: lr.leaveTypeId, year: lr.startDate.getUTCFullYear(), kind: "REVERSAL", days: lr.days.toString(), leaveRequestId: id, reason: reason ?? "Cancelled", createdById: ctx.userId || null } });
      // only future leave-marked days are removed; past attendance is history
      await tx.attendanceRecord.deleteMany({ where: { employeeId: lr.employeeId, source: "LEAVE", date: { gte: lr.startDate > today ? lr.startDate : today, lte: lr.endDate } } });
    }
    await uow.audit({ action: "leave.cancelled", entityType: "Employee", entityId: lr.employeeId, before: { status: lr.status }, after: { leaveRequestId: id, status: "CANCELLED", reason, reversed: lr.status === "APPROVED" } });
    uow.emit({ type: "leave.cancelled", entityType: "LeaveRequest", entityId: id, payload: { leaveRequestId: id, employeeId: lr.employeeId } });
  });
}

// --- read -----------------------------------------------------------------------

const listSchema = z.object({ status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"]).optional(), employee: z.string().max(40).optional(), scope: z.enum(["mine", "team", "all"]).default("all"), page: z.coerce.number().int().min(1).default(1) });

export async function listLeaveRequests(ctx: Ctx, raw: unknown) {
  const f = parseListParams(listSchema, raw ?? {});
  const me = await myEmployee(ctx);
  const ors: Prisma.LeaveRequestWhereInput[] = [];
  if (me) ors.push({ employeeId: me.id });
  if (me && f.scope !== "mine") ors.push({ employee: { managerId: me.id } });
  if (f.scope === "all" && can(ctx, "hr.leave.view")) {
    if (can(ctx, "hr.records.all")) ors.push({});
    else if (can(ctx, "hr.records.department") && me?.departmentId) ors.push({ employee: { departmentId: me.departmentId } });
  }
  if (f.scope === "mine") ors.splice(1);
  const where: Prisma.LeaveRequestWhereInput = { AND: [{ organizationId: ctx.organizationId }, ors.length ? { OR: ors } : { id: "__none__" }, ...(f.status ? [{ status: f.status }] : []), ...(f.employee ? [{ employeeId: f.employee }] : [])] };
  const [items, total] = await Promise.all([
    prisma.leaveRequest.findMany({ where, orderBy: [{ startDate: "desc" }], skip: (f.page - 1) * 30, take: 30, include: { leaveType: { select: { nameAr: true, nameEn: true, paid: true } }, employee: { select: { id: true, number: true, displayName: true, nameAr: true, managerId: true } } } }),
    prisma.leaveRequest.count({ where })
  ]);
  return { items, total, page: f.page, pageSize: 30, filters: f, meId: me?.id ?? null };
}
