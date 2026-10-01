import { prisma } from "../db";
import { can, type Ctx } from "../context";
import type { SearchHit } from "../crm/search";
import { projectWhere } from "./access";

/** Projects, tasks and milestones — only inside the caller's project scope. */
export async function projectSearch(ctx: Ctx, term: string): Promise<SearchHit[]> {
  if (!can(ctx, "projects.view")) return [];
  const scope = await projectWhere(ctx);
  const inScope = { organizationId: ctx.organizationId, AND: [...(scope.AND ?? [])] };
  const upper = term.toUpperCase();
  const [projects, tasks, milestones] = await Promise.all([
    prisma.project.findMany({ where: { ...inScope, OR: [{ number: { contains: upper } }, { name: { contains: term, mode: "insensitive" } }] }, take: 5, select: { id: true, number: true, name: true, status: true } }),
    can(ctx, "projects.tasks.view")
      ? prisma.task.findMany({ where: { organizationId: ctx.organizationId, archivedAt: null, project: inScope, OR: [{ number: { contains: upper } }, { title: { contains: term, mode: "insensitive" } }] }, take: 5, select: { id: true, number: true, title: true, projectId: true, project: { select: { number: true } } } })
      : [],
    can(ctx, "projects.milestones.view")
      ? prisma.projectMilestone.findMany({ where: { project: inScope, title: { contains: term, mode: "insensitive" } }, take: 4, select: { id: true, title: true, projectId: true, project: { select: { number: true } } } })
      : []
  ]);
  return [
    ...projects.map((p) => ({ type: "project", id: p.id, title: `${p.number} · ${p.name}`, subtitle: p.status, href: `/app/projects/${p.id}` })),
    ...tasks.map((t) => ({ type: "task", id: t.id, title: `${t.number} · ${t.title}`, subtitle: t.project.number, href: `/app/projects/${t.projectId}?tab=tasks&task=${t.id}` })),
    ...milestones.map((m) => ({ type: "milestone", id: m.id, title: m.title, subtitle: m.project.number, href: `/app/projects/${m.projectId}?tab=milestones` }))
  ];
}
