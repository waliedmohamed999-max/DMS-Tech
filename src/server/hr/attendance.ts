import { z } from "zod";
import type { AttendanceStatus, Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid } from "../errors";
import { unitOfWork } from "../events/bus";
import { optText, reqText } from "../crm/normalize";
import { addDays, todayIn, ymd } from "../commercial/dates";
import { employeeAccess, hrCovers, myEmployee } from "./access";

/**
 * Attendance — docs/HR.md. Manual / admin entry and self check-in/out (no biometric integration).
 * Everything that defines a working day is configuration (AttendancePolicy + CompanyHoliday);
 * nothing statutory is hard-coded. Corrections of existing records are audited with before/after.
 */

export async function policyOf(db: Tx | typeof prisma, organizationId: string) {
  return (await db.attendancePolicy.findUnique({ where: { organizationId } })) ?? (await db.attendancePolicy.create({ data: { organizationId } }));
}

const policySchema = z.object({
  workdayStart: z.string().regex(/^[0-2]\d:[0-5]\d$/),
  workdayEnd: z.string().regex(/^[0-2]\d:[0-5]\d$/),
  graceMinutes: z.coerce.number().int().min(0).max(240),
  workingDays: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),
  dailyExpectedMinutes: z.coerce.number().int().min(1).max(1440),
  leaveMarksAttendance: z.boolean(),
  leaveRequiresHrApproval: z.boolean(),
  payrollDeductUnpaidLeave: z.boolean(),
  payrollProrate: z.boolean()
});

export async function savePolicy(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "hr.attendance.manage");
  if (!can(ctx, "hr.records.all")) throw forbidden("hr.records.all");
  const input = policySchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await policyOf(tx, ctx.organizationId);
    const after = await tx.attendancePolicy.update({ where: { organizationId: ctx.organizationId }, data: { ...input, workingDays: [...new Set(input.workingDays)].sort() } });
    await uow.audit({ action: "hr.policy_changed", entityType: "AttendancePolicy", entityId: after.id, before, after });
  });
}

// --- holidays ---------------------------------------------------------------

const holidaySchema = z.object({ date: z.coerce.date(), name: reqText(2, 120), nameAr: optText(120), location: optText(80) });

export async function addHoliday(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "hr.attendance.manage");
  const input = holidaySchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    if (await tx.companyHoliday.findFirst({ where: { organizationId: ctx.organizationId, date: input.date } })) throw conflict("HOLIDAY_EXISTS");
    const h = await tx.companyHoliday.create({ data: { organizationId: ctx.organizationId, ...input, nameAr: input.nameAr ?? null, location: input.location ?? null } });
    await uow.audit({ action: "hr.holiday_added", entityType: "CompanyHoliday", entityId: h.id, after: { date: ymd(h.date), name: h.name } });
    return { id: h.id };
  });
}

export async function removeHoliday(ctx: Ctx, id: string) {
  requirePermission(ctx, "hr.attendance.manage");
  return unitOfWork(ctx, async (tx, uow) => {
    const h = await tx.companyHoliday.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!h) throw invalid("UNKNOWN_HOLIDAY");
    await tx.companyHoliday.delete({ where: { id } });
    await uow.audit({ action: "hr.holiday_removed", entityType: "CompanyHoliday", entityId: id, before: { date: ymd(h.date), name: h.name } });
  });
}

export async function listHolidays(organizationId: string, from?: Date, to?: Date) {
  return prisma.companyHoliday.findMany({ where: { organizationId, ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) }, orderBy: { date: "asc" } });
}

/** Working days between two dates (inclusive) per policy: configured weekdays minus company holidays. */
export async function workingDaysBetween(db: Tx | typeof prisma, organizationId: string, start: Date, end: Date) {
  const policy = await policyOf(db, organizationId);
  const holidays = new Set((await db.companyHoliday.findMany({ where: { organizationId, date: { gte: start, lte: end } }, select: { date: true } })).map((h) => ymd(h.date)));
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) if (policy.workingDays.includes(d.getUTCDay()) && !holidays.has(ymd(d))) days.push(d);
  return { days, policy };
}

// --- records ----------------------------------------------------------------

const hm = (tz: string, d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

const recordSchema = z.object({
  employeeId: z.string().min(1),
  date: z.coerce.date(),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "HALF_DAY", "REMOTE", "ON_LEAVE", "HOLIDAY", "MISSING"]),
  checkIn: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^[0-2]\d:[0-5]\d$/).nullable().optional()),
  checkOut: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^[0-2]\d:[0-5]\d$/).nullable().optional()),
  notes: optText(1000)
});

/** "HH:MM" on a calendar day in the org timezone → instant (offset taken from the timezone on that day). */
function atTime(date: Date, hhmm: string, tz: string) {
  const guess = new Date(`${ymd(date)}T${hhmm}:00Z`);
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(guess);
  const asUtc = new Date(`${local.replace(", ", "T").replace(/^(\d{4}-\d{2}-\d{2})T24/, "$1T00")}:00Z`);
  return new Date(guess.getTime() - (asUtc.getTime() - guess.getTime()));
}

/** Manual entry / correction by HR (hr.attendance.manage within HR scope). Existing records are corrected, audited. */
export async function recordAttendance(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "hr.attendance.manage");
  const input = recordSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const { rel } = await employeeAccess(tx, ctx, input.employeeId, { lock: true });
    if (!rel.hr) throw forbidden("hr.attendance.manage (HR scope)");
    if (rel.self) throw forbidden("own attendance correction");
    const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });
    if (input.date > todayIn(org.timezone)) throw invalid("ATTENDANCE_IN_FUTURE");
    const checkIn = input.checkIn ? atTime(input.date, input.checkIn, org.timezone) : null;
    const checkOut = input.checkOut ? atTime(input.date, input.checkOut, org.timezone) : null;
    if (checkOut && !checkIn) throw invalid("CHECKOUT_WITHOUT_CHECKIN");
    if (checkIn && checkOut && checkOut < checkIn) throw invalid("CHECKOUT_BEFORE_CHECKIN");
    const workMinutes = checkIn && checkOut ? Math.round((checkOut.getTime() - checkIn.getTime()) / 60_000) : null;
    const existing = await tx.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: input.employeeId, date: input.date } } });
    const data = { status: input.status as AttendanceStatus, checkIn, checkOut, workMinutes, notes: input.notes ?? null };
    if (existing) {
      await tx.attendanceRecord.update({ where: { id: existing.id }, data: { ...data, source: "MANUAL", correctedAt: new Date(), correctedById: ctx.userId || null } });
      await uow.audit({
        action: "attendance.corrected", entityType: "Employee", entityId: input.employeeId,
        before: { date: ymd(existing.date), status: existing.status, checkIn: existing.checkIn ? hm(org.timezone, existing.checkIn) : null, checkOut: existing.checkOut ? hm(org.timezone, existing.checkOut) : null, source: existing.source },
        after: { date: ymd(input.date), status: input.status, checkIn: input.checkIn ?? null, checkOut: input.checkOut ?? null, notes: input.notes }
      });
    } else {
      await tx.attendanceRecord.create({ data: { ...data, organizationId: ctx.organizationId, employeeId: input.employeeId, date: input.date, source: "MANUAL", createdById: ctx.userId || null } });
      await uow.audit({ action: "attendance.recorded", entityType: "Employee", entityId: input.employeeId, after: { date: ymd(input.date), status: input.status, checkIn: input.checkIn ?? null, checkOut: input.checkOut ?? null } });
    }
    uow.emit({ type: "attendance.recorded", entityType: "Employee", entityId: input.employeeId, payload: { employeeId: input.employeeId, date: ymd(input.date), status: input.status, corrected: Boolean(existing) } });
    return { corrected: Boolean(existing) };
  });
}

/** Self check-in / check-out for today (hr.attendance.self). Late = after workday start + grace. */
export async function selfCheck(ctx: Ctx, action: "in" | "out", raw?: unknown) {
  requirePermission(ctx, "hr.attendance.self");
  const { remote } = z.object({ remote: z.boolean().default(false) }).parse(raw ?? {});
  const me = await myEmployee(ctx);
  if (!me) throw forbidden("not an employee");
  return unitOfWork(ctx, async (tx, uow) => {
    await tx.$queryRaw`SELECT id FROM "Employee" WHERE id = ${me.id} FOR UPDATE`;
    const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });
    const policy = await policyOf(tx, ctx.organizationId);
    const date = todayIn(org.timezone);
    const now = new Date();
    const rec = await tx.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: me.id, date } } });
    if (action === "in") {
      if (rec?.checkIn) throw conflict("ALREADY_CHECKED_IN");
      const late = toMin(hm(org.timezone, now)) > toMin(policy.workdayStart) + policy.graceMinutes;
      const status: AttendanceStatus = remote ? "REMOTE" : late ? "LATE" : "PRESENT";
      if (rec) await tx.attendanceRecord.update({ where: { id: rec.id }, data: { checkIn: now, status, source: "SELF" } });
      else await tx.attendanceRecord.create({ data: { organizationId: ctx.organizationId, employeeId: me.id, date, checkIn: now, status, source: "SELF", createdById: ctx.userId } });
      await uow.audit({ action: "attendance.checked_in", entityType: "Employee", entityId: me.id, after: { date: ymd(date), at: hm(org.timezone, now), status } });
      uow.emit({ type: "attendance.recorded", entityType: "Employee", entityId: me.id, payload: { employeeId: me.id, date: ymd(date), status, self: true } });
      return { status };
    }
    if (!rec?.checkIn) throw conflict("NOT_CHECKED_IN");
    if (rec.checkOut) throw conflict("ALREADY_CHECKED_OUT");
    const minutes = Math.round((now.getTime() - rec.checkIn.getTime()) / 60_000);
    await tx.attendanceRecord.update({ where: { id: rec.id }, data: { checkOut: now, workMinutes: Math.min(minutes, 1440), status: rec.status === "LATE" || rec.status === "REMOTE" ? rec.status : minutes < policy.dailyExpectedMinutes / 2 ? "HALF_DAY" : "PRESENT" } });
    await uow.audit({ action: "attendance.checked_out", entityType: "Employee", entityId: me.id, after: { date: ymd(date), at: hm(org.timezone, now), minutes } });
    return { minutes };
  });
}

// --- read ---------------------------------------------------------------------

/** Employees whose attendance the caller may read (self, direct reports with hr.attendance.view, HR scope). */
async function attendanceScope(ctx: Ctx): Promise<Prisma.EmployeeWhereInput> {
  const me = await myEmployee(ctx);
  const ors: Prisma.EmployeeWhereInput[] = [];
  if (me) ors.push({ id: me.id });
  if (me && can(ctx, "hr.attendance.view")) ors.push({ managerId: me.id });
  if (can(ctx, "hr.attendance.view")) {
    if (can(ctx, "hr.records.all")) return {};
    if (can(ctx, "hr.records.department") && me?.departmentId) ors.push({ departmentId: me.departmentId });
  }
  return ors.length ? { AND: [{ OR: ors }] } : { id: "__none__" };
}

/** Today board: every visible current employee with today's record (or none) and approved leave. */
export async function attendanceToday(ctx: Ctx, opts: { departmentId?: string; date?: Date } = {}) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });
  const date = opts.date ?? todayIn(org.timezone);
  const scope = await attendanceScope(ctx);
  const employees = await prisma.employee.findMany({
    where: { AND: [{ organizationId: ctx.organizationId, status: { notIn: ["TERMINATED", "ARCHIVED"] }, joinDate: { lte: date } }, scope, ...(opts.departmentId ? [{ departmentId: opts.departmentId }] : [])] },
    orderBy: { displayName: "asc" },
    select: { id: true, number: true, displayName: true, nameAr: true, jobTitle: true, department: { select: { name: true, nameAr: true } }, attendance: { where: { date }, take: 1 }, leaveRequests: { where: { status: "APPROVED", startDate: { lte: date }, endDate: { gte: date } }, select: { leaveType: { select: { nameAr: true, nameEn: true } } }, take: 1 } }
  });
  const { days } = await workingDaysBetween(prisma, ctx.organizationId, date, date);
  const holiday = await prisma.companyHoliday.findFirst({ where: { organizationId: ctx.organizationId, date } });
  return { date, timezone: org.timezone, workingDay: days.length === 1, holiday, rows: employees.map((e) => ({ ...e, record: e.attendance[0] ?? null, leave: e.leaveRequests[0]?.leaveType ?? null })) };
}

/** Month grid for one employee (self / manager / HR scope). */
export async function attendanceMonth(ctx: Ctx, employeeId: string, month: string) {
  const { rel } = await employeeAccess(prisma, ctx, employeeId).catch(async () => {
    const me = await myEmployee(ctx);
    if (me?.id === employeeId) return { rel: { self: true, manager: false, hr: false } };
    throw forbidden("hr.attendance.view");
  });
  if (!rel.self && !((rel.manager || rel.hr) && can(ctx, "hr.attendance.view"))) throw forbidden("hr.attendance.view");
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) throw invalid("MONTH_INVALID");
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  const [records, wd, holidays] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { employeeId, date: { gte: from, lte: to } }, orderBy: { date: "asc" } }),
    workingDaysBetween(prisma, ctx.organizationId, from, to),
    listHolidays(ctx.organizationId, from, to)
  ]);
  const minutes = records.reduce((s, r) => s + (r.workMinutes ?? 0), 0);
  return { from, to, records, workingDays: wd.days.map((d) => ymd(d)!), holidays, policy: wd.policy, totals: { minutes, present: records.filter((r) => ["PRESENT", "LATE", "REMOTE", "HALF_DAY"].includes(r.status)).length, late: records.filter((r) => r.status === "LATE").length, absent: records.filter((r) => r.status === "ABSENT").length, missing: records.filter((r) => r.status === "MISSING").length } };
}

export async function canManageAttendanceOf(ctx: Ctx, employee: { departmentId: string | null }) {
  return can(ctx, "hr.attendance.manage") && (await hrCovers(ctx, employee));
}

