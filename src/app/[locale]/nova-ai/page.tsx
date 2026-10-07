import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getCompany, getNovaPage } from "@/lib/content";
import { Highlight, SectionHeading } from "@/components/ui/Section";
import { Icon } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/Brand";
import TechBackdrop from "@/components/ui/TechBackdrop";
import { DarkSteps, Faq, SectionNav } from "@/components/ui/ProductBlocks";
import ToolExplorer from "@/components/ui/ToolExplorer";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = await getNovaPage(locale as Locale);
  const title = c.heroTitle.replace(/\*/g, "");
  return { title: `NOVA AI — ${title}`, description: `${c.heroSub} ${c.workspace.sub}`, openGraph: { images: [{ url: `/images/photos/nova-app-${locale === "en" ? "en" : "ar"}.webp` }] } };
}

/**
 * NOVA AI — product page rebuilt from the NOVA platform's own landing page (src/content/nova-page.ts), in the DMS
 * Tech design: hero + real product screen, channels, problem, workspace (tools explorer), AI team, NOVA Brain, how it works, plans,
 * FAQ and a final call to action. Every "start" button opens NOVA's sign-up, "sign in" its sign-in page.
 */
export default async function NovaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [home, company, c] = await Promise.all([getTranslations("home"), getCompany(locale), getNovaPage(locale)]);
  const { nova } = company;
  const rtl = locale === "ar";
  const arrow = rtl ? "ArrowLeft" : "ArrowRight";
  const start = (label: string, cls = "btn btn-primary") => (
    <a href={nova.app.signUp} target="_blank" rel="noopener" className={cls}>
      {label} <Icon name={arrow} size={17} />
    </a>
  );
  const signIn = (cls = "btn btn-outline") => (
    <a href={nova.app.signIn} target="_blank" rel="noopener" className={cls}>
      {nova.appLabels.signIn}
    </a>
  );

  return (
    <>
      {/* 1 — hero + the real product screen */}
      <section className="on-dark relative overflow-hidden">
        <TechBackdrop />
        <div className="container-site relative grid gap-14 pb-20 pt-14 lg:pt-20">
          <div className="mx-auto grid max-w-3xl justify-items-center gap-6 text-center">
            <span className="inline-flex w-fit items-center gap-2 rounded-pill border border-white/15 bg-white/5 px-4 py-1.5 text-[13px] font-semibold text-iris-light">
              <Icon name="Sparkles" size={15} /> {c.eyebrow} · {c.brain}
            </span>
            <h1 className="h-hero">
              <Highlight text={c.heroTitle} />
            </h1>
            <p className="text-2xl font-semibold leading-snug text-white/85">{c.heroSub}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {start(c.startFree)}
              {signIn()}
              <Link href="/quote?service=nova-ai" className="btn-ghost">
                {home("novaCta")}
              </Link>
            </div>
            <p className="text-sm text-[#8d8e8f]">{c.trialNote}</p>
          </div>

          <div className="relative mx-auto w-full max-w-5xl">
            <div className="overflow-hidden rounded-card border border-white/10 bg-white shadow-sm2">
              <Image src={`/images/photos/nova-app-${rtl ? "ar" : "en"}.webp`} alt="NOVA AI" width={1600} height={954} priority sizes="(min-width:1024px) 1000px, 94vw" className="h-auto w-full" />
            </div>
            {c.floating.map((f, i) => (
              <div
                key={f.text}
                className={`absolute hidden items-center gap-2.5 rounded-2xl border border-mist bg-white px-4 py-3 text-sm font-semibold text-ink shadow-lg md:flex ${i === 0 ? "-top-5 start-6" : "-bottom-5 end-6"}`}
              >
                <span className="grid size-7 place-items-center rounded-full bg-lilac text-iris">
                  <Icon name={f.icon} size={15} />
                </span>
                {f.text}
                <span className="size-2 rounded-full bg-fern" />
              </div>
            ))}
          </div>

          {/* in-page navigation */}
          <SectionNav label="NOVA" items={c.sectionNav} />
        </div>
      </section>

      {/* 2 — channels */}
      <section className="border-b border-mist py-10">
        <div className="container-site flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          <span className="text-sm font-semibold text-graphite">{c.channelsTitle}</span>
          {c.channels.map((ch) => (
            <span key={ch.name} className="inline-flex items-center gap-2 text-[15px] font-semibold text-ink" dir="ltr">
              {ch.slug ? <BrandIcon slug={ch.slug} size={18} colored /> : <Icon name="Mail" size={18} className="text-[#0078D4]" />}
              {ch.name}
            </span>
          ))}
        </div>
      </section>

      {/* 3 — the problem */}
      <section className="section">
        <div className="container-site">
          <SectionHeading title={c.problem.title} sub={c.problem.sub} />
          <div className="mb-10 flex flex-wrap justify-center gap-3">
            {c.problem.questions.map((q) => (
              <span key={q} className="pill border-dashed text-iron">
                <Icon name="Search" size={14} className="text-graphite" /> {q}
              </span>
            ))}
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {c.problem.items.map((it) => (
              <div key={it.title} className="card grid content-start gap-3 p-8">
                <span className="grid size-10 place-items-center rounded-icon bg-[#fdecec] text-[#c2410c]">
                  <Icon name={it.icon} size={19} />
                </span>
                <h3 className="text-xl font-bold">{it.title}</h3>
                <p className="text-[15px] leading-relaxed text-iron">{it.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4 — one AI workspace */}
      <section id="product" className="section scroll-mt-24 bg-cloud">
        <div className="container-site">
          <SectionHeading title={c.workspace.title} sub={c.workspace.sub} />
          <ToolExplorer tools={c.workspace.tools} />
          <ul className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-mist bg-mist sm:grid-cols-3 lg:grid-cols-6">
            {c.workspace.modules.map((m) => (
              <li key={m.label} className="flex flex-col items-center gap-2 bg-white px-3 py-5 text-center text-[13.5px] font-medium text-ink">
                <Icon name={m.icon} size={19} className="text-iris" />
                {m.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 5 — the AI team */}
      <section id="team" className="section scroll-mt-24">
        <div className="container-site">
          <SectionHeading title={c.team.title}>
            <div className="flex flex-wrap justify-center gap-3">
              {start(c.team.build)}
              <a href="#how" className="btn btn-outline">
                {c.sectionNav.find((s) => s.id === "how")?.label}
              </a>
            </div>
          </SectionHeading>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {c.team.agents.map((a) => (
              <div key={a.title} className="card card-hover grid content-start gap-3 p-8">
                <span className="badge-icon">
                  <Icon name={a.icon} />
                </span>
                <p className="text-sm text-graphite">{a.text}</p>
                <h3 className="text-xl font-bold">{a.title}</h3>
                <blockquote className="mt-2 rounded-xl border-s-4 border-iris bg-lilac/50 px-4 py-3 text-[15px] leading-relaxed text-ink">«{a.quote}»</blockquote>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6 — NOVA Brain */}
      <section id="how" className="on-dark relative scroll-mt-24 overflow-hidden">
        <TechBackdrop />
        <div className="container-site relative grid gap-14 py-20 md:py-28">
          <div className="mx-auto grid max-w-3xl justify-items-center gap-5 text-center">
            <span className="inline-flex items-center gap-2 text-lg font-bold">
              <span className="grid size-9 place-items-center rounded-xl bg-white/10 text-iris-light">
                <Icon name="Sparkles" size={18} />
              </span>
              {c.brain}
            </span>
            <h2 className="h-display">
              <Highlight text={c.brainSection.title} />
            </h2>
            <p className="lead">{c.brainSection.sub}</p>
            <p className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-[#8d8e8f]">
              <Icon name="Languages" size={14} /> {c.brainSection.languages}
            </p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-card border border-white/10 bg-white/10 md:grid-cols-3">
            <div className="grid content-between gap-8 bg-obsidian p-8">
              <div className="grid gap-2">
                <h3 className="text-lg font-bold">{c.brainSection.pillars.context.title}</h3>
                <p className="text-[15px] leading-relaxed text-[#b4b5b6]">{c.brainSection.pillars.context.text}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Icon name="Sparkles" size={14} className="text-iris-light" /> {c.brainSection.demo.brainUpdated}
                </p>
                <p className="mt-2 text-xs text-[#8d8e8f]">{c.brainSection.demo.brandVoice}</p>
                <p className="text-lg font-semibold">{c.brainSection.demo.voice}</p>
              </div>
            </div>
            <div className="grid content-between gap-8 bg-obsidian p-8">
              <div className="grid gap-2">
                <h3 className="text-lg font-bold">{c.brainSection.pillars.approvals.title}</h3>
                <p className="text-[15px] leading-relaxed text-[#b4b5b6]">{c.brainSection.pillars.approvals.text}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="flex items-center gap-2 text-xs text-[#8d8e8f]">
                  <span className="size-2 rounded-full bg-amber-400" /> {c.brainSection.demo.waiting}
                </p>
                <p className="mt-1 font-semibold">{c.brainSection.demo.offer}</p>
                <div className="mt-3 flex gap-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-white text-ink">
                    <Icon name="Check" size={15} />
                  </span>
                  <span className="grid size-8 place-items-center rounded-lg bg-white/10">
                    <Icon name="Pencil" size={14} />
                  </span>
                </div>
              </div>
            </div>
            <div className="grid content-between gap-8 bg-obsidian p-8">
              <div className="grid gap-2">
                <h3 className="text-lg font-bold">{c.brainSection.pillars.learning.title}</h3>
                <p className="text-[15px] leading-relaxed text-[#b4b5b6]">{c.brainSection.pillars.learning.text}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold">{c.brainSection.demo.insight}</p>
                <div className="mt-3 flex h-16 items-end gap-1.5" aria-hidden>
                  {[100, 78, 56, 60, 48, 44, 34].map((h, i) => (
                    <span key={i} className="flex-1 rounded-t bg-gradient-to-t from-iris to-[#4f8cff]" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* how it works — 4 steps */}
          <div className="grid gap-8">
            <h2 className="text-center text-3xl font-bold md:text-4xl">
              <Highlight text={c.how.title} />
            </h2>
            <DarkSteps steps={c.how.steps} />
          </div>
        </div>
      </section>

      {/* 7 — plans */}
      <section id="pricing" className="section scroll-mt-24 bg-cloud">
        <div className="container-site">
          <SectionHeading title={c.pricing.title} sub={c.pricing.sub} />
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
            {c.pricing.plans.map((p) => (
              <div key={p.name} className={`grid content-between gap-8 rounded-card border p-8 ${p.featured ? "border-ink bg-ink text-white shadow-sm2 md:-translate-y-3" : "border-mist bg-white shadow-card"}`}>
                <div className="grid gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-2xl font-bold">{p.name}</h3>
                    {p.featured && <span className="rounded-full bg-iris px-2.5 py-0.5 text-xs font-semibold text-white">{c.pricing.popular}</span>}
                  </div>
                  <p className={`text-sm ${p.featured ? "text-white/70" : "text-iron"}`}>{p.for}</p>
                  <ul className="grid gap-2.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-[15px]">
                        <Icon name="Check" size={17} className={`mt-0.5 shrink-0 ${p.featured ? "text-iris-light" : "text-iris"}`} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <a href={nova.app.signUp} target="_blank" rel="noopener" className={`btn w-full justify-center ${p.featured ? "bg-white text-ink hover:bg-cloud" : "btn-primary"}`}>
                  {c.pricing.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8 — FAQ */}
      <section id="faq" className="section scroll-mt-24">
        <div className="container-site max-w-3xl">
          <SectionHeading title={c.faqTitle} />
          <Faq items={c.faq} />
        </div>
      </section>

      {/* 9 — final call to action */}
      <section className="on-dark relative overflow-hidden">
        <TechBackdrop />
        <div className="container-site relative grid justify-items-center gap-6 py-20 text-center md:py-28">
          <h2 className="h-display max-w-3xl">
            <Highlight text={c.finalTitle} />
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {start(c.finalCta)}
            {signIn()}
          </div>
          <p className="inline-flex items-center gap-2 text-sm text-[#8d8e8f]">
            <Icon name="Lightbulb" size={15} /> {c.builtBy} · {c.trialNote}
          </p>
        </div>
      </section>
    </>
  );
}
