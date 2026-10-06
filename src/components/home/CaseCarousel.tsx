"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/Brand";

type Item = { slug: string; icon: IconName; title: string; description: string; quote: string; apps: string[] };

const tints = [
  { block: "from-[#5b86e5] via-[#a9c0f2] to-white", dot: "bg-cobalt" },
  { block: "from-[#3fbf73] via-[#a7e3bf] to-white", dot: "bg-fern" },
  { block: "from-[#9b8cff] via-[#d4ccff] to-white", dot: "bg-iris" }
];

function Card({ item, tint, label, cta, rtl, faded }: { item: Item; tint: number; label: string; cta: string; rtl: boolean; faded?: boolean }) {
  const t = tints[tint % tints.length];
  return (
    <article className={`grid w-[min(92vw,620px)] shrink-0 overflow-hidden rounded-card border border-mist bg-white sm:grid-cols-[210px_1fr] ${faded ? "opacity-35" : "shadow-card"}`}>
      <div className={`flex flex-col items-center justify-between gap-6 bg-gradient-to-br ${t.block} px-6 py-8 text-center`}>
        <div className="flex items-center gap-2 text-ink">
          <Icon name={item.icon} size={22} />
          <span className="text-lg font-bold tracking-[-0.3px]">{item.title}</span>
        </div>
        <div className="grid justify-items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-iron">{label}</span>
          <div className="flex gap-2" dir="ltr">
            {item.apps.map((a) => (
              <span key={a} className={`grid size-9 place-items-center rounded-full text-white ${t.dot}`}>
                <BrandIcon slug={a} size={16} />
              </span>
            ))}
          </div>
        </div>
        <Link href="/clients" tabIndex={faded ? -1 : 0} className="inline-flex items-center gap-2 rounded-full bg-ink py-2 pe-2 ps-5 text-sm font-semibold text-white">
          {cta}
          <span className="grid size-5 place-items-center rounded-full bg-white text-ink">
            <Icon name={rtl ? "ArrowLeft" : "ArrowRight"} size={12} strokeWidth={2.5} />
          </span>
        </Link>
      </div>
      <div className="grid content-start gap-1 p-7">
        <p className="text-lg font-semibold text-ink">{item.title}</p>
        <p className="text-base text-graphite">{item.description}</p>
        <p className="mt-5 text-lg leading-relaxed text-ink">“{item.quote}”</p>
      </div>
    </article>
  );
}

/** Specify case-study carousel: centred card, neighbours faded and clipped at the edges */
export default function CaseCarousel({ items, label, cta }: { items: Item[]; label: string; cta: string }) {
  const [i, setI] = useState(0);
  const rtl = useLocale() === "ar";
  const n = items.length;

  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % n), 6000);
    return () => clearInterval(id);
  }, [n]);

  const at = (k: number) => (k + n) % n;

  return (
    <div>
      <div className="relative flex justify-center gap-8 overflow-hidden py-2 [mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)]">
        <div className="hidden justify-end lg:flex lg:w-0 lg:flex-1">
          <button type="button" onClick={() => setI(at(i - 1))} aria-label="previous" className="shrink-0">
            <Card item={items[at(i - 1)]} tint={at(i - 1)} label={label} cta={cta} rtl={rtl} faded />
          </button>
        </div>
        {/* all cases share one grid cell and only the current one is visible: the carousel keeps the height of the
            tallest card, so the auto-advance never resizes the section (no page jump on mobile, where cards stack) */}
        <div className="grid">
          {items.map((it, k) => {
            const on = k === i;
            return (
              <div key={on ? `on-${i}` : `off-${k}`} className={`col-start-1 row-start-1 grid ${on ? "motion-safe:animate-[fadeIn_.4s_ease]" : "invisible"}`} aria-hidden={!on} inert={!on}>
                <Card item={it} tint={k} label={label} cta={cta} rtl={rtl} />
              </div>
            );
          })}
        </div>
        <div className="hidden lg:flex lg:w-0 lg:flex-1">
          <button type="button" onClick={() => setI(at(i + 1))} aria-label="next" className="shrink-0">
            <Card item={items[at(i + 1)]} tint={at(i + 1)} label={label} cta={cta} rtl={rtl} faded />
          </button>
        </div>
      </div>
      <div className="mt-6 flex justify-center gap-2">
        {items.map((it, k) => (
          <button key={it.slug} type="button" aria-label={it.title} onClick={() => setI(k)} className={`size-1.5 rounded-full transition ${k === i ? "bg-ink" : "bg-line"}`} />
        ))}
      </div>
    </div>
  );
}
