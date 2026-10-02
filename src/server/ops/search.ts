import { prisma } from "../db";
import { can, canAny, type Ctx } from "../context";
import type { SearchHit } from "../crm/search";
import { requestWhere } from "./procurement";
import { poWhere } from "./orders";
import { ticketWhere } from "./support";
import { accessResolver } from "./documents";
import { searchArticles } from "./knowledge";

/** Permission-aware operations search. Documents are filtered through the document access resolver (no leaks). */
export async function opsSearch(ctx: Ctx, term: string): Promise<SearchHit[]> {
  const upper = term.toUpperCase();
  const out: SearchHit[] = [];
  const o = ctx.organizationId;
  const [reqs, pos, tickets] = await Promise.all([
    prisma.procurementRequest.findMany({ where: { AND: [{ organizationId: o }, await requestWhere(ctx), { OR: [{ title: { contains: term, mode: "insensitive" } }, { number: { contains: upper } }] }] }, take: 4, select: { id: true, number: true, title: true, status: true } }),
    canAny(ctx, "procurement.orders.view", "procurement.orders.create", "procurement.requests.create")
      ? prisma.purchaseOrder.findMany({ where: { AND: [{ organizationId: o }, await poWhere(ctx), { OR: [{ number: { contains: upper } }, { vendor: { name: { contains: term, mode: "insensitive" } } }] }] }, take: 4, select: { id: true, number: true, status: true, vendor: { select: { name: true } } } })
      : [],
    canAny(ctx, "support.tickets.view", "support.tickets.create", "support.tickets.manage")
      ? prisma.supportTicket.findMany({ where: { AND: [{ organizationId: o }, await ticketWhere(ctx), { OR: [{ subject: { contains: term, mode: "insensitive" } }, { number: { contains: upper } }] }] }, take: 4, select: { id: true, number: true, subject: true, status: true } })
      : []
  ]);
  out.push(...reqs.map((r) => ({ type: "procurement", id: r.id, title: `${r.number} · ${r.title}`, subtitle: r.status, href: `/app/procurement/${r.id}` })));
  out.push(...pos.map((p) => ({ type: "purchase_order", id: p.id, title: `${p.number} · ${p.vendor.name}`, subtitle: p.status, href: `/app/procurement/orders/${p.id}` })));
  out.push(...tickets.map((t) => ({ type: "ticket", id: t.id, title: `${t.number} · ${t.subject}`, subtitle: t.status, href: `/app/support/tickets/${t.id}` })));
  if (can(ctx, "assets.view")) {
    const assets = await prisma.asset.findMany({ where: { organizationId: o, OR: [{ name: { contains: term, mode: "insensitive" } }, { number: { contains: upper } }, { serialNumber: { contains: term, mode: "insensitive" } }] }, take: 4, select: { id: true, number: true, name: true, status: true } });
    out.push(...assets.map((a) => ({ type: "asset", id: a.id, title: `${a.number} · ${a.name}`, subtitle: a.status, href: `/app/assets/${a.id}` })));
  }
  if (can(ctx, "documents.view")) {
    const docs = await prisma.document.findMany({ where: { organizationId: o, status: { not: "ARCHIVED" }, OR: [{ title: { contains: term, mode: "insensitive" } }, { number: { contains: upper } }, { tags: { has: term.toLowerCase() } }] }, take: 20 });
    const r = accessResolver(ctx);
    let n = 0;
    for (const d of docs) {
      if (n >= 4) break;
      if (!(await r.doc(d)).view) continue;
      out.push({ type: "document", id: d.id, title: `${d.number} · ${d.title}`, subtitle: d.classification, href: `/app/documents/${d.id}` });
      n++;
    }
  }
  if (can(ctx, "knowledge.view")) {
    const { published } = await searchArticles(ctx, { q: term });
    out.push(...published.slice(0, 4).map((a) => ({ type: "article", id: a.id, title: `${a.number} · ${a.publishedVersion?.titleEn ?? a.titleEn}`, subtitle: a.publishedVersion?.titleAr ?? undefined, href: `/app/knowledge/${a.id}` })));
  }
  return out;
}
