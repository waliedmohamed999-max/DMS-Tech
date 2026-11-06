import "server-only";
import type { Locale } from "@/i18n/routing";
import type { L } from "@/content/types";
import { serviceExtrasCopy, services } from "@/content/services";
import { industries, integrations } from "@/content/industries";
import { aiCards, capabilities, nova, phases, promises, trustCards, values } from "@/content/company";
import { posts } from "@/content/posts";
import { careersCopy, isOpenJob, jobs } from "@/content/careers";
import { activeOffers, basisParts, basisPrice, findDeal, offerAliases, offerEndInstant, offerStatus, questionsFor, visibleGroups, visibleOffers, type Catalog, type Offer, type PackageGroup, type Tier } from "@/content/offers";
import { publishedCatalog } from "@/server/website/catalog";
import { formatMoney } from "@/lib/commercial/calc";
import { clientProjects } from "@/content/projects";
import { caseCopy, visibleCaseStudies } from "@/content/case-studies";
import { projectsCopy } from "@/content/projects-copy";
import { chatbot } from "@/content/chatbot";
import { chatbotNav } from "@/content/chatbot-nav";
import { novaPage } from "@/content/nova-page";

/**
 * Content repository — the only place pages read content from.
 *
 * Today it reads the typed files in `src/content`. When the admin dashboard lands,
 * swap these function bodies for Supabase queries (same return shapes) and every
 * page keeps working unchanged. Functions are async on purpose for that reason.
 */

/** Recursively replaces every bilingual `{ ar, en }` leaf with the locale's string. */
type Localized<T> = T extends L
  ? string
  : T extends readonly (infer U)[]
    ? Localized<U>[]
    : T extends object
      ? { [K in keyof T]: Localized<T[K]> }
      : T;

function isL(v: unknown): v is L {
  return !!v && typeof v === "object" && "ar" in v && "en" in v && Object.keys(v).length === 2;
}

export function localize<T>(value: T, locale: Locale): Localized<T> {
  if (isL(value)) return value[locale] as Localized<T>;
  if (Array.isArray(value)) return value.map((v) => localize(v, locale)) as Localized<T>;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, localize(v, locale)])) as Localized<T>;
  }
  return value as Localized<T>;
}

export async function getServices(locale: Locale) {
  return localize([...services].sort((a, b) => a.order - b.order), locale);
}
export type ServiceView = Awaited<ReturnType<typeof getServices>>[number];

export async function getService(slug: string, locale: Locale) {
  const s = services.find((x) => x.slug === slug);
  return s ? localize(s, locale) : null;
}

export const getServiceSlugs = async () => services.map((s) => s.slug);

export async function getIndustries(locale: Locale) {
  return localize(industries, locale);
}

export async function getIntegrations() {
  return integrations;
}

export async function getCompany(locale: Locale) {
  return { ...localize({ nova, aiCards, phases, values, promises, trustCards }, locale), capabilities };
}

export async function getPosts(locale: Locale) {
  return localize([...posts].sort((a, b) => b.date.localeCompare(a.date)), locale);
}
export type PostView = Awaited<ReturnType<typeof getPosts>>[number];

export async function getPost(slug: string, locale: Locale) {
  const p = posts.find((x) => x.slug === slug);
  return p ? localize(p, locale) : null;
}

export const getPostSlugs = async () => posts.map((p) => p.slug);

/** Open roles only (closed roles keep their page but leave the list). */
export async function getJobs(locale: Locale) {
  return localize(jobs.filter(isOpenJob), locale);
}
export async function getJob(slug: string, locale: Locale) {
  const j = jobs.find((x) => x.slug === slug);
  return j ? localize(j, locale) : null;
}
/** Every role page, open or closed (old links keep working). */
export async function getJobSlugs() {
  return jobs.map((j) => j.slug);
}
/** Open roles only — for the sitemap. */
export async function getOpenJobSlugs() {
  return jobs.filter(isOpenJob).map((j) => j.slug);
}
export async function getCareersCopy(locale: Locale) {
  return localize(careersCopy, locale);
}

export async function getProjects(locale: Locale) {
  return localize(clientProjects, locale);
}

export async function getProject(slug: string, locale: Locale) {
  const p = clientProjects.find((x) => x.slug === slug);
  return p ? localize(p, locale) : null;
}

export async function getProjectSlugs() {
  return clientProjects.map((p) => p.slug);
}

/** Case studies with their project's card data (name, cover) and the matching package page. */
export async function getCaseStudies(locale: Locale) {
  return visibleCaseStudies()
    .map((c) => {
      const p = clientProjects.find((x) => x.slug === c.slug);
      if (!p) return null;
      return { ...localize(c, locale), name: localize(p.name, locale), category: p.category ? localize(p.category, locale) : null, cover: p.cover, coverFit: p.coverFit, packageHref: `/offers/${c.package}` };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
export async function getCaseStudy(slug: string, locale: Locale) {
  return (await getCaseStudies(locale)).find((c) => c.slug === slug) ?? null;
}
export async function getCaseCopy(locale: Locale) {
  return localize(caseCopy, locale);
}

export async function getProjectsCopy(locale: Locale) {
  return localize(projectsCopy, locale);
}

export async function getChatbot(locale: Locale) {
  return { ...localize(chatbot, locale), ui: localize(chatbotNav, locale) };
}

export async function getNovaPage(locale: Locale) {
  return localize(novaPage, locale);
}

export async function getServiceExtrasCopy(locale: Locale) {
  return localize(serviceExtrasCopy, locale);
}

// Packages, campaigns and private deals — the catalog published from the dashboard (src/server/website/catalog.ts);
// every function takes the catalog to show (the published one by default, the working copy for a staff preview).
// marketing prices are whole riyals: "3,500 ر.س", not "3,500.00 ر.س"
const offerMoney = (v: number | null, locale: Locale) => (v === null ? null : formatMoney(v.toFixed(2), locale, "SAR").replace(/[.٫]0{2}(?!d)/, ""));
/** The price with 15% VAT, to the halala. */
const vatMoney = (v: number | null, locale: Locale) => (v === null ? null : offerMoney(Math.round(v * 115) / 100, locale));
export async function getOffersCopy(locale: Locale, cat?: Catalog) {
  return localize((cat ?? (await publishedCatalog())).copy, locale);
}
/** A tier for display: localized text, formatted prices (before / with VAT, monthly average of a term, yearly). */
function tierView(t: Tier, locale: Locale) {
  return {
    ...localize(t, locale),
    amount: t.price,
    price: offerMoney(t.price, locale),
    priceVat: vatMoney(t.price, locale),
    monthlyAvg: t.price !== null && t.termMonths ? offerMoney(Math.round(t.price / t.termMonths), locale) : null,
    annual: t.annual ? offerMoney(t.annual, locale) : null,
    annualSave: t.annual && t.price ? offerMoney(t.price * 12 - t.annual, locale) : null
  };
}
export async function getPackageGroups(locale: Locale, cat?: Catalog) {
  return visibleGroups((cat ?? (await publishedCatalog())).groups).map((g) => ({
    ...localize({ title: g.title, short: g.short, text: g.text, notice: g.notice, highlights: g.highlights }, locale),
    // the lowest priced tier, for the hero tiles ("from 1,999")
    startsAt: (() => {
      const t = g.tiers.filter((x) => x.price !== null).sort((a, b) => a.price! - b.price!)[0];
      return t ? { price: offerMoney(t.price, locale), period: t.period ? localize(t.period, locale) : null } : null;
    })(),
    id: g.id, segment: g.segment, service: g.service, icon: g.icon, draft: Boolean(g.draft), tiers: g.tiers.map((t) => tierView(t, locale)), ...(g.journey ? { journey: localize(g.journey, locale) } : {}) }));
}
/** "1 December 2026" / "1 ديسمبر 2026" for a Riyadh date (Gregorian, Latin digits). */
const longDate = (d: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(new Date(`${d}T12:00:00+03:00`));
/**
 * An offer for display. Everything it includes comes from its packages (`parts`, each with its current price and
 * period), so the offer page can't drift from the package pages; its struck price is their total.
 */
function offerView(o: Offer, locale: Locale, cat: Catalog) {
  const copy = cat.copy;
  const parts = (basisParts(o, cat.groups) ?? []).map((p) => ({
    key: p.tier.key,
    group: localize(p.group.title, locale),
    ...localize({ name: p.tier.name, tagline: p.tier.tagline, model: p.tier.model, about: p.tier.about, features: p.tier.features, excludes: p.tier.excludes, youProvide: p.tier.youProvide, delivery: p.tier.delivery }, locale),
    term: p.months === null ? null : p.months === 1 ? copy.forMonth[locale] : copy.forMonths[locale].replace("{n}", String(p.months)),
    price: offerMoney(p.price, locale)
  }));
  const base = basisPrice(o, cat.groups) ?? o.price;
  const start = longDate(o.startsAt, locale);
  const end = longDate(o.endsAt, locale);
  return {
    slug: o.slug,
    service: o.service,
    icon: o.icon,
    ...localize({ campaign: o.campaign, name: o.name, pitch: o.pitch, forWho: o.forWho, terms: o.terms }, locale),
    parts,
    // what the parts don't include, and what we need from the client, once each
    excludes: [...new Set(parts.flatMap((p) => p.excludes))],
    youProvide: [...new Set(parts.flatMap((p) => p.youProvide))],
    upcoming: offerStatus(o, new Date(), cat.groups) === "scheduled",
    startsAt: o.startsAt,
    endsAt: o.endsAt,
    startLabel: start,
    dates: copy.offerDates[locale].replace("{start}", start).replace("{end}", end),
    endsAtInstant: offerEndInstant(o.endsAt),
    price: offerMoney(o.price, locale),
    priceVat: vatMoney(o.price, locale),
    oldPrice: offerMoney(base, locale),
    saving: offerMoney(base - o.price, locale),
    percent: Math.round((1 - o.price / base) * 100)
  };
}
/** Offers the page shows: running ones (plus, in development, approved ones that haven't started — as a preview). */
export async function getActiveOffers(locale: Locale, cat?: Catalog) {
  const c = cat ?? (await publishedCatalog());
  return visibleOffers(new Date(), c.offers, c.groups).map((o) => offerView(o, locale, c));
}
/** The offer page's extra form questions, localized. */
const questionsView = (service: string, locale: Locale) =>
  questionsFor(service).map((q) => ({ key: q.key, label: localize(q.label, locale), ...(q.options ? { options: q.options.map((o) => localize(o, locale)) } : {}), ...(q.placeholder ? { placeholder: localize(q.placeholder, locale) } : {}) }));

/** A shareable item: a package tier or a running campaign (null = unknown, draft in production, or not running). */
export async function getOfferItem(rawSlug: string, locale: Locale, cat?: Catalog) {
  const c = cat ?? (await publishedCatalog());
  const slug = offerAliases[rawSlug] ?? rawSlug;
  for (const g of visibleGroups(c.groups)) {
    const t = g.tiers.find((x) => x.key === slug);
    if (t) {
      const v = tierView(t, locale);
      return {
        kind: "package" as const,
        key: `pkg:${t.key}`,
        service: g.service,
        group: localize(g.title, locale),
        ...localize({ name: t.name, tagline: t.tagline, features: t.features, period: t.period, delivery: t.delivery, idealFor: t.idealFor, excludes: t.excludes, notice: g.notice, model: t.model, about: t.about, youProvide: t.youProvide, after: t.after }, locale),
        revisions: t.revisions ? localize(t.revisions, locale) : null,
        from: t.from,
        indicative: Boolean(t.indicative),
        billing: t.billing,
        draft: Boolean(g.draft),
        icon: t.icon,
        amount: t.price,
        price: v.price,
        priceVat: v.priceVat,
        monthlyAvg: v.monthlyAvg,
        annual: v.annual,
        annualSave: v.annualSave,
        oldPrice: null,
        saving: null,
        percent: null,
        endsAtInstant: null,
        details: null,
        questions: questionsView(g.service, locale),
        compare: g.tiers.map((x) => ({ key: x.key, current: x.key === t.key, featured: Boolean(x.featured), from: x.from, indicative: Boolean(x.indicative), price: offerMoney(x.price, locale), ...localize({ name: x.name, tagline: x.tagline, period: x.period, delivery: x.delivery, features: x.features.slice(0, 5) }, locale) }))
      };
    }
  }
  const o = visibleOffers(new Date(), c.offers, c.groups).find((x) => x.slug === slug);
  if (!o) return null;
  const v = offerView(o, locale, c);
  return { kind: "offer" as const, key: `offer:${o.slug}`, service: o.service, group: v.campaign, model: null, about: null, youProvide: v.youProvide, after: null, name: v.name, tagline: v.pitch, features: v.parts.map((p) => `${p.group} — ${p.name}${p.term ? ` (${p.term})` : ""}`), period: null, delivery: v.parts.map((p) => `${p.name}: ${p.delivery}`).join(" · "), from: false, indicative: false, billing: "one-time" as const, draft: v.upcoming, icon: o.icon, amount: o.price, price: v.price, priceVat: v.priceVat, monthlyAvg: null, annual: null, annualSave: null, oldPrice: v.oldPrice, saving: v.saving, percent: v.percent, endsAtInstant: v.endsAtInstant, details: { forWho: v.forWho, parts: v.parts, terms: v.terms, excludes: v.excludes, youProvide: v.youProvide, dates: v.dates, upcoming: v.upcoming, startLabel: v.startLabel }, questions: questionsView(o.service, locale), compare: null };
}
/** "ended" for a campaign that is not running (past, not yet started or not approved); null when the slug never existed. */
export const offerUnavailable = async (rawSlug: string, cat?: Catalog) => {
  const slug = offerAliases[rawSlug] ?? rawSlug;
  return (cat ?? (await publishedCatalog())).offers.some((x) => x.slug === slug) ? ("ended" as const) : null;
};
export async function getDeal(token: string, locale: Locale) {
  const r = findDeal(token);
  if (!r) return null;
  return { expired: r.expired, key: `deal:${r.deal.token}`, preview: Boolean(r.deal.preview), ...localize({ client: r.deal.client, title: r.deal.title, text: r.deal.text }, locale), items: r.deal.items.map((i) => ({ label: localize(i.label, locale), price: offerMoney(i.price, locale) })), total: offerMoney(r.deal.total, locale), expiresAt: r.deal.expiresAt, expiresAtInstant: offerEndInstant(r.deal.expiresAt) };
}
export async function getOfferSlugs(cat?: Catalog) {
  const c = cat ?? (await publishedCatalog());
  // real pages only, once each — the ad aliases (/offers/store-marketing…) are copies with a canonical to the real page
  return [...new Set([...visibleGroups(c.groups).flatMap((g) => g.tiers.map((t) => t.key)), ...activeOffers(new Date(), c.offers, c.groups).map((o) => o.slug)])];
}
/** The raw package groups of a catalog (for the structured data on /offers). */
export async function getCatalogGroups(cat?: Catalog): Promise<PackageGroup[]> {
  return visibleGroups((cat ?? (await publishedCatalog())).groups);
}
