/**
 * Phase 11: CSP for the PUBLIC website without 'unsafe-inline' (docs/SECURITY.md#security-headers).
 *
 * Statically generated pages: the exact sha256 hashes of their inline scripts / styles (build-time manifest written
 * by scripts/csp-manifest.mjs). Dynamically rendered public pages (/offers, /quote): a per-request nonce, which Next.js
 * stamps on its scripts. Their style ATTRIBUTES are rendered per request (countdowns, sliders, animation delays), so no
 * build-time hash can list them: `style-src-attr 'unsafe-inline'` allows inline style attributes only — they cannot
 * run code — while scripts stay nonce-only and <style> elements stay hash-only. (The former site-wide hash union both
 * blocked those per-request styles and pushed the headers past 8 KB, which proxies and fetchers reject with 403/431.)
 * Development keeps a permissive policy (dev HTML is not what the manifest hashed).
 */
export type PublicCspEntry = { s: string[]; y: string[] };
export type PublicCspManifest = { buildId: string; routes: Record<string, PublicCspEntry>; notFound: PublicCspEntry; styleUnion: string[] };

/** Public URL → prerendered route key. Arabic is unprefixed (localePrefix "as-needed"), English lives under /en. */
export function publicRouteKey(pathname: string) {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (p === "/en" || p.startsWith("/en/") || p === "/ar" || p.startsWith("/ar/")) return p;
  return p === "/" ? "/ar" : `/ar${p}`;
}

const quote = (hashes: string[]) => hashes.map((x) => `'${x}'`).join(" ");

export function publicCsp(opts: { entry?: PublicCspEntry | null; nonce?: string; styleUnion?: string[]; notFound?: PublicCspEntry | null; dev?: boolean }) {
  const common = [
    "default-src 'self'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ];
  if (opts.dev) return [...common, "script-src 'self' 'unsafe-inline' 'unsafe-eval'", "style-src 'self' 'unsafe-inline'", "connect-src 'self' ws: wss:"].join("; ");
  let scripts: string[];
  let styles: string[];
  if (opts.entry) {
    scripts = [quote(opts.entry.s)];
    styles = opts.entry.y;
  } else {
    // dynamic page (or unknown path → not-found page): nonce for freshly rendered scripts + the static 404's hashes;
    // <style> elements only by the 404's hashes, style attributes via style-src-attr (see the note above)
    scripts = [opts.nonce ? `'nonce-${opts.nonce}'` : "", quote(opts.notFound?.s ?? [])];
    styles = opts.notFound?.y ?? [];
  }
  const scriptSrc = ["'self'", ...scripts].filter(Boolean).join(" ");
  const styleSrc = styles.length ? `'self' 'unsafe-hashes' ${quote(styles)}` : "'self'";
  const attr = opts.entry ? [] : ["style-src-attr 'unsafe-inline'"];
  return [...common, `script-src ${scriptSrc}`, `style-src ${styleSrc}`, ...attr, "connect-src 'self'"].join("; ");
}
