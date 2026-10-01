import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { can, type Ctx } from "../context";
import { addDays, todayIn } from "../commercial/dates";
import { projectAccess, projectWhere } from "./access";

/**
 * Delivery numbers for the Command Center, attention list, My Work and project workspace.
 * Every query applies the project record scope. No mock values.
 */

const OPEN: Prisma.ProjectWhereInput["status"] = { in: ["PLANNING", "ACTIVE", "WAITING_CLIENT", "BLOCKED", "AT_RISK", "ON_HOLD"] };

async function base(ctx: Ctx): Promise<Prisma.ProjectWhereInput> {
  const scope = await projectWhere(ctx);
  return { organizationId: ctx.organizationId, AND: [...(scope.AND ?? [])] };
}
const today = async (ctx: Ctx) => todayIn((await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } })).timezone);

const memo = new WeakMap<Ctx, ReturnType<typeof compute>>();
export function projectKpis(ctx: Ctx) {
  let p = memo.get(ctx);
  if (!p) memo.set(ctx, (p = compute(ctx)));
  return p;
}

async function compute(ctx: Ctx) {
  const ok = can(ctx, "projects.view");
  const b = await base(ctx);
  const t = await today(ctx);
  const monthStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  const openP = { ...b, status: OPEN };
  const [byHealth, completed, overdueMilestones, blockedTasks, overdueTasks, depsWaiting, nearingTarget, myUrgent] = ok
    ? await Promise.all([
        prisma.project.groupBy({ by: ["health"], where: openP, _count: { _all: true } }),
        prisma.project.count({ where: { ...b, status: "COMPLETED", completedAt: { gte: monthStart } } }),
        prisma.projectMilestone.count({ where: { project: openP, status: { notIn: ["COMPLETED", "CANCELLED"] }, dueDate: { lt: t } } }),
        prisma.task.count({ where: { project: openP, archivedAt: null, status: "BLOCKED" } }),
        prisma.task.count({ where: { project: openP, archivedAt: null, status: { notIn: ["DONE", "CANCELLED"] }, dueDate: { lt: t } } }),
        prisma.projectDependency.count({ where: { project: openP, ownerSide: "CLIENT", status: { in: ["OPEN", "WAITING"] } } }),
        prisma.project.count({ where: { ...openP, targetEndDate: { gte: t, lte: addDays(t, 14) } } }),
        prisma.task.count({ where: { assigneeId: ctx.userId, archivedAt: null, status: { notIn: ["DONE", "CANCELLED"] }, project: openP, OR: [{ dueDate: { lte: t } }, { priority: "URGENT" }] } })
      ])
    : [[], 0, 0, 0, 0, 0, 0, 0];
  const h = (k: string) => (byHealth as { health: string; _count: { _all: number } }[]).find((x) => x.health === k)?._count._all ?? 0;
  return { active: h("HEALTHY") + h("NEEDS_ATTENTION") + h("AT_RISK"), healthy: h("HEALTHY"), attention: h("NEEDS_ATTENTION"), atRisk: h("AT_RISK"), completed, overdueMilestones, blockedTasks, overdueTasks, depsWaiting, nearingTarget, myUrgent, monthStart };
}

export type ProjectAttention = { id: string; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; category: string; title: string; owner?: string | null; dueAt?: Date | null; href: string };

/** Deterministic delivery attention rules. Default = projects I manage; team = my record scope. */
export async function projectAttention(ctx: Ctx, opts: { team?: boolean } = {}): Promise<ProjectAttention[]> {
  if (!can(ctx, "projects.view")) return [];
  const out: ProjectAttention[] = [];
  const t = await today(ctx);
  const b = await base(ctx);
  const mine: Prisma.ProjectWhereInput = opts.team ? { ...b, status: OPEN } : { organizationId: ctx.organizationId, projectManagerId: ctx.userId, status: OPEN };
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { projectInactivityDays: true } });
  const [milestones, blockedCritical, deps, idle, endRisk, ready] = await Promise.all([
    prisma.projectMilestone.findMany({ where: { project: mine, status: { notIn: ["COMPLETED", "CANCELLED"] }, dueDate: { lt: t } }, take: 6, orderBy: { dueDate: "asc" }, include: { project: { select: { id: true, number: true } } } }),
    prisma.task.findMany({ where: { project: mine, archivedAt: null, status: "BLOCKED", priority: { in: ["HIGH", "URGENT"] } }, take: 6, include: { project: { select: { id: true, number: true } } } }),
    prisma.projectDependency.findMany({ where: { project: mine, status: { in: ["OPEN", "WAITING"] }, dueDate: { lt: t } }, take: 6, include: { project: { select: { id: true, number: true } } } }),
    prisma.project.findMany({ where: { ...mine, status: { in: ["ACTIVE", "AT_RISK"] }, lastActivityAt: { lt: addDays(t, -org.projectInactivityDays) } }, take: 4 }),
    prisma.project.findMany({ where: { ...mine, health: "AT_RISK" }, take: 6 }),
    prisma.projectDeliverable.findMany({ where: { project: mine, status: "READY" }, take: 6, include: { project: { select: { id: true, number: true } } } })
  ]);
  for (const m of milestones) out.push({ id: `pmo-${m.id}`, priority: "HIGH", category: "milestone_overdue", title: `${m.project.number} · ${m.title}`, dueAt: m.dueDate, href: `/app/projects/${m.project.id}?tab=milestones` });
  for (const x of blockedCritical) out.push({ id: `ptb-${x.id}`, priority: "HIGH", category: "task_blocked", title: `${x.number} · ${x.title}`, owner: x.blockedReason, href: `/app/projects/${x.project.id}?tab=tasks&task=${x.id}` });
  for (const d of deps) out.push({ id: `pdo-${d.id}`, priority: d.critical ? "HIGH" : "MEDIUM", category: d.ownerSide === "CLIENT" ? "client_dependency_overdue" : "dependency_overdue", title: `${d.project.number} · ${d.title}`, dueAt: d.dueDate, href: `/app/projects/${d.project.id}?tab=deliverables` });
  for (const p of idle) out.push({ id: `pna-${p.id}`, priority: "MEDIUM", category: "project_idle", title: `${p.number} · ${p.name}`, dueAt: p.lastActivityAt, href: `/app/projects/${p.id}` });
  for (const p of endRisk) out.push({ id: `pr-${p.id}`, priority: "URGENT", category: "project_at_risk", title: `${p.number} · ${p.name}`, dueAt: p.targetEndDate, href: `/app/projects/${p.id}` });
  for (const d of ready) out.push({ id: `pdr-${d.id}`, priority: "MEDIUM", category: "deliverable_review", title: `${d.project.number} · ${d.name}`, href: `/app/projects/${d.project.id}?tab=deliverables` });
  return out;
}

/** "My Work": my tasks in buckets + the projects I belong to. */
export async function myWork(ctx: Ctx) {
  const t = await today(ctx);
  const b = await base(ctx);
  const mineOpen: Prisma.TaskWhereInput = { assigneeId: ctx.userId, archivedAt: null, status: { notIn: ["DONE", "CANCELLED"] }, project: { ...b, status: { notIn: ["CANCELLED", "ARCHIVED"] } } };
  const include = { project: { select: { id: true, number: true, name: true } }, milestone: { select: { title: true } } } as const;
  const [overdue, dueToday, blocked, review, upcoming, projects] = await Promise.all([
    prisma.task.findMany({ where: { ...mineOpen, dueDate: { lt: t } }, orderBy: { dueDate: "asc" }, take: 50, include }),
    prisma.task.findMany({ where: { ...mineOpen, dueDate: t }, orderBy: { priority: "desc" }, take: 50, include }),
    prisma.task.findMany({ where: { ...mineOpen, status: "BLOCKED" }, take: 50, include }),
    prisma.task.findMany({ where: { ...mineOpen, status: "REVIEW" }, take: 50, include }),
    prisma.task.findMany({ where: { ...mineOpen, status: { notIn: ["DONE", "CANCELLED", "BLOCKED", "REVIEW"] }, OR: [{ dueDate: { gt: t } }, { dueDate: null }] }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }], take: 50, include }),
    prisma.project.findMany({
      where: { organizationId: ctx.organizationId, status: { notIn: ["CANCELLED", "ARCHIVED"] }, OR: [{ projectManagerId: ctx.userId }, { members: { some: { userId: ctx.userId, leftAt: null } } }] },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, number: true, name: true, status: true, health: true, progress: true, targetEndDate: true, client: { select: { displayName: true } } }
    })
  ]);
  return { today: t, overdue, dueToday, blocked, review, upcoming, projects };
}

/** Team workload — declared allocation + open task counts and remaining estimates (no capacity calendar). */
export async function teamWorkload(ctx: Ctx, projectId: string) {
  const a = await projectAccess(prisma, ctx, projectId);
  const t = await today(ctx);
  const members = a.project.members.filter((m) => !m.leftAt);
  const rows = await prisma.task.groupBy({ by: ["assigneeId", "status"], where: { projectId, archivedAt: null, assigneeId: { in: members.map((m) => m.userId) } }, _count: { _all: true }, _sum: { estimateMinutes: true } });
  const overdue = await prisma.task.groupBy({ by: ["assigneeId"], where: { projectId, archivedAt: null, status: { notIn: ["DONE", "CANCELLED"] }, dueDate: { lt: t } }, _count: { _all: true } });
  const elsewhere = await prisma.task.groupBy({ by: ["assigneeId"], where: { assigneeId: { in: members.map((m) => m.userId) }, archivedAt: null, status: { notIn: ["DONE", "CANCELLED"] }, projectId: { not: projectId } }, _count: { _all: true } });
  return members.map((m) => {
    const mine = rows.filter((r) => r.assigneeId === m.userId);
    const open = mine.filter((r) => r.status !== "DONE" && r.status !== "CANCELLED");
    return {
      userId: m.userId,
      role: m.role,
      allocationPercent: m.allocationPercent,
      activeTasks: open.reduce((s, r) => s + r._count._all, 0),
      doneTasks: mine.filter((r) => r.status === "DONE").reduce((s, r) => s + r._count._all, 0),
      overdue: overdue.find((o) => o.assigneeId === m.userId)?._count._all ?? 0,
      remainingEstimateMinutes: open.reduce((s, r) => s + (r._sum.estimateMinutes ?? 0), 0),
      openTasksOtherProjects: elsewhere.find((o) => o.assigneeId === m.userId)?._count._all ?? 0
    };
  });
}

/** Project activity = its domain events (operational; commercial payload is not exposed here). */
export async function projectActivity(ctx: Ctx, projectId: string) {
  await projectAccess(prisma, ctx, projectId);
  const rows = await prisma.domainEvent.findMany({
    where: { organizationId: ctx.organizationId, OR: [{ entityType: "Project", entityId: projectId }, { payload: { path: ["projectId"], equals: projectId } }] },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  const actors = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorId).filter(Boolean) as string[])] } }, select: { id: true, name: true, nameAr: true } });
  return rows.map((r) => {
    const p = (r.payload ?? {}) as Record<string, unknown>;
    return { id: r.id, type: r.type, at: r.createdAt, actor: actors.find((a) => a.id === r.actorId) ?? null, detail: { title: p.title ?? p.name, number: p.number, to: p.to, reason: p.reason } as Record<string, unknown> };
  });
}

/**
 * Contract ↔ project milestones: a commercial milestone becomes ELIGIBLE (to be satisfied by the
 * commercial team) once every operational milestone linked to it is completed. Nothing changes on
 * the contract automatically.
 */
export async function contractMilestoneEligibility(contractId: string) {
  const links = await prisma.projectMilestone.findMany({ where: { contractMilestoneId: { not: null }, project: { contractId, status: { not: "CANCELLED" } } }, select: { contractMilestoneId: true, status: true } });
  const map = new Map<string, { linked: number; completed: number }>();
  for (const l of links) {
    const e = map.get(l.contractMilestoneId!) ?? { linked: 0, completed: 0 };
    if (l.status !== "CANCELLED") e.linked++;
    if (l.status === "COMPLETED") e.completed++;
    map.set(l.contractMilestoneId!, e);
  }
  return Object.fromEntries([...map].map(([k, v]) => [k, { ...v, eligible: v.linked > 0 && v.completed === v.linked }]));
}
