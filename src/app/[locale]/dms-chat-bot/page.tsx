import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getChatbot } from "@/lib/content";
import { Highlight, SectionHeading } from "@/components/ui/Section";
import { Icon } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/Brand";
import TechBackdrop from "@/components/ui/TechBackdrop";
import { FinalCta } from "@/components/home/Sections";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = await getChatbot(locale as Locale);
  return { title: `${c.title} — ${c.tagline.replace(/\*/g, "")}`, description: c.description, openGraph: { images: [{ url: c.image }] } };
}

/**
 * DMS Chat Bot — product page (src/content/chatbot.ts), same design language as the NOVA AI page, marked "coming
 * soon": hero + product screen, features, services in detail, channels & tools, solutions, vision & method, FAQ.
 * "Register your interest" opens the quote form with the product preselected.
 */
export default async function ChatbotPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [home, c] = await Promise.all([getTranslations("home"), getChatbot(locale)]);
  const quote = `/quote?service=${c.slug}`;
  const arrow = locale === "ar" ? "ArrowLeft" : "ArrowRight";

  return (
    <>
      {/* 1 — hero */}
      <section className="on-dark relative overflow-hidden">
        <TechBackdrop />
        <div className="container-site relative grid gap-14 pb-20 pt-14 lg:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
            <div className="grid gap-6">
              <span className="inline-flex w-fit items-center gap-2 rounded-pill border border-white/15 bg-white/5 px-4 py-1.5 text-[13px] font-semibold text-iris-light">
                <Icon name="Timer" size={15} /> {c.ui.soonLong}
              </span>
              <h1 className="h-hero">
                <Highlight text={c.tagline} />
              </h1>
              <p className="flex items-center gap-2 text-sm font-semibold text-[#8d8e8f]">
                <BrandIcon slug="whatsapp" size={16} colored /> {c.title} · {c.fullName}
              </p>
              <p className="lead">{c.description}</p>
              <div className="flex flex-wrap items-center gap-3">
                <Link href={quote} className="btn btn-primary">
                  {c.ui.notify} <Icon name={arrow} size={17} />
                </Link>
                <a href="#method" className="btn btn-outline">
                  {c.ui.howItWorks}
                </a>
              </div>
            </div>
            <div className="relative">
              <div className="overflow-hidden rounded-card border border-white/10 bg-white shadow-sm2">
                <Image src={c.image} alt={c.title} width={1261} height={726} priority sizes="(min-width:1024px) 640px, 94vw" className="h-auto w-full" />
              </div>
              <span className="absolute -bottom-4 start-6 hidden items-center gap-2 rounded-2xl border border-mist bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-lg sm:flex">
                <BrandIcon slug="whatsapp" size={16} colored /> WhatsApp Business Platform
              </span>
            </div>
          </div>
          <nav aria-label={c.title} className="flex flex-wrap justify-center gap-2">
            {c.sectionNav.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="rounded-pill border border-white/15 px-4 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white">
                {s.label}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {/* 2 — features */}
      <section className="section bg-cloud">
        <div className="container-site">
          <SectionHeading title={c.featuresTitle} sub={c.description} />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {c.features.map((f) => (
              <div key={f.title} className="card card-hover grid content-start gap-4 p-7">
                <span className="grid size-11 place-items-center rounded-icon bg-[#e7f8ee] text-fern">
                  <Icon name={f.icon} size={20} />
                </span>
                <h3 className="text-lg font-bold">{f.title}</h3>
                <p className="text-[15px] leading-relaxed text-iron">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 — services in detail */}
      <section id="services" className="section scroll-mt-24">
        <div className="container-site">
          <SectionHeading title={c.servicesTitle} />
          <div className="grid gap-6">
            {c.services.map((s, i) => (
              <article key={s.title} className="card grid gap-8 p-8 md:grid-cols-[1.25fr_1fr] md:p-10">
                <div className="grid content-start gap-4">
                  <span className="flex items-center gap-3">
                    <span className="badge-icon">
                      <Icon name={s.icon} />
                    </span>
                    <span className="font-mono text-xs text-graphite">{String(i + 1).padStart(2, "0")}</span>
                  </span>
                  <h3 className="text-2xl font-bold">{s.title}</h3>
                  <p className="text-[15.5px] leading-relaxed text-iron">{s.text}</p>
                </div>
                <ul className="grid content-start gap-3 rounded-2xl bg-cloud p-6">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-[15px] font-medium text-ink">
                      <Icon name="CircleCheck" size={18} className="mt-0.5 shrink-0 text-fern" />
                      {p}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 4 — channels & tools */}
      <section id="channels" className="section scroll-mt-24 bg-cloud">
        <div className="container-site">
          <SectionHeading title={c.channelsTitle} sub={c.channelsSub} />
          <div className="grid gap-10 lg:grid-cols-2">
            {[
              { label: c.channelsLabel, items: c.channels },
              { label: c.toolsLabel, items: c.tools }
            ].map((group) => (
              <div key={group.label} className="grid content-start gap-4">
                <h3 className="text-lg font-bold">{group.label}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {group.items.map((it) => {
                    const brand = (it as { brand?: string | null }).brand;
                    return (
                    <div key={it.title} className="card flex items-start gap-3 p-5">
                      <span className="grid size-10 shrink-0 place-items-center rounded-icon bg-white text-iris shadow-card ring-1 ring-mist">
                        {brand ? <BrandIcon slug={brand} size={19} colored /> : <Icon name={it.icon} size={18} />}
                      </span>
                      <span className="grid gap-1">
                        <span className="font-semibold text-ink">{it.title}</span>
                        <span className="text-sm leading-relaxed text-iron">{it.text}</span>
                      </span>
                    </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5 — solutions */}
      <section id="solutions" className="section scroll-mt-24">
        <div className="container-site">
          <SectionHeading title={c.solutionsTitle} sub={c.solutionsSub} />
          <div className="grid gap-10">
            {[
              { label: c.byIndustry, items: c.industries, cols: "sm:grid-cols-2 lg:grid-cols-3" },
              { label: c.byTeam, items: c.teams, cols: "sm:grid-cols-3" }
            ].map((group) => (
              <div key={group.label} className="grid gap-4">
                <h3 className="text-center text-sm font-semibold uppercase tracking-wider text-graphite">{group.label}</h3>
                <div className={`grid gap-4 ${group.cols}`}>
                  {group.items.map((it) => (
                    <div key={it.title} className="card card-hover flex items-center gap-4 p-5">
                      <span className="badge-icon">
                        <Icon name={it.icon} />
                      </span>
                      <span className="grid gap-0.5">
                        <span className="font-bold text-ink">{it.title}</span>
                        <span className="text-sm text-iron">{it.text}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6 — vision + method */}
      <section id="method" className="on-dark relative scroll-mt-24 overflow-hidden">
        <TechBackdrop />
        <div className="container-site relative grid gap-16 py-20 md:py-28">
          <div className="mx-auto grid max-w-3xl gap-5 text-center">
            <span className="eyebrow mx-auto">{c.visionTitle}</span>
            <p className="text-xl leading-loose text-white/85 md:text-2xl md:leading-loose">{c.vision}</p>
          </div>
          <div className="grid gap-8">
            <h2 className="text-center text-3xl font-bold md:text-4xl">
              <Highlight text={c.methodTitle} />
            </h2>
            <ol className="grid gap-px overflow-hidden rounded-card border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
              {c.method.map((m, i) => (
                <li key={m.title} className="grid content-start gap-3 bg-obsidian p-7">
                  <span className="flex items-center justify-between">
                    <span className="grid size-9 place-items-center rounded-icon bg-white/5 text-iris-light">
                      <Icon name={m.icon} size={17} />
                    </span>
                    <span className="font-mono text-xs text-[#8d8e8f]">{String(i + 1).padStart(2, "0")}</span>
                  </span>
                  <h3 className="text-lg font-bold">{m.title}</h3>
                  <p className="text-[15px] leading-relaxed text-[#b4b5b6]">{m.text}</p>
                </li>
              ))}
            </ol>
            <div className="flex justify-center">
              <Link href={quote} className="btn btn-primary">
                {c.ui.notify} <Icon name={arrow} size={17} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 7 — FAQ */}
      <section id="faq" className="section scroll-mt-24">
        <div className="container-site max-w-3xl">
          <SectionHeading title={c.faqTitle} />
          <div className="grid gap-3">
            {c.faq.map((f, i) => (
              <details key={f.q} className="card group p-0 [&_summary::-webkit-details-marker]:hidden" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-6 text-lg font-semibold">
                  {f.q}
                  <Icon name="ChevronDown" size={20} className="shrink-0 text-graphite transition group-open:rotate-180" />
                </summary>
                <p className="px-6 pb-6 text-[15.5px] leading-relaxed text-iron">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <FinalCta
        title={c.tagline.replace(/\*/g, "")}
        sub={c.description}
        input={home("ctaInput")}
        button={c.ui.notify}
        alt={home("ctaAlt")}
        checks={c.features.slice(0, 3).map((f) => f.title)}
      />
    </>
  );
}
