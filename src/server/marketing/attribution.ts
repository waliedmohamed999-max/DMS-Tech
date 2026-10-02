import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import type { Uow } from "../events/bus";

/**
 * Deterministic attribution (docs/MARKETING.md#attribution).
 * Every lead has exactly ONE first touch (partial unique index) that is never updated or deleted (trigger);
 * later contacts (website resubmissions, campaign replies) are appended as TOUCH rows — last touch = latest row.
 * A touch is linked to a campaign only by an exact UTM campaign match or an explicit WhatsApp campaign reply.
 */

export type TouchInput = { source: string; medium?: string | null; utmCampaign?: string | null; utmContent?: string | null; utmTerm?: string | null; referrer?: string | null; landingPage?: string | null; campaignId?: string | null; occurredAt?: Date };

export async function campaignByUtm(db: Tx | typeof prisma, organizationId: string, utmCampaign?: string | null) {
  if (!utmCampaign) return null;
  const c = await db.marketingCampaign.findFirst({ where: { organizationId, utmCampaign: { equals: utmCampaign, mode: "insensitive" } }, orderBy: { createdAt: "desc" }, select: { id: true } });
  return c?.id ?? null;
}

/** From Phase 2 website capture metadata (utm_*, referrer, page). */
export function touchFromCapture(source: string, captureMeta: unknown): TouchInput {
  const m = (captureMeta ?? {}) as { utm?: Record<string, string>; referrer?: string | null; page?: string | null };
  const u = m.utm ?? {};
  return { source: u.utm_source || source.toLowerCase(), medium: u.utm_medium ?? null, utmCampaign: u.utm_campaign ?? null, utmContent: u.utm_content ?? null, utmTerm: u.utm_term ?? null, referrer: m.referrer ?? null, landingPage: m.page ?? null };
}

async function write(tx: Tx, uow: Uow | null, organizationId: string, leadId: string, touchType: "FIRST" | "TOUCH", t: TouchInput) {
  const campaignId = t.campaignId ?? (await campaignByUtm(tx, organizationId, t.utmCampaign));
  await tx.attributionTouch.create({
    data: { organizationId, leadId, touchType, source: t.source.slice(0, 80), medium: t.medium ?? null, utmCampaign: t.utmCampaign ?? null, utmContent: t.utmContent ?? null, utmTerm: t.utmTerm ?? null, referrer: t.referrer?.slice(0, 300) ?? null, landingPage: t.landingPage?.slice(0, 300) ?? null, campaignId, occurredAt: t.occurredAt ?? new Date() }
  });
  if (campaignId) uow?.emit({ type: "marketing.lead_attributed", entityType: "Lead", entityId: leadId, payload: { leadId, campaignId, touchType } });
}

/** First touch at lead creation (idempotent: a second call is ignored, the original source is preserved). */
export async function recordFirstTouch(tx: Tx, uow: Uow | null, organizationId: string, leadId: string, t: TouchInput) {
  if (await tx.attributionTouch.findFirst({ where: { leadId, touchType: "FIRST" }, select: { id: true } })) return;
  await write(tx, uow, organizationId, leadId, "FIRST", t);
}

export const recordTouch = (tx: Tx, uow: Uow | null, organizationId: string, leadId: string, t: TouchInput) => write(tx, uow, organizationId, leadId, "TOUCH", t);

export type AttributionModel = "first" | "last";

/**
 * Funnel per campaign, traceable chain only:
 *   lead (touch) → qualified / converted → opportunity (Opportunity.sourceLeadId) → won → quotations → contracts
 *   → invoices issued (billed) → payment allocations (collected).
 * "Billed" and "collected" are separate figures; nothing here is called revenue.
 */
export async function campaignFunnel(organizationId: string, campaignIds: string[], model: AttributionModel = "first") {
  const touches = await prisma.attributionTouch.findMany({ where: { organizationId, ...(model === "first" ? { touchType: "FIRST", campaignId: { in: campaignIds } } : {}) }, orderBy: { occurredAt: "asc" }, select: { leadId: true, campaignId: true, touchType: true, occurredAt: true } });
  // last-touch: the latest touch of each lead decides
  const byLead = new Map<string, string | null>();
  for (const t of touches) {
    if (model === "first") byLead.set(t.leadId, t.campaignId);
    else byLead.set(t.leadId, t.campaignId);
  }
  const leadsOf = new Map<string, string[]>();
  for (const [lead, cid] of byLead) if (cid && campaignIds.includes(cid)) leadsOf.set(cid, [...(leadsOf.get(cid) ?? []), lead]);
  const out: Record<string, { leads: number; qualified: number; opportunities: number; won: number; billed: string; collected: string; currency: string }> = {};
  for (const cid of campaignIds) {
    const ids = leadsOf.get(cid) ?? [];
    if (!ids.length) {
      out[cid] = { leads: 0, qualified: 0, opportunities: 0, won: 0, billed: "0.00", collected: "0.00", currency: "SAR" };
      continue;
    }
    const leads = await prisma.lead.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, opportunity: { select: { id: true, status: true } } } });
    const opps = leads.map((l) => l.opportunity).filter(Boolean) as { id: string; status: string }[];
    const oppIds = opps.map((o) => o.id);
    // invoices traceable to these opportunities: via quotation.opportunityId or contract → quotation.opportunityId
    const invoiceWhere: Prisma.InvoiceWhereInput = {
      organizationId, status: { in: ["ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
      OR: [{ quotation: { opportunityId: { in: oppIds } } }, { contract: { quotation: { opportunityId: { in: oppIds } } } }]
    };
    const [billed, collected] = oppIds.length
      ? await Promise.all([
          prisma.invoice.aggregate({ where: invoiceWhere, _sum: { total: true } }),
          prisma.paymentAllocation.aggregate({ where: { invoice: invoiceWhere, payment: { reversedAt: null } }, _sum: { amount: true } })
        ])
      : [{ _sum: { total: null } }, { _sum: { amount: null } }];
    out[cid] = {
      leads: ids.length,
      qualified: leads.filter((l) => l.status === "QUALIFIED" || l.status === "CONVERTED").length,
      opportunities: opps.length,
      won: opps.filter((o) => o.status === "WON").length,
      billed: (billed._sum.total ?? 0).toFixed(2),
      collected: ((collected as { _sum: { amount: { toFixed(n: number): string } | null } })._sum.amount ?? 0).toFixed(2),
      currency: "SAR"
    };
  }
  return out;
}
