import type { CrmActivityType, Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { ownedWhere, scopeOf } from "./scope";
import type { CrmAttention } from "./insights";

/**
 * Lead response time (board item L-04): "answer new leads within minutes".
 *  - `Lead.firstContactedAt` is written ONCE, by the first outbound contact (see `markFirstContact`).
 *  - `uncontactedLeads` feeds the CRM attention list.
 *  - `leadResponseTimes` reports the median minutes from creation to first contact per owner.
 * All time arithmetic uses JS dates (the columns are `timestamp(3)` holding UTC — never compare them with SQL now()).
 */

/** Activity types that count as reaching out to the lead. Notes, tasks and follow-up reminders do not. */
export const CONTACT_ACTIVITY_TYPES = ["CALL", "EMAIL", "WHATSAPP", "MEETING"] as const satisfies readonly CrmActivityType[];
export const isContactActivity = (type: string): boolean => (CONTACT_ACTIVITY_TYPES as readonly string[]).includes(type);

/** A new lead with no first contact after this many minutes needs attention. */
export const FIRST_CONTACT_SLA_MINUTES = 60;

/**
 * Record the first outbound contact on a lead. Idempotent and race-safe: the conditional update only
 * matches while the column is still NULL, so the earliest writer wins and later contacts never move it.
 * `at` may be a back-dated activity time ("called ten minutes ago"); it is clamped to [createdAt, now].
 * Returns true when this call set the value.
 */
export async function markFirstContact(tx: Tx, organizationId: string, leadId: string, at: Date = new Date(), now: Date = new Date()): Promise<boolean> {
  const lead = await tx.lead.findFirst({ where: { id: leadId, organizationId }, select: { createdAt: true, firstContactedAt: true } });
  if (!lead || lead.firstContactedAt) return false;
  const when = new Date(Math.max(lead.createdAt.getTime(), Math.min(at.getTime(), now.getTime())));
  const r = await tx.lead.updateMany({ where: { id: leadId, organizationId, firstContactedAt: null }, data: { firstContactedAt: when } });
  return r.count === 1;
}

/**
 * Attention rule: OPEN leads still in stage NEW, created more than FIRST_CONTACT_SLA_MINUTES ago, with no first
 * contact. Oldest first, at most `take`.
 *  - `team: true` (CRM overview) → the caller's record scope (ALL / TEAM / OWN).
 *  - otherwise (Command Center) → leads I own; whoever can assign leads across the organization also sees the
 *    unassigned ones, because nobody else is responsible for them yet.
 * Leads that predate `firstContactedAt` have NULL there even when they were contacted, so candidates with a
 * logged contact activity are skipped — no backfill needed, and old contacted leads never light up.
 */
export async function uncontactedLeads(ctx: Ctx, opts: { team?: boolean; now?: Date; take?: number } = {}): Promise<CrmAttention[]> {
  if (!can(ctx, "crm.leads.view")) return [];
  const now = opts.now ?? new Date();
  const take = opts.take ?? 5;
  const personal: Prisma.LeadWhereInput =
    can(ctx, "crm.leads.assign") && scopeOf(ctx) === "ALL" ? { AND: [{ OR: [{ ownerId: ctx.userId }, { ownerId: null }] }] } : { ownerId: ctx.userId };
  const visible = opts.team ? await ownedWhere(ctx) : personal;
  const candidates = await prisma.lead.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...visible,
      status: "OPEN",
      stage: "NEW",
      firstContactedAt: null,
      createdAt: { lt: new Date(now.getTime() - FIRST_CONTACT_SLA_MINUTES * 60_000) }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 200,
    select: { id: true, number: true, name: true, priority: true, createdAt: true, owner: { select: { name: true } } }
  });
  if (!candidates.length) return [];
  const contacted = await prisma.crmActivity.findMany({
    where: { organizationId: ctx.organizationId, entityType: "LEAD", entityId: { in: candidates.map((c) => c.id) }, isSystem: false, type: { in: [...CONTACT_ACTIVITY_TYPES] } },
    select: { entityId: true },
    distinct: ["entityId"]
  });
  const skip = new Set(contacted.map((c) => c.entityId));
  return candidates
    .filter((l) => !skip.has(l.id))
    .slice(0, take)
    .map((l) => ({
      id: `nfc-${l.id}`,
      priority: l.priority === "URGENT" || l.priority === "HIGH" ? ("URGENT" as const) : ("HIGH" as const),
      category: "lead_no_contact",
      title: `${l.number} · ${l.name}`,
      owner: l.owner?.name ?? null,
      dueAt: new Date(l.createdAt.getTime() + FIRST_CONTACT_SLA_MINUTES * 60_000),
      href: `/app/crm/leads/${l.id}`
    }));
}

export type ResponseTimeRow = {
  /** null = leads that have no owner */
  ownerId: string | null;
  ownerName: string | null;
  /** leads created in the period (within the caller's record scope) */
  leads: number;
  /** of those, how many have a recorded first contact */
  contacted: number;
  /** of the contacted ones, how many were reached within FIRST_CONTACT_SLA_MINUTES */
  withinSla: number;
  /** median minutes from createdAt to firstContactedAt over the contacted leads; null when none */
  medianMinutes: number | null;
};

const median = (sorted: number[]): number | null => {
  if (!sorted.length) return null;
  const mid = sorted.length >> 1;
  const m = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(m * 10) / 10;
};

/**
 * Median minutes from lead creation to first contact, per CURRENT owner, for leads created in the last `days`
 * (record scope applied). Leads without a recorded first contact count in `leads` but not in the median — which
 * includes every lead contacted before the column existed. `overall` aggregates the same rows.
 */
export async function leadResponseTimes(ctx: Ctx, days = 30, now: Date = new Date()): Promise<{ days: number; slaMinutes: number; overall: ResponseTimeRow; byOwner: ResponseTimeRow[] }> {
  requirePermission(ctx, "crm.leads.view");
  const since = new Date(now.getTime() - days * 86400000);
  const leads = await prisma.lead.findMany({
    where: { organizationId: ctx.organizationId, ...(await ownedWhere(ctx)), createdAt: { gte: since, lte: now } },
    select: { ownerId: true, createdAt: true, firstContactedAt: true, owner: { select: { name: true } } }
  });
  const groups = new Map<string, { ownerId: string | null; ownerName: string | null; leads: number; minutes: number[] }>();
  const all: number[] = [];
  for (const l of leads) {
    const key = l.ownerId ?? "";
    const g = groups.get(key) ?? { ownerId: l.ownerId, ownerName: l.owner?.name ?? null, leads: 0, minutes: [] };
    g.leads++;
    if (l.firstContactedAt) {
      const m = Math.max(0, (l.firstContactedAt.getTime() - l.createdAt.getTime()) / 60_000);
      g.minutes.push(m);
      all.push(m);
    }
    groups.set(key, g);
  }
  const row = (g: { ownerId: string | null; ownerName: string | null; leads: number; minutes: number[] }): ResponseTimeRow => {
    const sorted = [...g.minutes].sort((a, b) => a - b);
    return { ownerId: g.ownerId, ownerName: g.ownerName, leads: g.leads, contacted: sorted.length, withinSla: sorted.filter((m) => m <= FIRST_CONTACT_SLA_MINUTES).length, medianMinutes: median(sorted) };
  };
  return {
    days,
    slaMinutes: FIRST_CONTACT_SLA_MINUTES,
    overall: row({ ownerId: null, ownerName: null, leads: leads.length, minutes: all }),
    // slowest first; owners with nothing measured yet go last
    byOwner: [...groups.values()].map(row).sort((a, b) => (b.medianMinutes ?? -1) - (a.medianMinutes ?? -1) || b.leads - a.leads)
  };
}
