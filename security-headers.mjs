/**
 * Security headers (Phase 9 review — docs/SECURITY.md#headers). Imported by next.config.mjs and by the tests.
 *
 * CSP: Next.js App Router streams inline RSC bootstrap scripts, so script-src needs 'unsafe-inline' (no nonce pipeline in
 * this build); every other directive is strict: no third-party script / connect / frame origins, no plugins, no framing,
 * forms only to self. PDF / file responses keep their own `sandbox` CSP (set by the route) and are excluded here so the
 * browser's built-in PDF viewer keeps working.
 */
export function contentSecurityPolicy(production) {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    `connect-src 'self'${production ? "" : " ws: wss:"}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
    // no upgrade-insecure-requests: HSTS already forces HTTPS in production, and the directive breaks local http tests
  ].join("; ");
}

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

export function headerRules(production) {
  const base = securityHeaders(production);
  const csp = { key: "Content-Security-Policy", value: contentSecurityPolicy(production) };
  return [
    { source: "/", headers: [...base, csp] },
    // every path except file / PDF routes
    { source: "/:path((?!.*/(?:pdf|download|payslip)$).+)", headers: [...base, csp] },
    { source: "/:path(.*/(?:pdf|download|payslip))", headers: base }
  ];
}
