import { prisma } from "../db";
import { can, type Ctx } from "../context";
import { normPhone } from "./normalize";
import { clientWhere, ownedWhere, scopeOf } from "./scope";

export type SearchHit = { type: string; id: string; title: string; subtitle?: string; href: string };

/** CRM part of the global (Ctrl+K) search. Each entity is permission- AND scope-filtered. */
export async function crmSearch(ctx: Ctx, term: string): Promise<SearchHit[]> {
  const phone = normPhone(term);
  const upper = term.toUpperCase();
  const out: SearchHit[] = [];
  const org = { organizationId: ctx.organizationId };

  const tasks: Promise<void>[] = [];
  if (can(ctx, "crm.leads.view"))
    tasks.push(
      (async () => {
        const rows = await prisma.lead.findMany({
          where: {
            ...org,
            ...(await ownedWhere(ctx)),
            status: { not: "ARCHIVED" },
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { companyName: { contains: term, mode: "insensitive" } },
              { email: { contains: term, mode: "insensitive" } },
              { number: { contains: upper } },
              ...(phone ? [{ phoneNormalized: { contains: phone } }, { whatsappNormalized: { contains: phone } }] : [])
            ]
          },
          take: 5,
          select: { id: true, number: true, name: true, companyName: true }
        });
        out.push(...rows.map((r) => ({ type: "lead", id: r.id, title: r.name, subtitle: [r.number, r.companyName].filter(Boolean).join(" · "), href: `/app/crm/leads/${r.id}` })));
      })()
    );
  if (can(ctx, "crm.opportunities.view"))
    tasks.push(
      (async () => {
        const rows = await prisma.opportunity.findMany({
          where: { ...org, ...(await ownedWhere(ctx)), OR: [{ title: { contains: term, mode: "insensitive" } }, { number: { contains: upper } }] },
          take: 5,
          select: { id: true, number: true, title: true, client: { select: { displayName: true } } }
        });
        out.push(...rows.map((r) => ({ type: "opportunity", id: r.id, title: r.title, subtitle: `${r.number} · ${r.client.displayName}`, href: `/app/crm/opportunities/${r.id}` })));
      })()
    );
  if (can(ctx, "crm.clients.view"))
    tasks.push(
      (async () => {
        const rows = await prisma.client.findMany({
          where: {
            ...org,
            deletedAt: null,
            ...(await clientWhere(ctx)),
            OR: [
              { displayName: { contains: term, mode: "insensitive" } },
              { nameAr: { contains: term } },
              { email: { contains: term, mode: "insensitive" } },
              { number: { contains: upper } },
              ...(phone ? [{ phoneNormalized: { contains: phone } }] : [])
            ]
          },
          take: 5,
          select: { id: true, number: true, displayName: true }
        });
        out.push(...rows.map((r) => ({ type: "client", id: r.id, title: r.displayName, subtitle: r.number, href: `/app/crm/clients/${r.id}` })));
      })()
    );
  if (can(ctx, "crm.contacts.view"))
    tasks.push(
      (async () => {
        const cw = await clientWhere(ctx);
        const rows = await prisma.contact.findMany({
          where: {
            ...org,
            deletedAt: null,
            ...(scopeOf(ctx) === "ALL" ? {} : { OR: [{ client: cw }, { clientId: null, createdById: ctx.userId }] }),
            AND: [
              {
                OR: [
                  { firstName: { contains: term, mode: "insensitive" } },
                  { lastName: { contains: term, mode: "insensitive" } },
                  { email: { contains: term, mode: "insensitive" } },
                  ...(phone ? [{ phoneNormalized: { contains: phone } }] : [])
                ]
              }
            ]
          },
          take: 5,
          select: { id: true, firstName: true, lastName: true, clientId: true, client: { select: { displayName: true } } }
        });
        out.push(
          ...rows.map((r) => ({
            type: "contact",
            id: r.id,
            title: `${r.firstName} ${r.lastName ?? ""}`.trim(),
            subtitle: r.client?.displayName,
            href: r.clientId ? `/app/crm/clients/${r.clientId}?tab=contacts` : "/app/crm/contacts"
          }))
        );
      })()
    );
  await Promise.all(tasks);
  return out;
}
