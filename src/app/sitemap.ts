import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { site } from "@/content/site";
import { getPostSlugs, getServiceSlugs } from "@/lib/content";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [services, posts] = await Promise.all([getServiceSlugs(), getPostSlugs()]);
  const paths = [
    "",
    "/services",
    ...services.map((s) => `/services/${s}`),
    "/nova-ai",
    "/about",
    "/clients",
    "/careers",
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
