"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";

type JobCard = { slug: string; service: string; title: string; description: string; team: string; type: string; location: string; experience: string; icon: IconName };
type Group = { slug: string; title: string; icon: IconName; count: number };

/** Careers list with department filters (one per website service). Every card links to the full job page. */
export default function JobsBrowser({ jobs, groups, labels, locale }: { jobs: JobCard[]; groups: Group[]; labels: { all: string; details: string }; locale: string }) {
  const [filter, setFilter] = useState<string | null>(null);
  const shown = filter ? jobs.filter((j) => j.service === filter) : jobs;
  const arrow = locale === "ar" ? "ArrowLeft" : "ArrowRight";

  const Chip = ({ id, title, icon, count }: { id: string | null; title: string; icon: IconName; count: number }) => {
    const on = filter === id;
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => setFilter(id)}
        className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
          on ? "border-iris bg-iris text-white" : "border-mist bg-white text-ink hover:border-iris/40"
        }`}
      >
        <Icon name={icon} size={15} />
        {title}
        <span className={`rounded-full px-1.5 text-[11px] ${on ? "bg-white/20" : "bg-cloud text-iron"}`}>{count}</span>
      </button>
    );
  };

  return (
    <div className="grid gap-8">
      {/* phones: one scrollable row; larger screens: wrapped */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {Chip({ id: null, title: labels.all, icon: "LayoutDashboard", count: jobs.length })}
        {groups.map((g) => (
          <span key={g.slug} className="contents">
            {Chip({ id: g.slug, title: g.title, icon: g.icon, count: g.count })}
          </span>
        ))}
      </div>

      <ul className="grid gap-5 md:grid-cols-2">
        {shown.map((j) => (
          <li key={j.slug}>
            <Link
              href={`/careers/${j.slug}`}
              className="card group grid h-full content-start gap-4 p-6 transition duration-300 hover:-translate-y-1 hover:border-iris/40 hover:shadow-lg md:p-7"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-lilac text-iris transition group-hover:bg-iris group-hover:text-white">
                  <Icon name={j.icon} size={22} />
                </span>
                <span className="rounded-full bg-mint px-2.5 py-0.5 text-xs font-semibold text-fern">{j.type}</span>
              </div>
              <div className="grid gap-1.5">
                <h2 className="text-xl font-bold">{j.title}</h2>
                <p className="text-[15px] leading-relaxed text-iron">{j.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="chip inline-flex items-center gap-1.5">
                  <Icon name="Layers" size={13} /> {j.team}
                </span>
                <span className="chip inline-flex items-center gap-1.5">
                  <Icon name="MapPin" size={13} /> {j.location}
                </span>
                <span className="chip inline-flex items-center gap-1.5">
                  <Icon name="Award" size={13} /> {j.experience}
                </span>
              </div>
              <span className="mt-auto inline-flex items-center gap-1.5 border-t border-mist pt-4 text-sm font-semibold text-iris">
                {labels.details}
                <Icon name={arrow} size={15} className="transition group-hover:translate-x-[-3px] ltr:group-hover:translate-x-[3px]" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
