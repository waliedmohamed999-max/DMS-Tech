import { prisma } from "../db";
import { systemCtx } from "../context";
import { unitOfWork } from "../events/bus";
import { addDays, todayIn, ymd } from "../commercial/dates";
import { withLease } from "../jobs/lease";
import { workingDaysBetween } from "./attendance";
import { revokeEmployeeAccessTx } from "./offboarding";
import { log } from "../obs/log";

/**
 * HR sweep (docs/HR.md) — JobLease-guarded, every signal claimed once by a conditional update:
 *   · attendance: yesterday was a working day, the employee was active and has no record and no leave
 *     → MISSING record (system) + "attendance correction required" (claim: AttendanceRecord.notifiedAt)
 *   · leave starting within 2 days → employee + manager reminder (claim: LeaveRequest.startNotifiedAt)
 *   · performance reviews due within 7 days → reviewer reminder (claim: dueNotifiedAt)
 *   · sent offers expiring within 2 days → recruiter reminder (claim: expiryNotifiedAt)
 *   · Phase 11 offboarding: termination effective (date ≤ today) or archived, access not yet revoked → disable the
 *     linked account + revoke sessions (claim: Employee.accessRevokedAt; see offboarding.ts)
 * Notifications carry entity dedupe keys. Never touches payroll.
 */
export async function sweepHr(organizationId: string, now = new Date()) {
  const res = await withLease(`sweep:hr:${organizationId}`, 10 * 60_000, () => runSweep(organizationId, now));
  return res ?? { skipped: true as const };
}

async function runSweep(organizationId: string, now: Date) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
  const today = todayIn(org.timezone, now);
  const ctx = systemCtx(organizationId, { ip: "system", userAgent: "hr-sweep" });
  const out = { missingAttendance: 0, leaveStarting: 0, reviewsDue: 0, offersExpiring: 0, accessRevoked: 0, offboardingBlocked: 0 };

  const leavers = await prisma.employee.findMany({
    where: { organizationId, accessRevokedAt: null, OR: [{ status: "TERMINATED", terminationDate: { lte: today } }, { status: "ARCHIVED" }] },
    select: { id: true },
    take: 500
  });
  for (const l of leavers) {
    try {
      const r = await unitOfWork(ctx, (tx, uow) => revokeEmployeeAccessTx(tx, uow, l.id, now, "scheduled_termination"));
      if (r.outcome !== "already_done") out.accessRevoked++;
    } catch (err) {
      // e.g. LAST_SUPER_ADMIN — stays pending (go-live:check / system health show it); other leavers continue
      out.offboardingBlocked++;
      log.warn("offboarding_blocked", { employeeId: l.id, error: String((err as Error)?.message ?? err) });
    }
  }

  const yesterday = addDays(today, -1);
  const { days } = await workingDaysBetween(prisma, organizationId, yesterday, yesterday);
  if (days.length) {
    const emps = await prisma.employee.findMany({
      where: { organizationId, status: { in: ["ACTIVE", "PROBATION"] }, joinDate: { lte: yesterday }, userId: { not: null }, attendance: { none: { date: yesterday } }, leaveRequests: { none: { status: "APPROVED", startDate: { lte: yesterday }, endDate: { gte: yesterday } } } },
      select: { id: true, userId: true },
      take: 2000
    });
    for (const e of emps) {
      await unitOfWork(ctx, async (tx, uow) => {
        const created = await tx.attendanceRecord.createMany({ data: [{ organizationId, employeeId: e.id, date: yesterday, status: "MISSING", source: "SYSTEM", notifiedAt: now }], skipDuplicates: true });
        if (!created.count) return;
        uow.emit({ type: "attendance.missing", entityType: "Employee", entityId: e.id, payload: { employeeId: e.id, userId: e.userId, date: ymd(yesterday) } });
        out.missingAttendance++;
      });
    }
  }

  const starting = await prisma.leaveRequest.findMany({ where: { organizationId, status: "APPROVED", startNotifiedAt: null, startDate: { gte: today, lte: addDays(today, 2) } }, include: { employee: { select: { userId: true, displayName: true, manager: { select: { userId: true } } } } }, take: 1000 });
  for (const l of starting) {
    await unitOfWork(ctx, async (tx, uow) => {
      const r = await tx.leaveRequest.updateMany({ where: { id: l.id, startNotifiedAt: null }, data: { startNotifiedAt: now } });
      if (r.count !== 1) return;
      uow.emit({ type: "leave.starting", entityType: "LeaveRequest", entityId: l.id, payload: { leaveRequestId: l.id, userId: l.employee.userId, managerUserId: l.employee.manager?.userId ?? null, name: l.employee.displayName, start: ymd(l.startDate) } });
      out.leaveStarting++;
    });
  }

  const due = await prisma.performanceReview.findMany({ where: { organizationId, status: { in: ["DRAFT", "IN_REVIEW"] }, dueNotifiedAt: null, dueDate: { lte: addDays(today, 7) } }, include: { employee: { select: { displayName: true } } }, take: 1000 });
  for (const rv of due) {
    await unitOfWork(ctx, async (tx, uow) => {
      const r = await tx.performanceReview.updateMany({ where: { id: rv.id, dueNotifiedAt: null }, data: { dueNotifiedAt: now } });
      if (r.count !== 1) return;
      uow.emit({ type: "performance.review_due", entityType: "PerformanceReview", entityId: rv.id, payload: { reviewId: rv.id, employeeId: rv.employeeId, reviewerId: rv.reviewerId, name: rv.employee.displayName, due: ymd(rv.dueDate) } });
      out.reviewsDue++;
    });
  }

  const offers = await prisma.offer.findMany({ where: { organizationId, status: "SENT", expiryNotifiedAt: null, expiresAt: { not: null, lte: addDays(today, 2) } }, include: { application: { select: { ownerId: true } } }, take: 500 });
  for (const o of offers) {
    await unitOfWork(ctx, async (tx, uow) => {
      const r = await tx.offer.updateMany({ where: { id: o.id, expiryNotifiedAt: null }, data: { expiryNotifiedAt: now } });
      if (r.count !== 1) return;
      uow.emit({ type: "offer.expiring", entityType: "Offer", entityId: o.id, payload: { offerId: o.id, number: o.number, ownerId: o.application.ownerId ?? o.createdById, expiresAt: ymd(o.expiresAt) } });
      out.offersExpiring++;
    });
  }
  return out;
}

const last = new Map<string, number>();
export async function sweepHrIfDue(organizationId: string, everyMs = 5 * 60_000) {
  const t = last.get(organizationId) ?? 0;
  if (Date.now() - t < everyMs) return null;
  last.set(organizationId, Date.now());
  return sweepHr(organizationId);
}
