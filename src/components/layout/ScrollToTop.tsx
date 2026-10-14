"use client";

import { useEffect } from "react";

/**
 * Every visit starts at the top: the browser would otherwise restore the last scroll position on reload / reopen,
 * landing visitors in the middle of a page. Links to an anchor (#packages…) still go to their section.
 */
export function ScrollToTop() {
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    if (!window.location.hash) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);
  return null;
}
