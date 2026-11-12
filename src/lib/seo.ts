import { site } from "@/content/site";

/**
 * The page's own canonical URL and its Arabic / English twin (hreflang). Every public page sets this from its
 * generateMetadata — otherwise it would inherit the layout's, which points at the home page and tells search engines
 * the page is a copy of the home page. Arabic is unprefixed, English lives under /en (localePrefix "as-needed").
 */
export function alternatesFor(locale: string, path: string) {
  const p = path === "/" ? "" : path;
  const ar = p || "/";
  const en = `/en${p}`;
  return { alternates: { canonical: locale === "en" ? en : ar, languages: { ar, en, "x-default": ar } } };
}

/** Share image used when a page has none of its own (the layout's default). */
export const DEFAULT_SHARE_IMAGE = "/images/photos/about-team.jpg";

/** Arabic is published for Saudi readers, English for everyone else. */
export const ogLocale = (locale: string) => (locale === "en" ? "en_US" : "ar_SA");

/** Headings in messages mark highlighted words with *stars* — never show them in a title or a share preview. */
export const plainText = (s: string) => s.replace(/\*/g, "").replace(/\s+/g, " ").trim();

type PageMeta = {
  locale: string;
  /** the page path without the locale prefix ("/careers", "/blog/x") */
  path: string;
  title: string;
  description?: string | null;
  /** site-relative or absolute; resolved against the layout's metadataBase */
  image?: string | null;
  type?: "website" | "article";
  /** articles: YYYY-MM-DD */
  publishedTime?: string;
};

/**
 * Everything a public page needs so its link previews (WhatsApp, X, LinkedIn, Slack…) and search results show the
 * page itself, not the home page: title, description, canonical + hreflang, Open Graph and Twitter card.
 * Next.js replaces — does not merge — a parent's `openGraph` / `twitter` objects, so a page that set only
 * `openGraph.images` used to lose its title and description in previews; this helper always sets the whole object.
 */
export function pageMetadata(m: PageMeta) {
  const title = plainText(m.title);
  const description = m.description ? plainText(m.description) : undefined;
  const { alternates } = alternatesFor(m.locale, m.path);
  const image = m.image || DEFAULT_SHARE_IMAGE;
  return {
    title,
    description,
    alternates,
    openGraph: {
      type: m.type ?? "website",
      url: alternates.canonical,
      title,
      description,
      siteName: site.name,
      locale: ogLocale(m.locale),
      alternateLocale: [m.locale === "en" ? "ar_SA" : "en_US"],
      images: [{ url: image, alt: title }],
      ...(m.publishedTime ? { publishedTime: m.publishedTime } : {})
    },
    twitter: { card: "summary_large_image" as const, title, description, images: [image] }
  };
}
