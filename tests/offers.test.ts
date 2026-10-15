import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { captureWebsiteLead, websiteLeadSchema } from "@/server/crm/website";
import { buildLeadMail } from "@/server/notify/lead-mail";
import { activeOffers, cycleEnd, DEALS_PER_DAY, findDeal, findOffer, groupAliases, offerAliases, offerLabel, offers, packageGroups, todaysDeal, todaysDeals } from "@/content/offers";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";
import { campaignReport } from "@/server/crm/insights";

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
    expect(offerLabel("pkg:web-growth")).toBe("باقات المواقع الإلكترونية — الأعمال");
    expect(offerLabel("pkg:nope")).toBeNull();
    expect(offerLabel("anything")).toBeNull();
  });

  it("6. every package says who it suits and what is not included; store packages exclude the platform subscription", () => {
    const tiers = packageGroups.flatMap((g) => g.tiers);
    expect(tiers.every((t) => t.idealFor.ar && t.features.length >= 4 && t.excludes.length >= 1 && t.delivery.ar)).toBe(true);
    const store = packageGroups.find((g) => g.service === "ecommerce")!;
    expect(store.notice.ar).toContain("غير مشمول");
    expect(store.tiers.every((t) => t.excludes.some((x) => x.ar.includes("اشتراك المنصة")))).toBe(true);
    // every store tier is ready to advertise (pixels), and the journey runs from founding to ongoing marketing
    expect(store.tiers.every((t) => t.features.some((f) => f.ar.includes("بكسل")))).toBe(true);
    const keys = new Set(tiers.map((t) => t.key));
    expect(store.journey!.length).toBeGreaterThanOrEqual(5);
    expect(store.journey!.every((j) => keys.has(j.tier))).toBe(true);
    const mkt = packageGroups.find((g) => g.id === "digital-marketing")!;
    expect(mkt.notice.ar).toContain("الميزانية الإعلانية");
    expect(mkt.notice.ar).toContain("لا نَعِد");
    expect(mkt.tiers.every((t) => t.excludes.some((x) => x.ar.includes("الميزانية الإعلانية")))).toBe(true);
    // ids are unique (they are the tab and link keys); smb packages come before company solutions
    expect(new Set(packageGroups.map((g) => g.id)).size).toBe(packageGroups.length);
    expect(packageGroups.findIndex((g) => g.segment === "business")).toBeGreaterThan(packageGroups.findLastIndex((g) => g.segment === "smb"));
    // "from" prices only where the scope varies; longer team terms are cheaper per month
    expect(tiers.filter((t) => t.from).map((t) => t.key).sort()).toEqual(["ai-custom", "app-mvp", "enterprise-systems", "store-scale", "wa-advanced", "web-pro"]);
    const team = packageGroups.find((g) => g.service === "dedicated-tech-team")!.tiers.map((t) => t.price!);
    expect(team[0] > team[1] && team[1] > team[2]).toBe(true);
  });

  it("2. design examples never appear in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(findDeal("example-k3v9q2")).toBeNull();
    expect(offerLabel("offer:store-launch-example")).toBeNull();
  });

  it("7. a deal never contradicts the packages: its struck price is the real package price and it costs less", () => {
    const price = (key: string) => packageGroups.flatMap((g) => g.tiers).find((t) => t.key === key)!.price!;
    const deal = (slug: string) => offers.find((o) => o.slug === slug)!;
    // deal → what it really costs as a package (WhatsApp: 3 months of Basic)
    const refs: [string, number][] = [["day-website", price("web-starter")], ["day-store", price("store-launch")], ["day-whatsapp", price("wa-basic") * 3], ["day-marketing", price("mkt-start") + price("social-presence")], ["day-social", price("social-engage")], ["day-automation", price("ai-auto-starter")]];
    for (const [slug, ref] of refs) {
      expect(deal(slug).oldPrice).toBe(ref);
      expect(deal(slug).price).toBeLessThan(ref);
    }
    // weekly offers: struck price = the sum of the packages inside
    expect(deal("store-week").oldPrice).toBe(price("store-launch") + price("mkt-start") + price("social-presence"));
    expect(deal("ai-agent-week").oldPrice).toBe(price("ai-assistant"));
    expect(deal("ai-bundle-week").oldPrice).toBe(price("ai-assistant") + price("ai-auto-starter"));
    expect(deal("system-week").oldPrice).toBe(price("app-mvp"));
    // a smaller deal never costs more than a bigger one of the same kind
    // the website-only AI bot is cheaper than the full assistant offer
    expect(deal("day-ai-bot").price).toBeLessThan(deal("ai-agent-week").price);
  });

  it("8. every day shows at least one AI / automation / integration deal", () => {
    const tech = new Set(["ai-automation", "digital-transformation"]);
    for (let d = 0; d < 30; d++) {
      const day = todaysDeals(new Date(Date.UTC(2026, 9, 1 + d, 12)));
      expect(day.some((o) => tech.has(o.service))).toBe(true);
    }
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
    // several deals from different services run each day, all reachable by their own link
    const deals = todaysDeals(at("2026-10-14T12:00:00Z"));
    expect(deals).toHaveLength(DEALS_PER_DAY);
    expect(new Set(deals.map((o) => o.slug)).size).toBe(DEALS_PER_DAY);
    expect(new Set(deals.map((o) => o.service)).size).toBeGreaterThan(1);
    expect(activeOffers(at("2026-10-14T12:00:00Z")).filter((o) => o.cycle === "daily")).toHaveLength(DEALS_PER_DAY);
    expect(deals.every((o) => findOffer(o.slug, at("2026-10-14T12:00:00Z"))?.slug === o.slug)).toBe(true);
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

  it("9. an offer form's extra answers and the ad source reach the CRM; unknown fields are refused", async () => {
    vi.stubEnv("OS_ORG_SLUG", "test-org");
    await captureWebsiteLead(lead({ offer: "pkg:store-launch", details: { hasStore: "نعم — سلة", productCount: "حتى 30" }, utm: { utm_source: "snapchat", utm_campaign: "store-oct", gclid: "abc123" } }));
    const l = await prisma.lead.findFirstOrThrow();
    expect(l.message).toBe("[باقات المتاجر الإلكترونية — الانطلاق]\nنحتاج موقع\n• حساب سلة أو زد: نعم — سلة\n• عدد المنتجات: حتى 30");
    const meta = l.captureMeta as { details: Record<string, string>; utm: Record<string, string> };
    expect(meta.details).toEqual({ hasStore: "نعم — سلة", productCount: "حتى 30" });
    expect(meta.utm).toEqual({ utm_source: "snapchat", utm_campaign: "store-oct", gclid: "abc123" });
    // keys outside the whitelist never get in
    expect(websiteLeadSchema.safeParse(lead({ details: { salary: "1" } })).success).toBe(false);
    expect(websiteLeadSchema.safeParse(lead({ utm: { session_id: "x" } })).success).toBe(false);
  });

  it("10. ad links (/offers/<alias>) open a real package or offer", () => {
    expect(offerAliases["store-marketing"]).toBe("store-week");
    // section links point at real tabs
    for (const id of Object.values(groupAliases)) expect(packageGroups.some((g) => g.id === id)).toBe(true);
    for (const target of Object.values(offerAliases)) expect(packageGroups.some((g) => g.tiers.some((t) => t.key === target)) || offers.some((o) => o.slug === target && o.cycle === "weekly")).toBe(true);
  });

  it("11. the CRM campaign report counts website leads by offer and by ad campaign", async () => {
    vi.stubEnv("OS_ORG_SLUG", "test-org");
    const org = await prisma.organization.findFirstOrThrow({ where: { slug: "test-org" } });
    const ctx = await ctxFor((await makeUser(org.id, "mgr@x.test", ["sales_manager"])).id);
    await captureWebsiteLead(lead({ phone: "0550000011", offer: "pkg:store-launch", utm: { utm_source: "snapchat", utm_campaign: "oct" } }));
    await captureWebsiteLead(lead({ phone: "0550000012", offer: "pkg:store-launch", utm: { fbclid: "x1" } }));
    await captureWebsiteLead(lead({ phone: "0550000013", offer: "pkg:web-starter" }));
    const r = await campaignReport(ctx, 30);
    expect(r.byOffer.find((x) => x.key === "pkg:store-launch")?.leads).toBe(2);
    expect(r.byOffer.find((x) => x.key === "pkg:web-starter")?.leads).toBe(1);
    expect(r.byCampaign.find((x) => x.key === "snapchat|oct")?.leads).toBe(1);
    expect(r.byCampaign.find((x) => x.key === "meta|")?.leads).toBe(1);
    expect(r.byCampaign.find((x) => x.key === "direct")?.leads).toBe(1);
  });

  it("4. the e-mail to the company names the package", () => {
    const m = buildLeadMail(websiteLeadSchema.parse(lead({ offer: "pkg:wa-pro" })), { saved: true });
    expect(m.text).toContain("الباقة / العرض: باقات واتساب والأتمتة — الاحترافية");
    expect(m.text).toContain("النموذج: الباقات والعروض");
  });
});
