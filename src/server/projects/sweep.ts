import { prisma } from "../db";
import { systemCtx } from "../context";
import { unitOfWork } from "../events/bus";
import { addDays, todayIn } from "../commercial/dates";
import { withLease } from "../jobs/lease";
import { recomputeProject } from "./engine";

/**
 * Time-based delivery signals (docs/PROJECTS.md "Scheduled sweep"):
 *   task.overdue / task.due_soon  · milestone.overdue · dependency.overdue · project health refresh
 *
 * Safe with many app instances and many cron hosts:
 *   1. a JobLease row lets only one runner work per organization at a time;
 *   2. every signal is claimed with a conditional update (… WHERE overdueNotifiedAt IS NULL), so even
 *      two runners can never both emit the same event;
 *   3. notifications carry a dedupeKey (unique per user), so a retried subscriber cannot duplicate.
 * Re-running the sweep therefore changes nothing (tested).
 */
export async function sweepProjects(organizationId: string, now = new Date()) {
  const res = await withLease(`sweep:projects:${organizationId}`, 10 * 60_000, () => runSweep(organizationId, now));
  return res ?? { skipped: true as const };
}

async function runSweep(organizationId: string, now: Date) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
  const today = todayIn(org.timezone, now);
  const ctx = systemCtx(organizationId, { ip: "system", userAgent: "project-sweep" });
  const out = { tasksOverdue: 0, tasksDueSoon: 0, milestonesOverdue: 0, dependenciesOverdue: 0, projectsRecomputed: 0, becameAtRisk: 0 };
  const LIVE = { status: { in: ["PLANNING", "ACTIVE", "WAITING_CLIENT", "BLOCKED", "AT_RISK", "ON_HOLD"] as ("PLANNING" | "ACTIVE" | "WAITING_CLIENT" | "BLOCKED" | "AT_RISK" | "ON_HOLD")[] } };

  const overdue = await prisma.task.findMany({ where: { organizationId, archivedAt: null, status: { notIn: ["DONE", "CANCELLED"] }, dueDate: { lt: today }, overdueNotifiedAt: null, project: LIVE }, take: 500, include: { project: { select: { projectManagerId: true } } } });
  for (const t of overdue) {
    await unitOfWork(ctx, async (tx, uow) => {
      const r = await tx.task.updateMany({ where: { id: t.id, overdueNotifiedAt: null }, data: { overdueNotifiedAt: now } });
      if (r.count !== 1) return;
      uow.emit({ type: "task.overdue", entityType: "Task", entityId: t.id, payload: { projectId: t.projectId, taskId: t.id, number: t.number, title: t.title, assigneeId: t.assigneeId, ownerId: t.project.projectManagerId, dueDate: t.dueDate?.toISOString().slice(0, 10) } });
      out.tasksOverdue++;
    });
  }

  const soon = await prisma.task.findMany({ where: { organizationId, archivedAt: null, status: { notIn: ["DONE", "CANCELLED"] }, dueDate: { gte: today, lte: addDays(today, 1) }, dueSoonNotifiedAt: null, assigneeId: { not: null }, project: LIVE }, take: 500 });
  for (const t of soon) {
    await unitOfWork(ctx, async (tx, uow) => {
      const r = await tx.task.updateMany({ where: { id: t.id, dueSoonNotifiedAt: null }, data: { dueSoonNotifiedAt: now } });
      if (r.count !== 1) return;
      uow.emit({ type: "task.due_soon", entityType: "Task", entityId: t.id, payload: { projectId: t.projectId, taskId: t.id, number: t.number, title: t.title, assigneeId: t.assigneeId, dueDate: t.dueDate?.toISOString().slice(0, 10) } });
      out.tasksDueSoon++;
    });
  }

  const ms = await prisma.projectMilestone.findMany({ where: { project: { organizationId, ...LIVE }, status: { notIn: ["COMPLETED", "CANCELLED"] }, dueDate: { lt: today }, overdueNotifiedAt: null }, take: 500, include: { project: { select: { number: true, projectManagerId: true } } } });
  for (const m of ms) {
    await unitOfWork(ctx, async (tx, uow) => {
      const r = await tx.projectMilestone.updateMany({ where: { id: m.id, overdueNotifiedAt: null }, data: { overdueNotifiedAt: now } });
      if (r.count !== 1) return;
      await uow.audit({ action: "milestone.overdue", entityType: "ProjectMilestone", entityId: m.id, after: { projectId: m.projectId, title: m.title, dueDate: m.dueDate.toISOString().slice(0, 10) } });
      uow.emit({ type: "milestone.overdue", entityType: "ProjectMilestone", entityId: m.id, payload: { projectId: m.projectId, number: m.project.number, title: m.title, ownerId: m.project.projectManagerId, dueDate: m.dueDate.toISOString().slice(0, 10) } });
      out.milestonesOverdue++;
    });
  }

  const deps = await prisma.projectDependency.findMany({ where: { project: { organizationId, ...LIVE }, status: { in: ["OPEN", "WAITING"] }, dueDate: { lt: today }, overdueNotifiedAt: null }, take: 500, include: { project: { select: { number: true, projectManagerId: true } } } });
  for (const d of deps) {
    await unitOfWork(ctx, async (tx, uow) => {
      const r = await tx.projectDependency.updateMany({ where: { id: d.id, overdueNotifiedAt: null }, data: { overdueNotifiedAt: now } });
      if (r.count !== 1) return;
      uow.emit({ type: "dependency.overdue", entityType: "ProjectDependency", entityId: d.id, payload: { projectId: d.projectId, number: d.project.number, title: d.title, ownerSide: d.ownerSide, ownerId: d.project.projectManagerId } });
      out.dependenciesOverdue++;
    });
  }

  // date-based health (target dates, inactivity) changes without any user action
  const live = await prisma.project.findMany({ where: { organizationId, ...LIVE }, select: { id: true }, take: 1000 });
  for (const p of live) {
    await unitOfWork(ctx, async (tx, uow) => {
      const r = await recomputeProject(tx, p.id, uow, now);
      if (r.health === "AT_RISK" && r.previousHealth !== "AT_RISK") out.becameAtRisk++;
    });
    out.projectsRecomputed++;
  }
  return out;
}

/** In-process throttle for the lazy trigger (pages); the scheduler calls sweepProjects directly. */
const last = new Map<string, number>();
export async function sweepProjectsIfDue(organizationId: string, everyMs = 5 * 60_000) {
  if (Date.now() - (last.get(organizationId) ?? 0) < everyMs) return null;
  last.set(organizationId, Date.now());
  try {
    return await sweepProjects(organizationId);
  } catch (e) {
    last.delete(organizationId);
    console.error("[project-sweep]", e);
    return null;
  }
}
