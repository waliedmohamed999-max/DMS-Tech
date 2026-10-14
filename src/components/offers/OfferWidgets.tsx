"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/Brand";

/** Time left until `endsAt` (an ISO instant); `labels.seconds` adds a ticking seconds box (24-hour deals).
 * Renders nothing until mounted, so server and client markup agree. */
export function Countdown({ endsAt, labels, dark = false, big = false }: { endsAt: string; labels: { endsIn: string; days: string; hours: string; minutes: string; seconds?: string }; dark?: boolean; big?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  const everyMs = labels.seconds ? 1000 : 60_000;
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  if (now === null) return null;
  const left = Math.max(0, new Date(endsAt).getTime() - now);
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const sec = Math.floor((left % 60_000) / 1000);
  const parts: [number, string][] = [...(d > 0 ? ([[d, labels.days]] as [number, string][]) : []), [h, labels.hours], [m, labels.minutes], ...(labels.seconds ? ([[sec, labels.seconds]] as [number, string][]) : [])];
  const box = dark ? "bg-white/10 text-white" : "bg-white text-ink shadow-card";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className={`inline-flex items-center gap-1.5 font-semibold ${dark ? "text-white/80" : "text-iris"}`}>
        <Icon name="Timer" size={15} /> {labels.endsIn}
      </span>
      {/* follows the page direction: Arabic reads days → hours → minutes from the right */}
      <span className="flex gap-1.5">
        {parts.map(([v, l]) => (
          <span key={l} className={`grid min-w-12 justify-items-center rounded-lg px-2 py-1 ${box}`}>
            <b className={`tabular ${big ? "text-2xl" : "text-base"}`}>{String(v).padStart(2, "0")}</b>
            <span className="text-[10px] opacity-70">{l}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

export type TierView = { key: string; icon: IconName; name: string; tagline: string; price: string | null; period: string | null; delivery: string; featured?: boolean; features: string[] };
export type GroupView = { service: string; icon: IconName; title: string; text: string; tiers: TierView[] };

/** Packages by service (tabs), three tiers each; every tier links to its own shareable page. */
export function PackagesBrowser({ groups, labels, locale }: { groups: GroupView[]; labels: { mostPopular: string; from: string; onRequest: string; choose: string; delivery: string }; locale: string }) {
  const [active, setActive] = useState(groups[0]?.service);
  const g = groups.find((x) => x.service === active) ?? groups[0];
  const arrow = locale === "ar" ? "ArrowLeft" : "ArrowRight";
  if (!g) return null;
  return (
    <div className="grid gap-8">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0">
        {groups.map((x) => (
          <button
            key={x.service}
            type="button"
            aria-pressed={x.service === g.service}
            onClick={() => setActive(x.service)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${x.service === g.service ? "border-iris bg-iris text-white" : "border-mist bg-white text-ink hover:border-iris/40"}`}
          >
            <Icon name={x.icon} size={15} /> {x.title}
          </button>
        ))}
      </div>
      <p className="mx-auto max-w-2xl text-center text-iron">{g.text}</p>
      <div className="grid items-stretch gap-5 md:grid-cols-3">
        {g.tiers.map((t) => (
          <div key={t.key} className={`relative grid content-start gap-5 rounded-card border p-7 ${t.featured ? "border-iris bg-white shadow-lg ring-4 ring-iris/10 md:-translate-y-2" : "border-mist bg-white shadow-card"}`}>
            {t.featured && <span className="absolute -top-3 start-6 rounded-full bg-iris px-3 py-1 text-xs font-semibold text-white">{labels.mostPopular}</span>}
            <span className={`grid size-11 place-items-center rounded-xl ${t.featured ? "bg-iris text-white" : "bg-lilac text-iris"}`}>
              <Icon name={t.icon} size={20} />
            </span>
            <div className="grid gap-1">
              <h3 className="text-xl font-bold">{t.name}</h3>
              <p className="text-sm text-iron">{t.tagline}</p>
            </div>
            <p className="border-y border-mist py-3">
              {t.price ? (
                <span className="grid">
                  <span className="text-xs text-graphite">{labels.from}</span>
                  <span className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-2xl font-bold tabular" dir="ltr">
                      {t.price}
                    </span>
                    {t.period && <span className="text-sm font-medium text-iron">/ {t.period}</span>}
                  </span>
                </span>
              ) : (
                <span className="text-base font-semibold text-iris">{labels.onRequest}</span>
              )}
            </p>
            <p className="flex items-center gap-1.5 text-sm text-iron">
              <Icon name="Clock" size={14} className="text-iris" /> {labels.delivery}: <b className="font-semibold text-ink">{t.delivery}</b>
            </p>
            <ul className="grid gap-2.5">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[15px] text-ink">
                  <Icon name="CircleCheck" size={17} className="mt-0.5 shrink-0 text-iris" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href={`/offers/${t.key}`} className={`btn mt-auto w-full justify-center ${t.featured ? "btn-primary" : "btn-outline"}`}>
              {labels.choose} <Icon name={arrow} size={16} />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Copy the page link / send it on WhatsApp (for the team sharing an offer with a client). */
export function ShareLink({ title, labels }: { title: string; labels: { share: string; copy: string; copied: string; shareWa: string } }) {
  const [copied, setCopied] = useState(false);
  // read the address at click time (no state to sync with the browser)
  const url = () => window.location.href.split("#")[0];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-graphite">{labels.share}:</span>
      <button
        type="button"
        className="btn-ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url());
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {}
        }}
      >
        <Icon name="Link" size={15} /> {copied ? labels.copied : labels.copy}
      </button>
      <button type="button" className="btn-ghost" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${title}\n${url()}`)}`, "_blank", "noopener,noreferrer")}>
        <BrandIcon slug="whatsapp" size={15} colored /> {labels.shareWa}
      </button>
    </div>
  );
}
