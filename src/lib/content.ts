import "server-only";
import type { Locale } from "@/i18n/routing";
import type { L } from "@/content/types";
import { serviceExtrasCopy, services } from "@/content/services";
import { industries, integrations } from "@/content/industries";
import { aiCards, capabilities, nova, phases, promises, trustCards, values } from "@/content/company";
import { posts } from "@/content/posts";
import { careersCopy, jobs } from "@/content/careers";
import { activeOffers, cycleEnd, findDeal, findOffer, offerAliases, offerEndInstant, offers, offersCopy, packageGroups, questionsFor, todaysDeals, type Offer } from "@/content/offers";
import { formatMoney } from "@/lib/commercial/calc";
import { clientProjects } from "@/content/projects";
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

export async function getJobs(locale: Locale) {
  return localize(jobs, locale);
}
export async function getJob(slug: string, locale: Locale) {
  const j = jobs.find((x) => x.slug === slug);
  return j ? localize(j, locale) : null;
}
export async function getJobSlugs() {
  return jobs.map((j) => j.slug);
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

// Packages, offers and private deals (src/content/offers.ts)
// marketing prices are whole riyals: "3,500 ر.س", not "3,500.00 ر.س"
const offerMoney = (v: number | null, locale: Locale) => (v === null ? null : formatMoney(v.toFixed(2), locale, "SAR").replace(/[.٫]0{2}(?!d)/, ""));
export async function getOffersCopy(locale: Locale) {
  return localize(offersCopy, locale);
}
export async function getPackageGroups(locale: Locale) {
  return packageGroups.map((g) => ({
    ...localize({ title: g.title, short: g.short, text: g.text, notice: g.notice, highlights: g.highlights }, locale),
    // the lowest priced tier, for the hero tiles ("from 1,999")
    startsAt: (() => {
      const t = g.tiers.filter((x) => x.price !== null).sort((a, b) => a.price! - b.price!)[0];
      return t ? { price: offerMoney(t.price, locale), period: t.period ? localize(t.period, locale) : null } : null;
    })(),
    id: g.id, segment: g.segment, service: g.service, icon: g.icon, tiers: g.tiers.map((t) => ({ ...localize(t, locale), price: offerMoney(t.price, locale) })), ...(g.journey ? { journey: localize(g.journey, locale) } : {}) }));
}
/** An offer with its localized details and the end of its current cycle (end of today / of this week). */
function offerView(o: Offer, locale: Locale) {
  return { ...localize(o, locale), endsAtInstant: cycleEnd(o.cycle).toISOString(), price: offerMoney(o.price, locale), oldPrice: offerMoney(o.oldPrice, locale), saving: offerMoney(o.oldPrice - o.price, locale), percent: Math.round((1 - o.price / o.oldPrice) * 100) };
}
export async function getActiveOffers(locale: Locale) {
  return { weekly: activeOffers().filter((o) => o.cycle === "weekly").map((o) => offerView(o, locale)), today: todaysDeals().map((o) => offerView(o, locale)), weekEndsAt: cycleEnd("weekly").toISOString() };
}
/** A shareable item: a package tier, a running offer or "today" (null = unknown, ended, or a daily deal on another day). */
/** The offer page's extra form questions, localized. */
const questionsView = (service: string, locale: Locale) =>
  questionsFor(service).map((q) => ({ key: q.key, label: localize(q.label, locale), ...(q.options ? { options: q.options.map((o) => localize(o, locale)) } : {}), ...(q.placeholder ? { placeholder: localize(q.placeholder, locale) } : {}) }));

export async function getOfferItem(rawSlug: string, locale: Locale) {
  const slug = offerAliases[rawSlug] ?? rawSlug;
  for (const g of packageGroups) {
    const t = g.tiers.find((x) => x.key === slug);
    if (t)
      return {
        kind: "package" as const,
        key: `pkg:${t.key}`,
        service: g.service,
        group: localize(g.title, locale),
        ...localize({ name: t.name, tagline: t.tagline, features: t.features, period: t.period, delivery: t.delivery, idealFor: t.idealFor, excludes: t.excludes, notice: g.notice }, locale),
        from: t.from,
        icon: t.icon,
        price: offerMoney(t.price, locale),
        oldPrice: null,
        saving: null,
        percent: null,
        endsAtInstant: null,
        details: null,
        questions: questionsView(g.service, locale),
        compare: g.tiers.map((x) => ({ key: x.key, current: x.key === t.key, featured: Boolean(x.featured), from: x.from, price: offerMoney(x.price, locale), ...localize({ name: x.name, tagline: x.tagline, period: x.period, delivery: x.delivery, features: x.features.slice(0, 5) }, locale) }))
      };
  }
  const o = findOffer(slug);
  if (!o) return null;
  const v = offerView(o, locale);
  return { kind: "offer" as const, key: `offer:${o.slug}`, service: o.service, group: v.badge, name: v.title, tagline: v.text, features: v.features, period: null, delivery: v.delivery, icon: o.icon, price: v.price, oldPrice: v.oldPrice, saving: v.saving, percent: v.percent, endsAtInstant: v.endsAtInstant, cycle: o.cycle, details: { forWho: v.forWho, deliverables: v.deliverables, terms: v.terms, excludes: v.excludes }, questions: questionsView(o.service, locale), compare: null };
}
/** "ended" for a past weekly offer, "notToday" for a daily deal on another day, null when the slug never existed. */
export const offerUnavailable = (rawSlug: string) => {
  const slug = offerAliases[rawSlug] ?? rawSlug;
  const o = offers.find((x) => x.slug === slug);
  return o ? (o.cycle === "daily" ? ("notToday" as const) : ("ended" as const)) : null;
};
export async function getDeal(token: string, locale: Locale) {
  const r = findDeal(token);
  if (!r) return null;
  return { expired: r.expired, key: `deal:${r.deal.token}`, preview: Boolean(r.deal.preview), ...localize({ client: r.deal.client, title: r.deal.title, text: r.deal.text }, locale), items: r.deal.items.map((i) => ({ label: localize(i.label, locale), price: offerMoney(i.price, locale) })), total: offerMoney(r.deal.total, locale), expiresAt: r.deal.expiresAt, expiresAtInstant: offerEndInstant(r.deal.expiresAt) };
}
export async function getOfferSlugs() {
  return [...packageGroups.flatMap((g) => g.tiers.map((t) => t.key)), ...offers.filter((o) => o.cycle === "weekly").map((o) => o.slug), ...Object.keys(offerAliases), "today"];
}
