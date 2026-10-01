import { z } from "zod";
import type { Prisma, ProjectMilestoneStatus, TaskStatus } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { nextNumber } from "../crm/sequence";
import { optDate, optId, optText, parseListParams, reqText } from "../crm/normalize";
import { ymd } from "../commercial/dates";
import { isClosed, projectAccess, projectWhere, requireManager, requireParticipant } from "./access";
import { touchProject } from "./engine";

/**
 * Project milestones (operational checkpoints), tasks and task comments — docs/PROJECTS.md.
 */

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export const MILESTONE_TRANSITIONS: Record<ProjectMilestoneStatus, readonly ProjectMilestoneStatus[]> = {
  NOT_STARTED: ["IN_PROGRESS", "BLOCKED", "CANCELLED", "COMPLETED"],
  IN_PROGRESS: ["NOT_STARTED", "BLOCKED", "COMPLETED", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "NOT_STARTED", "CANCELLED"],
  COMPLETED: ["IN_PROGRESS"],
  CANCELLED: ["NOT_STARTED"]
};

const milestoneSchema = z.object({
  title: reqText(2, 200),
  description: optText(4000),
  startDate: optDate,
  dueDate: z.coerce.date(),
  ownerId: optId,
  weight: z.coerce.number().int().min(1).max(100).default(10),
  required: z.boolean().default(true),
  contractMilestoneId: optId
});

async function checkMilestoneRefs(tx: Tx, ctx: Ctx, project: { id: string; contractId: string | null }, input: { ownerId?: string | null; contractMilestoneId?: string | null; startDate?: Date | null; dueDate?: Date }) {
  if (input.startDate && input.dueDate && input.dueDate < input.startDate) throw invalid("DUE_BEFORE_START");
  if (input.ownerId && !(await tx.user.findFirst({ where: { id: input.ownerId, organizationId: ctx.organizationId, deletedAt: null } }))) throw invalid("UNKNOWN_USER");
  if (input.contractMilestoneId) {
    // link only to a commercial milestone of THIS project's contract (the contract is never modified)
    const cm = await tx.contractMilestone.findFirst({ where: { id: input.contractMilestoneId, contractId: project.contractId ?? "__none__" } });
    if (!cm) throw invalid("CONTRACT_MILESTONE_NOT_OF_PROJECT");
  }
}

export async function createMilestone(ctx: Ctx, projectId: string, raw: unknown) {
  const input = milestoneSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const { project } = await requireManager(tx, ctx, projectId, "projects.milestones.manage", { lock: true });
    if (isClosed(project.status)) throw conflict(`PROJECT_CLOSED:${project.status}`);
    await checkMilestoneRefs(tx, ctx, project, input);
    const max = await tx.projectMilestone.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    const m = await tx.projectMilestone.create({ data: { ...input, projectId, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
    await uow.audit({ action: "milestone.created", entityType: "ProjectMilestone", entityId: m.id, after: { projectId, title: m.title, dueDate: ymd(m.dueDate), weight: m.weight } });
    uow.emit({ type: "milestone.created", entityType: "ProjectMilestone", entityId: m.id, payload: { projectId, title: m.title } });
    await touchProject(tx, projectId, uow);
    return m;
  });
}

export async function updateMilestone(ctx: Ctx, milestoneId: string, raw: unknown) {
  const input = milestoneSchema.partial().parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await tx.projectMilestone.findUnique({ where: { id: milestoneId } });
    if (!before) throw notFound("ProjectMilestone");
    const { project } = await requireManager(tx, ctx, before.projectId, "projects.milestones.manage", { lock: true });
    await checkMilestoneRefs(tx, ctx, project, { ...input, startDate: input.startDate ?? before.startDate, dueDate: input.dueDate ?? before.dueDate });
    const after = await tx.projectMilestone.update({ where: { id: milestoneId }, data: input });
    const dueChanged = ymd(before.dueDate) !== ymd(after.dueDate);
    await uow.audit({ action: dueChanged ? "milestone.due_date_changed" : "milestone.updated", entityType: "ProjectMilestone", entityId: milestoneId, before: { title: before.title, dueDate: ymd(before.dueDate), weight: before.weight, ownerId: before.ownerId }, after: { title: after.title, dueDate: ymd(after.dueDate), weight: after.weight, ownerId: after.ownerId } });
    if (dueChanged) await tx.projectMilestone.update({ where: { id: milestoneId }, data: { overdueNotifiedAt: null } });
    await touchProject(tx, before.projectId, uow);
  });
}

const milestoneStatusSchema = z.object({ to: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"]), reason: optText(1000), from: z.string().optional() });

export async function setMilestoneStatus(ctx: Ctx, milestoneId: string, raw: unknown) {
  const input = milestoneStatusSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const pre = await tx.projectMilestone.findUnique({ where: { id: milestoneId }, select: { projectId: true } });
    if (!pre) throw notFound("ProjectMilestone");
    const { project } = await requireManager(tx, ctx, pre.projectId, "projects.milestones.manage", { lock: true });
    await tx.$queryRaw`SELECT id FROM "ProjectMilestone" WHERE id = ${milestoneId} FOR UPDATE`;
    const m = await tx.projectMilestone.findUniqueOrThrow({ where: { id: milestoneId } });
    if (input.from && input.from !== m.status) throw conflict("MILESTONE_STALE");
    if (!MILESTONE_TRANSITIONS[m.status].includes(input.to)) throw conflict(`MILESTONE_INVALID_TRANSITION:${m.status}->${input.to}`);
    if (input.to === "BLOCKED" && (!input.reason || input.reason.trim().length < 3)) throw invalid("BLOCKED_REASON_REQUIRED");
    if (input.to === "COMPLETED") {
      const open = await tx.task.count({ where: { milestoneId, status: { notIn: ["DONE", "CANCELLED"] }, archivedAt: null } });
      if (open) throw conflict(`MILESTONE_HAS_OPEN_TASKS:${open}`);
    }
    await tx.projectMilestone.update({
      where: { id: milestoneId },
      data: { status: input.to, blockedReason: input.to === "BLOCKED" ? input.reason!.trim() : null, completedAt: input.to === "COMPLETED" ? new Date() : null, ...(input.to === "IN_PROGRESS" && !m.startDate ? { startDate: new Date() } : {}) }
    });
    await uow.audit({ action: `milestone.${input.to.toLowerCase()}`, entityType: "ProjectMilestone", entityId: milestoneId, before: { status: m.status }, after: { status: input.to, reason: input.reason } });
    if (input.to === "COMPLETED") uow.emit({ type: "milestone.completed", entityType: "ProjectMilestone", entityId: milestoneId, payload: { projectId: project.id, number: project.number, title: m.title, contractMilestoneId: m.contractMilestoneId } });
    else uow.emit({ type: "milestone.status_changed", entityType: "ProjectMilestone", entityId: milestoneId, payload: { projectId: project.id, title: m.title, from: m.status, to: input.to } });
    await touchProject(tx, project.id, uow);
  });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/** Allowed task moves. BLOCKED needs a reason; DONE needs every subtask closed. */
export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  BACKLOG: ["TODO", "IN_PROGRESS", "CANCELLED"],
  TODO: ["BACKLOG", "IN_PROGRESS", "BLOCKED", "CANCELLED"],
  IN_PROGRESS: ["TODO", "REVIEW", "BLOCKED", "DONE", "CANCELLED"],
  REVIEW: ["IN_PROGRESS", "DONE", "BLOCKED"],
  BLOCKED: ["TODO", "IN_PROGRESS"],
  DONE: ["IN_PROGRESS"],
  CANCELLED: ["BACKLOG"]
};
export const BOARD_COLUMNS: TaskStatus[] = ["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "BLOCKED", "DONE"];

const taskSchema = z.object({
  projectId: z.string().min(1),
  milestoneId: optId,
  parentTaskId: optId,
  title: reqText(2, 300),
  description: optText(8000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  assigneeId: optId,
  startDate: optDate,
  dueDate: optDate,
  estimateHours: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().positive().max(2000).nullable()).optional(),
  status: z.enum(["BACKLOG", "TODO"]).default("TODO")
});

async function checkTaskRefs(tx: Tx, ctx: Ctx, projectId: string, input: { milestoneId?: string | null; parentTaskId?: string | null; assigneeId?: string | null; startDate?: Date | null; dueDate?: Date | null }, selfId?: string) {
  if (input.startDate && input.dueDate && input.dueDate < input.startDate) throw invalid("DUE_BEFORE_START");
  if (input.milestoneId && !(await tx.projectMilestone.findFirst({ where: { id: input.milestoneId, projectId } }))) throw invalid("MILESTONE_NOT_OF_PROJECT");
  if (input.parentTaskId) {
    const parent = await tx.task.findFirst({ where: { id: input.parentTaskId, projectId, archivedAt: null } });
    if (!parent) throw invalid("PARENT_NOT_OF_PROJECT");
    // one level only → cycles are impossible
    if (parent.parentTaskId) throw invalid("SUBTASK_DEPTH");
    if (selfId && (parent.id === selfId || (await tx.task.count({ where: { parentTaskId: selfId } })))) throw invalid("SUBTASK_DEPTH");
  }
  if (input.assigneeId) {
    const m = await tx.projectMember.findFirst({ where: { projectId, userId: input.assigneeId, leftAt: null } });
    if (!m) throw invalid("ASSIGNEE_NOT_MEMBER");
  }
}

export async function createTask(ctx: Ctx, raw: unknown) {
  const input = taskSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const a = await requireParticipant(tx, ctx, input.projectId, "projects.tasks.create", { lock: true });
    if (isClosed(a.project.status)) throw conflict(`PROJECT_CLOSED:${a.project.status}`);
    if (input.assigneeId && input.assigneeId !== ctx.userId && !(can(ctx, "projects.tasks.assign") && a.manager)) throw forbidden("projects.tasks.assign");
    await checkTaskRefs(tx, ctx, input.projectId, input);
    const max = await tx.task.aggregate({ where: { projectId: input.projectId, status: input.status }, _max: { sortOrder: true } });
    const t = await tx.task.create({
      data: {
        organizationId: ctx.organizationId,
        number: await nextNumber(tx, ctx.organizationId, "TASK"),
        projectId: input.projectId,
        milestoneId: input.milestoneId ?? null,
        parentTaskId: input.parentTaskId ?? null,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        status: input.status,
        assigneeId: input.assigneeId ?? null,
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
        estimateMinutes: input.estimateHours ? Math.round(input.estimateHours * 60) : null,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
        createdById: ctx.userId || null
      }
    });
    await uow.audit({ action: "task.created", entityType: "Task", entityId: t.id, after: { number: t.number, projectId: t.projectId, title: t.title, assigneeId: t.assigneeId } });
    uow.emit({ type: "task.created", entityType: "Task", entityId: t.id, payload: { projectId: t.projectId, taskId: t.id, number: t.number, title: t.title } });
    if (t.assigneeId) uow.emit({ type: "task.assigned", entityType: "Task", entityId: t.id, payload: { projectId: t.projectId, taskId: t.id, number: t.number, title: t.title, assigneeId: t.assigneeId } });
    await touchProject(tx, t.projectId, uow);
    return { id: t.id, number: t.number };
  });
}

async function loadTask(tx: Tx, ctx: Ctx, taskId: string, lock = false) {
  if (lock) await tx.$queryRaw`SELECT id FROM "Task" WHERE id = ${taskId} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const t = await tx.task.findFirst({ where: { id: taskId, organizationId: ctx.organizationId, archivedAt: null } });
  if (!t) throw notFound("Task");
  const a = await projectAccess(tx, ctx, t.projectId); // NOT_FOUND when the project is out of scope
  return { t, a };
}

const taskUpdateSchema = taskSchema.omit({ projectId: true, status: true, assigneeId: true }).partial();

export async function updateTask(ctx: Ctx, taskId: string, raw: unknown) {
  requirePermission(ctx, "projects.tasks.edit");
  const input = taskUpdateSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const { t, a } = await loadTask(tx, ctx, taskId, true);
    if (!a.manager && t.assigneeId !== ctx.userId && t.createdById !== ctx.userId) throw forbidden("projects.tasks.edit (assignee, creator or manager)");
    await checkTaskRefs(tx, ctx, t.projectId, { ...input, startDate: input.startDate ?? t.startDate, dueDate: input.dueDate ?? t.dueDate }, t.id);
    const { estimateHours, ...rest } = input;
    const data: Prisma.TaskUncheckedUpdateInput = { ...rest, ...(estimateHours !== undefined ? { estimateMinutes: estimateHours ? Math.round(estimateHours * 60) : null } : {}) };
    const after = await tx.task.update({ where: { id: taskId }, data: { ...data, ...(input.dueDate !== undefined ? { overdueNotifiedAt: null, dueSoonNotifiedAt: null } : {}) } });
    await uow.audit({ action: "task.updated", entityType: "Task", entityId: taskId, before: { title: t.title, dueDate: ymd(t.dueDate), priority: t.priority, milestoneId: t.milestoneId }, after: { title: after.title, dueDate: ymd(after.dueDate), priority: after.priority, milestoneId: after.milestoneId } });
    await touchProject(tx, t.projectId, uow);
  });
}

export async function assignTask(ctx: Ctx, taskId: string, assigneeId: string | null) {
  requirePermission(ctx, "projects.tasks.assign");
  return unitOfWork(ctx, async (tx, uow) => {
    const { t, a } = await loadTask(tx, ctx, taskId, true);
    if (!a.manager) throw forbidden("projects.tasks.assign (project manager only)");
    if (assigneeId) await checkTaskRefs(tx, ctx, t.projectId, { assigneeId });
    if ((t.assigneeId ?? null) === (assigneeId ?? null)) return;
    await tx.task.update({ where: { id: taskId }, data: { assigneeId } });
    await uow.audit({ action: "task.reassigned", entityType: "Task", entityId: taskId, before: { assigneeId: t.assigneeId }, after: { assigneeId } });
    if (assigneeId) uow.emit({ type: "task.assigned", entityType: "Task", entityId: taskId, payload: { projectId: t.projectId, taskId, number: t.number, title: t.title, assigneeId } });
    await touchProject(tx, t.projectId, uow);
  });
}

const moveSchema = z.object({ to: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "BLOCKED", "DONE", "CANCELLED"]), from: z.string().optional(), reason: optText(1000), position: z.coerce.number().int().min(0).optional() });

/**
 * Status change (list, task panel, Kanban drag). Server-side rules; the optional `from` makes
 * the move optimistic-concurrency safe (a stale board gets TASK_STALE instead of overwriting).
 */
export async function changeTaskStatus(ctx: Ctx, taskId: string, raw: unknown) {
  requirePermission(ctx, "projects.tasks.change_status");
  const input = moveSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const { t, a } = await loadTask(tx, ctx, taskId, true);
    if (!a.manager && t.assigneeId !== ctx.userId) throw forbidden("projects.tasks.change_status (assignee or manager)");
    if (isClosed(a.project.status)) throw conflict(`PROJECT_CLOSED:${a.project.status}`);
    if (input.from && input.from !== t.status) throw conflict("TASK_STALE");
    const sameColumn = input.to === t.status;
    if (!sameColumn && !TASK_TRANSITIONS[t.status].includes(input.to)) throw conflict(`TASK_INVALID_TRANSITION:${t.status}->${input.to}`);
    if (input.to === "BLOCKED" && (!input.reason || input.reason.trim().length < 3)) throw invalid("BLOCKED_REASON_REQUIRED");
    if (input.to === "DONE") {
      const open = await tx.task.count({ where: { parentTaskId: t.id, status: { notIn: ["DONE", "CANCELLED"] }, archivedAt: null } });
      if (open) throw conflict(`TASK_HAS_OPEN_SUBTASKS:${open}`);
    }
    const now = new Date();
    const data: Prisma.TaskUncheckedUpdateInput = sameColumn
      ? {}
      : {
          status: input.to,
          statusChangedAt: now,
          blockedReason: input.to === "BLOCKED" ? input.reason!.trim() : null,
          completedAt: input.to === "DONE" ? now : null,
          // starting an already-overdue task: the start can't be after the due date (Task_dates_valid)
          ...(input.to === "IN_PROGRESS" && !t.startDate ? { startDate: t.dueDate && t.dueDate < now ? t.dueDate : now } : {})
        };
    if (input.position !== undefined) data.sortOrder = input.position * 10 - 5;
    else if (!sameColumn) data.sortOrder = ((await tx.task.aggregate({ where: { projectId: t.projectId, status: input.to }, _min: { sortOrder: true } }))._min.sortOrder ?? 1) - 1;
    await tx.task.update({ where: { id: taskId }, data });
    if (input.position !== undefined) {
      // normalise the column order (sortOrder = index × 10) so later drops stay deterministic
      const col = await tx.task.findMany({ where: { projectId: t.projectId, status: input.to, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }], select: { id: true } });
      for (let i = 0; i < col.length; i++) await tx.task.update({ where: { id: col[i].id }, data: { sortOrder: i * 10 } });
    }
    if (sameColumn) return;
    await uow.audit({ action: input.to === "DONE" ? "task.completed" : input.to === "BLOCKED" ? "task.blocked" : "task.status_changed", entityType: "Task", entityId: taskId, before: { status: t.status, blockedReason: t.blockedReason }, after: { status: input.to, blockedReason: input.to === "BLOCKED" ? input.reason : null } });
    const payload = { projectId: t.projectId, taskId, number: t.number, title: t.title, from: t.status, to: input.to, reason: input.reason, assigneeId: t.assigneeId, ownerId: a.project.projectManagerId };
    uow.emit({ type: "task.status_changed", entityType: "Task", entityId: taskId, payload });
    if (input.to === "IN_PROGRESS" && (t.status === "TODO" || t.status === "BACKLOG")) uow.emit({ type: "task.started", entityType: "Task", entityId: taskId, payload });
    if (input.to === "BLOCKED") uow.emit({ type: "task.blocked", entityType: "Task", entityId: taskId, payload });
    if (input.to === "DONE") uow.emit({ type: "task.completed", entityType: "Task", entityId: taskId, payload });
    // work started inside a not-started milestone → the milestone is in progress (conditional, so concurrent moves start it once)
    if (t.milestoneId && ["IN_PROGRESS", "REVIEW", "DONE"].includes(input.to)) {
      const started = await tx.projectMilestone.updateMany({ where: { id: t.milestoneId, status: "NOT_STARTED" }, data: { status: "IN_PROGRESS" } });
      if (started.count) {
        await uow.audit({ action: "milestone.status_changed", entityType: "ProjectMilestone", entityId: t.milestoneId, before: { status: "NOT_STARTED" }, after: { status: "IN_PROGRESS", auto: true, taskId } });
        uow.emit({ type: "milestone.status_changed", entityType: "ProjectMilestone", entityId: t.milestoneId, payload: { projectId: t.projectId, from: "NOT_STARTED", to: "IN_PROGRESS", auto: true, taskId } });
      }
    }
    await touchProject(tx, t.projectId, uow);
  });
}

export async function archiveTask(ctx: Ctx, taskId: string) {
  requirePermission(ctx, "projects.tasks.edit");
  return unitOfWork(ctx, async (tx, uow) => {
    const { t, a } = await loadTask(tx, ctx, taskId, true);
    if (!a.manager && t.createdById !== ctx.userId) throw forbidden("projects.tasks.edit (creator or manager)");
    if ((await tx.timeEntry.count({ where: { taskId } })) > 0) throw conflict("TASK_HAS_TIME");
    await tx.task.update({ where: { id: taskId }, data: { archivedAt: new Date() } });
    await uow.audit({ action: "task.archived", entityType: "Task", entityId: taskId, before: { title: t.title, status: t.status } });
    await touchProject(tx, t.projectId, uow);
  });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const TASKS_PAGE_SIZE = 50;
const taskListSchema = z.object({
  project: z.string().max(40).optional(),
  milestone: z.string().max(40).optional(),
  assignee: z.string().max(40).optional(),
  status: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "BLOCKED", "DONE", "CANCELLED", "open"]).optional(),
  due: z.enum(["overdue", "today", "week"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1)
});

/** Paginated task list (never the whole company). Scope comes from the project. */
export async function listTasks(ctx: Ctx, raw: unknown, today: Date) {
  requirePermission(ctx, "projects.tasks.view");
  const f = parseListParams(taskListSchema, raw);
  const scope = await projectWhere(ctx);
  const and: Prisma.TaskWhereInput[] = [{ project: { organizationId: ctx.organizationId, AND: [...(scope.AND ?? [])] } }];
  if (f.project) and.push({ projectId: f.project });
  if (f.milestone) and.push({ milestoneId: f.milestone === "none" ? null : f.milestone });
  if (f.assignee) and.push({ assigneeId: f.assignee === "me" ? ctx.userId : f.assignee === "none" ? null : f.assignee });
  if (f.status === "open") and.push({ status: { notIn: ["DONE", "CANCELLED"] } });
  else if (f.status) and.push({ status: f.status });
  if (f.due === "overdue") and.push({ dueDate: { lt: today }, status: { notIn: ["DONE", "CANCELLED"] } });
  if (f.due === "today") and.push({ dueDate: today });
  if (f.due === "week") and.push({ dueDate: { gte: today, lte: new Date(today.getTime() + 7 * 86_400_000) } });
  if (f.q) and.push({ OR: [{ title: { contains: f.q, mode: "insensitive" } }, { number: { contains: f.q.toUpperCase() } }] });
  const where: Prisma.TaskWhereInput = { organizationId: ctx.organizationId, archivedAt: null, AND: and };
  const [items, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { createdAt: "asc" }],
      skip: (f.page - 1) * TASKS_PAGE_SIZE,
      take: TASKS_PAGE_SIZE,
      include: { project: { select: { id: true, number: true, name: true, projectManagerId: true } }, assignee: { select: { id: true, name: true, nameAr: true } }, milestone: { select: { id: true, title: true } }, _count: { select: { subtasks: true } } }
    }),
    prisma.task.count({ where })
  ]);
  return { items, total, page: f.page, pageSize: TASKS_PAGE_SIZE };
}

/** Kanban for ONE project (optionally one milestone): at most `perColumn` cards per column + totals. */
export async function projectBoard(ctx: Ctx, projectId: string, opts: { milestoneId?: string; assignee?: string; perColumn?: number } = {}) {
  requirePermission(ctx, "projects.tasks.view");
  await projectAccess(prisma, ctx, projectId);
  const take = opts.perColumn ?? 60;
  const base: Prisma.TaskWhereInput = {
    projectId,
    archivedAt: null,
    ...(opts.milestoneId ? { milestoneId: opts.milestoneId } : {}),
    ...(opts.assignee ? { assigneeId: opts.assignee } : {})
  };
  const columns = await Promise.all(
    BOARD_COLUMNS.map(async (status) => ({
      status,
      total: await prisma.task.count({ where: { ...base, status } }),
      items: await prisma.task.findMany({
        where: { ...base, status },
        orderBy: status === "DONE" ? [{ completedAt: "desc" }] : [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take,
        include: { assignee: { select: { id: true, name: true, nameAr: true } }, milestone: { select: { title: true } }, _count: { select: { subtasks: true } } }
      })
    }))
  );
  return columns;
}

export async function getTask(ctx: Ctx, taskId: string) {
  requirePermission(ctx, "projects.tasks.view");
  const t = await prisma.task.findFirst({
    where: { id: taskId, organizationId: ctx.organizationId, archivedAt: null },
    include: {
      assignee: { select: { id: true, name: true, nameAr: true } },
      createdBy: { select: { name: true, nameAr: true } },
      milestone: { select: { id: true, title: true } },
      parent: { select: { id: true, number: true, title: true } },
      subtasks: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, number: true, title: true, status: true, assigneeId: true } }
    }
  });
  if (!t) throw notFound("Task");
  const a = await projectAccess(prisma, ctx, t.projectId);
  const [comments, logged] = await Promise.all([
    prisma.comment.findMany({ where: { entityType: "TASK", entityId: taskId, deletedAt: null }, orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, nameAr: true } } } }),
    prisma.timeEntry.aggregate({ where: { taskId, status: { not: "REJECTED" } }, _sum: { minutes: true } })
  ]);
  return { task: t, access: a, comments, loggedMinutes: logged._sum.minutes ?? 0 };
}

// ---------------------------------------------------------------------------
// Comments (reusable: TASK / PROJECT)
// ---------------------------------------------------------------------------

export async function addTaskComment(ctx: Ctx, taskId: string, body: string) {
  requirePermission(ctx, "projects.tasks.view");
  const text = reqText(1, 8000).parse(body);
  return unitOfWork(ctx, async (tx, uow) => {
    const { t, a } = await loadTask(tx, ctx, taskId);
    if (!a.manager && !a.member) throw forbidden("comment (project members only)");
    const c = await tx.comment.create({ data: { organizationId: ctx.organizationId, entityType: "TASK", entityId: taskId, authorId: ctx.userId, body: text } });
    uow.emit({ type: "task.commented", entityType: "Task", entityId: taskId, payload: { projectId: t.projectId, taskId, number: t.number, assigneeId: t.assigneeId } });
    await touchProject(tx, t.projectId);
    return c;
  });
}

/** Author edits own comment; author or project manager deletes (soft, audited). */
export async function editComment(ctx: Ctx, commentId: string, body: string | null) {
  const text = body === null ? null : reqText(1, 8000).parse(body);
  return unitOfWork(ctx, async (tx, uow) => {
    const c = await tx.comment.findFirst({ where: { id: commentId, organizationId: ctx.organizationId, deletedAt: null } });
    if (!c) throw notFound("Comment");
    const { a } = await loadTask(tx, ctx, c.entityId);
    if (text !== null && c.authorId !== ctx.userId) throw forbidden("comment author only");
    if (text === null && c.authorId !== ctx.userId && !a.manager) throw forbidden("comment author or project manager");
    await tx.comment.update({ where: { id: commentId }, data: text === null ? { deletedAt: new Date() } : { body: text } });
    await uow.audit({ action: text === null ? "comment.deleted" : "comment.updated", entityType: "Comment", entityId: commentId, before: { body: c.body }, after: text === null ? undefined : { body: text } });
  });
}
