import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { ownedWhere } from "./scope";
import { followUpWindow } from "./leads";

/**
 * CRM aggregates for /app/crm, the Command Center and follow-ups.
 * All numbers come from SQL aggregation over scope-filtered rows. Money is summed in
 * the database (Decimal) and returned as strings. Values are reported in SAR; rows
 * in other currencies are excluded from money totals and counted separately.
 */

export const STALLED_DAYS = 14;
export const QUIET_DAYS = 7;

const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);

// one computation per request context (several Command Center KPI providers share it)
const kpiMemo = new WeakMap<Ctx, ReturnType<typeof computeKpis>>();
export function crmKpis(ctx: Ctx) {
  let p = kpiMemo.get(ctx);
  if (!p) kpiMemo.set(ctx, (p = computeKpis(ctx)));
  return p;
}

async function computeKpis(ctx: Ctx) {
  const leadsOk = can(ctx, "crm.leads.view");
  const oppsOk = can(ctx, "crm.opportunities.view");
  const scope = await ownedWhere(ctx);
  const now = new Date();
  const org = { organizationId: ctx.organizationId };
  const [activeLeads, openOpps, pipeline, won, wonPrev, overdueLeads, overdueOpps] = await Promise.all([
    leadsOk ? prisma.lead.count({ where: { ...org, ...scope, status: { in: ["OPEN", "QUALIFIED"] } } }) : null,
    oppsOk ? prisma.opportunity.count({ where: { ...org, ...scope, status: "OPEN" } }) : null,
    oppsOk ? prisma.opportunity.aggregate({ where: { ...org, ...scope, status: "OPEN", currency: "SAR" }, _sum: { estimatedValue: true } }) : null,
    oppsOk ? prisma.opportunity.aggregate({ where: { ...org, ...scope, status: "WON", currency: "SAR", wonAt: { gte: startOfMonth(now) } }, _sum: { estimatedValue: true }, _count: { _all: true } }) : null,
    oppsOk
      ? prisma.opportunity.aggregate({
          where: { ...org, ...scope, status: "WON", currency: "SAR", wonAt: { gte: startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1)), lte: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), now.getHours()) } },
          _sum: { estimatedValue: true }
        })
      : null,
    leadsOk ? prisma.lead.count({ where: { ...org, ...scope, status: { in: ["OPEN", "QUALIFIED"] }, nextFollowUpAt: { lt: now } } }) : null,
    oppsOk ? prisma.opportunity.count({ where: { ...org, ...scope, status: "OPEN", nextFollowUpAt: { lt: now } } }) : null
  ]);
  return {
    activeLeads,
    openOpps,
    pipelineValue: pipeline?._sum.estimatedValue?.toString() ?? (oppsOk ? "0" : null),
    wonThisMonth: won ? won._sum.estimatedValue?.toString() ?? "0" : null,
    wonThisMonthCount: won?._count._all ?? null,
    wonPrevPeriod: wonPrev ? wonPrev._sum.estimatedValue?.toString() ?? "0" : null,
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
    oppsOk ? prisma.opportunity.aggregate({ where: { ...org, ...scope, status: "WON", currency: "SAR", wonAt: { gte: since } }, _sum: { estimatedValue: true }, _count: { _all: true } }) : Promise.resolve(null),
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
    wonValue: wonAgg?._sum.estimatedValue?.toString() ?? "0",
    wonCount: wonAgg?._count._all ?? 0,
    kpis
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
 */
export async function crmAttention(ctx: Ctx, opts: { team?: boolean } = {}): Promise<CrmAttention[]> {
  const out: CrmAttention[] = [];
  const now = new Date();
  const org = { organizationId: ctx.organizationId };
  const scope = await ownedWhere(ctx);
  const mine = opts.team ? scope : { ownerId: ctx.userId };
  if (can(ctx, "crm.leads.view")) {
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
