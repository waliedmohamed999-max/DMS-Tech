import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { captureWebsiteLead, websiteLeadSchema } from "@/server/crm/website";
import { buildLeadMail } from "@/server/notify/lead-mail";
import { activeOffers, cycleEnd, findDeal, offerLabel, offers, packageGroups, todaysDeal } from "@/content/offers";
import { resetDb, setupOrg } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await setupOrg();
});
afterEach(() => vi.unstubAllEnvs());

const lead = (over: Record<string, unknown> = {}) => ({ name: "سارة", phone: "0550000003", service: "web-development", message: "نحتاج موقع", source: "offer", locale: "ar", elapsed: 5000, ...over });

describe("packages & offers", () => {
  it("1. every package has a unique key and no price is set without approval (null until the company sets one)", () => {
    const keys = packageGroups.flatMap((g) => g.tiers.map((t) => t.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(packageGroups.flatMap((g) => g.tiers).every((t) => t.price === null || t.price > 0)).toBe(true);
    expect(offerLabel("pkg:web-growth")).toBe("باقات المواقع والتطبيقات — الاحترافية");
    expect(offerLabel("pkg:nope")).toBeNull();
    expect(offerLabel("anything")).toBeNull();
  });

  it("6. every package says who it suits and what is not included; store packages exclude the platform subscription", () => {
    const tiers = packageGroups.flatMap((g) => g.tiers);
    expect(tiers.every((t) => t.idealFor.ar && t.features.length >= 4 && t.excludes.length >= 1 && t.delivery.ar)).toBe(true);
    const store = packageGroups.find((g) => g.service === "ecommerce")!;
    expect(store.notice.ar).toContain("غير مشمول");
    expect(store.tiers.every((t) => t.excludes.some((x) => x.ar.includes("اشتراك المنصة")))).toBe(true);
    // "from" prices only where the scope varies; longer team terms are cheaper per month
    expect(tiers.filter((t) => t.from).map((t) => t.key).sort()).toEqual(["store-scale", "web-pro"]);
    const team = packageGroups.find((g) => g.service === "dedicated-tech-team")!.tiers.map((t) => t.price!);
    expect(team[0] > team[1] && team[1] > team[2]).toBe(true);
  });

  it("2. design examples never appear in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(findDeal("example-k3v9q2")).toBeNull();
    expect(offerLabel("offer:store-launch-example")).toBeNull();
  });

  it("5. weekly offers end Saturday midnight (Riyadh); the deal of the day changes at midnight and is cheaper than the weekly offers", () => {
    const at = (iso: string) => new Date(iso);
    // Wednesday 14 Oct 2026, 15:00 Riyadh → the week ends Sunday 18 Oct 00:00 Riyadh (= Sat 21:00 UTC)
    expect(cycleEnd("weekly", at("2026-10-14T12:00:00Z")).toISOString()).toBe("2026-10-17T21:00:00.000Z");
    expect(cycleEnd("daily", at("2026-10-14T12:00:00Z")).toISOString()).toBe("2026-10-14T21:00:00.000Z");
    // Saturday 23:30 Riyadh still belongs to the same week; Sunday 00:30 starts a new one
    expect(cycleEnd("weekly", at("2026-10-17T20:30:00Z")).toISOString()).toBe("2026-10-17T21:00:00.000Z");
    expect(cycleEnd("weekly", at("2026-10-17T21:30:00Z")).toISOString()).toBe("2026-10-24T21:00:00.000Z");
    const d1 = todaysDeal(at("2026-10-14T12:00:00Z"))!;
    const d2 = todaysDeal(at("2026-10-15T12:00:00Z"))!;
    expect(d1.slug).not.toBe(d2.slug);
    expect(activeOffers(at("2026-10-14T12:00:00Z")).filter((o) => o.cycle === "daily")).toHaveLength(1);
    // a daily deal is a real discount and cheaper than any weekly offer for the same service
    for (const day of offers.filter((o) => o.cycle === "daily")) {
      expect(day.price).toBeLessThan(day.oldPrice);
      for (const w of offers.filter((o) => o.cycle === "weekly" && o.service === day.service)) expect(day.price).toBeLessThan(w.price);
    }
    expect(offers.every((o) => o.deliverables.length > 0 && o.terms.length > 0 && o.excludes.length > 0)).toBe(true);
  });

  it("3. a request from a package page reaches the CRM with the package (resolved on the server, never from the visitor)", async () => {
    vi.stubEnv("OS_ORG_SLUG", "test-org");
    await captureWebsiteLead(lead({ offer: "pkg:store-growth" }));
    const l = await prisma.lead.findFirstOrThrow();
    expect(l.message).toBe("[باقات المتاجر الإلكترونية — النمو]\nنحتاج موقع");
    await captureWebsiteLead(lead({ phone: "0550000004", offer: "pkg:made-up<script>" }));
    const l2 = await prisma.lead.findFirstOrThrow({ where: { phone: "0550000004" } });
    expect(l2.message).toBe("نحتاج موقع");
  });

  it("4. the e-mail to the company names the package", () => {
    const m = buildLeadMail(websiteLeadSchema.parse(lead({ offer: "pkg:wa-pro" })), { saved: true });
    expect(m.text).toContain("الباقة / العرض: باقات حلول واتساب — الاحترافية");
    expect(m.text).toContain("النموذج: الباقات والعروض");
  });
});
