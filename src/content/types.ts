import type { IconName } from "@/components/ui/Icon";

/**
 * Content model.
 *
 * Every entity here maps 1:1 to a future database table (see supabase/migrations).
 * Text fields are bilingual (`L`) in the source; the repository in `src/lib/content.ts`
 * resolves them to plain strings for the requested locale, so components never
 * know whether data came from these files or from the dashboard's database.
 */
export type L = { ar: string; en: string };

export type Feature = { icon: IconName; title: L; description: L };
export type Benefit = { icon: IconName; label: L };

export type Service = {
  slug: string;
  icon: IconName;
  image: string;
  eyebrow: L;
  title: L;
  /** One-line pitch used on cards and in the mega menu */
  summary: L;
  /** Longer intro on the service page */
  description: L;
  /** Three short lines shown on carousel cards (Wrike "solutions" style) */
  highlights: L[];
  features: Feature[];
  benefits: Benefit[];
  order: number;
  /** Optional extra sections, rendered on the service page only when present (e.g. dedicated-tech-team). */
  audience?: Feature[];
  comparison?: { label: L; inHouse: L; withUs: L }[];
  plans?: { icon: IconName; name: L; term: L; for: L; featured?: boolean; features: L[] }[];
  /** replaces the generic company delivery process */
  process?: Feature[];
  faq?: { q: L; a: L }[];
};

export type Industry = { slug: string; icon: IconName; image: string; title: L; description: L; quote: L; /** simple-icons slugs */ apps: string[] };

/** A delivered client project (src/content/projects.ts). Optional texts are null when not published. */
export type ClientProject = {
  slug: string;
  name: L;
  category: L | null;
  description: L | null;
  /** live website of the project */
  link: string | null;
  cover: string;
  /** "cover" fills the card (photos), "contain" shows the whole image (logos) */
  coverFit: "cover" | "contain";
  gallery: { src: string; width: number; height: number }[];
};

export type ProcessPhase = {
  slug: string;
  icon: IconName;
  tab: L;
  title: L;
  description: L;
  image: string;
  features: { icon: IconName; label: L; href: string }[];
};

export type AiCard = { icon: IconName; title: L; description: L; cta: L; href: string; size: "lg" | "md" | "sm" };

export type Integration = { name: string; slug?: string; color?: string };

export type Post = {
  slug: string;
  category: L;
  title: L;
  excerpt: L;
  image: string;
  date: string;
  readMinutes: number;
  body: L[];
};

export type Job = {
  slug: string;
  /** the website service this role belongs to (services.ts slug) — groups the careers page */
  service: string;
  title: L;
  team: L;
  type: L;
  location: L;
  experience: L;
  icon: IconName;
  /** one-line summary (list card) */
  description: L;
  about: L;
  responsibilities: L[];
  requirements: L[];
  niceToHave: L[];
  /** tools / skills, shown as written in both languages */
  skills: string[];
};

export type Value = { icon: IconName; title: L; description: L };
