"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Pauses the CSS animations of page sections that are off screen (`data-motion-paused`, see globals.css).
 * The homepage runs dozens of decorative loops (service-card demos, marquees, cursors); on phones the ones the visitor
 * cannot see still cost style/paint work every frame and make scrolling stutter. Sections resume 200px before they
 * scroll into view, so nothing visibly stops.
 */
export function PauseOffscreenMotion() {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main section"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.target.toggleAttribute("data-motion-paused", !e.isIntersecting);
      },
      { rootMargin: "200px 0px" }
    );
    sections.forEach((s) => io.observe(s));
    return () => {
      io.disconnect();
      sections.forEach((s) => s.removeAttribute("data-motion-paused"));
    };
  }, [pathname]);
  return null;
}
