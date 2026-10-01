import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, type Ctx } from "../context";
import { notFound, forbidden } from "../errors";
import { clientWhere } from "../crm/scope";
import type { Permission } from "../rbac/permissions";

/**
 * Project visibility (OPERATIONAL) — applied in every project / task / time / search query:
 *   ALL  (projects.records.all)  every project
 *   TEAM (projects.records.team) projects of my department (project department or PM's department)
 *   always                      projects I manage, created, or am an active member of
 *   sales                       users who sell (crm.opportunities.view) also see projects of
 *                               clients in their CRM scope — status visibility for their clients
 *
 * COMMERCIAL data (budget, contract value, quotation) is a separate check: canSeeCommercial()
 * plus the commercial record's own scope. Being a project member never grants it.
 */
export type ProjectScope = "ALL" | "TEAM" | "OWN";
export const projectScopeOf = (ctx: Ctx): ProjectScope => (can(ctx, "projects.records.all") ? "ALL" : can(ctx, "projects.records.team") ? "TEAM" : "OWN");

const deptMemo = new WeakMap<Ctx, Promise<string | null>>();
export function myDepartment(ctx: Ctx) {
  let p = deptMemo.get(ctx);
  if (!p) deptMemo.set(ctx, (p = prisma.user.findUnique({ where: { id: ctx.userId }, select: { departmentId: true } }).then((u) => u?.departmentId ?? null)));
  return p;
}

/** `where` fragment for Project. AND-wrapped on purpose (callers add their own OR clauses). */
export async function projectWhere(ctx: Ctx): Promise<{ AND?: Prisma.ProjectWhereInput[] }> {
  if (projectScopeOf(ctx) === "ALL") return {};
  const ors: Prisma.ProjectWhereInput[] = [{ projectManagerId: ctx.userId }, { createdById: ctx.userId }, { members: { some: { userId: ctx.userId, leftAt: null } } }];
  if (projectScopeOf(ctx) === "TEAM") {
    const dept = await myDepartment(ctx);
    if (dept) ors.push({ departmentId: dept }, { projectManager: { departmentId: dept } });
  }
  if (can(ctx, "crm.opportunities.view") && can(ctx, "crm.clients.view")) ors.push({ type: "CLIENT", client: (await clientWhere(ctx)) as Prisma.ClientWhereInput });
  return { AND: [{ OR: ors }] };
}

export type ProjectAccess = {
  project: Prisma.ProjectGetPayload<{ include: { members: true } }>;
  /** may manage the project (PM, or ALL scope, or TEAM scope over this project) */
  manager: boolean;
  member: { role: string } | null;
};

/** Load a visible project (NOT_FOUND otherwise) and compute the caller's relation to it. */
export async function projectAccess(db: Tx | typeof prisma, ctx: Ctx, projectId: string, opts: { lock?: boolean } = {}): Promise<ProjectAccess> {
  if (opts.lock) await (db as Tx).$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const project = await db.project.findFirst({ where: { id: projectId, organizationId: ctx.organizationId, ...(await projectWhere(ctx)) }, include: { members: true } });
  if (!project) throw notFound("Project");
  const scope = projectScopeOf(ctx);
  let manager = scope === "ALL" || project.projectManagerId === ctx.userId;
  if (!manager && scope === "TEAM") {
    const dept = await myDepartment(ctx);
    if (dept && project.departmentId === dept) manager = true;
    if (dept && !manager && project.projectManagerId) {
      const pm = await db.user.findUnique({ where: { id: project.projectManagerId }, select: { departmentId: true } });
      manager = pm?.departmentId === dept;
    }
  }
  const m = project.members.find((x) => x.userId === ctx.userId && !x.leftAt);
  return { project, manager, member: m ? { role: m.role } : null };
}

/** Permission + "manages this project". */
export async function requireManager(db: Tx | typeof prisma, ctx: Ctx, projectId: string, perm: Permission, opts: { lock?: boolean } = {}) {
  if (!can(ctx, perm)) throw forbidden(perm);
  const a = await projectAccess(db, ctx, projectId, opts);
  if (!a.manager) throw forbidden(`${perm} (project manager only)`);
  return a;
}

/** Permission + manager or active member. */
export async function requireParticipant(db: Tx | typeof prisma, ctx: Ctx, projectId: string, perm: Permission, opts: { lock?: boolean } = {}) {
  if (!can(ctx, perm)) throw forbidden(perm);
  const a = await projectAccess(db, ctx, projectId, opts);
  if (!a.manager && !a.member) throw forbidden(`${perm} (project members only)`);
  return a;
}

/** Commercial visibility is independent of project membership. */
export const canSeeCommercial = (ctx: Ctx) => can(ctx, "sales.contracts.view") || can(ctx, "sales.quotations.view");

export const CLOSED_PROJECT = ["COMPLETED", "CANCELLED", "ARCHIVED"] as const;
export const isClosed = (s: string) => (CLOSED_PROJECT as readonly string[]).includes(s);
