"use client";

import { useEffect } from "react";

export const ATTRIBUTION_KEY = "dms_attr";
export const ATTRIBUTION_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "ttclid", "sccid"] as const;

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
 */
export function AttributionCapture() {
  useEffect(() => {
    try {
      const found = readAttribution(window.location.search);
      if (Object.keys(found).length && !sessionStorage.getItem(ATTRIBUTION_KEY)) sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ ...found, landing: window.location.pathname.slice(0, 200) }));
    } catch {}
  }, []);
  return null;
}
