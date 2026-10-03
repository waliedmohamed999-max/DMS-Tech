/**
 * Phase 10: strict per-request nonce CSP for the Business OS (/app pages are all dynamically rendered, so Next.js
 * stamps the nonce on its own scripts). No 'unsafe-inline' for scripts; 'strict-dynamic' lets only nonce-loaded scripts
 * load further chunks. Styles keep 'unsafe-inline' (React style attributes — residual, low-risk).
 */
export function osCsp(nonce: string, dev = process.env.NODE_ENV !== "production") {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; ");
}
