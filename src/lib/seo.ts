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
