import "server-only";
import type { Locale } from "@/i18n/routing";
import type { L } from "@/content/types";
import { serviceExtrasCopy, services } from "@/content/services";
import { industries, integrations } from "@/content/industries";
import { aiCards, capabilities, nova, phases, promises, trustCards, values } from "@/content/company";
import { posts } from "@/content/posts";
import { careersCopy, jobs } from "@/content/careers";
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
