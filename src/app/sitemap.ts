import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { site } from "@/content/site";
import { getJobSlugs, getPostSlugs, getProjectSlugs, getServiceSlugs } from "@/lib/content";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [services, posts, projects, jobs] = await Promise.all([getServiceSlugs(), getPostSlugs(), getProjectSlugs(), getJobSlugs()]);
  const paths = [
    "",
    "/services",
    ...services.map((s) => `/services/${s}`),
    "/nova-ai",
    "/dms-chat-bot",
    "/about",
    "/clients",
    ...projects.map((p) => `/clients/${p}`),
    "/careers",
    ...jobs.map((j) => `/careers/${j}`),
    "/blog",
    ...posts.map((p) => `/blog/${p}`),
    "/contact",
    "/quote"
  ];
  const url = (locale: string, path: string) => `${site.url}${locale === routing.defaultLocale ? "" : `/${locale}`}${path}`;

  return paths.map((path) => ({
    url: url(routing.defaultLocale, path),
    lastModified: new Date(),
    alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, url(l, path)])) }
  }));
}
