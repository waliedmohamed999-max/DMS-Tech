import { prisma } from "../db";
import { can, canAny, type Ctx } from "../context";
import { addDays, todayIn } from "../commercial/dates";
import { employeeWhere, myEmployee } from "./access";

/** People dashboard, My Team and attention — real counts within the caller's HR visibility. */

export async function hrDashboard(ctx: Ctx) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });
  const today = todayIn(org.timezone);
  const scope = await employeeWhere(ctx);
  const inScope = { AND: [{ organizationId: ctx.organizationId }, scope] };
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const [active, onLeave, present, pendingLeave, openJobs, interviewing, newHires, probation, payroll] = await Promise.all([
    prisma.employee.count({ where: { ...inScope, status: { notIn: ["TERMINATED", "ARCHIVED"] }, joinDate: { lte: today } } }),
    prisma.leaveRequest.count({ where: { employee: inScope, status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } } }),
    prisma.attendanceRecord.count({ where: { employee: inScope, date: today, status: { in: ["PRESENT", "LATE", "REMOTE", "HALF_DAY"] } } }),
    prisma.leaveRequest.count({ where: { employee: inScope, status: "SUBMITTED" } }),
    can(ctx, "hr.recruitment.view") ? prisma.jobOpening.count({ where: { organizationId: ctx.organizationId, status: "OPEN" } }) : Promise.resolve(null),
    can(ctx, "hr.recruitment.view") ? prisma.application.count({ where: { organizationId: ctx.organizationId, status: "ACTIVE", stage: { in: ["INTERVIEW", "TECHNICAL", "FINAL_INTERVIEW"] } } }) : Promise.resolve(null),
    prisma.employee.count({ where: { ...inScope, joinDate: { gte: monthStart, lte: today } } }),
    prisma.employee.count({ where: { ...inScope, status: "PROBATION", probationEndDate: { lte: addDays(today, 14) } } }),
    canAny(ctx, "hr.payroll.view", "hr.payroll.prepare", "hr.payroll.approve", "hr.payroll.pay")
      ? prisma.payrollPeriod.findFirst({ where: { organizationId: ctx.organizationId }, orderBy: { periodStart: "desc" }, select: { id: true, name: true, status: true, approvalId: true, employeeCount: true } })
      : Promise.resolve(undefined)
  ]);
  return { today, active, onLeave, present, pendingLeave, openJobs, interviewing, newHires, probation, payroll };
}

/** Direct reports with today's attendance, approved leave and pending requests / reviews. */
export async function myTeam(ctx: Ctx) {
  const me = await myEmployee(ctx);
  if (!me) return null;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });
  const today = todayIn(org.timezone);
  const reports = await prisma.employee.findMany({
    where: { organizationId: ctx.organizationId, managerId: me.id, status: { notIn: ["TERMINATED", "ARCHIVED"] } },
    orderBy: { displayName: "asc" },
    select: {
      id: true, number: true, displayName: true, nameAr: true, jobTitle: true, status: true,
      attendance: { where: { date: today }, take: 1, select: { status: true, checkIn: true, checkOut: true } },
      leaveRequests: { where: { OR: [{ status: "SUBMITTED" }, { status: "APPROVED", endDate: { gte: today } }] }, orderBy: { startDate: "asc" }, select: { id: true, status: true, startDate: true, endDate: true, days: true, approvalId: true, leaveType: { select: { nameAr: true, nameEn: true } } } },
      reviews: { where: { status: { in: ["DRAFT", "IN_REVIEW"] } }, select: { id: true, periodLabel: true, dueDate: true, status: true } }
    }
  });
  return { today, reports };
}

export type HrAttention = { id: string; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; category: string; title: string; dueAt?: Date | null; href: string };

/** Command Center items (pending leave / payroll / offer approvals already come from the approval engine). */
export async function hrAttention(ctx: Ctx): Promise<HrAttention[]> {
  const out: HrAttention[] = [];
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });
  const today = todayIn(org.timezone);
  const reviews = await prisma.performanceReview.findMany({ where: { organizationId: ctx.organizationId, reviewerId: ctx.userId, status: { in: ["DRAFT", "IN_REVIEW"] }, dueDate: { lte: addDays(today, 7) } }, take: 6, include: { employee: { select: { displayName: true } } } });
  for (const r of reviews) out.push({ id: `rev-${r.id}`, priority: r.dueDate && r.dueDate < today ? "HIGH" : "MEDIUM", category: "review_due", title: `${r.employee.displayName} · ${r.periodLabel}`, dueAt: r.dueDate, href: `/app/hr/employees/${r.employeeId}?tab=performance` });
  const me = await myEmployee(ctx);
  if (me) {
    const missing = await prisma.attendanceRecord.findMany({ where: { employeeId: me.id, status: "MISSING", date: { gte: addDays(today, -14) } }, take: 3, orderBy: { date: "desc" } });
    for (const m of missing) out.push({ id: `att-${m.id}`, priority: "MEDIUM", category: "attendance_missing", title: m.date.toISOString().slice(0, 10), dueAt: m.date, href: "/app/my-hr?tab=attendance" });
  }
  if (can(ctx, "hr.payroll.pay")) {
    const toPay = await prisma.payrollPeriod.findMany({ where: { organizationId: ctx.organizationId, status: "APPROVED" }, take: 3 });
    for (const p of toPay) out.push({ id: `pay-${p.id}`, priority: p.payDate <= today ? "HIGH" : "MEDIUM", category: "payroll_to_pay", title: `${p.name} · ${p.employeeCount}`, dueAt: p.payDate, href: `/app/hr/payroll/${p.id}` });
  }
  if (can(ctx, "hr.employees.edit") && can(ctx, "hr.records.all")) {
    const probation = await prisma.employee.findMany({ where: { organizationId: ctx.organizationId, status: "PROBATION", probationEndDate: { lte: addDays(today, 7) } }, take: 5 });
    for (const e of probation) out.push({ id: `prob-${e.id}`, priority: "MEDIUM", category: "probation_ending", title: `${e.number} · ${e.displayName}`, dueAt: e.probationEndDate, href: `/app/hr/employees/${e.id}` });
  }
  return out;
}
