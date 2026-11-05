import { packageGroups } from "@/content/offers";

/**
 * Package profitability (design only — no admin screen yet, see docs/PRICING-PROFITABILITY.md).
 *
 * A cost sheet holds the real, approved delivery cost of ONE sale of a package (one project, one month of a monthly
 * plan, or the whole term of a term plan), in SAR before VAT. No figure is ever estimated in code: a package without an
 * approved sheet is reported as "needs financial approval".
 *
 *   total cost = hours × hourly cost + management & QA + tools & hosting + expected support + allocated overhead
 *   margin %   = (price − total cost) ÷ price × 100
 *
 * 30–40% is the operating margin used as a review target, not a guarantee or a rule for every service.
 */
export type CostSheet = {
  /** estimated delivery hours (design, development, content, campaign work…) */
  hours: number;
  /** cost of one hour of the employee or freelancer doing it */
  hourlyCost: number;
  managementAndQa: number;
  /** tools, licences and hosting the package itself includes */
  toolsAndHosting: number;
  expectedSupport: number;
  /** share of overheads allocated to one sale */
  overhead: number;
  /** who approved these figures and when */
  approvedBy: string;
};
export const TARGET_MARGIN = { min: 30, max: 40 } as const;

/** Approved cost sheets by package key — empty until finance provides real figures. */
export const costSheets: Record<string, CostSheet> = {};

const r2 = (n: number) => Math.round(n * 100) / 100;
export type Assessment =
  | { status: "needs-financial-approval"; reason: "no-cost-sheet" | "no-fixed-price" }
  | { status: "below-target" | "on-target" | "above-target"; totalCost: number; profit: number; margin: number };

/** The margin of one sale at `price` with `sheet`; "needs financial approval" without a fixed price or a sheet. */
export function assess(price: number | null, sheet: CostSheet | undefined): Assessment {
  if (price === null || price <= 0) return { status: "needs-financial-approval", reason: "no-fixed-price" };
  if (!sheet) return { status: "needs-financial-approval", reason: "no-cost-sheet" };
  const totalCost = r2(sheet.hours * sheet.hourlyCost + sheet.managementAndQa + sheet.toolsAndHosting + sheet.expectedSupport + sheet.overhead);
  const profit = r2(price - totalCost);
  const margin = r2((profit / price) * 100);
  return { status: margin < TARGET_MARGIN.min ? "below-target" : margin > TARGET_MARGIN.max ? "above-target" : "on-target", totalCost, profit, margin };
}

/** Every package with its price and assessment — "from" prices are assessed on their stated base scope. */
export function pricingReview(sheets: Record<string, CostSheet> = costSheets) {
  return packageGroups.flatMap((g) => g.tiers.map((t) => ({ group: g.id, key: t.key, price: t.price, billing: t.billing, from: t.from, draft: Boolean(g.draft), ...assess(t.price, sheets[t.key]) })));
}
