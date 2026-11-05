import { describe, expect, it } from "vitest";
import { assess, costSheets, pricingReview, type CostSheet } from "@/lib/commercial/profitability";

const sheet = (over: Partial<CostSheet> = {}): CostSheet => ({ hours: 40, hourlyCost: 100, managementAndQa: 500, toolsAndHosting: 300, expectedSupport: 400, overhead: 800, approvedBy: "finance — test", ...over });

describe("package profitability (design)", () => {
  it("margin = (price − total cost) ÷ price × 100, against the 30–40% review target", () => {
    // total cost = 40 × 100 + 500 + 300 + 400 + 800 = 6,000
    expect(assess(9999, sheet())).toEqual({ status: "on-target", totalCost: 6000, profit: 3999, margin: 39.99 });
    expect(assess(7499, sheet())).toMatchObject({ status: "below-target", margin: 19.99 });
    expect(assess(12000, sheet())).toMatchObject({ status: "above-target", margin: 50 });
  });

  it("no approved cost sheet or no fixed price → needs financial approval (nothing is estimated)", () => {
    expect(assess(9999, undefined)).toEqual({ status: "needs-financial-approval", reason: "no-cost-sheet" });
    expect(assess(null, sheet())).toEqual({ status: "needs-financial-approval", reason: "no-fixed-price" });
    expect(costSheets).toEqual({});
    const review = pricingReview();
    expect(review.length).toBeGreaterThan(30);
    expect(review.every((r) => r.status === "needs-financial-approval")).toBe(true);
    expect(pricingReview({ "web-growth": sheet() }).find((r) => r.key === "web-growth")).toMatchObject({ status: "above-target", margin: 45.45 });
  });
});
