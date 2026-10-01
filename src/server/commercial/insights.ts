import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { can, type Ctx } from "../context";
import { ownedWhere } from "../crm/scope";
import { Decimal } from "@/lib/commercial/calc";
import { addDays, todayIn } from "./dates";

/**
 * Commercial (Phase 3) numbers for the Command Center, attention list and the sales section
 * of /app/crm. All queries apply the record scope. Values are QUOTATION values (offers),
 * never "revenue" — revenue starts with invoices in Phase 5. Sums include only quotations in
 * the organization currency (no FX conversion).
 */

const memo = new WeakMap<Ctx, ReturnType<typeof compute>>();
export function commercialKpis(ctx: Ctx) {
  let p = memo.get(ctx);
  if (!p) memo.set(ctx, (p = compute(ctx)));
  return p;
}

async function compute(ctx: Ctx) {
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true, currency: true, quoteExpiryWarningDays: true, contractExpiryWarningDays: true } });
  const today = todayIn(o.timezone);
  const qOk = can(ctx, "sales.quotations.view");
  const cOk = can(ctx, "sales.contracts.view");
  const scope = await ownedWhere(ctx);
  const qBase: Prisma.QuotationWhereInput = { organizationId: ctx.organizationId, ...scope };
  const [awaiting, awaitingValue, pending, expiring, acceptedNoContract, contractsExpiring] = await Promise.all([
    qOk ? prisma.quotation.count({ where: { ...qBase, status: { in: ["SENT", "VIEWED"] } } }) : null,
    qOk ? prisma.quotationVersion.aggregate({ where: { status: { in: ["SENT", "VIEWED"] }, currency: o.currency, quotation: qBase, currentOf: { isNot: null } }, _sum: { total: true } }) : null,
    qOk ? prisma.quotation.count({ where: { ...qBase, status: "PENDING_APPROVAL" } }) : null,
    qOk ? prisma.quotation.count({ where: { ...qBase, status: { in: ["SENT", "VIEWED"] }, currentVersion: { validUntil: { gte: today, lte: addDays(today, Math.max(o.quoteExpiryWarningDays, 1)) } } } }) : null,
    qOk ? prisma.quotation.count({ where: { ...qBase, status: "ACCEPTED", contracts: { none: { status: { not: "CANCELLED" } } } } }) : null,
    cOk ? prisma.contract.count({ where: { organizationId: ctx.organizationId, ...scope, status: { in: ["ACTIVE", "EXPIRING"] }, endDate: { gte: today, lte: addDays(today, o.contractExpiryWarningDays) } } }) : null
  ]);
  return {
    awaiting,
    awaitingValue: awaitingValue?._sum.total?.toFixed(2) ?? (qOk ? "0.00" : null),
    pendingApproval: pending,
    expiringSoon: expiring,
    acceptedNoContract,
    contractsExpiring,
    currency: o.currency
  };
}

export type CommercialAttention = { id: string; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; category: string; title: string; owner?: string | null; dueAt?: Date | null; href: string };

/** Deterministic rules. `team` widens owner-only rules to the caller's record scope. */
export async function commercialAttention(ctx: Ctx, opts: { team?: boolean } = {}): Promise<CommercialAttention[]> {
  const out: CommercialAttention[] = [];
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true, quoteExpiryWarningDays: true, contractExpiryWarningDays: true } });
  const today = todayIn(o.timezone);
  const scope = await ownedWhere(ctx);
  const mine = opts.team ? scope : { ownerId: ctx.userId };
  if (can(ctx, "sales.quotations.view")) {
    const [expiring, accepted] = await Promise.all([
      prisma.quotation.findMany({
        where: { organizationId: ctx.organizationId, ...mine, status: { in: ["SENT", "VIEWED"] }, currentVersion: { validUntil: { gte: today, lte: addDays(today, Math.max(o.quoteExpiryWarningDays, 1)) } } },
        include: { client: { select: { displayName: true } }, currentVersion: { select: { versionNumber: true, validUntil: true } } },
        take: 5
      }),
      prisma.quotation.findMany({
        where: { organizationId: ctx.organizationId, ...mine, status: "ACCEPTED", contracts: { none: { status: { not: "CANCELLED" } } } },
        include: { client: { select: { displayName: true } }, currentVersion: { select: { versionNumber: true, acceptedAt: true } } },
        take: 5
      })
    ]);
    for (const q of expiring) out.push({ id: `qexp-${q.id}`, priority: "HIGH", category: "quote_expiring", title: `${q.number} V${q.currentVersion?.versionNumber} · ${q.client.displayName}`, dueAt: q.currentVersion?.validUntil, href: `/app/sales/quotations/${q.id}` });
    if (can(ctx, "sales.contracts.create"))
      for (const q of accepted) out.push({ id: `qacc-${q.id}`, priority: "MEDIUM", category: "quote_needs_contract", title: `${q.number} V${q.currentVersion?.versionNumber} · ${q.client.displayName}`, dueAt: q.currentVersion?.acceptedAt, href: `/app/sales/quotations/${q.id}` });
  }
  if (can(ctx, "sales.contracts.view")) {
    const ending = await prisma.contract.findMany({
      where: { organizationId: ctx.organizationId, ...mine, status: { in: ["ACTIVE", "EXPIRING"] }, endDate: { gte: today, lte: addDays(today, o.contractExpiryWarningDays) } },
      include: { client: { select: { displayName: true } } },
      take: 5
    });
    for (const c of ending) out.push({ id: `cexp-${c.id}`, priority: "MEDIUM", category: "contract_expiring", title: `${c.number} · ${c.client.displayName}`, dueAt: c.endDate, href: `/app/sales/contracts/${c.id}` });
  }
  return out;
}

/**
 * Sales metrics for a period of `days` (all by event date in the period):
 *   created  = quotations created (current-version value)     · approved = versions approved
 *   sent     = versions marked sent                            · accepted = versions accepted
 *   acceptanceRate = accepted ÷ (accepted + client-rejected + expired) decided in the period
 *   avgDiscount    = mean of discountTotal ÷ subtotal over versions sent in the period
 */
export async function salesMetrics(ctx: Ctx, days = 30) {
  if (!can(ctx, "sales.quotations.view")) return null;
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { currency: true } });
  const since = new Date(Date.now() - days * 86_400_000);
  const scope = await ownedWhere(ctx);
  const q: Prisma.QuotationWhereInput = { organizationId: ctx.organizationId, ...scope };
  const base = { quotation: q, currency: o.currency };
  const agg = (where: Prisma.QuotationVersionWhereInput) => prisma.quotationVersion.aggregate({ where: { ...base, ...where }, _sum: { total: true }, _count: { _all: true } });
  const [created, approved, sent, accepted, rejected, expired, sentRows] = await Promise.all([
    prisma.quotationVersion.aggregate({ where: { ...base, currentOf: { isNot: null }, quotation: { ...q, createdAt: { gte: since } } }, _sum: { total: true }, _count: { _all: true } }),
    agg({ approvedAt: { gte: since } }),
    agg({ sentAt: { gte: since } }),
    agg({ acceptedAt: { gte: since } }),
    prisma.quotationVersion.count({ where: { ...base, rejectedAt: { gte: since } } }),
    prisma.quotationVersion.count({ where: { ...base, expiredAt: { gte: since } } }),
    prisma.quotationVersion.findMany({ where: { ...base, sentAt: { gte: since } }, select: { subtotal: true, discountTotal: true } })
  ]);
  const decided = accepted._count._all + rejected + expired;
  const discounts = sentRows.filter((r) => r.subtotal.gt(0)).map((r) => new Decimal(r.discountTotal.toString()).div(r.subtotal.toString()).mul(100));
  const avg = discounts.length ? discounts.reduce((a, b) => a.plus(b), new Decimal(0)).div(discounts.length) : new Decimal(0);
  const v = (a: { _sum: { total: { toFixed(n: number): string } | null }; _count: { _all: number } }) => ({ count: a._count._all, value: a._sum.total?.toFixed(2) ?? "0.00" });
  return {
    days,
    currency: o.currency,
    created: v(created),
    approved: v(approved),
    sent: v(sent),
    accepted: v(accepted),
    clientRejected: rejected,
    expired,
    acceptanceRate: decided ? Math.round((accepted._count._all / decided) * 1000) / 10 : null,
    avgDiscount: avg.toDecimalPlaces(1).toFixed(1)
  };
}
