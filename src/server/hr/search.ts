import { prisma } from "../db";
import { can, type Ctx } from "../context";
import type { SearchHit } from "../crm/search";
import { employeeWhere } from "./access";

/** Employees (directory scope, names / numbers / job titles only), candidates and jobs (hr.recruitment.view). */
export async function hrSearch(ctx: Ctx, term: string): Promise<SearchHit[]> {
  const upper = term.toUpperCase();
  const out: SearchHit[] = [];
  const emps = await prisma.employee.findMany({
    where: { AND: [{ organizationId: ctx.organizationId }, await employeeWhere(ctx), { OR: [{ displayName: { contains: term, mode: "insensitive" } }, { nameAr: { contains: term } }, { number: { contains: upper } }, { jobTitle: { contains: term, mode: "insensitive" } }] }] },
    take: 5,
    select: { id: true, number: true, displayName: true, jobTitle: true }
  });
  out.push(...emps.map((e) => ({ type: "employee", id: e.id, title: `${e.number} · ${e.displayName}`, subtitle: e.jobTitle ?? undefined, href: `/app/hr/employees/${e.id}` })));
  if (can(ctx, "hr.recruitment.view")) {
    const [cands, jobs] = await Promise.all([
      prisma.candidate.findMany({ where: { organizationId: ctx.organizationId, archivedAt: null, OR: [{ firstName: { contains: term, mode: "insensitive" } }, { lastName: { contains: term, mode: "insensitive" } }, { number: { contains: upper } }] }, take: 4, select: { id: true, number: true, firstName: true, lastName: true } }),
      prisma.jobOpening.findMany({ where: { organizationId: ctx.organizationId, OR: [{ title: { contains: term, mode: "insensitive" } }, { number: { contains: upper } }] }, take: 3, select: { id: true, number: true, title: true, status: true } })
    ]);
    out.push(...cands.map((c) => ({ type: "candidate", id: c.id, title: `${c.number} · ${c.firstName} ${c.lastName}`, href: `/app/hr/recruitment/candidates/${c.id}` })));
    out.push(...jobs.map((j) => ({ type: "job", id: j.id, title: `${j.number} · ${j.title}`, subtitle: j.status, href: `/app/hr/recruitment/jobs/${j.id}` })));
  }
  return out;
}
