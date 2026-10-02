import { prisma } from "../db";
import { can, canAny, type Ctx } from "../context";
import { addDays, todayIn } from "../commercial/dates";
import { requestWhere } from "./procurement";
import { poWhere } from "./orders";
import { OPEN_TICKET, ticketWhere } from "./support";
import { listDocuments } from "./documents";
import { terminatedWithAssets } from "./assets";

/** Operations dashboard + Command Center attention — real counts, each gated by the matching permission (null = not shown). */

export async function opsDashboard(ctx: Ctx) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });
  const today = todayIn(org.timezone);
  const now = new Date();
  const o = ctx.organizationId;
  const procurement = canAny(ctx, "procurement.requests.view", "procurement.requests.approve", "procurement.requests.create");
  const orders = can(ctx, "procurement.orders.view");
  const assets = can(ctx, "assets.view");
  const support = canAny(ctx, "support.tickets.view", "support.tickets.manage");
  const tw = support ? await ticketWhere(ctx) : null;
  const openT = tw ? { AND: [{ organizationId: o, status: { in: OPEN_TICKET } }, tw] } : null;
  const [pendingRequests, posAwaiting, posLate, assigned, maintenance, unreturned, openTickets, urgentTickets, slaBreaches, kbReview, recentDocs] = await Promise.all([
    procurement ? prisma.procurementRequest.count({ where: { AND: [{ organizationId: o, status: "PENDING_APPROVAL" }, await requestWhere(ctx)] } }) : null,
    orders ? prisma.purchaseOrder.count({ where: { AND: [{ organizationId: o, status: "PENDING_APPROVAL" }, await poWhere(ctx)] } }) : null,
    orders ? prisma.purchaseOrder.count({ where: { organizationId: o, status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] }, expectedDeliveryDate: { lt: today } } }) : null,
    assets ? prisma.asset.count({ where: { organizationId: o, status: "ASSIGNED" } }) : null,
    assets ? prisma.asset.count({ where: { organizationId: o, status: "MAINTENANCE" } }) : null,
    assets ? terminatedWithAssets(o).then((x) => x.length) : null,
    openT ? prisma.supportTicket.count({ where: openT }) : null,
    openT ? prisma.supportTicket.count({ where: { AND: [openT, { priority: "URGENT" }] } }) : null,
    openT ? prisma.supportTicket.count({ where: { AND: [openT, { OR: [{ slaBreachedAt: { not: null } }, { responseBreachedAt: { not: null } }, { resolutionDueAt: { lt: now }, pausedAt: null }] }] } }) : null,
    canAny(ctx, "knowledge.review", "knowledge.publish") ? prisma.knowledgeArticle.count({ where: { organizationId: o, status: "REVIEW" } }) : null,
    can(ctx, "documents.view") ? listDocuments(ctx, {}).then((d) => d.filter((x) => x.updatedAt >= addDays(today, -7))) : null
  ]);
  return { today, pendingRequests, posAwaiting, posLate, assigned, maintenance, unreturned, openTickets, urgentTickets, slaBreaches, kbReview, recentDocs };
}

export type OpsAttention = { id: string; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; category: string; title: string; dueAt?: Date | null; href: string };

export async function opsAttention(ctx: Ctx): Promise<OpsAttention[]> {
  const out: OpsAttention[] = [];
  const o = ctx.organizationId;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: o }, select: { timezone: true } });
  const today = todayIn(org.timezone);
  const now = new Date();
  if (can(ctx, "procurement.orders.view")) {
    const late = await prisma.purchaseOrder.findMany({ where: { organizationId: o, status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] }, expectedDeliveryDate: { lt: today } }, take: 5, orderBy: { expectedDeliveryDate: "asc" }, include: { vendor: { select: { name: true } } } });
    for (const p of late) out.push({ id: `po-${p.id}`, priority: "HIGH", category: "po_overdue", title: `${p.number} · ${p.vendor.name}`, dueAt: p.expectedDeliveryDate, href: `/app/procurement/orders/${p.id}` });
  }
  if (can(ctx, "assets.view")) {
    const cats = await prisma.assetCategory.findMany({ where: { organizationId: o }, select: { id: true, warrantyAlertDays: true } });
    for (const c of cats) {
      const soon = await prisma.asset.findMany({ where: { organizationId: o, categoryId: c.id, archivedAt: null, status: { notIn: ["RETIRED", "DISPOSED", "LOST"] }, warrantyEndDate: { gte: today, lte: addDays(today, c.warrantyAlertDays) } }, take: 3 });
      for (const a of soon) out.push({ id: `wty-${a.id}`, priority: "MEDIUM", category: "warranty_expiring", title: `${a.number} · ${a.name}`, dueAt: a.warrantyEndDate, href: `/app/assets/${a.id}` });
    }
  }
  if (can(ctx, "assets.assign")) {
    for (const x of (await terminatedWithAssets(o)).slice(0, 5)) out.push({ id: `off-${x.id}`, priority: "HIGH", category: "terminated_with_asset", title: `${x.employee.number} · ${x.employee.displayName} — ${x.asset.number}`, dueAt: x.employee.terminationDate, href: `/app/assets/${x.asset.id}` });
  }
  if (canAny(ctx, "support.tickets.view", "support.tickets.manage")) {
    const mine = can(ctx, "support.tickets.manage") ? {} : { assignedToId: ctx.userId };
    const tickets = await prisma.supportTicket.findMany({
      where: { AND: [{ organizationId: o, status: { in: OPEN_TICKET } }, await ticketWhere(ctx), { OR: [{ priority: "URGENT", assignedToId: null }, { ...mine, OR: [{ slaBreachedAt: { not: null } }, { responseBreachedAt: { not: null } }, { slaWarnedAt: { not: null } }, { responseWarnedAt: { not: null } }, { resolutionDueAt: { lt: now } }] }] }] },
      take: 8, orderBy: { resolutionDueAt: "asc" }
    });
    for (const t of tickets) {
      const breached = Boolean(t.slaBreachedAt || t.responseBreachedAt || (t.resolutionDueAt && t.resolutionDueAt < now && !t.pausedAt));
      const category = breached ? "sla_breached" : t.slaWarnedAt || t.responseWarnedAt ? "sla_warning" : "critical_ticket";
      out.push({ id: `tck-${t.id}`, priority: breached || t.priority === "URGENT" ? "URGENT" : "HIGH", category, title: `${t.number} · ${t.subject}`, dueAt: t.resolutionDueAt, href: `/app/support/tickets/${t.id}` });
    }
  }
  const docs = await prisma.document.findMany({ where: { organizationId: o, status: "IN_REVIEW", reviewerId: ctx.userId }, take: 5 });
  for (const d of docs) out.push({ id: `doc-${d.id}`, priority: "MEDIUM", category: "document_review", title: `${d.number} · ${d.title}`, dueAt: null, href: `/app/documents/${d.id}` });
  if (canAny(ctx, "knowledge.review", "knowledge.publish")) {
    const kb = await prisma.knowledgeArticle.findMany({ where: { organizationId: o, status: "REVIEW", authorId: { not: ctx.userId } }, take: 5 });
    for (const a of kb) out.push({ id: `kb-${a.id}`, priority: "LOW", category: "knowledge_review", title: `${a.number} · ${a.titleEn}`, dueAt: null, href: `/app/knowledge/${a.id}` });
  }
  return out;
}
