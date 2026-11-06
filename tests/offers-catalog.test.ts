import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { fileCatalog, offerLabel, offerReference, type Catalog } from "@/content/offers";
import { catalogEditorState, checkCatalog, discardCatalogDraft, forgetPublishedCatalog, parseCatalog, publishCatalogDraft, publishedCatalog, restoreCatalogVersion, saveCatalogDraft } from "@/server/website/catalog";
import { getActiveOffers, getOfferItem, getOffersCopy, getPackageGroups } from "@/lib/content";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

vi.mock("server-only", () => ({}));

/** A deep copy of the built-in catalog to change in a test. */
const copyOf = (c: Catalog = fileCatalog): Catalog => JSON.parse(JSON.stringify(c));

describe("offers catalog: shape and contradictions", () => {
  it("1. the built-in catalog is a valid, publishable catalog and survives a JSON round trip", () => {
    const cat = parseCatalog(JSON.parse(JSON.stringify(fileCatalog)));
    expect(cat.groups).toEqual(JSON.parse(JSON.stringify(fileCatalog.groups)));
    expect(cat.offers).toEqual(JSON.parse(JSON.stringify(fileCatalog.offers)));
    expect(cat.copy).toEqual(fileCatalog.copy);
    expect(checkCatalog(cat)).toEqual([]);
  });

  it("2. texts missing from a stored catalog fall back to the built-in wording; edited ones are kept", () => {
    const c = copyOf() as unknown as { copy: Record<string, unknown> };
    delete c.copy.faqTitle;
    c.copy.packagesTitle = { ar: "باقاتنا", en: "Our packages" };
    c.copy.faqs = [{ q: { ar: "سؤال", en: "Q" }, a: { ar: "جواب", en: "A" } }];
    const cat = parseCatalog(c);
    expect(cat.copy.faqTitle).toEqual(fileCatalog.copy.faqTitle);
    expect(cat.copy.packagesTitle.ar).toBe("باقاتنا");
    expect(cat.copy.faqs).toHaveLength(1);
  });

  it("3. a broken shape is refused with where it is", () => {
    const c = copyOf();
    (c.groups[0].tiers[0] as { price: unknown }).price = "cheap";
    expect(() => parseCatalog(c)).toThrow(/CATALOG_INVALID:groups\.0\.tiers\.0\.price/);
    const d = copyOf();
    d.groups[0].tiers[0].key = "Not A Link";
    expect(() => parseCatalog(d)).toThrow(/CATALOG_INVALID/);
  });

  it("4. contradictions block publishing: dearer offer, missing or duplicate package, taken links, bad dates", () => {
    const c = copyOf();
    c.offers[0].price = 999_999;
    c.offers[1].basis = [{ key: "nothing-here" }];
    c.offers[2].endsAt = "2020-01-01";
    c.groups[1].tiers[0].key = c.groups[0].tiers[0].key;
    c.groups[0].tiers[1].key = "store-week"; // an old link
    const problems = checkCatalog(c).map((p) => p.en).join(" | ");
    expect(problems).toMatch(/is not below its packages/);
    expect(problems).toMatch(/missing package \(nothing-here\)/);
    expect(problems).toMatch(/ends before it starts/);
    expect(problems).toMatch(/is used twice/);
    expect(problems).toMatch(/reserved for an old link/);
  });

  it("5. an offer can be built on a new package added in the dashboard", () => {
    const c = copyOf();
    const t = { ...copyOf().groups[0].tiers[0], key: "web-new", price: 5000 };
    c.groups[0].tiers.push(t);
    c.offers.push({ ...copyOf().offers[0], slug: "new-offer", basis: [{ key: "web-new" }], price: 4500 });
    expect(checkCatalog(parseCatalog(c))).toEqual([]);
    expect(offerLabel("pkg:web-new", c)).toBe(`${c.groups[0].title.ar} — ${t.name.ar}`);
    expect(offerReference("pkg:web-new", c)?.price).toBe(5000);
  });
});

describe("offers catalog: draft → publish → what visitors see", () => {
  let orgId: string;
  beforeEach(async () => {
    await resetDb();
    orgId = (await setupOrg()).id;
    forgetPublishedCatalog();
    vi.stubEnv("OS_ORG_SLUG", "test-org");
    return () => {
      vi.unstubAllEnvs();
      forgetPublishedCatalog();
    };
  });

  it("6. permissions: marketing edits but cannot publish; the CEO publishes; an employee cannot open it", async () => {
    const mk = await ctxFor((await makeUser(orgId, "mk@x.test", ["marketing"])).id);
    const ceo = await ctxFor((await makeUser(orgId, "ceo@x.test", ["ceo"])).id);
    const emp = await ctxFor((await makeUser(orgId, "emp@x.test", ["employee"])).id);
    await expect(catalogEditorState(emp)).rejects.toThrow(/FORBIDDEN|Missing permission/);
    await saveCatalogDraft(mk, copyOf());
    await expect(publishCatalogDraft(mk)).rejects.toThrow(/website.offers.publish/);
    expect((await publishCatalogDraft(ceo, "first")).version).toBe(1);
  });

  it("7. visitors keep seeing the published catalog while a draft is edited; publishing switches it", async () => {
    const ceo = await ctxFor((await makeUser(orgId, "ceo@x.test", ["ceo"])).id);
    // before any publish: the built-in catalog
    expect((await publishedCatalog()).groups.length).toBe(fileCatalog.groups.length);
    const c = copyOf();
    c.groups[0].tiers[0].name = { ar: "صفحة هبوط سريعة", en: "Quick landing page" };
    c.copy.packagesTitle = { ar: "باقاتنا", en: "Our packages" };
    await saveCatalogDraft(ceo, c);
    forgetPublishedCatalog();
    expect((await getPackageGroups("ar"))[0].tiers[0].name).toBe(fileCatalog.groups[0].tiers[0].name.ar);
    const state = await catalogEditorState(ceo);
    expect([state.hasDraft, state.live, state.catalog.groups[0].tiers[0].name.ar]).toEqual([true, null, "صفحة هبوط سريعة"]);
    await publishCatalogDraft(ceo);
    expect((await getPackageGroups("ar"))[0].tiers[0].name).toBe("صفحة هبوط سريعة");
    expect((await getOffersCopy("en")).packagesTitle).toBe("Our packages");
    expect((await getOfferItem(c.groups[0].tiers[0].key, "en"))?.name).toBe("Quick landing page");
    const after = await catalogEditorState(ceo);
    expect([after.hasDraft, after.live?.version, after.history.length]).toEqual([false, 1, 1]);
  });

  it("8. publishing is refused while the draft contradicts itself; the live page is untouched", async () => {
    const ceo = await ctxFor((await makeUser(orgId, "ceo@x.test", ["ceo"])).id);
    const c = copyOf();
    c.offers[0].price = 999_999;
    const saved = await saveCatalogDraft(ceo, c);
    expect(saved.problems.length).toBeGreaterThan(0);
    await expect(publishCatalogDraft(ceo)).rejects.toThrow(/CATALOG_HAS_PROBLEMS/);
    expect(await prisma.siteCatalog.count({ where: { status: "PUBLISHED" } })).toBe(0);
  });

  it("9. history: each publish archives the previous one; a version restores into the draft; discard drops it", async () => {
    const ceo = await ctxFor((await makeUser(orgId, "ceo@x.test", ["ceo"])).id);
    await saveCatalogDraft(ceo, copyOf());
    await publishCatalogDraft(ceo, "v1");
    const c = copyOf();
    c.offers = [];
    await saveCatalogDraft(ceo, c);
    await publishCatalogDraft(ceo, "v2");
    expect(await getActiveOffers("ar")).toEqual([]);
    const s = await catalogEditorState(ceo);
    expect(s.history.map((h) => [h.version, h.live, h.note])).toEqual([
      [2, true, "v2"],
      [1, false, "v1"]
    ]);
    await restoreCatalogVersion(ceo, s.history[1].id);
    expect((await catalogEditorState(ceo)).catalog.offers.length).toBe(fileCatalog.offers.length);
    await discardCatalogDraft(ceo);
    expect((await catalogEditorState(ceo)).hasDraft).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "website.offers.published" } })).toBe(2);
  });

  it("10. a published catalog the code can no longer read falls back to the built-in one", async () => {
    await prisma.siteCatalog.create({ data: { organizationId: orgId, key: "offers", status: "PUBLISHED", version: 1, data: { groups: "broken" }, createdById: "x", updatedById: "x" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await publishedCatalog()).groups.length).toBe(fileCatalog.groups.length);
    spy.mockRestore();
  });
});
