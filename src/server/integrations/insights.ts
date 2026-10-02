import { prisma } from "../db";
import { can, type Ctx } from "../context";
import type { SearchHit } from "../crm/search";

/** Home "needs attention" items for Phase 8 — each gated by permission, counts of real rows only. */
export type IntegrationAttention = { id: string; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; category: string; title: string; dueAt?: Date | null; href: string };

export async function integrationsAttention(ctx: Ctx): Promise<IntegrationAttention[]> {
  const out: IntegrationAttention[] = [];
  const o = ctx.organizationId;
  if (can(ctx, "integrations.manage")) {
    const bad = await prisma.integrationConnection.findMany({ where: { organizationId: o, status: { in: ["ERROR", "DEGRADED"] } }, take: 5 });
    for (const c of bad) out.push({ id: `int-${c.id}`, priority: c.status === "ERROR" ? "HIGH" : "MEDIUM", category: "integration_error", title: `${c.provider} · ${c.lastErrorCode ?? c.status}`, dueAt: c.lastFailureAt, href: "/app/integrations" });
  }
  if (can(ctx, "integrations.logs.view")) {
    const dead = await prisma.integrationOutbox.count({ where: { organizationId: o, status: "DEAD_LETTER" } });
    if (dead) out.push({ id: "int-dead", priority: "HIGH", category: "dead_letter", title: String(dead), href: "/app/integrations/logs?view=dead" });
  }
  if (can(ctx, "whatsapp.send")) {
    const convs = await prisma.whatsAppConversation.findMany({ where: { organizationId: o, matchState: { in: ["UNMATCHED", "AMBIGUOUS"] }, leadId: null, ticketId: null, lastInboundAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, orderBy: { lastInboundAt: "desc" }, take: 5 });
    for (const c of convs) out.push({ id: `wa-${c.id}`, priority: "MEDIUM", category: "wa_unmatched", title: c.profileName ?? `+${c.waId}`, dueAt: c.lastInboundAt, href: `/app/whatsapp/${c.id}` });
  }
  if (can(ctx, "marketing.manage") || can(ctx, "whatsapp.campaigns.create")) {
    const camps = await prisma.marketingCampaign.findMany({ where: { organizationId: o, OR: [{ status: "READY" }, { status: "FAILED", failedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }] }, take: 5 });
    for (const c of camps) out.push({ id: `cmp-${c.id}`, priority: c.status === "FAILED" ? "HIGH" : "LOW", category: c.status === "FAILED" ? "campaign_failed" : "campaign_ready", title: `${c.number} · ${c.name}`, dueAt: c.startDate, href: `/app/marketing/campaigns/${c.id}` });
  }
  return out;
}

export async function integrationsSearch(ctx: Ctx, term: string): Promise<SearchHit[]> {
  const out: SearchHit[] = [];
  const o = ctx.organizationId;
  if (can(ctx, "marketing.view")) {
    const rows = await prisma.marketingCampaign.findMany({ where: { organizationId: o, OR: [{ name: { contains: term, mode: "insensitive" } }, { number: { contains: term.toUpperCase() } }, { utmCampaign: { contains: term, mode: "insensitive" } }] }, take: 4, select: { id: true, number: true, name: true, status: true } });
    out.push(...rows.map((c) => ({ type: "campaign", id: c.id, title: `${c.number} · ${c.name}`, subtitle: c.status, href: `/app/marketing/campaigns/${c.id}` })));
  }
  if (can(ctx, "whatsapp.view")) {
    const digits = term.replace(/\D/g, "");
    const rows = await prisma.whatsAppConversation.findMany({ where: { organizationId: o, OR: [{ profileName: { contains: term, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ waId: { contains: digits } }] : [])] }, take: 4, select: { id: true, waId: true, profileName: true, matchState: true } });
    out.push(...rows.map((c) => ({ type: "conversation", id: c.id, title: c.profileName ?? `+${c.waId}`, subtitle: c.matchState, href: `/app/whatsapp/${c.id}` })));
  }
  return out;
}
