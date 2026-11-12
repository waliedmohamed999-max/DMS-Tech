"use client";

import { useEffect } from "react";
import { listenWhatsAppClicks } from "@/lib/track";

export const ATTRIBUTION_KEY = "dms_attr";
/** utm_* and the ad platforms' click ids. Keep in sync with the server whitelist (ATTRIBUTION_KEY_RE, src/server/crm/website.ts). */
export const ATTRIBUTION_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid", "fbclid", "ttclid", "sccid", "li_fat_id"] as const;

/** Campaign parameters of a URL (utm_* and the ad platforms' click ids), trimmed. */
export function readAttribution(search: string) {
  const q = new URLSearchParams(search);
  const out: Record<string, string> = {};
  for (const k of ATTRIBUTION_PARAMS) {
    const v = q.get(k) ?? (k === "sccid" ? q.get("ScCid") : null);
    if (v) out[k] = v.slice(0, 150);
  }
  return out;
}

/**
 * Keeps the campaign a visitor arrived from (first touch) for the rest of the visit, so a request sent from another
 * page is still credited to the right ad. Session storage only — no cookie, nothing sent anywhere until a form is.
 * Mounted once on every public page, it also registers the delegated WhatsApp click listener (click_cta, dataLayer only).
 */
export function AttributionCapture() {
  useEffect(() => {
    try {
      const found = readAttribution(window.location.search);
      if (Object.keys(found).length && !sessionStorage.getItem(ATTRIBUTION_KEY)) sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ ...found, landing: window.location.pathname.slice(0, 200) }));
    } catch {}
    return listenWhatsAppClicks();
  }, []);
  return null;
}
