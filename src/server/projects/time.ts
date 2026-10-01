import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { cancelApprovalTx, registerApprovalHandler, requestApprovalTx } from "../approvals/service";
import { optId, optText } from "../crm/normalize";
import { todayIn, ymd } from "../commercial/dates";
import { isClosed, projectAccess, projectWhere, requireParticipant } from "./access";
import { touchProject } from "./engine";

/**
 * Timesheets — docs/PROJECTS.md.
 *   DRAFT ─submit→ SUBMITTED ─approve→ APPROVED (immutable; DB trigger)
 *                            └reject (reason)→ REJECTED ─edit/submit again→ …
 *   APPROVED ─correction (approver, reason, audited)→ DRAFT
 * A submission batches one person's DRAFT/REJECTED entries of one project and is decided through
 * the Phase 1 approval engine (type TIMESHEET), routed to the project manager. Self-approval is
 * blocked by the engine; the handler additionally requires the approver to manage the project.
 * No timer in Phase 4: manual entries only (server is the only clock that matters).
 */

const entrySchema = z.object({
  projectId: z.string().min(1),
  taskId: optId,
  date: z.coerce.date(),
  minutes: z.coerce.number().int(),
  description: optText(2000),
  billable: z.boolean().default(true)
});

async function checkDailyLimit(tx: Tx, ctx: Ctx, userId: string, date: Date, minutes: number, excludeId?: string) {
  // serialise concurrent entries of the same person/day (multi-instance safe)
  const key = `time:${userId}:${ymd(date)}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS locked`;
  const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timesheetMaxDailyMinutes: true, timezone: true } });
  if (date > todayIn(org.timezone)) throw invalid("TIME_IN_FUTURE");
  const sum = await tx.timeEntry.aggregate({ where: { userId, date, status: { not: "REJECTED" }, ...(excludeId ? { id: { not: excludeId } } : {}) }, _sum: { minutes: true } });
  if ((sum._sum.minutes ?? 0) + minutes > org.timesheetMaxDailyMinutes) throw invalid(`TIME_DAILY_LIMIT:${org.timesheetMaxDailyMinutes}`);
}

function validMinutes(m: number) {
  if (!Number.isInteger(m) || m <= 0) throw invalid("TIME_MINUTES_INVALID");
  if (m > 1440) throw invalid("TIME_MINUTES_INVALID");
}

export async function createTimeEntry(ctx: Ctx, raw: unknown) {
  const input = entrySchema.parse(raw);
  validMinutes(input.minutes);
  return unitOfWork(ctx, async (tx, uow) => {
    const a = await requireParticipant(tx, ctx, input.projectId, "projects.time.create");
    if (isClosed(a.project.status)) throw conflict(`PROJECT_CLOSED:${a.project.status}`);
    if (input.taskId && !(await tx.task.findFirst({ where: { id: input.taskId, projectId: input.projectId, archivedAt: null } }))) throw invalid("TASK_NOT_OF_PROJECT");
    await checkDailyLimit(tx, ctx, ctx.userId, input.date, input.minutes);
    const e = await tx.timeEntry.create({ data: { organizationId: ctx.organizationId, projectId: input.projectId, taskId: input.taskId ?? null, userId: ctx.userId, date: input.date, minutes: input.minutes, description: input.description ?? null, billable: input.billable } });
    await uow.audit({ action: "time.created", entityType: "TimeEntry", entityId: e.id, after: { projectId: e.projectId, taskId: e.taskId, date: ymd(e.date), minutes: e.minutes } });
    await touchProject(tx, input.projectId);
    return e;
  });
}

/** Own DRAFT / REJECTED entries only (submitted and approved entries are locked). */
export async function updateTimeEntry(ctx: Ctx, entryId: string, raw: unknown) {
  requirePermission(ctx, "projects.time.create");
  const input = entrySchema.omit({ projectId: true }).partial().parse(raw);
  if (input.minutes !== undefined) validMinutes(input.minutes);
  return unitOfWork(ctx, async (tx, uow) => {
    await tx.$queryRaw`SELECT id FROM "TimeEntry" WHERE id = ${entryId} FOR UPDATE`;
    const e = await tx.timeEntry.findFirst({ where: { id: entryId, organizationId: ctx.organizationId } });
    if (!e || e.userId !== ctx.userId) throw notFound("TimeEntry");
    if (e.status !== "DRAFT" && e.status !== "REJECTED") throw conflict(`TIME_ENTRY_LOCKED:${e.status}`);
    const date = input.date ?? e.date;
    const minutes = input.minutes ?? e.minutes;
    await checkDailyLimit(tx, ctx, ctx.userId, date, minutes, e.id);
    const after = await tx.timeEntry.update({ where: { id: entryId }, data: { ...input, status: "DRAFT", rejectionReason: null, rejectedAt: null } });
    await uow.audit({ action: "time.updated", entityType: "TimeEntry", entityId: entryId, before: { date: ymd(e.date), minutes: e.minutes, status: e.status }, after: { date: ymd(after.date), minutes: after.minutes } });
    await touchProject(tx, e.projectId);
  });
}

export async function deleteTimeEntry(ctx: Ctx, entryId: string) {
  requirePermission(ctx, "projects.time.create");
  return unitOfWork(ctx, async (tx, uow) => {
    const e = await tx.timeEntry.findFirst({ where: { id: entryId, organizationId: ctx.organizationId } });
    if (!e || e.userId !== ctx.userId) throw notFound("TimeEntry");
    if (e.status !== "DRAFT" && e.status !== "REJECTED") throw conflict(`TIME_ENTRY_LOCKED:${e.status}`);
    await tx.timeEntry.delete({ where: { id: entryId } });
    await uow.audit({ action: "time.deleted", entityType: "TimeEntry", entityId: entryId, before: { date: ymd(e.date), minutes: e.minutes } });
    await touchProject(tx, e.projectId);
  });
}

/** Submit all my draft/rejected time on a project as one batch → approval routed to the PM. */
export async function submitTimesheet(ctx: Ctx, projectId: string) {
  return unitOfWork(ctx, async (tx, uow) => {
    const a = await requireParticipant(tx, ctx, projectId, "projects.time.submit");
    const key = `timesheet:${ctx.userId}:${projectId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS locked`;
    const entries = await tx.timeEntry.findMany({ where: { projectId, userId: ctx.userId, status: { in: ["DRAFT", "REJECTED"] } }, orderBy: { date: "asc" } });
    if (!entries.length) throw invalid("TIME_NOTHING_TO_SUBMIT");
    const total = entries.reduce((s, e) => s + e.minutes, 0);
    const sub = await tx.timesheetSubmission.create({
      data: { organizationId: ctx.organizationId, projectId, userId: ctx.userId, periodStart: entries[0].date, periodEnd: entries[entries.length - 1].date, totalMinutes: total }
    });
    const now = new Date();
    await tx.timeEntry.updateMany({ where: { id: { in: entries.map((e) => e.id) } }, data: { status: "SUBMITTED", submissionId: sub.id, submittedAt: now, rejectedAt: null, rejectionReason: null } });
    const hours = (total / 60).toFixed(2).replace(/\.?0+$/, "");
    const approval = await requestApprovalTx(tx, uow, ctx, {
      type: "TIMESHEET",
      entityType: "TimesheetSubmission",
      entityId: sub.id,
      title: `${ctx.userName} · ${a.project.number} · ${hours}h (${ymd(sub.periodStart)} → ${ymd(sub.periodEnd)})`,
      payload: { submissionId: sub.id, projectId, projectNumber: a.project.number, projectName: a.project.name, userId: ctx.userId, userName: ctx.userName, totalMinutes: total, entries: entries.length, periodStart: ymd(sub.periodStart), periodEnd: ymd(sub.periodEnd) },
      requiredPermission: "projects.time.approve",
      assigneeId: a.project.projectManagerId && a.project.projectManagerId !== ctx.userId ? a.project.projectManagerId : undefined
    });
    await tx.timesheetSubmission.update({ where: { id: sub.id }, data: { approvalId: approval.id } });
    await uow.audit({ action: "time.submitted", entityType: "TimesheetSubmission", entityId: sub.id, after: { projectId, entries: entries.length, totalMinutes: total, approvalId: approval.id } });
    uow.emit({ type: "time.submitted", entityType: "TimesheetSubmission", entityId: sub.id, payload: { projectId, submissionId: sub.id, userId: ctx.userId, totalMinutes: total } });
    await touchProject(tx, projectId);
    return { submissionId: sub.id, approvalId: approval.id, entries: entries.length, totalMinutes: total };
  });
}

export async function withdrawTimesheet(ctx: Ctx, submissionId: string) {
  return unitOfWork(ctx, async (tx, uow) => {
    const s = await tx.timesheetSubmission.findFirst({ where: { id: submissionId, organizationId: ctx.organizationId, userId: ctx.userId } });
    if (!s || !s.approvalId) throw notFound("TimesheetSubmission");
    if (s.status !== "SUBMITTED") throw conflict("TIMESHEET_ALREADY_DECIDED");
    await cancelApprovalTx(tx, uow, ctx, s.approvalId); // handler returns entries to DRAFT
  });
}

async function lockSubmission(tx: Tx, organizationId: string, submissionId: string) {
  await tx.$queryRaw`SELECT id FROM "TimesheetSubmission" WHERE id = ${submissionId} FOR UPDATE`;
  const s = await tx.timesheetSubmission.findFirst({ where: { id: submissionId, organizationId } });
  if (!s) throw notFound("TimesheetSubmission");
  if (s.status !== "SUBMITTED") throw conflict("TIMESHEET_ALREADY_DECIDED");
  return s;
}

registerApprovalHandler("TIMESHEET", {
  async onApproved(tx, uow, approval, ctx) {
    const p = approval.payload as { submissionId: string; projectId: string; userId: string };
    const s = await lockSubmission(tx, ctx.organizationId, p.submissionId);
    const a = await projectAccess(tx, ctx, s.projectId);
    if (!a.manager) throw forbidden("projects.time.approve (project manager of this project)");
    const now = new Date();
    const r = await tx.timeEntry.updateMany({ where: { submissionId: s.id, status: "SUBMITTED" }, data: { status: "APPROVED", approvedAt: now, approvedById: ctx.userId } });
    await tx.timesheetSubmission.update({ where: { id: s.id }, data: { status: "APPROVED", decidedAt: now, decidedById: ctx.userId } });
    await uow.audit({ action: "time.approved", entityType: "TimesheetSubmission", entityId: s.id, after: { projectId: s.projectId, userId: s.userId, entries: r.count, totalMinutes: s.totalMinutes } });
    uow.emit({ type: "time.approved", entityType: "TimesheetSubmission", entityId: s.id, payload: { projectId: s.projectId, submissionId: s.id, userId: s.userId, totalMinutes: s.totalMinutes } });
    await touchProject(tx, s.projectId);
  },
  async onRejected(tx, uow, approval, ctx) {
    const p = approval.payload as { submissionId: string };
    const s = await lockSubmission(tx, ctx.organizationId, p.submissionId);
    const a = await projectAccess(tx, ctx, s.projectId);
    if (!a.manager) throw forbidden("projects.time.approve (project manager of this project)");
    const reason = approval.decisionComment ?? "";
    const now = new Date();
    await tx.timeEntry.updateMany({ where: { submissionId: s.id, status: "SUBMITTED" }, data: { status: "REJECTED", rejectedAt: now, rejectionReason: reason } });
    await tx.timesheetSubmission.update({ where: { id: s.id }, data: { status: "REJECTED", decidedAt: now, decidedById: ctx.userId, reason } });
    await uow.audit({ action: "time.rejected", entityType: "TimesheetSubmission", entityId: s.id, after: { projectId: s.projectId, userId: s.userId, reason } });
    uow.emit({ type: "time.rejected", entityType: "TimesheetSubmission", entityId: s.id, payload: { projectId: s.projectId, submissionId: s.id, userId: s.userId, reason } });
    await touchProject(tx, s.projectId);
  },
  async onCancelled(tx, uow, approval, ctx) {
    const p = approval.payload as { submissionId: string };
    const s = await tx.timesheetSubmission.findFirst({ where: { id: p.submissionId, organizationId: ctx.organizationId, status: "SUBMITTED" } });
    if (!s) return;
    await tx.timeEntry.updateMany({ where: { submissionId: s.id, status: "SUBMITTED" }, data: { status: "DRAFT", submissionId: null, submittedAt: null } });
    await tx.timesheetSubmission.update({ where: { id: s.id }, data: { status: "WITHDRAWN", decidedAt: new Date() } });
    await uow.audit({ action: "time.withdrawn", entityType: "TimesheetSubmission", entityId: s.id });
  }
});

/** Explicit correction of APPROVED time: approver of the project re-opens one entry, with a reason. */
export async function reopenApprovedEntry(ctx: Ctx, entryId: string, reason: string) {
  requirePermission(ctx, "projects.time.approve");
  if (!reason || reason.trim().length < 5) throw invalid("REASON_REQUIRED");
  return unitOfWork(ctx, async (tx, uow) => {
    await tx.$queryRaw`SELECT id FROM "TimeEntry" WHERE id = ${entryId} FOR UPDATE`;
    const e = await tx.timeEntry.findFirst({ where: { id: entryId, organizationId: ctx.organizationId } });
    if (!e) throw notFound("TimeEntry");
    const a = await projectAccess(tx, ctx, e.projectId);
    if (!a.manager) throw forbidden("projects.time.approve (project manager of this project)");
    if (e.status !== "APPROVED") throw conflict(`TIME_ENTRY_NOT_APPROVED:${e.status}`);
    if (e.userId === ctx.userId) throw forbidden("cannot correct own approved time");
    // Phase 5: billed time is part of an invoice — void/cancel that invoice first (releases the link)
    if (await tx.invoiceTimeEntry.findFirst({ where: { timeEntryId: entryId, releasedAt: null }, select: { id: true } })) throw conflict("TIME_ENTRY_BILLED");
    await tx.timeEntry.update({ where: { id: entryId }, data: { status: "DRAFT", approvedAt: null, approvedById: null, submissionId: null } });
    await uow.audit({ action: "time.correction_opened", entityType: "TimeEntry", entityId: entryId, before: { status: "APPROVED", minutes: e.minutes, approvedById: e.approvedById }, after: { status: "DRAFT", reason } });
  });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** My entries (any project in scope) for a date range. */
export async function myTime(ctx: Ctx, from: Date, to: Date) {
  requirePermission(ctx, "projects.time.create");
  return prisma.timeEntry.findMany({
    where: { organizationId: ctx.organizationId, userId: ctx.userId, date: { gte: from, lte: to } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { project: { select: { id: true, number: true, name: true } }, task: { select: { id: true, number: true, title: true } } }
  });
}

/** Time on a project: members see their own; managers / time viewers with scope see everyone. */
export async function projectTime(ctx: Ctx, projectId: string) {
  requirePermission(ctx, "projects.time.view");
  const a = await projectAccess(prisma, ctx, projectId);
  const where: Prisma.TimeEntryWhereInput = { projectId, ...(a.manager || can(ctx, "projects.records.all") ? {} : { userId: ctx.userId }) };
  const [entries, byUser, submissions] = await Promise.all([
    prisma.timeEntry.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 200, include: { user: { select: { id: true, name: true, nameAr: true } }, task: { select: { number: true, title: true } } } }),
    prisma.timeEntry.groupBy({ by: ["userId", "status"], where, _sum: { minutes: true } }),
    prisma.timesheetSubmission.findMany({ where: { projectId, ...(a.manager ? {} : { userId: ctx.userId }) }, orderBy: { createdAt: "desc" }, take: 30, include: { user: { select: { name: true, nameAr: true } } } })
  ]);
  return { entries, byUser, submissions, manager: a.manager };
}

/** Pending timesheets the caller can decide (manager of the project, not their own). */
export async function pendingTimesheets(ctx: Ctx) {
  if (!can(ctx, "projects.time.approve")) return [];
  const scope = await projectWhere(ctx);
  const rows = await prisma.timesheetSubmission.findMany({
    where: { organizationId: ctx.organizationId, status: "SUBMITTED", userId: { not: ctx.userId }, project: { AND: [...(scope.AND ?? [])] } },
    orderBy: { createdAt: "asc" },
    take: 50,
    include: { user: { select: { name: true, nameAr: true } }, project: { select: { id: true, number: true, name: true, projectManagerId: true, departmentId: true } } }
  });
  return rows;
}
