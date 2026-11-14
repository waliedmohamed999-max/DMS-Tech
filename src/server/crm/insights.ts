import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { uncontactedLeads } from "./response";
import { ownedWhere } from "./scope";
import { followUpWindow } from "./leads";
import { orgMonthOf } from "../kpi/period";

/**
 * CRM aggregates for /app/crm, the Command Center and follow-ups.
 * All numbers come from SQL aggregation over scope-filtered rows. Money is summed in
 * the database (Decimal) and returned as strings. Values are reported in SAR; rows
 * in other currencies are excluded from money totals and counted separately.
 */

export const STALLED_DAYS = 14;
export const QUIET_DAYS = 7;

// one computation per request context (several Command Center KPI providers share it)
const kpiMemo = new WeakMap<Ctx, { at: number | null; p: ReturnType<typeof computeKpis> }>();
export function crmKpis(ctx: Ctx, now?: Date) {
  const at = now ? now.getTime() : null;
  const hit = kpiMemo.get(ctx);
  if (hit && hit.at === at) return hit.p;
  const p = computeKpis(ctx, now ?? new Date());
  kpiMemo.set(ctx, { at, p });
  return p;
}

const SIGNED_CONTRACT = ["ACTIVE", "EXPIRING", "EXPIRED"] as const;
export type WonValue = { total: string; count: number; bySource: { quotation: number; contract: number; estimate: number } };

/**
 * Value of won opportunities, net of VAT, from the most binding figure each one has:
 *   1. its accepted quotation(s) — accepted version subtotal − discount;
 *   2. else its signed contract(s) (ACTIVE / EXPIRING / EXPIRED) — subtotal − discount;
 *   3. else the salesperson's `estimatedValue`.
 * A document in a different currency than the opportunity is ignored (no FX), so the row falls
 * through to the next source. `bySource` says how many opportunities used each, so the figure can
 * be labelled honestly ("n of m are still estimates").
 */
export async function wonValueOf(opps: { id: string; estimatedValue: { toString(): string }; currency: string }[]): Promise<{ byId: Map<string, { value: Prisma.Decimal; source: keyof WonValue["bySource"] }> } & WonValue> {
  const ids = opps.map((o) => o.id);
  const [quotes, contracts] = ids.length
    ? await Promise.all([
        prisma.quotation.findMany({ where: { opportunityId: { in: ids }, status: "ACCEPTED", acceptedVersionId: { not: null } }, select: { opportunityId: true, acceptedVersionId: true } }),
        prisma.contract.findMany({ where: { opportunityId: { in: ids }, status: { in: [...SIGNED_CONTRACT] } }, select: { opportunityId: true, subtotal: true, discountTotal: true, currency: true } })
      ])
    : [[], []];
  const versions = quotes.length
    ? await prisma.quotationVersion.findMany({ where: { id: { in: quotes.map((q) => q.acceptedVersionId!) } }, select: { id: true, subtotal: true, discountTotal: true, currency: true } })
    : [];
  const versionOf = new Map(versions.map((v) => [v.id, v]));
  const zero = new Prisma.Decimal(0);
  const byId = new Map<string, { value: Prisma.Decimal; source: keyof WonValue["bySource"] }>();
  const bySource = { quotation: 0, contract: 0, estimate: 0 };
  let total = zero;
  for (const o of opps) {
    const net = (rows: { subtotal: Prisma.Decimal; discountTotal: Prisma.Decimal; currency: string }[]) => {
      const same = rows.filter((r) => r.currency === o.currency);
      return same.length ? same.reduce((s, r) => s.plus(r.subtotal).minus(r.discountTotal), zero) : null;
    };
    const fromQuotes = net(quotes.filter((q) => q.opportunityId === o.id).flatMap((q) => versionOf.get(q.acceptedVersionId!) ?? []));
    const fromContracts = fromQuotes ? null : net(contracts.filter((c) => c.opportunityId === o.id));
    const picked = fromQuotes ? { value: fromQuotes, source: "quotation" as const } : fromContracts ? { value: fromContracts, source: "contract" as const } : { value: new Prisma.Decimal(o.estimatedValue.toString()), source: "estimate" as const };
    byId.set(o.id, picked);
    bySource[picked.source]++;
    total = total.plus(picked.value);
  }
  return { byId, total: total.toFixed(2), count: opps.length, bySource };
}

const wonIn = async (where: Prisma.OpportunityWhereInput) => wonValueOf(await prisma.opportunity.findMany({ where, select: { id: true, estimatedValue: true, currency: true } }));

async function computeKpis(ctx: Ctx, now: Date) {
  const leadsOk = can(ctx, "crm.leads.view");
  const oppsOk = can(ctx, "crm.opportunities.view");
  const scope = await ownedWhere(ctx);
  // month bounds in the organization's timezone (shared with the dashboard and finance KPIs)
  const month = await orgMonthOf(ctx.organizationId, now);
  const org = { organizationId: ctx.organizationId };
  const [activeLeads, openOpps, pipeline, won, wonPrev, overdueLeads, overdueOpps] = await Promise.all([
    leadsOk ? prisma.lead.count({ where: { ...org, ...scope, status: { in: ["OPEN", "QUALIFIED"] } } }) : null,
    oppsOk ? prisma.opportunity.count({ where: { ...org, ...scope, status: "OPEN" } }) : null,
    oppsOk ? prisma.opportunity.aggregate({ where: { ...org, ...scope, status: "OPEN", currency: "SAR" }, _sum: { estimatedValue: true } }) : null,
    oppsOk ? wonIn({ ...org, ...scope, status: "WON", currency: "SAR", wonAt: { gte: month.from, lte: month.to } }) : null,
    oppsOk ? wonIn({ ...org, ...scope, status: "WON", currency: "SAR", wonAt: { gte: month.prevFrom, lte: month.prevTo } }) : null,
    leadsOk ? prisma.lead.count({ where: { ...org, ...scope, status: { in: ["OPEN", "QUALIFIED"] }, nextFollowUpAt: { lt: now } } }) : null,
    oppsOk ? prisma.opportunity.count({ where: { ...org, ...scope, status: "OPEN", nextFollowUpAt: { lt: now } } }) : null
  ]);
  return {
    activeLeads,
    openOpps,
    pipelineValue: pipeline?._sum.estimatedValue?.toString() ?? (oppsOk ? "0" : null),
    /** Net of VAT: accepted quotation, else signed contract, else the estimate (see wonValueOf). */
    wonThisMonth: won ? won.total : null,
    wonThisMonthCount: won?.count ?? null,
    /** How many of this month's won opportunities are valued from each source. */
    wonThisMonthSources: won?.bySource ?? null,
    wonPrevPeriod: wonPrev ? wonPrev.total : null,
    overdueFollowUps: leadsOk || oppsOk ? (overdueLeads ?? 0) + (overdueOpps ?? 0) : null
  };
}

/** /app/crm overview (period = last N days). */
export async function crmOverview(ctx: Ctx, days = 30) {
  requirePermission(ctx, "crm.leads.view");
  const scope = await ownedWhere(ctx);
  const since = new Date(Date.now() - days * 86400000);
  const org = { organizationId: ctx.organizationId };
  const inRange: Prisma.LeadWhereInput = { ...org, ...scope, createdAt: { gte: since } };
  const oppsOk = can(ctx, "crm.opportunities.view");

  const [newLeads, qualified, converted, lost, bySource, byStage, valueByStage, wonAgg, kpis] = await Promise.all([
    prisma.lead.count({ where: inRange }),
    prisma.lead.count({ where: { ...inRange, status: { in: ["QUALIFIED", "CONVERTED"] } } }),
    prisma.lead.count({ where: { ...inRange, status: "CONVERTED" } }),
    prisma.lead.count({ where: { ...inRange, status: "LOST" } }),
    prisma.lead.groupBy({ by: ["source"], where: inRange, _count: { _all: true }, orderBy: { _count: { source: "desc" } } }),
    oppsOk ? prisma.opportunity.groupBy({ by: ["stageId"], where: { ...org, ...scope, status: "OPEN" }, _count: { _all: true } }) : Promise.resolve([]),
    // value totals are SAR-only (no FX conversion in Phase 2 — see docs/CRM.md)
    oppsOk ? prisma.opportunity.groupBy({ by: ["stageId"], where: { ...org, ...scope, status: "OPEN", currency: "SAR" }, _sum: { estimatedValue: true } }) : Promise.resolve([]),
    oppsOk ? wonIn({ ...org, ...scope, status: "WON", currency: "SAR", wonAt: { gte: since } }) : Promise.resolve(null),
    crmKpis(ctx)
  ]);
  const stages = await prisma.pipelineStage.findMany({ where: { pipeline: { organizationId: ctx.organizationId, isDefault: true }, active: true }, orderBy: { position: "asc" } });
  return {
    days,
    newLeads,
    qualified,
    converted,
    lost,
    /** converted ÷ leads created in the period (0 when none) */
    conversionRate: newLeads ? Math.round((converted / newLeads) * 1000) / 10 : 0,
    bySource: bySource.map((s) => ({ source: s.source, count: s._count._all })),
    byStage: stages
      .filter((s) => !s.isWonStage && !s.isLostStage)
      .map((s) => {
        const g = byStage.find((x) => x.stageId === s.id);
        const v = valueByStage.find((x) => x.stageId === s.id);
        return { stageId: s.id, key: s.key, nameAr: s.nameAr, nameEn: s.nameEn, colorToken: s.colorToken, count: g?._count._all ?? 0, value: v?._sum.estimatedValue?.toString() ?? "0" };
      }),
    /** net of VAT — accepted quotation / signed contract where one exists, else the estimate */
    wonValue: wonAgg?.total ?? "0",
    wonCount: wonAgg?.count ?? 0,
    wonSources: wonAgg?.bySource ?? { quotation: 0, contract: 0, estimate: 0 },
    kpis
  };
}

export type CampaignRow = { key: string; label: string; leads: number; qualified: number; won: number; revenue: string };
type Capture = { offer?: { key?: string; label?: string } | null; utm?: Record<string, string> | null; referrer?: string | null } | null;

/**
 * Website leads by offer and by ad campaign (utm / click id captured on the site), with how many were qualified, won
 * and the won value (SAR, net: accepted quotation / signed contract, else the estimate) of the opportunity each converted into — so ad spend can be judged by real outcomes.
 */
export async function campaignReport(ctx: Ctx, days = 90) {
  requirePermission(ctx, "crm.leads.view");
  const scope = await ownedWhere(ctx);
  const since = new Date(Date.now() - days * 86400000);
  const leads = await prisma.lead.findMany({
    where: { organizationId: ctx.organizationId, ...scope, source: "WEBSITE", createdAt: { gte: since } },
    select: { id: true, status: true, captureMeta: true }
  });
  const opps = can(ctx, "crm.opportunities.view") && leads.length
    ? await prisma.opportunity.findMany({ where: { organizationId: ctx.organizationId, sourceLeadId: { in: leads.map((l) => l.id) } }, select: { id: true, sourceLeadId: true, status: true, estimatedValue: true, currency: true } })
    : [];
  const oppOf = new Map(opps.map((o) => [o.sourceLeadId, o]));
  // same won-value rule as the KPIs: accepted quotation / signed contract (net) before the estimate
  const wonValues = (await wonValueOf(opps.filter((o) => o.status === "WON" && o.currency === "SAR"))).byId;

  const group = (keyOf: (m: Capture) => { key: string; label: string }) => {
    const rows = new Map<string, { label: string; leads: number; qualified: number; won: number; revenue: Prisma.Decimal | number }>();
    for (const l of leads) {
      const { key, label } = keyOf(l.captureMeta as Capture);
      const r = rows.get(key) ?? { label, leads: 0, qualified: 0, won: 0, revenue: 0 };
      r.leads++;
      if (l.status === "QUALIFIED" || l.status === "CONVERTED") r.qualified++;
      const o = oppOf.get(l.id);
      if (o?.status === "WON") {
        r.won++;
        r.revenue = Number(r.revenue) + Number(wonValues.get(o.id)?.value ?? 0);
      }
      rows.set(key, r);
    }
    return [...rows.entries()].map(([key, r]): CampaignRow => ({ key, label: r.label, leads: r.leads, qualified: r.qualified, won: r.won, revenue: Number(r.revenue).toFixed(2) })).sort((a, b) => b.leads - a.leads);
  };
  const host = (u?: string | null) => {
    try {
      return u ? new URL(u).hostname.replace(/^www\./, "") : "";
    } catch {
      return "";
    }
  };
  return {
    days,
    byOffer: group((m) => (m?.offer?.key ? { key: m.offer.key, label: m.offer.label ?? m.offer.key } : { key: "—", label: "" })),
    byCampaign: group((m) => {
      const u = m?.utm ?? {};
      const src = u.utm_source || (u.gclid ? "google" : u.fbclid ? "meta" : u.ttclid ? "tiktok" : u.sccid ? "snapchat" : "");
      if (src) return { key: `${src}|${u.utm_campaign ?? ""}`, label: [src, u.utm_campaign].filter(Boolean).join(" · ") };
      const ref = host(m?.referrer);
      return ref ? { key: `ref|${ref}`, label: ref } : { key: "direct", label: "" };
    })
  };
}

/** Open-pipeline snapshot by stage for the Command Center (counts all currencies, sums SAR only). */
export async function pipelineSummary(ctx: Ctx) {
  requirePermission(ctx, "crm.opportunities.view");
  const scope = await ownedWhere(ctx);
  const where = { organizationId: ctx.organizationId, ...scope, status: "OPEN" as const };
  const [stages, counts, values] = await Promise.all([
    prisma.pipelineStage.findMany({ where: { pipeline: { organizationId: ctx.organizationId, isDefault: true }, active: true, isWonStage: false, isLostStage: false }, orderBy: { position: "asc" } }),
    prisma.opportunity.groupBy({ by: ["stageId"], where, _count: { _all: true } }),
    prisma.opportunity.groupBy({ by: ["stageId"], where: { ...where, currency: "SAR" }, _sum: { estimatedValue: true } })
  ]);
  return stages.map((s) => ({
    key: s.key,
    nameAr: s.nameAr,
    nameEn: s.nameEn,
    count: counts.find((c) => c.stageId === s.id)?._count._all ?? 0,
    value: values.find((v) => v.stageId === s.id)?._sum.estimatedValue?.toString() ?? "0"
  }));
}

export type FollowUpItem = {
  kind: "lead" | "opportunity";
  id: string;
  number: string;
  title: string;
  subtitle: string | null;
  owner: { id: string; name: string; nameAr: string | null } | null;
  due: Date;
  phone: string | null;
  whatsapp: string | null;
  href: string;
};

/** Follow-ups bucketed into overdue / today / upcoming (7 days). Defaults to my own records. */
export async function followUps(ctx: Ctx, opts: { who?: "me" | "all" } = {}) {
  const leadsOk = can(ctx, "crm.leads.view");
  const oppsOk = can(ctx, "crm.opportunities.view");
  const scope = await ownedWhere(ctx);
  const mine = opts.who !== "all" ? { ownerId: ctx.userId } : {};
  const horizon = followUpWindow("upcoming")!;
  const due = { not: null, lt: horizon.lt as Date };
  const [leads, opps] = await Promise.all([
    leadsOk
      ? prisma.lead.findMany({
          where: { organizationId: ctx.organizationId, ...scope, ...mine, status: { in: ["OPEN", "QUALIFIED"] }, nextFollowUpAt: due },
          orderBy: { nextFollowUpAt: "asc" },
          take: 200,
          select: { id: true, number: true, name: true, companyName: true, phone: true, whatsapp: true, nextFollowUpAt: true, owner: { select: { id: true, name: true, nameAr: true } } }
        })
      : [],
    oppsOk
      ? prisma.opportunity.findMany({
          where: { organizationId: ctx.organizationId, ...scope, ...mine, status: "OPEN", nextFollowUpAt: due },
          orderBy: { nextFollowUpAt: "asc" },
          take: 200,
          select: { id: true, number: true, title: true, nextFollowUpAt: true, client: { select: { displayName: true, phone: true } }, primaryContact: { select: { phone: true, whatsapp: true } }, owner: { select: { id: true, name: true, nameAr: true } } }
        })
      : []
  ]);
  const items: FollowUpItem[] = [
    ...leads.map((l) => ({ kind: "lead" as const, id: l.id, number: l.number, title: l.name, subtitle: l.companyName, owner: l.owner, due: l.nextFollowUpAt!, phone: l.phone, whatsapp: l.whatsapp ?? l.phone, href: `/app/crm/leads/${l.id}` })),
    ...opps.map((o) => ({ kind: "opportunity" as const, id: o.id, number: o.number, title: o.title, subtitle: o.client.displayName, owner: o.owner, due: o.nextFollowUpAt!, phone: o.primaryContact?.phone ?? o.client.phone, whatsapp: o.primaryContact?.whatsapp ?? o.primaryContact?.phone ?? null, href: `/app/crm/opportunities/${o.id}` }))
  ].sort((a, b) => a.due.getTime() - b.due.getTime());
  const now = new Date();
  const today = followUpWindow("today", now)!;
  return {
    overdue: items.filter((i) => i.due < now),
    today: items.filter((i) => i.due >= now && i.due < (today.lt as Date)),
    upcoming: items.filter((i) => i.due >= (today.lt as Date))
  };
}

export type CrmAttention = { id: string; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; category: string; title: string; owner?: string | null; dueAt?: Date | null; href: string };

/**
 * Deterministic attention rules (no AI scoring):
 *  - overdue lead / opportunity follow-ups (mine)
 *  - open opportunity stuck in the same stage > STALLED_DAYS
 *  - high-value opportunity (≥ org quote approval threshold) with no activity for QUIET_DAYS
 */
/**
 * Deterministic CRM attention rules. Overdue follow-ups are personal (owner = me) on the
 * Command Center; `team: true` (CRM overview) widens them to the caller's record scope so
 * the list matches the scoped "overdue follow-ups" KPI. Stalled / quiet deals are always scoped.
 * New leads with no first contact after 60 minutes come from `uncontactedLeads` (./response).
 */
export async function crmAttention(ctx: Ctx, opts: { team?: boolean } = {}): Promise<CrmAttention[]> {
  const out: CrmAttention[] = [];
  const now = new Date();
  const org = { organizationId: ctx.organizationId };
  const scope = await ownedWhere(ctx);
  const mine = opts.team ? scope : { ownerId: ctx.userId };
  if (can(ctx, "crm.leads.view")) {
    out.push(...(await uncontactedLeads(ctx, { team: opts.team, now })));
    const leads = await prisma.lead.findMany({ where: { ...org, ...mine, status: { in: ["OPEN", "QUALIFIED"] }, nextFollowUpAt: { lt: now } }, orderBy: { nextFollowUpAt: "asc" }, take: 5, include: { owner: { select: { name: true } } } });
    for (const l of leads) out.push({ id: `lfu-${l.id}`, priority: l.priority === "URGENT" ? "URGENT" : "HIGH", category: "lead_followup", title: `${l.number} · ${l.name}`, owner: opts.team ? l.owner?.name : undefined, dueAt: l.nextFollowUpAt, href: `/app/crm/leads/${l.id}` });
  }
  if (can(ctx, "crm.opportunities.view")) {
    const [overdue, stalled, settings] = await Promise.all([
      prisma.opportunity.findMany({ where: { ...org, ...mine, status: "OPEN", nextFollowUpAt: { lt: now } }, orderBy: { nextFollowUpAt: "asc" }, take: 5, include: { client: { select: { displayName: true } } } }),
      prisma.opportunity.findMany({ where: { ...org, ...scope, status: "OPEN", stageChangedAt: { lt: new Date(now.getTime() - STALLED_DAYS * 86400000) } }, orderBy: { stageChangedAt: "asc" }, take: 5, include: { owner: { select: { name: true } } } }),
      prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { quoteApprovalThreshold: true } })
    ]);
    for (const o of overdue) out.push({ id: `ofu-${o.id}`, priority: "HIGH", category: "opp_followup", title: `${o.number} · ${o.title}`, owner: o.client.displayName, dueAt: o.nextFollowUpAt, href: `/app/crm/opportunities/${o.id}` });
    for (const o of stalled) out.push({ id: `stl-${o.id}`, priority: "MEDIUM", category: "opp_stalled", title: `${o.number} · ${o.title}`, owner: o.owner?.name, dueAt: o.stageChangedAt, href: `/app/crm/opportunities/${o.id}` });
    const quiet = await prisma.opportunity.findMany({
      where: {
        ...org,
        ...scope,
        status: "OPEN",
        estimatedValue: { gte: settings.quoteApprovalThreshold },
        OR: [{ lastActivityAt: null, createdAt: { lt: new Date(now.getTime() - QUIET_DAYS * 86400000) } }, { lastActivityAt: { lt: new Date(now.getTime() - QUIET_DAYS * 86400000) } }]
      },
      take: 5,
      include: { owner: { select: { name: true } } }
    });
    for (const o of quiet) out.push({ id: `hv-${o.id}`, priority: "HIGH", category: "opp_quiet", title: `${o.number} · ${o.title}`, owner: o.owner?.name, dueAt: o.lastActivityAt ?? o.createdAt, href: `/app/crm/opportunities/${o.id}` });
  }
  return out;
}
