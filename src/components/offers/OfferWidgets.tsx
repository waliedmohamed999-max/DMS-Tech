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

export type DealSlide = { slug: string; icon: IconName; badge: string; title: string; text: string; features: string[]; price: string | null; oldPrice: string | null; saving: string | null; endsAtInstant: string };
const SLIDE_BG = ["from-iris via-[#5a3fd8] to-iris-soft", "from-[#0f766e] via-[#0d9488] to-[#14b8a6]", "from-[#c2410c] via-[#ea580c] to-[#f59e0b]", "from-[#1e3a8a] via-[#2563eb] to-[#38bdf8]", "from-[#9d174d] via-[#db2777] to-[#f472b6]"];

/**
 * Today's 24-hour deals as a sliding banner: one service per slide, auto-advancing every 6 s (paused on hover / focus
 * and for reduced-motion users), with arrows, dots and swipe.
 */
export function DealsCarousel({ deals, labels, locale }: { deals: DealSlide[]; labels: { dayTitle: string; dayNote: string; seeDeal: string; save: string; endsIn: string; days: string; hours: string; minutes: string; seconds: string; prev: string; next: string }; locale: string }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touchX, setTouchX] = useState<number | null>(null);
  const n = deals.length;
  const rtl = locale === "ar";
  const go = (k: number) => setI(((k % n) + n) % n);
  useEffect(() => {
    if (paused || n < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((x) => (x + 1) % n), 6000);
    return () => clearInterval(id);
  }, [paused, n]);
  if (!n) return null;
  const arrow = rtl ? "ArrowLeft" : "ArrowRight";
  return (
    <div
      className="relative overflow-hidden rounded-card shadow-lg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 40) go(i + ((dx < 0) !== rtl ? 1 : -1));
        setTouchX(null);
      }}
      role="region"
      aria-roledescription="carousel"
      aria-label={labels.dayTitle}
    >
      <div className="flex transition-transform duration-700 ease-out" style={{ transform: `translateX(${(rtl ? 1 : -1) * i * 100}%)` }}>
        {deals.map((d, k) => (
          <article key={d.slug} aria-hidden={k !== i} className={`relative grid w-full shrink-0 gap-8 overflow-hidden bg-gradient-to-br p-7 pb-16 text-white md:grid-cols-[1.3fr_1fr] md:p-10 md:pb-16 ${SLIDE_BG[k % SLIDE_BG.length]}`}>
            <span aria-hidden className="absolute -end-20 -top-20 size-72 rounded-full bg-white/10 blur-2xl" />
            <div className="relative grid content-start gap-4">
              <span className="flex flex-wrap items-center gap-2">
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-bold text-ink">
                  <Icon name="Zap" size={13} /> {labels.dayTitle}
                </span>
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{d.badge}</span>
              </span>
              <h2 className="flex items-start gap-3 text-2xl font-bold leading-snug md:text-3xl">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15">
                  <Icon name={d.icon} size={22} />
                </span>
                {d.title}
              </h2>
              <p className="text-[15px] leading-relaxed text-white/85">{d.text}</p>
              <ul className="flex flex-wrap gap-2">
                {d.features.map((f) => (
                  <li key={f} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm">
                    <Icon name="Check" size={14} /> {f}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-white/70">{labels.dayNote}</p>
            </div>
            <div className="relative grid content-center justify-items-start gap-4 rounded-2xl bg-white/10 p-6 backdrop-blur-sm">
              <Countdown endsAt={d.endsAtInstant} labels={labels} dark big />
              <div className="grid">
                <span className="text-sm text-white/70 line-through" dir="ltr">
                  {d.oldPrice}
                </span>
                <span className="text-4xl font-bold" dir="ltr">
                  {d.price}
                </span>
                <span className="mt-1 w-fit rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">
                  {labels.save} {d.saving}
                </span>
              </div>
              <Link href={`/offers/${d.slug}`} tabIndex={k === i ? 0 : -1} className="btn w-full justify-center bg-white text-ink hover:bg-cloud">
                {labels.seeDeal} <Icon name={arrow} size={16} />
              </Link>
            </div>
          </article>
        ))}
      </div>
      {n > 1 && (
        <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-3">
          <button type="button" onClick={() => go(i - 1)} aria-label={labels.prev} className="grid size-8 place-items-center rounded-full bg-white/20 text-white hover:bg-white/35">
            <Icon name={rtl ? "ChevronRight" : "ChevronLeft"} size={16} />
          </button>
          <span className="flex gap-1.5">
            {deals.map((d, k) => (
              <button key={d.slug} type="button" onClick={() => go(k)} aria-label={d.badge} aria-current={k === i} className={`h-2 rounded-full transition-all ${k === i ? "w-7 bg-white" : "w-2 bg-white/45 hover:bg-white/70"}`} />
            ))}
          </span>
          <button type="button" onClick={() => go(i + 1)} aria-label={labels.next} className="grid size-8 place-items-center rounded-full bg-white/20 text-white hover:bg-white/35">
            <Icon name={rtl ? "ChevronLeft" : "ChevronRight"} size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export type TierView = { key: string; icon: IconName; name: string; tagline: string; idealFor: string; price: string | null; from: boolean; period: string | null; delivery: string; featured?: boolean; features: string[]; excludes: string[] };
export type JourneyView = { icon: IconName; title: string; text: string; tier: string };
export type GroupView = { service: string; icon: IconName; title: string; text: string; notice: string; tiers: TierView[]; journey?: JourneyView[] };
type BrowserLabels = { mostPopular: string; from: string; onRequest: string; choose: string; delivery: string; idealFor: string; notIncluded: string; journeyTitle: string; journeySub: string; journeyStep: string };

/** Packages by service (tabs), three tiers each; every tier links to its own shareable page. */
export function PackagesBrowser({ groups, labels, locale }: { groups: GroupView[]; labels: BrowserLabels; locale: string }) {
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
      <div className="mx-auto grid max-w-3xl gap-3 text-center">
        <p className="text-iron">{g.text}</p>
        <p className="flex items-start gap-2 rounded-xl border border-iris/20 bg-lilac/60 px-4 py-3 text-start text-sm leading-relaxed text-ink">
          <Icon name="Lightbulb" size={17} className="mt-0.5 shrink-0 text-iris" />
          {g.notice}
        </p>
      </div>
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
            <p className="rounded-lg bg-cloud px-3 py-2 text-[13px] text-iron">
              <b className="font-semibold text-ink">{labels.idealFor}:</b> {t.idealFor}
            </p>
            <p className="border-y border-mist py-3">
              {t.price ? (
                <span className="grid">
                  {t.from && <span className="text-xs text-graphite">{labels.from}</span>}
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
            {t.excludes.length > 0 && (
              <div className="grid gap-1.5 border-t border-mist pt-3">
                <span className="text-xs font-semibold text-graphite">{labels.notIncluded}</span>
                {t.excludes.map((x) => (
                  <span key={x} className="flex items-start gap-2 text-[13px] text-iron">
                    <Icon name="X" size={14} className="mt-0.5 shrink-0 text-graphite" />
                    {x}
                  </span>
                ))}
              </div>
            )}
            <Link href={`/offers/${t.key}`} className={`btn mt-auto w-full justify-center ${t.featured ? "btn-primary" : "btn-outline"}`}>
              {labels.choose} <Icon name={arrow} size={16} />
            </Link>
          </div>
        ))}
      </div>
      {g.journey && <Journey steps={g.journey} groups={groups} labels={labels} arrow={arrow} />}
    </div>
  );
}

/** The client journey under a group (stores: founding → first orders → ongoing growth); each step links to its package. */
function Journey({ steps, groups, labels, arrow }: { steps: JourneyView[]; groups: GroupView[]; labels: BrowserLabels; arrow: IconName }) {
  const tierName = (key: string) => {
    for (const x of groups) {
      const t = x.tiers.find((y) => y.key === key);
      if (t) return `${x.title} — ${t.name}`;
    }
    return key;
  };
  return (
    <div className="grid gap-6 rounded-card border border-mist bg-white p-6 md:p-9">
      <div className="grid gap-1 text-center">
        <h3 className="text-2xl font-bold">{labels.journeyTitle}</h3>
        <p className="text-iron">{labels.journeySub}</p>
      </div>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="relative grid content-start gap-2.5 rounded-2xl border border-mist bg-cloud p-5">
            <span className="flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-xl bg-iris text-white">
                <Icon name={s.icon} size={18} />
              </span>
              <span className="text-xs font-bold text-iris">
                {labels.journeyStep} {i + 1}
              </span>
            </span>
            <b className="text-lg">{s.title}</b>
            <p className="text-[14px] leading-relaxed text-iron">{s.text}</p>
            <Link href={`/offers/${s.tier}`} className="link-arrow mt-auto text-sm">
              {tierName(s.tier)} <Icon name={arrow} size={14} />
            </Link>
          </li>
        ))}
      </ol>
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
