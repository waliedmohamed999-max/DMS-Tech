/**
 * Phase 11: CSP for the PUBLIC website without 'unsafe-inline' (docs/SECURITY.md#security-headers).
 *
 * Statically generated pages: the exact sha256 hashes of their inline scripts / styles (build-time manifest written
 * by scripts/csp-manifest.mjs). Dynamically rendered public pages (e.g. /quote): a per-request nonce, which Next.js
 * stamps on its scripts; their style attributes come from the same shared components, so the site-wide style hash
 * set applies. Development keeps a permissive policy (dev HTML is not what the manifest hashed).
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
    // dynamic page (or unknown path → not-found page): nonce for freshly rendered scripts + the static 404's hashes
    scripts = [opts.nonce ? `'nonce-${opts.nonce}'` : "", quote(opts.notFound?.s ?? [])];
    styles = [...new Set([...(opts.styleUnion ?? []), ...(opts.notFound?.y ?? [])])];
  }
  const scriptSrc = ["'self'", ...scripts].filter(Boolean).join(" ");
  const styleSrc = styles.length ? `'self' 'unsafe-hashes' ${quote(styles)}` : "'self'";
  return [...common, `script-src ${scriptSrc}`, `style-src ${styleSrc}`, "connect-src 'self'"].join("; ");
}
