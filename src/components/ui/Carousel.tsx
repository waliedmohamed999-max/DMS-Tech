"use client";

import { useRef, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "./Icon";

/** Swipeable scroll-snap carousel with prev/next buttons (Wrike solutions/testimonials style). */
export default function Carousel({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations("common");
  const rtl = useLocale() === "ar";

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-slide]");
    const step = (card?.offsetWidth ?? 320) + 24;
    // in RTL, "next" moves towards negative scrollLeft
    el.scrollBy({ left: dir * step * (rtl ? -1 : 1), behavior: "smooth" });
  };

  return (
    <div>
      <div ref={ref} className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-px-4 px-4 pb-6 sm:-mx-6 sm:scroll-px-6 sm:px-6">
        {children}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>{footer}</div>
        <div className="flex gap-2">
          <button type="button" onClick={() => scroll(-1)} aria-label={t("prev")} className="grid size-12 place-items-center rounded-full border border-mist transition hover:border-ink hover:bg-ink hover:text-white">
            <Icon name={rtl ? "ChevronRight" : "ChevronLeft"} />
          </button>
          <button type="button" onClick={() => scroll(1)} aria-label={t("next")} className="grid size-12 place-items-center rounded-full border border-mist transition hover:border-ink hover:bg-ink hover:text-white">
            <Icon name={rtl ? "ChevronLeft" : "ChevronRight"} />
          </button>
        </div>
      </div>
    </div>
  );
}
