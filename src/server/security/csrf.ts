/**
 * CSRF guard for route handlers (docs/SECURITY.md#csrf). Server actions are protected by Next.js itself
 * (Origin must match Host); route handlers that change state call this. Together with the SameSite=Lax session cookie
 * a cross-site page can neither send the cookie on a POST nor pass the origin check.
 *
 *  · Sec-Fetch-Site other than same-origin / none            → rejected
 *  · Origin present but different host (or the opaque "null") → rejected
 *  · neither header (non-browser client)                      → allowed: no browser = no ambient cookie = no CSRF
 */
export function isSameOrigin(h: Headers) {
  const site = h.get("sec-fetch-site");
  if (site && !["same-origin", "none"].includes(site)) return false;
  const origin = h.get("origin");
  if (!origin) return true;
  if (origin === "null") return false;
  try {
    return new URL(origin).host === (h.get("x-forwarded-host") ?? h.get("host"));
  } catch {
    return false;
  }
}
