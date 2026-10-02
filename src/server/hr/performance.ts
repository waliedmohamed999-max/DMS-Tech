import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { optDate, optId, optText, reqText } from "../crm/normalize";

import { hrCovers, myEmployee } from "./access";

/**
 * Performance — lightweight reviews + goals (docs/HR.md), no OKR suite, no peer reviews, no AI.
 * Review: DRAFT → IN_REVIEW → COMPLETED (rating 1–5 + summary) → ACKNOWLEDGED (by the employee).
 * Privacy: the employee sees own goals and COMPLETED / ACKNOWLEDGED reviews; the direct manager and
 * the reviewer see their team's; HR (hr.performance.view within HR scope) sees all. Nobody else.
 */

async function reviewAccess(ctx: Ctx, employeeId: string) {
  const me = await myEmployee(ctx);
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, organizationId: ctx.organizationId }, select: { id: true, managerId: true, departmentId: true } });
  if (!emp) throw notFound("Employee");
  const self = me?.id === emp.id;
  const manager = Boolean(me && emp.managerId === me.id);
  const hr = can(ctx, "hr.performance.view") && (await hrCovers(ctx, emp));
  return { self, manager, hr, canManage: can(ctx, "hr.performance.manage") && (manager || (hr && can(ctx, "hr.records.all"))) };
}

const reviewSchema = z.object({ employeeId: z.string().min(1), reviewerId: optId, periodLabel: reqText(2, 60), periodStart: z.coerce.date(), periodEnd: z.coerce.date(), dueDate: optDate });

export async function createReview(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "hr.performance.manage");
  const input = reviewSchema.parse(raw);
  if (input.periodEnd < input.periodStart) throw invalid("END_BEFORE_START");
  const a = await reviewAccess(ctx, input.employeeId);
  if (!a.canManage || a.self) throw forbidden("hr.performance.manage (manager or HR)");
  return unitOfWork(ctx, async (tx, uow) => {
    const reviewerId = input.reviewerId ?? ctx.userId;
    if (!(await tx.user.findFirst({ where: { id: reviewerId, organizationId: ctx.organizationId, status: "ACTIVE" } }))) throw invalid("UNKNOWN_USER");
    const r = await tx.performanceReview.create({ data: { organizationId: ctx.organizationId, employeeId: input.employeeId, reviewerId, periodLabel: input.periodLabel, periodStart: input.periodStart, periodEnd: input.periodEnd, dueDate: input.dueDate ?? null, createdById: ctx.userId || null } });
    await uow.audit({ action: "performance.review_created", entityType: "Employee", entityId: input.employeeId, after: { reviewId: r.id, period: r.periodLabel, reviewerId } });
    return { id: r.id };
  });
}

const updateSchema = z.object({ status: z.enum(["IN_REVIEW", "COMPLETED"]).optional(), summary: optText(8000), rating: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(5).nullable().optional()) });

/** Reviewer / manager / HR updates; completing requires a rating and summary. Completed reviews are final. */
export async function updateReview(ctx: Ctx, id: string, raw: unknown) {
  const input = updateSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    await tx.$queryRaw`SELECT id FROM "PerformanceReview" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    const r = await tx.performanceReview.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!r) throw notFound("PerformanceReview");
    const a = await reviewAccess(ctx, r.employeeId);
    if (a.self || !(r.reviewerId === ctx.userId || a.canManage)) throw forbidden("hr.performance.manage");
    if (r.status === "COMPLETED" || r.status === "ACKNOWLEDGED") throw conflict("REVIEW_COMPLETED");
    if (input.status === "COMPLETED" && (!input.rating && !r.rating || !(input.summary ?? r.summary))) throw invalid("RATING_AND_SUMMARY_REQUIRED");
    await tx.performanceReview.update({ where: { id }, data: { summary: input.summary ?? r.summary, rating: input.rating ?? r.rating, ...(input.status ? { status: input.status } : {}), ...(input.status === "COMPLETED" ? { completedAt: new Date() } : {}) } });
    if (input.status === "COMPLETED") {
      await uow.audit({ action: "performance.review_completed", entityType: "Employee", entityId: r.employeeId, after: { reviewId: id, rating: input.rating ?? r.rating } });
      const emp = await tx.employee.findUniqueOrThrow({ where: { id: r.employeeId }, select: { userId: true } });
      uow.emit({ type: "performance.review_completed", entityType: "PerformanceReview", entityId: id, payload: { reviewId: id, userId: emp.userId, period: r.periodLabel } });
    } else await uow.audit({ action: "performance.review_updated", entityType: "Employee", entityId: r.employeeId, after: { reviewId: id, status: input.status ?? r.status } });
  });
}

export async function acknowledgeReview(ctx: Ctx, id: string) {
  return unitOfWork(ctx, async (tx, uow) => {
    const r = await tx.performanceReview.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!r) throw notFound("PerformanceReview");
    const me = await myEmployee(ctx);
    if (me?.id !== r.employeeId) throw forbidden("own review only");
    const res = await tx.performanceReview.updateMany({ where: { id, status: "COMPLETED" }, data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() } });
    if (res.count !== 1) throw conflict(`REVIEW_INVALID_TRANSITION:${r.status}`);
    await uow.audit({ action: "performance.review_acknowledged", entityType: "Employee", entityId: r.employeeId, after: { reviewId: id } });
  });
}

const goalSchema = z.object({ employeeId: z.string().min(1), reviewId: optId, title: reqText(2, 200), description: optText(4000), weight: z.coerce.number().int().min(0).max(100).default(0), dueDate: optDate });

export async function createGoal(ctx: Ctx, raw: unknown) {
  const input = goalSchema.parse(raw);
  const a = await reviewAccess(ctx, input.employeeId);
  if (!a.canManage && !a.self) throw forbidden("hr.performance.manage");
  return unitOfWork(ctx, async (tx, uow) => {
    if (input.reviewId && !(await tx.performanceReview.findFirst({ where: { id: input.reviewId, employeeId: input.employeeId } }))) throw invalid("REVIEW_NOT_OF_EMPLOYEE");
    const g = await tx.performanceGoal.create({ data: { employeeId: input.employeeId, reviewId: input.reviewId ?? null, title: input.title, description: input.description ?? null, weight: input.weight, dueDate: input.dueDate ?? null, createdById: ctx.userId || null } });
    await uow.audit({ action: "performance.goal_created", entityType: "Employee", entityId: input.employeeId, after: { goalId: g.id, title: g.title } });
    return { id: g.id };
  });
}

export async function updateGoal(ctx: Ctx, id: string, raw: unknown) {
  const input = z.object({ status: z.enum(["NOT_STARTED", "IN_PROGRESS", "ACHIEVED", "MISSED", "CANCELLED"]), result: optText(4000) }).parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const g = await tx.performanceGoal.findUnique({ where: { id }, include: { employee: { select: { organizationId: true } } } });
    if (!g || g.employee.organizationId !== ctx.organizationId) throw notFound("PerformanceGoal");
    const a = await reviewAccess(ctx, g.employeeId);
    // the employee updates progress; only manager / HR set a final outcome
    if (!a.canManage && !(a.self && ["NOT_STARTED", "IN_PROGRESS"].includes(input.status))) throw forbidden("hr.performance.manage");
    await tx.performanceGoal.update({ where: { id }, data: { status: input.status, result: input.result ?? g.result } });
    await uow.audit({ action: "performance.goal_updated", entityType: "Employee", entityId: g.employeeId, after: { goalId: id, status: input.status } });
  });
}

/** Reviews + goals of one employee, filtered by privacy rules. */
export async function employeePerformance(ctx: Ctx, employeeId: string) {
  const a = await reviewAccess(ctx, employeeId);
  if (!a.self && !a.manager && !a.hr) {
    // reviewers assigned by HR still see the reviews they write
    const reviewer = await prisma.performanceReview.findFirst({ where: { employeeId, reviewerId: ctx.userId }, select: { id: true } });
    if (!reviewer) throw forbidden("hr.performance.view");
  }
  const reviewWhere: Prisma.PerformanceReviewWhereInput = { employeeId, ...(a.self && !a.hr ? { status: { in: ["COMPLETED", "ACKNOWLEDGED"] } } : {}), ...(!a.self && !a.manager && !a.hr ? { reviewerId: ctx.userId } : {}) };
  const [reviews, goals] = await Promise.all([
    prisma.performanceReview.findMany({ where: reviewWhere, orderBy: { periodStart: "desc" } }),
    prisma.performanceGoal.findMany({ where: { employeeId }, orderBy: { createdAt: "desc" } })
  ]);
  const reviewers = reviews.length ? await prisma.user.findMany({ where: { id: { in: [...new Set(reviews.map((r) => r.reviewerId))] } }, select: { id: true, name: true, nameAr: true } }) : [];
  return { reviews, goals, reviewers, can: { manage: a.canManage && !a.self, self: a.self } };
}

/** HR list of reviews (hr.performance.view within scope) or my reviews to write. */
export async function listReviews(ctx: Ctx) {
  const me = await myEmployee(ctx);
  const ors: Prisma.PerformanceReviewWhereInput[] = [{ reviewerId: ctx.userId }];
  if (me) ors.push({ employee: { managerId: me.id } });
  if (can(ctx, "hr.performance.view")) {
    if (can(ctx, "hr.records.all")) ors.push({});
    else if (can(ctx, "hr.records.department") && me?.departmentId) ors.push({ employee: { departmentId: me.departmentId } });
  }
  return prisma.performanceReview.findMany({ where: { organizationId: ctx.organizationId, OR: ors, ...(me ? { employeeId: { not: me.id } } : {}) }, orderBy: [{ status: "asc" }, { dueDate: "asc" }], take: 200, include: { employee: { select: { id: true, number: true, displayName: true, nameAr: true } } } });
}

