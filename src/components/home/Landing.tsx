import { Link } from "@/i18n/navigation";
import type { Integration } from "@/content/types";
import { BrandIcon, hasBrand } from "@/components/ui/Brand";
import { Icon, type IconName } from "@/components/ui/Icon";
import CodeTabs from "./CodeTabs";
import WorkflowScene from "./WorkflowScene";

const arrow = (locale: string) => (locale === "ar" ? "ArrowLeft" : "ArrowRight");

/** Black pill with a white arrow disc — Specify's primary CTA shape */
export function ArrowPill({ href, children, locale }: { href: string; children: React.ReactNode; locale: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 rounded-full bg-ink py-2 pe-2 ps-5 text-sm font-semibold text-white shadow-btn transition hover:bg-black">
      {children}
      <span className="grid size-6 place-items-center rounded-full bg-white text-ink">
        <Icon name={arrow(locale)} size={13} strokeWidth={2.5} />
      </span>
    </Link>
  );
}

/** Centred light-section header (plain ink headline, no gradient) */
export function Heading({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-2xl justify-items-center gap-5 text-center">
      <h2 className="text-[34px] font-bold leading-[1.15] tracking-[-0.021em] text-ink md:text-5xl">{title}</h2>
      {sub && <p className="text-lg leading-relaxed text-iron">{sub}</p>}
      {children}
    </div>
  );
}

export function Hero({ pill, title, sub, locale }: { pill: string; title: string; sub: string; locale: string }) {
  return (
    <section className="bg-obsidian text-white">
      <div className="container-site pb-10 pt-12 text-center md:pt-16">
        <Link href="/nova-ai" className="inline-flex items-center gap-2.5 rounded-full bg-white py-1.5 pe-1.5 ps-4 text-sm font-medium text-ink transition hover:bg-cloud">
          {pill}
          <span className="grid size-6 place-items-center rounded-full bg-ink text-white">
            <Icon name={arrow(locale)} size={13} strokeWidth={2.5} />
          </span>
        </Link>
        <h1 className="mx-auto mt-7 max-w-4xl bg-[linear-gradient(90deg,#f3dcff_0%,#d9b8ff_35%,#a88bff_70%,#8a6cf5_100%)] bg-clip-text pb-2 text-[42px] font-bold leading-[1.13] tracking-[-0.016em] text-transparent sm:text-6xl lg:text-[68px] rtl:bg-[linear-gradient(270deg,#f3dcff_0%,#d9b8ff_35%,#a88bff_70%,#8a6cf5_100%)]">
          {title}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[#c4c6c8]">{sub}</p>
        <WorkflowScene />
      </div>
    </section>
  );
}

/** "Loved by" band — monochrome white marks scrolling */
export function LovedBy({ label, items }: { label: string; items: Integration[] }) {
  const row = [...items, ...items];
  return (
    <section className="bg-obsidian pb-16 pt-6 text-white">
      <p className="text-center text-base font-medium text-[#c4c6c8]">{label}</p>
      <div className="mt-9 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]" dir="ltr">
        <ul className="flex w-max animate-marquee items-center gap-20 [--marquee-shift:-50%]">
          {row.map((it, i) => (
            <li key={`${it.name}-${i}`} className="flex items-center gap-2.5 text-2xl font-semibold tracking-[-0.5px] text-white/90">
              {hasBrand(it.slug) && <BrandIcon slug={it.slug!} size={28} />}
              {it.name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** App tile grid (Specify "Sync your tokens") */
function AppGrid({ apps }: { apps: (Integration | null | "core")[][] }) {
  return (
    <div className="grid justify-center gap-3 [mask-image:linear-gradient(to_bottom,black_65%,transparent)]" dir="ltr">
      {apps.map((row, r) => (
        <div key={r} className="flex justify-center gap-3">
          {row.map((a, c) =>
            a === "core" ? (
              <span key={c} className="grid size-[68px] place-items-center rounded-[18px] bg-iris text-white shadow-[0_10px_30px_-8px_rgba(98,77,227,.7)]">
                <Icon name="Sparkles" size={30} />
              </span>
            ) : a ? (
              <span key={c} title={a.name} className="grid size-[68px] place-items-center rounded-[18px] border border-mist bg-white shadow-card">
                {hasBrand(a.slug) ? <BrandIcon slug={a.slug!} size={32} colored /> : <span className="text-sm font-bold">{a.name}</span>}
              </span>
            ) : (
              <span key={c} className="size-[68px] rounded-[18px] border border-mist/70 bg-white/60" />
            )
          )}
        </div>
      ))}
    </div>
  );
}

const chipStyles: { icon: IconName; cls: string }[] = [
  { icon: "Zap", cls: "bg-[#dcfce7] text-[#16a34a]" },
  { icon: "Settings", cls: "bg-[#dbeafe] text-[#2563eb]" },
  { icon: "Sparkles", cls: "bg-[#fef3c7] text-[#d97706]" }
];

/** Parser-style chips in drifting rows (Specify "Customize outputs") */
function ChipRows({ rows }: { rows: string[][] }) {
  return (
    <div className="grid gap-2.5 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]" dir="ltr">
      {rows.map((row, r) => (
        <div key={r} className="overflow-hidden py-0.5">
          <div className={`flex w-max gap-2.5 animate-marquee [--marquee-shift:-50%] [animation-duration:55s] ${r % 2 ? "[animation-direction:reverse]" : ""}`}>
            {[...row, ...row].map((c, i) => {
              const st = chipStyles[(i + r) % chipStyles.length];
              return (
                <span key={`${c}-${i}`} className="inline-flex items-center gap-2 rounded-lg border border-mist bg-white py-1.5 pe-3 ps-1.5 text-sm font-medium text-ink shadow-card">
                  <span className={`grid size-6 place-items-center rounded-md ${st.cls}`}>
                    <Icon name={st.icon} size={13} strokeWidth={2.25} />
                  </span>
                  {c}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function SoftCard({ title, text, cta, href, locale, children }: { title: string; text: string; cta: string; href: string; locale: string; children: React.ReactNode }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-[28px] border border-mist bg-gradient-to-b from-white to-cloud">
      <div className="grid justify-items-center gap-4 px-6 pb-8 pt-10 text-center md:px-10">
        <h3 className="text-[26px] font-semibold tracking-[-0.74px] text-ink md:text-[30px]">{title}</h3>
        <p className="max-w-md text-[17px] leading-relaxed text-iron">{text}</p>
        <div className="pt-2">
          <ArrowPill href={href} locale={locale}>
            {cta}
          </ArrowPill>
        </div>
      </div>
      <div className="mt-auto">{children}</div>
    </article>
  );
}

export function Setup({
  locale,
  copy,
  apps,
  chips
}: {
  locale: string;
  copy: Record<"title" | "sub" | "cta" | "syncTitle" | "syncText" | "syncCta" | "customTitle" | "customText" | "customCta", string>;
  apps: (Integration | null | "core")[][];
  chips: string[][];
}) {
  return (
    <section className="py-24 md:py-32">
      <div className="container-site">
        <Heading title={copy.title} sub={copy.sub}>
          <Link href="/about#process" className="btn btn-outline">
            <Icon name="Play" size={15} className="fill-ink" /> {copy.cta}
          </Link>
        </Heading>
        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          <SoftCard title={copy.syncTitle} text={copy.syncText} cta={copy.syncCta} href="/clients#platforms" locale={locale}>
            <div className="pb-2">
              <AppGrid apps={apps} />
            </div>
          </SoftCard>
          <SoftCard title={copy.customTitle} text={copy.customText} cta={copy.customCta} href="/quote" locale={locale}>
            <div className="pb-10">
              <ChipRows rows={chips} />
            </div>
          </SoftCard>
        </div>
      </div>
    </section>
  );
}

/** Six plain features — no cards, inline iris icon + title */
export function SixFeatures({ items }: { items: { icon: IconName; title: string; description: string }[] }) {
  return (
    <section className="pb-24 md:pb-32">
      <div className="container-site grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((f) => (
          <div key={f.title}>
            <p className="flex items-center gap-2 text-base font-semibold text-ink">
              <Icon name={f.icon} size={17} className="text-iris" strokeWidth={2} />
              {f.title}
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-iron">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Violet gradient band with frosted cards (Specify "Trusted by product teams") */
export function JourneyBand({
  title,
  sub,
  steps
}: {
  title: string;
  sub: string;
  steps: { icon: IconName; tab: string; title: string; description: string }[];
}) {
  return (
    <section className="px-3 sm:px-6 lg:px-10">
      <div className="overflow-hidden rounded-[40px] bg-[linear-gradient(180deg,#ffffff_0%,#ffffff_12%,#d9ccff_32%,#9277f2_58%,#5b3fc4_80%,#3a2780_100%)] pb-16 pt-24">
        <div className="container-site">
          <Heading title={title} sub={sub} />
        </div>
        <div className="mt-14 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
          <div className="flex w-max animate-marquee gap-6 px-6 [--marquee-shift:-50%] [animation-duration:60s] hover:[animation-play-state:paused] rtl:[--marquee-shift:50%]">
            {[...steps, ...steps].map((s, i) => (
              <article key={i} className="flex w-[340px] shrink-0 flex-col gap-5 rounded-card border border-white/25 bg-white/15 p-7 text-white backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <span className="text-xl font-bold tracking-[-0.3px]">{s.tab}</span>
                  <span className="font-mono text-sm text-white/70">{String((i % steps.length) + 1).padStart(2, "0")}</span>
                </div>
                <p className="text-base font-semibold leading-relaxed text-white/95">{s.title}</p>
                <div className="mt-auto flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-lg bg-white/20">
                    <Icon name={s.icon} size={20} />
                  </span>
                  <span className="text-sm leading-snug text-white/80">{s.description}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniCard({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <div className="w-[190px] shrink-0 rounded-2xl border border-mist bg-white p-4 shadow-card">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="grid size-7 place-items-center rounded-md bg-cloud text-iron">
          <Icon name={icon} size={14} />
        </span>
        {title}
      </p>
      {children}
    </div>
  );
}

export function Heart({
  title,
  locale,
  copy,
  labels
}: {
  title: string;
  locale: string;
  copy: Record<"h1Title" | "h1Text" | "h1Cta" | "h2Title" | "h2Text" | "h2Cta", string>;
  labels: { identity: string; automation: string; reports: string; content: string; lines: string[] };
}) {
  const swatches = ["#7d562f", "#a06f3b", "#ca9859", "#ddb478", "#f4e2bc", "#1a1d1e", "#3b3e40", "#5f6162", "#8d8e8f", "#ebedef", "#3a2780", "#624de3", "#8d4af7", "#a99bff", "#f1eefe"];
  return (
    <section className="py-24 md:py-32">
      <div className="container-site">
        <Heading title={title} />
        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          <SoftCard title={copy.h1Title} text={copy.h1Text} cta={copy.h1Cta} href="/services" locale={locale}>
            <div className="flex gap-4 overflow-hidden px-6 pb-8 [mask-image:linear-gradient(to_left,transparent,black_20%)] rtl:[mask-image:linear-gradient(to_right,transparent,black_20%)]">
              <MiniCard icon="Palette" title={labels.identity}>
                <div className="grid grid-cols-5 gap-1.5" dir="ltr">
                  {swatches.map((c) => (
                    <span key={c} className="aspect-square rounded-[5px]" style={{ background: c }} />
                  ))}
                </div>
              </MiniCard>
              <MiniCard icon="Workflow" title={labels.automation}>
                <div className="grid gap-2">
                  {[true, true, false].map((on, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-cloud px-2.5 py-2">
                      <span className="h-1.5 w-14 rounded-full bg-line" />
                      <span className={`flex h-4 w-7 items-center rounded-full p-0.5 ${on ? "justify-end bg-iris" : "bg-line"}`}>
                        <span className="size-3 rounded-full bg-white" />
                      </span>
                    </div>
                  ))}
                </div>
              </MiniCard>
              <MiniCard icon="ChartColumn" title={labels.reports}>
                <div className="flex h-[74px] items-end gap-1.5" dir="ltr">
                  {[40, 55, 35, 70, 60, 85, 75].map((h, i) => (
                    <span key={i} className={`flex-1 rounded-t-[3px] ${i === 5 ? "bg-iris" : "bg-lilac"}`} style={{ height: `${h}%` }} />
                  ))}
                </div>
              </MiniCard>
              <MiniCard icon="FileText" title={labels.content}>
                <div className="grid gap-2">
                  {labels.lines.map((l) => (
                    <span key={l} className="flex items-center gap-2 text-xs text-iron">
                      <span className="grid size-4 place-items-center rounded bg-cloud font-mono text-[9px]">P</span>
                      {l}
                    </span>
                  ))}
                </div>
              </MiniCard>
            </div>
          </SoftCard>
          <SoftCard title={copy.h2Title} text={copy.h2Text} cta={copy.h2Cta} href="/quote" locale={locale}>
            <div className="ps-6 sm:ps-12">
              <CodeTabs />
            </div>
          </SoftCard>
        </div>
      </div>
    </section>
  );
}
