import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { captureWebsiteLead, websiteLeadSchema } from "@/server/crm/website";
import { buildLeadMail } from "@/server/notify/lead-mail";
import { activeOffers, basisPrice, findDeal, findOffer, groupAliases, offerAliases, offerLabel, offerReference, offers, offerStatus, packageGroups, retiredOffers, visibleGroups, type Offer } from "@/content/offers";
import { offerCatalog } from "@/lib/offers-schema";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";
import { campaignReport } from "@/server/crm/insights";

vi.mock("server-only", () => ({}));

beforeEach(async () => {
  await resetDb();
  await setupOrg();
});
afterEach(() => vi.unstubAllEnvs());

const lead = (over: Record<string, unknown> = {}) => ({ name: "سارة", phone: "0550000003", service: "web-development", message: "نحتاج موقع", source: "offer", locale: "ar", elapsed: 5000, ...over });
const tiers = () => packageGroups.flatMap((g) => g.tiers);
const tier = (key: string) => tiers().find((t) => t.key === key)!;
/** a campaign fixture built on current packages (the real list is empty until one is approved) */
const campaign = (over: Partial<Offer> = {}): Offer => ({
  slug: "nov-web",
  service: "web-development",
  icon: "Rocket",
  badge: { ar: "عرض", en: "Offer" },
  title: { ar: "موقع الأعمال", en: "Business website" },
  text: { ar: "نص", en: "Text" },
  forWho: { ar: "للشركات", en: "Companies" },
  features: [{ ar: "ميزة", en: "Feature" }],
  deliverables: [{ title: { ar: "تسليم", en: "Delivery" }, text: { ar: "نص", en: "Text" } }],
  delivery: { ar: "21 يوم عمل", en: "21 business days" },
  terms: [{ ar: "شرط", en: "Term" }],
  excludes: [{ ar: "استثناء", en: "Exclusion" }],
  price: 8999,
  basis: [{ key: "web-growth" }],
  startsAt: "2026-11-10",
  endsAt: "2026-11-20",
  approved: "المالك — 2026-11-05",
  ...over
});
const at = (iso: string) => new Date(iso);

describe("packages: the price list (2026-11-05, raised ~10%)", () => {
  it("1. every package carries its new price, billing and 'from' flag", () => {
    const want: Record<string, [number, boolean, string]> = {
      "landing-page": [2799, false, "one-time"],
      "web-starter": [3899, false, "one-time"],
      "web-growth": [10999, false, "one-time"],
      "web-pro": [21999, true, "one-time"],
      "store-launch": [2799, false, "one-time"],
      "store-growth": [6599, false, "one-time"],
      "store-scale": [19799, true, "one-time"],
      "mkt-start": [2199, false, "monthly"],
      "mkt-growth": [4399, false, "monthly"],
      "mkt-pro": [8299, false, "monthly"],
      "social-presence": [1999, false, "monthly"],
      "social-engage": [3899, false, "monthly"],
      "social-brand": [6599, false, "monthly"],
      "mkt90-basic": [10500, false, "term"],
      "mkt90-growth": [21000, false, "term"],
      "mkt90-full": [37500, false, "term"],
      "ai-auto-starter": [5499, true, "one-time"],
      "ai-site-bot": [6599, true, "one-time"],
      "ai-assistant": [14299, true, "one-time"],
      "ai-custom": [27499, true, "one-time"],
      "ux-ui": [5499, true, "one-time"],
      integration: [6599, true, "one-time"],
      dashboard: [7699, true, "one-time"],
      "app-mvp": [27499, true, "one-time"],
      "enterprise-systems": [38500, true, "one-time"],
      // kept as they were (WhatsApp under review of Meta fees; team pending a cost study; ads-launch pending finance)
      "ads-launch": [1499, false, "one-time"],
      "wa-basic": [599, false, "monthly"],
      "wa-pro": [1299, false, "monthly"],
      "wa-advanced": [2999, true, "monthly"],
      "team-monthly": [13500, false, "monthly"],
      "team-semiannual": [12400, false, "monthly"],
      "team-annual": [11200, false, "monthly"]
    };
    expect(tiers().map((t) => t.key).sort()).toEqual(Object.keys(want).sort());
    for (const [key, [price, from, billing]] of Object.entries(want)) expect([tier(key).price, tier(key).from, tier(key).billing], key).toEqual([price, from, billing]);
    expect(tier("enterprise-systems").indicative).toBe(true);
    // the 90-day plans: 3 months, the price is the whole term (monthly average 3,500 / 7,000 / 12,500), Growth recommended
    for (const k of ["mkt90-basic", "mkt90-growth", "mkt90-full"]) expect(tier(k).termMonths).toBe(3);
    expect(["mkt90-basic", "mkt90-growth", "mkt90-full"].map((k) => tier(k).price! / 3)).toEqual([3500, 7000, 12500]);
    expect(tier("mkt90-growth").featured).toBe(true);
  });

  it("2. keys are unique, every package states who it suits, its limits and what is excluded; no open promises", () => {
    const keys = tiers().map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(packageGroups.map((g) => g.id)).size).toBe(packageGroups.length);
    expect(tiers().every((t) => t.idealFor.ar && t.idealFor.en && t.features.length >= 4 && t.excludes.length >= 1 && t.delivery.ar && t.period)).toBe(true);
    // smb packages come before company solutions
    expect(packageGroups.findIndex((g) => g.segment === "business")).toBeGreaterThan(packageGroups.findLastIndex((g) => g.segment === "smb"));
    // no package promises anything unlimited, guaranteed or "first on Google" (notices may say we don't)
    const text = JSON.stringify(tiers().map((t) => [t.name, t.tagline, t.features]));
    for (const banned of ["غير محدود", "غير محدودة", "مضمونة", "الأول في جوجل", "100%", "unlimited", "guaranteed"]) expect(text.includes(banned), banned).toBe(false);
    // store packages never include the platform subscription; every store tier is ready to advertise (pixels)
    const store = packageGroups.find((g) => g.id === "ecommerce")!;
    expect(store.notice.ar).toContain("غير مشمولة");
    expect(store.tiers.every((t) => t.excludes.some((x) => x.ar.includes("اشتراك المنصة")))).toBe(true);
    expect(store.tiers.every((t) => t.features.some((f) => f.ar.includes("بكسل")))).toBe(true);
    expect(store.journey!.every((j) => keys.includes(j.tier))).toBe(true);
    // ads: spend excluded, a spend limit per monthly plan, no promised results
    const ads = packageGroups.find((g) => g.id === "digital-marketing")!;
    expect(ads.notice.ar).toContain("لا نَعِد");
    expect(ads.tiers.every((t) => t.excludes.some((x) => x.ar.includes("الميزانية الإعلانية")))).toBe(true);
    expect(ads.tiers.filter((t) => t.billing === "monthly").every((t) => t.features.some((f) => f.ar.includes("تغطي الأتعاب إنفاقاً حتى")))).toBe(true);
    // AI: usage limits and usage fees stated on every tier
    const ai = packageGroups.find((g) => g.id === "ai-automation")!;
    expect(ai.tiers.every((t) => t.features.some((f) => f.ar.includes("حد")) && t.excludes.some((x) => x.ar.includes("الاستخدام") || x.ar.includes("استخدام")))).toBe(true);
    // the tech team: 120 hours shared by the whole team, not per person
    expect(packageGroups.find((g) => g.id === "dedicated-tech-team")!.notice.ar).toContain("وليست 120 ساعة لكل فرد");
    const team = packageGroups.find((g) => g.id === "dedicated-tech-team")!.tiers.map((t) => t.price!);
    expect(team[0] > team[1] && team[1] > team[2]).toBe(true);
    // comparison tables have one value per tier
    for (const g of packageGroups.filter((x) => x.compare)) for (const r of g.compare!) expect(r.values.length, `${g.id}: ${r.label.en}`).toBe(g.tiers.length);
    // a yearly price is always below 12 months of the monthly price
    for (const t of tiers().filter((x) => x.annual)) expect(t.annual!, t.key).toBeLessThan(t.price! * 12);
  });

  it("3. the 90-day plans are a draft: shown in development, never in production (page, form label, reference)", () => {
    expect(visibleGroups().some((g) => g.id === "integrated-marketing")).toBe(true);
    expect(offerLabel("pkg:mkt90-growth")).toBe("باقات التسويق المتكامل – 90 يوماً لنمو أعمالك — النمو");
    vi.stubEnv("NODE_ENV", "production");
    expect(visibleGroups().some((g) => g.id === "integrated-marketing")).toBe(false);
    expect(offerLabel("pkg:mkt90-growth")).toBeNull();
    expect(offerReference("pkg:mkt90-growth")).toBeNull();
    expect(findDeal("example-k3v9q2")).toBeNull();
    // the published packages are still all there
    expect(visibleGroups().length).toBe(packageGroups.length - 1);
  });

  it("4. the reference price says how it is paid and that it is before VAT", () => {
    expect(offerReference("pkg:web-growth")).toMatchObject({ price: 10999, from: false, billing: "one-time", text: "10,999 ر.س — دفعة واحدة، قبل ضريبة القيمة المضافة 15%" });
    expect(offerReference("pkg:mkt-growth")!.text).toBe("4,399 ر.س — شهرياً، قبل ضريبة القيمة المضافة 15%");
    expect(offerReference("pkg:web-pro")!.text).toBe("يبدأ من 21,999 ر.س — دفعة واحدة، قبل ضريبة القيمة المضافة 15%");
    expect(offerReference("pkg:enterprise-systems")!.text).toBe("مؤشر أولي من 38,500 ر.س — دفعة واحدة، قبل ضريبة القيمة المضافة 15%");
    expect(offerReference("pkg:mkt90-growth")!.text).toBe("21,000 ر.س — إجمالي 3 أشهر (متوسط 7,000 ر.س شهرياً)، قبل ضريبة القيمة المضافة 15%");
    expect(offerReference("pkg:nope")).toBeNull();
  });

  it("5. the page views: VAT added to the halala, prices in both languages, the package page matches the list", async () => {
    const { getOfferItem, getPackageGroups } = await import("@/lib/content");
    const ar = await getPackageGroups("ar");
    const en = await getPackageGroups("en");
    const arTier = (k: string) => ar.flatMap((g) => g.tiers).find((t) => t.key === k)!;
    const enTier = (k: string) => en.flatMap((g) => g.tiers).find((t) => t.key === k)!;
    expect([arTier("landing-page").price, arTier("landing-page").priceVat]).toEqual(["2,799 ر.س", "3,218.85 ر.س"]);
    expect([enTier("landing-page").price, enTier("landing-page").priceVat]).toEqual(["SAR 2,799", "SAR 3,218.85"]);
    expect(arTier("web-growth").priceVat).toBe("12,648.85 ر.س");
    expect(arTier("mkt90-basic").monthlyAvg).toBe("3,500 ر.س");
    expect([arTier("mkt-start").period, enTier("mkt-start").period]).toEqual(["شهرياً", "per month"]);
    // the package page shows the same price as the list, for every package, in both languages
    for (const locale of ["ar", "en"] as const) {
      const groups = locale === "ar" ? ar : en;
      for (const t of groups.flatMap((g) => g.tiers)) {
        const item = (await getOfferItem(t.key, locale))!;
        expect([item.price, item.priceVat, item.billing, item.from], `${locale} ${t.key}`).toEqual([t.price, t.priceVat, t.billing, t.from]);
      }
    }
    // ad aliases open the real package
    expect((await getOfferItem("store-marketing", "ar"))!.key).toBe("pkg:store-growth");
  });

  it("6. structured data lists published prices only: minimum for 'from', per month for subscriptions, never drafts", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { getPackageGroups } = await import("@/lib/content");
    const cat = offerCatalog(await getPackageGroups("ar"), "ar", "الباقات والعروض");
    const items = cat.itemListElement.flatMap((g) => g.itemListElement);
    const one = (key: string) => items.find((i) => i.url.endsWith(`/offers/${key}`))!.priceSpecification as Record<string, unknown>;
    expect(one("web-growth")).toMatchObject({ "@type": "PriceSpecification", price: 10999, priceCurrency: "SAR", valueAddedTaxIncluded: false });
    expect(one("web-pro")).toMatchObject({ minPrice: 21999 });
    expect(one("web-pro").price).toBeUndefined();
    expect(one("mkt-growth")).toMatchObject({ "@type": "UnitPriceSpecification", price: 4399, referenceQuantity: { unitCode: "MON" } });
    expect(items.some((i) => i.url.includes("mkt90"))).toBe(false);
    expect(items.length).toBe(visibleGroups().flatMap((g) => g.tiers).filter((t) => t.price !== null).length);
    expect(cat.url).toBe("https://dmstech.sa/offers");
  });
});

describe("limited-time campaigns: dated, approved, never renewing", () => {
  it("7. the December campaigns: approved, 1–14 Dec 2026 only (after the new prices are live), 13–18% below the current packages", () => {
    expect(offers.map((o) => o.slug).sort()).toEqual(["business-website-season", "landing-campaign-season", "ramadan-store", "whatsapp-season"]);
    // not before 1 December: the struck price must first be the price the site charges
    expect(activeOffers(at("2026-11-20T12:00:00Z"))).toEqual([]);
    expect(offers.every((o) => offerStatus(o, at("2026-11-30T20:59:00Z")) === "scheduled")).toBe(true);
    const during = at("2026-12-07T12:00:00Z");
    expect(activeOffers(during).length).toBe(4);
    for (const o of offers) {
      const off = 1 - o.price / basisPrice(o)!;
      expect([o.approved !== null, offerStatus(o, during)], o.slug).toEqual([true, "live"]);
      expect(off, o.slug).toBeGreaterThan(0.13);
      expect(off, o.slug).toBeLessThan(0.18);
      expect(o.deliverables.length > 0 && o.terms.length > 0 && o.excludes.length > 0, o.slug).toBe(true);
    }
    expect(basisPrice(offers.find((o) => o.slug === "ramadan-store")!)).toBe(6599 + 2199);
    // the last minute of 14 Dec (Riyadh) still runs; then nothing — no renewal
    expect(activeOffers(at("2026-12-14T20:59:00Z")).length).toBe(4);
    for (const d of ["2026-12-14T21:00:00Z", "2027-01-10T12:00:00Z", "2027-12-07T12:00:00Z"]) expect(activeOffers(at(d))).toEqual([]);
    expect(findOffer("today")).toBeNull();
  });

  it("7b. no contradictions between packages and campaigns", () => {
    const monthly = (k: string) => tier(k).price!;
    // a campaign is never dearer per month than a permanent plan for the same thing
    const wa = offers.find((o) => o.slug === "whatsapp-season")!;
    expect(wa.price / 3).toBeLessThan(tier("wa-pro").annual! / 12);
    // ads + social together is a permanent 90-day plan, so no campaign sells that pair
    for (const o of offers) expect(o.basis.some((b) => b.key.startsWith("mkt-")) && o.basis.some((b) => b.key.startsWith("social-")), o.slug).toBe(false);
    // the 90-day plans: a fixed commitment discount of 15–18% on the matching separate packages, never deeper than the campaigns
    const pairs: [string, string, string][] = [["mkt90-basic", "social-presence", "mkt-start"], ["mkt90-growth", "social-engage", "mkt-growth"], ["mkt90-full", "social-brand", "mkt-pro"]];
    for (const [bundle, social, ads] of pairs) {
      const ratio = tier(bundle).price! / 3 / (monthly(social) + monthly(ads));
      expect(ratio, bundle).toBeGreaterThan(0.82);
      expect(ratio, bundle).toBeLessThan(0.85);
    }
    // the 14-day trial gives less than a month of the Starter plan: one campaign, two creatives
    const ads = packageGroups.find((g) => g.id === "digital-marketing")!;
    const row = (label: string) => ads.compare!.find((r) => r.label.en === label)!.values.map((v) => v.en);
    expect(row("Active campaigns").slice(0, 2)).toEqual(["1", "1"]);
    expect(tier("ads-launch").price!).toBeLessThan(tier("mkt-start").price!);
    expect(tier("ads-launch").features.some((f) => f.ar.includes("حملة واحدة"))).toBe(true);
    // prices rise with each tier inside a group
    for (const g of packageGroups.filter((x) => x.id !== "dedicated-tech-team" && x.id !== "digital-marketing")) {
      const p = g.tiers.map((t) => t.price!);
      expect(p, g.id).toEqual([...p].sort((x, y) => x - y));
    }
  });

  it("8. a campaign shows only between its approved dates (Riyadh days, end day included) and then ends — no renewal", () => {
    const o = campaign();
    const list = [o];
    expect(offerStatus(o, at("2026-11-09T20:59:00Z"))).toBe("scheduled"); // 23:59 on 9 Nov Riyadh
    expect(offerStatus(o, at("2026-11-09T21:00:00Z"))).toBe("live"); // 00:00 on 10 Nov Riyadh
    expect(findOffer("nov-web", at("2026-11-15T12:00:00Z"), list)?.slug).toBe("nov-web");
    expect(offerStatus(o, at("2026-11-20T20:59:00Z"))).toBe("live"); // last minute of 20 Nov Riyadh
    expect(offerStatus(o, at("2026-11-20T21:00:00Z"))).toBe("ended");
    // weeks and months later it is still ended: nothing restarts it
    for (const d of ["2026-11-27T12:00:00Z", "2026-12-20T12:00:00Z", "2027-11-15T12:00:00Z"]) expect(activeOffers(at(d), list)).toEqual([]);
  });

  it("9. no made-up 'was' price: the struck price is the current package price, and a campaign that isn't cheaper never shows", () => {
    expect(basisPrice(campaign())).toBe(10999);
    expect(basisPrice(campaign({ basis: [{ key: "mkt-growth", months: 3 }, { key: "social-engage" }] }))).toBe(4399 * 3 + 3899);
    expect(basisPrice(campaign({ basis: [{ key: "wa-pro", annual: true }] }))).toBe(12990);
    const now = at("2026-11-15T12:00:00Z");
    // not approved, priced at or above its packages, built on a "from" price or an unknown package, or bad dates → never shown
    expect(offerStatus(campaign({ approved: null }), now)).toBe("invalid");
    expect(offerStatus(campaign({ price: 10999 }), now)).toBe("invalid");
    expect(offerStatus(campaign({ basis: [{ key: "web-pro" }] }), now)).toBe("invalid");
    expect(offerStatus(campaign({ basis: [{ key: "gone" }] }), now)).toBe("invalid");
    expect(offerStatus(campaign({ basis: [] }), now)).toBe("invalid");
    expect(offerStatus(campaign({ endsAt: "2026-11-01" }), now)).toBe("invalid");
    // a draft package can't back a published campaign
    vi.stubEnv("NODE_ENV", "production");
    expect(offerStatus(campaign({ basis: [{ key: "mkt90-growth" }] }), now)).toBe("invalid");
  });

  it("10. old deal / offer links open the package they were built on; ad and section links still work", () => {
    const keys = new Set(tiers().map((t) => t.key));
    expect(Object.keys(retiredOffers).length).toBe(19);
    for (const [slug, to] of Object.entries(retiredOffers)) expect(to === null || keys.has(to), slug).toBe(true);
    expect(retiredOffers.today).toBeNull();
    expect(retiredOffers["web-week"]).toBe("web-growth");
    // a retired key that still arrives from an old form is named, not dropped
    expect(offerLabel("offer:day-store")).toBe("عرض سابق متوقف (day-store)");
    expect(offerReference("offer:day-store")).toBeNull();
    for (const id of Object.values(groupAliases)) expect(packageGroups.some((g) => g.id === id)).toBe(true);
    for (const target of Object.values(offerAliases)) expect(keys.has(target), target).toBe(true);
  });
});

describe("requests from the offers pages", () => {
  it("11. a package request reaches the CRM with the package and its reference price (resolved on the server)", async () => {
    vi.stubEnv("OS_ORG_SLUG", "test-org");
    await captureWebsiteLead(lead({ offer: "pkg:store-growth" }));
    const l = await prisma.lead.findFirstOrThrow();
    expect(l.message).toBe("[باقات المتاجر الإلكترونية — متجر النمو]\n• السعر المرجعي: 6,599 ر.س — دفعة واحدة، قبل ضريبة القيمة المضافة 15%\nنحتاج موقع");
    expect((l.captureMeta as { offer: unknown }).offer).toEqual({ key: "pkg:store-growth", label: "باقات المتاجر الإلكترونية — متجر النمو", price: 6599, from: false, billing: "one-time", termMonths: null, reference: "6,599 ر.س — دفعة واحدة، قبل ضريبة القيمة المضافة 15%" });
    // a made-up key adds nothing
    await captureWebsiteLead(lead({ phone: "0550000004", offer: "pkg:made-up<script>" }));
    const l2 = await prisma.lead.findFirstOrThrow({ where: { phone: "0550000004" } });
    expect(l2.message).toBe("نحتاج موقع");
  });

  it("12. an offer form's extra answers and the ad source reach the CRM; unknown fields are refused", async () => {
    vi.stubEnv("OS_ORG_SLUG", "test-org");
    await captureWebsiteLead(lead({ offer: "pkg:mkt-start", details: { adBudget: "1,500 – 5,000", platforms: "سناب" }, utm: { utm_source: "snapchat", utm_campaign: "ads-nov", gclid: "abc123" } }));
    const l = await prisma.lead.findFirstOrThrow();
    expect(l.message).toBe("[باقات إدارة الحملات الإعلانية — البداية]\n• السعر المرجعي: 2,199 ر.س — شهرياً، قبل ضريبة القيمة المضافة 15%\nنحتاج موقع\n• الميزانية الإعلانية الشهرية: 1,500 – 5,000\n• المنصات: سناب");
    const meta = l.captureMeta as { details: Record<string, string>; utm: Record<string, string>; offer: { billing: string } };
    expect(meta.offer.billing).toBe("monthly");
    expect(meta.utm).toEqual({ utm_source: "snapchat", utm_campaign: "ads-nov", gclid: "abc123" });
    expect(websiteLeadSchema.safeParse(lead({ details: { salary: "1" } })).success).toBe(false);
    expect(websiteLeadSchema.safeParse(lead({ utm: { session_id: "x" } })).success).toBe(false);
  });

  it("13. the CRM campaign report counts website leads by package and by ad campaign", async () => {
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

  it("14. the e-mail to the company names the package and its reference price", () => {
    const m = buildLeadMail(websiteLeadSchema.parse(lead({ offer: "pkg:wa-pro" })), { saved: true });
    expect(m.text).toContain("الباقة / العرض: باقات واتساب للأعمال — الاحترافية");
    expect(m.text).toContain("السعر المرجعي: 1,299 ر.س — شهرياً، قبل ضريبة القيمة المضافة 15%");
    expect(m.text).toContain("النموذج: الباقات والعروض");
    const m2 = buildLeadMail(websiteLeadSchema.parse(lead({ offer: "pkg:store-launch", details: { hasStore: "نعم — سلة" }, utm: { utm_source: "snapchat" } })), { saved: true });
    expect(m2.text).toContain("حساب سلة أو زد: نعم — سلة");
    expect(m2.text).toContain("الحملة: utm_source=snapchat");
  });
});
