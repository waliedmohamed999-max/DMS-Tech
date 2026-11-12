
/**
 * Packages, limited-time offers and private deals (/offers, /offers/[slug], /offers/deal/[token]).
 *
 * Terms used on the page, and kept apart in the code:
 * - PACKAGE (`Tier`): a service with a written scope and a published price — fixed, or "from" for a stated base scope.
 * - OFFER (`Offer`): a special price on one or more packages for real dates. It holds no scope text of its own: its
 *   contents, exclusions and struck price all come from the packages in `basis`, so it can never contradict them.
 * - CUSTOM QUOTE: anything whose price depends on requirements (business solutions, "from" prices).
 *
 * PRICES (SAR, before 15% VAT) — approved by the owner on 2026-11-05 (brief, then +~10%). Platform subscriptions, ad
 * spend, Meta and AI usage are never included. Never change a price without the company's approval; no package has an
 * approved cost sheet yet (docs/PRICING-PROFITABILITY.md). `draft: true` groups render in development only.
 * Every package, offer and deal has a stable `key`; the website form sends it and the server resolves it here (see
 * offerLabel / offerReference), so the CRM lead and the e-mail show exactly what the client asked for, at which price.
 * Naming: tiers inside a section climb Essential → Professional → Advanced (الأساسية → الاحترافية → المتقدمة) unless the
 * tiers are different products (websites, AI, systems).
 *
 * EDITING: the sections, packages, offers and page texts are edited in the dashboard (/app/website/offers) and published
 * from there (src/server/website/catalog.ts). This file is the built-in starting catalog: the site uses it until the first
 * publish, and whenever the database can't be read. Every helper below takes the catalog it works on (default: this file).
 */
import { type Billing, type Catalog, type Offer, type PackageGroup } from "./model";
import { packageGroups } from "./packages";
import { deals, offers, retiredOffers } from "./campaigns";
import { offersCopy } from "./copy";
export type { Billing, Catalog, Deal, JourneyStep, Offer, PackageGroup, Tier } from "./model";
export { packageGroups } from "./packages";
export { LEAD_DETAIL_LABELS, groupAliases, leadQuestions, offerAliases, questionsFor } from "./lead-questions";
export type { LeadDetailKey, LeadQuestion } from "./lead-questions";
export { deals, offers, retiredOffers } from "./campaigns";
export { offersCopy } from "./copy";
export type { OffersCopy } from "./copy";

/** Design examples (`preview`) and unapproved groups (`draft`) exist in development only. */
const inDevelopment = () => process.env.NODE_ENV !== "production";
const live = (x: { preview?: boolean; draft?: boolean }) => !(x.preview || x.draft) || inDevelopment();
/** The package groups visitors may see (drafts only in development). */
export const visibleGroups = (groups: PackageGroup[] = packageGroups) => groups.filter(live);
const day = (s: string) => new Date(`${s}T00:00:00+03:00`);
/** End of the given Riyadh day as an ISO instant (private deals and offers run through their last day). */
export const offerEndInstant = (s: string) => new Date(day(s).getTime() + 86_400_000).toISOString();

/** A visible package by key, with its group. */
export function findTier(key: string, groups: PackageGroup[] = packageGroups) {
  for (const g of visibleGroups(groups)) {
    const x = g.tiers.find((y) => y.key === key);
    if (x) return { group: g, tier: x };
  }
  return null;
}
/** An offer's packages with what each costs today; null when a part has no fixed price or is not visible. */
export function basisParts(o: Offer, groups: PackageGroup[] = packageGroups) {
  const parts = o.basis.map((b) => {
    const f = findTier(b.key, groups);
    if (!f || f.tier.from || f.tier.price === null) return null;
    const months = f.tier.billing === "one-time" ? null : (b.months ?? 1);
    return { ...f, months, price: f.tier.price * (months ?? 1) };
  });
  return parts.length && parts.every((p) => p !== null) ? (parts as NonNullable<(typeof parts)[number]>[]) : null;
}
/** What an offer's packages cost today at their published prices (its struck price). */
export function basisPrice(o: Offer, groups: PackageGroup[] = packageGroups): number | null {
  const parts = basisParts(o, groups);
  return parts ? parts.reduce((s, p) => s + p.price, 0) : null;
}
/** live = approved, within its dates and cheaper than its packages; scheduled / ended by date; invalid = never shown. */
export function offerStatus(o: Offer, now = new Date(), groups: PackageGroup[] = packageGroups): "live" | "scheduled" | "ended" | "invalid" {
  const base = basisPrice(o, groups);
  if (!o.approved || base === null || o.price >= base || o.endsAt < o.startsAt) return "invalid";
  if (now < day(o.startsAt)) return "scheduled";
  if (now >= new Date(offerEndInstant(o.endsAt))) return "ended";
  return "live";
}
/** Offers running now. */
export function activeOffers(now = new Date(), list = offers, groups: PackageGroup[] = packageGroups) {
  return list.filter((o) => offerStatus(o, now, groups) === "live");
}
/** What the page shows: running offers, plus — in development only — approved offers that haven't started (preview). */
export function visibleOffers(now = new Date(), list = offers, groups: PackageGroup[] = packageGroups) {
  return list.filter((o) => {
    const s = offerStatus(o, now, groups);
    return s === "live" || (s === "scheduled" && inDevelopment());
  });
}
export function findOffer(slug: string, now = new Date(), list = offers, groups: PackageGroup[] = packageGroups) {
  return activeOffers(now, list, groups).find((o) => o.slug === slug) ?? null;
}
/** A private deal by its token: `expired` once past expiresAt (the page then says so instead of showing it). */
export function findDeal(token: string, now = new Date()) {
  const d = deals.find((x) => x.token === token && live(x));
  if (!d) return null;
  return { deal: d, expired: now >= new Date(offerEndInstant(d.expiresAt)) };
}

const sar = (n: number) => `${n.toLocaleString("en-US")} ر.س`;
/** What a form key stands for ("pkg:web-growth", "offer:<slug>", "deal:<token>"), in Arabic for the CRM / e-mail. */
export function offerLabel(key: string, cat: Catalog = fileCatalog): string | null {
  const [kind, id] = key.split(":");
  if (kind === "pkg") {
    const f = findTier(id, cat.groups);
    if (f) return `${f.group.title.ar} — ${f.tier.name.ar}`;
  }
  if (kind === "offer") {
    const o = cat.offers.find((x) => x.slug === id);
    if (o) return `عرض لفترة محدودة: ${o.name.ar}`;
    if (id in retiredOffers) return `عرض سابق متوقف (${id})`;
  }
  if (kind === "deal") {
    const d = deals.find((x) => x.token === id && live(x));
    if (d) return `عرض خاص: ${d.title.ar} (${d.client.ar})`;
  }
  return null;
}
/**
 * The reference price of a form key at the moment of the request, resolved on the server (never from the visitor):
 * amount, how it is paid and one Arabic line for the CRM lead and the e-mail. null when the key has no price.
 */
export function offerReference(key: string, cat: Catalog = fileCatalog): { price: number; from: boolean; billing: Billing; termMonths: number | null; text: string } | null {
  const [kind, id] = key.split(":");
  const vat = "قبل ضريبة القيمة المضافة 15%";
  if (kind === "pkg") {
    const x = findTier(id, cat.groups)?.tier;
    if (!x || x.price === null) return null;
    const lead = x.from ? (x.indicative ? "مؤشر أولي من " : "يبدأ من ") : "";
    const avg = x.termMonths ? ` (متوسط ${sar(Math.round(x.price / x.termMonths))} شهرياً)` : "";
    return { price: x.price, from: x.from, billing: x.billing, termMonths: x.termMonths ?? null, text: `${lead}${sar(x.price)} — ${x.period?.ar ?? ""}${avg}، ${vat}` };
  }
  if (kind === "offer") {
    const o = findOffer(id, new Date(), cat.offers, cat.groups);
    const base = o ? basisPrice(o, cat.groups) : null;
    if (!o || base === null) return null;
    return { price: o.price, from: false, billing: "one-time", termMonths: null, text: `${sar(o.price)} بدل ${sar(base)} حتى ${o.endsAt}، ${vat}` };
  }
  if (kind === "deal") {
    const d = deals.find((x) => x.token === id && live(x));
    if (!d || d.total === null) return null;
    return { price: d.total, from: false, billing: "one-time", termMonths: null, text: `${sar(d.total)}، ${vat}` };
  }
  return null;
}

/** The built-in catalog (this file). */
export const fileCatalog: Catalog = { groups: packageGroups, offers, copy: offersCopy };
