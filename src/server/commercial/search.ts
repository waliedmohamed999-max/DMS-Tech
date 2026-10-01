import { prisma } from "../db";
import { can, type Ctx } from "../context";
import { ownedWhere } from "../crm/scope";
import type { SearchHit } from "../crm/search";

/** Permission- and scope-aware search over services, quotations and contracts. */
export async function commercialSearch(ctx: Ctx, term: string): Promise<SearchHit[]> {
  const out: SearchHit[] = [];
  const upper = term.toUpperCase();
  const scope = await ownedWhere(ctx);
  await Promise.all([
    (async () => {
      if (!can(ctx, "services.view")) return;
      const rows = await prisma.service.findMany({
        where: { organizationId: ctx.organizationId, OR: [{ nameAr: { contains: term } }, { nameEn: { contains: term, mode: "insensitive" } }, { code: { contains: upper } }] },
        take: 4,
        select: { id: true, code: true, nameAr: true, nameEn: true, active: true }
      });
      out.push(...rows.map((s) => ({ type: "service", id: s.id, title: s.nameEn === s.nameAr ? s.nameEn : `${s.nameAr} · ${s.nameEn}`, subtitle: s.code, href: `/app/sales/services?focus=${s.id}` })));
    })(),
    (async () => {
      if (!can(ctx, "sales.quotations.view")) return;
      const rows = await prisma.quotation.findMany({
        where: { organizationId: ctx.organizationId, ...scope, OR: [{ number: { contains: upper } }, { client: { displayName: { contains: term, mode: "insensitive" } } }] },
        take: 5,
        orderBy: { updatedAt: "desc" },
        select: { id: true, number: true, client: { select: { displayName: true } }, currentVersion: { select: { versionNumber: true } } }
      });
      out.push(...rows.map((q) => ({ type: "quotation", id: q.id, title: `${q.number} V${q.currentVersion?.versionNumber ?? 1}`, subtitle: q.client.displayName, href: `/app/sales/quotations/${q.id}` })));
    })(),
    (async () => {
      if (!can(ctx, "sales.contracts.view")) return;
      const rows = await prisma.contract.findMany({
        where: { organizationId: ctx.organizationId, ...scope, OR: [{ number: { contains: upper } }, { title: { contains: term, mode: "insensitive" } }, { client: { displayName: { contains: term, mode: "insensitive" } } }] },
        take: 4,
        select: { id: true, number: true, title: true, client: { select: { displayName: true } } }
      });
      out.push(...rows.map((c) => ({ type: "contract", id: c.id, title: `${c.number} · ${c.title}`, subtitle: c.client.displayName, href: `/app/sales/contracts/${c.id}` })));
    })()
  ]);
  return out;
}
