"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * Cards in a grid on tablets / desktops (`className` holds the grid columns); on phones the same cards become a
 * one-card slider like the deals banner — swipe, arrows and dots (`.card-slider` in globals.css).
 */
export function CardSlider({ children, className = "", labels, rtl }: { children: ReactNode; className?: string; labels: { prev: string; next: string }; rtl: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const count = Children.count(children);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth || 1;
      setActive(Math.min(count - 1, Math.round(Math.abs(el.scrollLeft) / (w + 16))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [count]);

  const go = (k: number) => {
    const el = ref.current;
    if (!el) return;
    const i = Math.max(0, Math.min(count - 1, k));
    // RTL containers scroll towards negative scrollLeft
    el.scrollTo({ left: (rtl ? -1 : 1) * i * (el.clientWidth + 16), behavior: "smooth" });
  };

  return (
    <div className="min-w-0">
      <div ref={ref} className={`card-slider min-w-0 ${className}`}>
        {children}
      </div>
      {count > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 md:hidden">
          <button type="button" onClick={() => go(active - 1)} aria-label={labels.prev} disabled={active === 0} className="grid size-9 place-items-center rounded-full border border-mist bg-white text-ink shadow-card disabled:opacity-40">
            <Icon name={rtl ? "ChevronRight" : "ChevronLeft"} size={16} />
          </button>
          <span className="flex gap-1.5">
            {Array.from({ length: count }, (_, k) => (
              <button key={k} type="button" onClick={() => go(k)} aria-label={`${k + 1}`} aria-current={k === active} className={`h-2 rounded-full transition-all ${k === active ? "w-7 bg-iris" : "w-2 bg-line"}`} />
            ))}
          </span>
          <button type="button" onClick={() => go(active + 1)} aria-label={labels.next} disabled={active === count - 1} className="grid size-9 place-items-center rounded-full border border-mist bg-white text-ink shadow-card disabled:opacity-40">
            <Icon name={rtl ? "ChevronLeft" : "ChevronRight"} size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
