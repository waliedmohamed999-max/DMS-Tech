/**
 * Security headers (Phase 9 review, Phase 11 CSP — docs/SECURITY.md#security-headers). Imported by next.config.mjs and
 * the tests. Page CSPs are set per request by src/proxy.ts (no 'unsafe-inline' scripts); this file only carries the
 * baseline headers and the strict CSP for non-page responses.
 */
export function securityHeaders(production) {
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // HSTS only over production HTTPS (never on localhost development)
    ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : [])
  ];
}

/** Non-page responses (API JSON, static files with an extension): nothing may execute or be framed. */
export const NON_PAGE_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export function headerRules(production) {
  const base = securityHeaders(production);
  return [
    // Phase 11: EVERY page CSP is set per request by src/proxy.ts —
    //   public pages: build-time sha256 hashes (static) or a nonce (dynamic), no 'unsafe-inline' (src/lib/csp/public.ts)
    //   /app pages:   per-request nonce + 'strict-dynamic' (src/lib/os/csp.ts)
    // (file / PDF routes send their own `sandbox` CSP from the route handler)
    { source: "/:path*", headers: base },
    // API responses and directly opened SVG files: nothing may execute or be framed
    { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: NON_PAGE_CSP }] },
    { source: "/:path(.*\\.svg)", headers: [{ key: "Content-Security-Policy", value: NON_PAGE_CSP }] }
  ];
}
