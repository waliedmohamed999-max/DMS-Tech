"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";

/** Records one view_offer per offer page view (see src/lib/track.ts). */
export function TrackView({ offer, service, price }: { offer: string; service: string; price?: string | null }) {
  useEffect(() => {
    const value = price ? Number(price.replace(/[^0-9.]/g, "")) : undefined;
    track("view_offer", { offer, service, value, currency: value ? "SAR" : undefined }, `view:${offer}`);
  }, [offer, service, price]);
  return null;
}
