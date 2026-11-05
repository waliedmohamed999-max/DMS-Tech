"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/Brand";
import { ServiceVisual } from "@/components/offers/ServiceVisual";
import { CardSlider } from "@/components/offers/CardSlider";
import { track } from "@/lib/track";

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

export type Billing = "one-time" | "monthly" | "term";
export type TierView = { key: string; icon: IconName; name: string; tagline: string; idealFor: string; price: string | null; priceVat: string | null; monthlyAvg: string | null; from: boolean; indicative?: boolean; period: string | null; billing: Billing; delivery: string; featured?: boolean; features: string[]; excludes: string[]; annual?: string | null; annualSave?: string | null };
export type JourneyView = { icon: IconName; title: string; text: string; tier: string };
export type GroupView = { id: string; segment: "smb" | "business"; service: string; icon: IconName; title: string; short: string; text: string; highlights: string[]; notice: string; startsAt: { price: string | null; period: string | null } | null; tiers: TierView[]; compare: { label: string; values: string[] }[] | null; journey?: JourneyView[]; draft: boolean };
export type BrowserLabels = { mostPopular: string; from: string; indicative: string; onRequest: string; choose: string; customQuote: string; delivery: string; idealFor: string; notIncluded: string; journeyTitle: string; journeySub: string; journeyStep: string; aboutService: string; prev: string; next: string; quote: string; yearly: string; save: string; inclVat: string; monthlyAvg: string; billing: Record<Billing, string>; tableTitle: string; tableItem: string; tablePrice: string; tableBilling: string; draft: string };

/** "From" / "Initial indication from" before a starting price. */
const fromLabel = (t: { from: boolean; indicative?: boolean }, labels: { from: string; indicative: string }) => (t.from ? (t.indicative ? labels.indicative : labels.from) : null);

/** A price as the client should read it: how it is paid, the amount before VAT, with VAT, and a term's monthly average. */
export function PriceBlock({ t, labels, size = "md" }: { t: Pick<TierView, "price" | "priceVat" | "monthlyAvg" | "from" | "indicative" | "period" | "billing" | "annual" | "annualSave">; labels: Pick<BrowserLabels, "from" | "indicative" | "onRequest" | "inclVat" | "monthlyAvg" | "billing" | "yearly" | "save">; size?: "md" | "lg" }) {
  if (!t.price) return <span className="text-base font-semibold text-iris">{labels.onRequest}</span>;
  const lead = fromLabel(t, labels);
  return (
    <span className="grid gap-1">
      <span className="flex flex-wrap items-center gap-2">
        {labels.billing[t.billing] !== t.period && <span className="w-fit rounded-full bg-lilac px-2.5 py-0.5 text-[11px] font-bold text-iris">{labels.billing[t.billing]}</span>}
        {lead && <span className="text-xs text-graphite">{lead}</span>}
      </span>
      <span className="flex flex-wrap items-baseline gap-1.5">
        <span className={`${size === "lg" ? "text-4xl" : "text-2xl"} font-bold tabular`} dir="ltr">
          {t.price}
        </span>
        {t.period && <span className="text-sm font-medium text-iron">/ {t.period}</span>}
      </span>
      {t.monthlyAvg && (
        <span className="text-xs text-iron">
          {labels.monthlyAvg}:{" "}
          <b className="text-ink" dir="ltr">
            {t.monthlyAvg}
          </b>
        </span>
      )}
      {t.priceVat && (
        <span className="text-xs text-graphite">
          {lead ? `${lead} ` : ""}
          <span dir="ltr">{t.priceVat}</span> {labels.inclVat}
        </span>
      )}
      {t.annual && (
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-iron">
          {labels.yearly}{" "}
          <b className="text-ink" dir="ltr">
            {t.annual}
          </b>
          <span className="rounded-full bg-mint px-2 py-0.5 font-bold text-fern">
            {labels.save} {t.annualSave}
          </span>
        </span>
      )}
    </span>
  );
}

/** The group's tiers side by side: price, billing, delivery, then the group's own rows. Scrolls inside its card on phones. */
function CompareTable({ g, labels }: { g: GroupView; labels: BrowserLabels }) {
  if (!g.compare?.length) return null;
  const rows: { label: string; values: string[] }[] = [
    { label: labels.tablePrice, values: g.tiers.map((t) => (t.price ? `${fromLabel(t, labels) ? `${fromLabel(t, labels)} ` : ""}${t.price}` : labels.onRequest)) },
    { label: labels.tableBilling, values: g.tiers.map((t) => (t.period && t.period !== labels.billing[t.billing] ? `${labels.billing[t.billing]} · ${t.period}` : labels.billing[t.billing])) },
    { label: labels.delivery, values: g.tiers.map((t) => t.delivery) },
    ...g.compare
  ];
  return (
    <div className="grid gap-3 rounded-card border border-mist bg-white p-4 shadow-card md:p-6">
      <h3 className="text-lg font-bold">{labels.tableTitle}</h3>
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[560px] border-collapse text-start text-[13.5px]">
          <thead>
            <tr>
              <th scope="col" className="sticky start-0 z-10 bg-white p-2.5 text-start text-xs font-semibold text-graphite">
                {labels.tableItem}
              </th>
              {g.tiers.map((t) => (
                <th key={t.key} scope="col" className={`p-2.5 text-start align-bottom ${t.featured ? "rounded-t-xl bg-lilac/70 text-iris" : ""}`}>
                  <b className="text-[14.5px]">{t.name}</b>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-mist">
                <th scope="row" className="sticky start-0 z-10 bg-white p-2.5 text-start text-xs font-semibold text-iron">
                  {r.label}
                </th>
                {r.values.map((v, i) => (
                  <td key={g.tiers[i]?.key ?? i} className={`p-2.5 align-top ${g.tiers[i]?.featured ? "bg-lilac/40" : ""}`}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Packages by service (tabs), three tiers each; every tier links to its own shareable page. */
export function PackagesBrowser({ groups, labels, locale, anchor = "packages" }: { groups: GroupView[]; labels: BrowserLabels; locale: string; anchor?: string }) {
  const [active, setActive] = useState(groups[0]?.id);
  const g = groups.find((x) => x.id === active) ?? groups[0];
  // the hero tiles link to #pkg-<group id>: open that tab and bring the packages into view
  useEffect(() => {
    const open = () => {
      const want = window.location.hash.startsWith("#pkg-") ? window.location.hash.slice(5) : null;
      if (!want || !groups.some((x) => x.id === want)) return;
      setActive(want);
      document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [groups, anchor]);
  const arrow = locale === "ar" ? "ArrowLeft" : "ArrowRight";
  if (!g) return null;
  return (
    <div className="grid gap-8">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0">
        {groups.map((x) => (
          <button
            key={x.id}
            type="button"
            aria-pressed={x.id === g.id}
            onClick={() => setActive(x.id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${x.id === g.id ? "border-iris bg-iris text-white" : "border-mist bg-white text-ink hover:border-iris/40"}`}
          >
            <Icon name={x.icon} size={15} /> {x.short}
          </button>
        ))}
      </div>
      {g.draft && (
        <p className="flex items-center gap-2 rounded-xl border border-[#f59e0b]/40 bg-[#fffbeb] px-4 py-3 text-sm font-semibold text-[#92400e]">
          <Icon name="Pencil" size={17} className="shrink-0" /> {labels.draft}
        </p>
      )}
      {/* the service at a glance: what it delivers, beside a scene that shows it */}
      <div key={g.id} className="sv-enter grid items-center gap-6 rounded-card border border-mist bg-white p-5 shadow-card md:grid-cols-[1.1fr_1fr] md:p-8">
        <div className="grid content-start gap-4">
          <span className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-iris to-iris-soft text-white shadow-[0_0_0_5px_rgba(98,77,227,.12)]">
              <Icon name={g.icon} size={22} />
            </span>
            <h3 className="text-2xl font-bold">{g.title}</h3>
          </span>
          <p className="leading-relaxed text-iron">{g.text}</p>
          <ul className="grid gap-2">
            {g.highlights.map((h) => (
              <li key={h} className="flex items-start gap-2 font-medium">
                <Icon name="CircleCheck" size={18} className="mt-0.5 shrink-0 text-iris" />
                {h}
              </li>
            ))}
          </ul>
          <p className="flex items-start gap-2 rounded-xl border border-iris/20 bg-lilac/60 px-4 py-3 text-sm leading-relaxed text-ink">
            <Icon name="Lightbulb" size={17} className="mt-0.5 shrink-0 text-iris" />
            {g.notice}
          </p>
          <Link href={`/services/${g.service}`} className="link-arrow w-fit text-sm">
            {labels.aboutService} <Icon name={arrow} size={14} />
          </Link>
        </div>
        <ServiceVisual service={g.service} locale={locale} className="h-72 md:h-80" />
      </div>
      <CardSlider key={`tiers-${g.id}`} className={`grid items-stretch gap-5 ${g.tiers.length === 4 ? "md:grid-cols-2 xl:grid-cols-4" : g.tiers.length > 4 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-3"}`} labels={{ prev: labels.prev, next: labels.next }} rtl={locale === "ar"}>
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
            <div className="border-y border-mist py-3">
              <PriceBlock t={t} labels={labels} />
            </div>
            <p className="flex items-start gap-1.5 text-sm text-iron">
              <Icon name="Clock" size={14} className="mt-0.5 shrink-0 text-iris" />
              <span>
                {labels.delivery}: <b className="font-semibold text-ink">{t.delivery}</b>
              </span>
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
              {t.from || !t.price ? labels.customQuote : g.segment === "business" ? labels.quote : labels.choose} <Icon name={arrow} size={16} />
            </Link>
          </div>
        ))}
      </CardSlider>
      <CompareTable g={g} labels={labels} />
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

/** Opens a chat with the company WhatsApp number, pre-filled with what the client wants, its price and this page link. */
export function WhatsAppOrder({ phone, lines, label, className = "" }: { phone: string; lines: string[]; label: string; className?: string }) {
  return (
    <button
      type="button"
      className={`btn justify-center bg-[#25d366] text-white hover:bg-[#1ebe5b] ${className}`}
      onClick={() => {
        track("click_cta", { cta: "whatsapp_order", page: window.location.pathname });
        const text = [...lines, window.location.href.split("#")[0]].join("\n");
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      }}
    >
      <BrandIcon slug="whatsapp" size={18} /> {label}
    </button>
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
