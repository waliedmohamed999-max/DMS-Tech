/** Catalog data model: packages (tiers), sections, offers and private deals. */
import { type IconName } from "@/components/ui/Icon";
import { type L } from "../types";
import { type OffersCopy } from "./copy";

/** How a price is paid: once, every month, or one total for a fixed term of `termMonths`. */
export type Billing = "one-time" | "monthly" | "term";
export type Tier = {
  key: string;
  icon: IconName;
  name: L;
  tagline: L;
  /** who the package suits */
  idealFor: L;
  /** what kind of service it is: a project or system the client owns, a subscription, or a fixed term */
  model: L;
  /** plain explanation of what we do and what the client ends up with */
  about: L;
  /** what we need from the client to start */
  youProvide: L[];
  /** what happens after delivery: support, renewals, running costs */
  after: L;
  price: number | null;
  /** true = "from" price (for the stated base scope); false = a fixed price */
  from: boolean;
  /** a "from" price that is only a first indication ("initial indication from") — set after a requirements study */
  indicative?: boolean;
  period: L | null;
  billing: Billing;
  /** term plans: the months the total price covers (the page also shows the monthly average) */
  termMonths?: number;
  delivery: L;
  /** revision rounds, where the package has them */
  revisions?: L;
  featured?: boolean;
  features: L[];
  /** stated plainly so nobody is surprised later */
  excludes: L[];
  /** monthly plans: the price for 12 months paid upfront (shown as "or yearly …, save …") */
  annual?: number;
};
/** One step of a client journey shown under a group's tiers; `tier` is the package that covers it. */
export type JourneyStep = { icon: IconName; title: L; text: L; tier: string };
/** `notice`: the section's key conditions, shown above the tiers · `short`: the tab / hero tile name ·
 * `highlights`: three things the service delivers, shown beside its visual · `id`: the tab / link key (#pkg-<id>) ·
 * `service`: the service page it belongs to · `segment`: smb = packages, business = company solutions (quote-led) ·
 * `draft`: awaiting the company's approval, development only. */
export type PackageGroup = { id: string; segment: "smb" | "business"; service: string; icon: IconName; title: L; short: L; text: L; highlights: L[]; notice: L; tiers: Tier[]; journey?: JourneyStep[]; draft?: boolean };
/**
 * A limited-time offer on current packages. It shows only once `approved` (who approved it and when) and only between
 * `startsAt` and `endsAt` (Riyadh dates, both days included) — nothing renews by itself. What it includes, excludes and
 * its struck price come from the packages in `basis` (`months` of a monthly plan); a bundle lists each one. An offer
 * priced at or above its packages, or built on a "from" price or a draft, is never shown.
 */
export type Offer = {
  slug: string;
  service: string;
  icon: IconName;
  /** the campaign it belongs to (shown on the banner with its dates) */
  campaign: L;
  name: L;
  /** one sentence: what the client gets */
  pitch: L;
  forWho: L;
  price: number;
  basis: { key: string; months?: number }[];
  /** conditions of the offer itself (payment, how long the price holds) — the packages' own scope still applies */
  terms: L[];
  startsAt: string;
  endsAt: string;
  approved: string | null;
};
export type Deal = { token: string; client: L; title: L; text: L; items: { label: L; price: number | null }[]; total: number | null; expiresAt: string; preview?: boolean };

export type Catalog = { groups: PackageGroup[]; offers: Offer[]; copy: OffersCopy };
