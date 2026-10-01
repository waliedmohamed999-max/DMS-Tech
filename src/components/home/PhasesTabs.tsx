"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";

type Phase = {
  slug: string;
  icon: IconName;
  tab: string;
  title: string;
  description: string;
  image: string;
  features: { icon: IconName; label: string; href: string }[];
};

/** Wrike's 5-phase tab switcher (Ideate → Plan → Deliver → Report → Learn) */
export default function PhasesTabs({ phases, allLabel, allHref, locale }: { phases: Phase[]; allLabel: string; allHref: string; locale: string }) {
  const [active, setActive] = useState(0);
  const p = phases[active];

  return (
    <div>
      <div role="tablist" className="no-scrollbar -mx-4 mb-10 flex gap-2 overflow-x-auto px-4 md:mx-0 md:justify-center md:px-0">
        {phases.map((ph, i) => (
          <button
            key={ph.slug}
            role="tab"
            id={`tab-${ph.slug}`}
            aria-selected={i === active}
            aria-controls={`panel-${ph.slug}`}
            onClick={() => setActive(i)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-pill border px-5 py-3 text-[15px] font-semibold transition ${
              i === active ? "border-ink bg-ink text-white" : "border-mist text-iron hover:border-iris hover:text-iris"
            }`}
          >
            <span className={`grid size-6 place-items-center rounded-full text-[11px] ${i === active ? "bg-iris text-ink" : "bg-cloud"}`}>
              {String(i + 1).padStart(2, "0")}
            </span>
            {ph.tab}
          </button>
        ))}
      </div>

      <div
        key={p.slug}
        role="tabpanel"
        id={`panel-${p.slug}`}
        aria-labelledby={`tab-${p.slug}`}
        className="grid items-center gap-10 rounded-card bg-white p-6 shadow-lg motion-safe:animate-[fadeIn_.4s_ease] md:p-12 lg:grid-cols-2"
      >
        <div className="grid gap-5">
          <span className="soft-icon">
            <Icon name={p.icon} />
          </span>
          <h3 className="h-lg">{p.title}</h3>
          <p className="lead">{p.description}</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {p.features.map((f) => (
              <Link key={f.label} href={f.href} className="group flex items-center gap-3 rounded-2xl border border-mist p-4 transition hover:border-iris hover:bg-lilac">
                <span className="soft-icon size-10 group-hover:bg-white">
                  <Icon name={f.icon} size={19} />
                </span>
                <span className="text-[15px] font-semibold">{f.label}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl">
          <Image src={p.image} alt={p.title} fill sizes="(min-width: 1024px) 560px, 90vw" className="object-cover" />
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link href={allHref} className="btn btn-outline">
          {allLabel} <Icon name={locale === "ar" ? "ArrowLeft" : "ArrowRight"} size={18} />
        </Link>
      </div>
    </div>
  );
}
