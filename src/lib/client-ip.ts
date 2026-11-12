/**
 * The visitor's IP for rate limits and audit rows — one place instead of a copy in every route.
 *
 * Default (TRUSTED_PROXY_HOPS unset or 0): the FIRST X-Forwarded-For entry, which is correct when the edge
 * OVERWRITES the header with the client address (deploy/nginx/dms-os.conf: `proxy_set_header X-Forwarded-For
 * $remote_addr`). Behind a proxy that APPENDS instead (Apache mod_proxy, a CDN), the first entry is whatever the client
 * sent and can be rotated to dodge the limits: set TRUSTED_PROXY_HOPS to the number of proxies you run, and the entry
 * that many places from the right (the one your outermost proxy wrote) is used.
 */
type HeaderBag = { get(name: string): string | null };

export function clientIp(h: HeaderBag): string | null {
  const list = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length) {
    const hops = Math.floor(Number(process.env.TRUSTED_PROXY_HOPS ?? 0));
    return hops > 0 ? list[Math.max(0, list.length - hops)] : list[0];
  }
  return h.get("x-real-ip")?.trim() || null;
}
