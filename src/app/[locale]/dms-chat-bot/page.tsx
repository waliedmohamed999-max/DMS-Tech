import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getChatbot } from "@/lib/content";
import { Highlight, SectionHeading } from "@/components/ui/Section";
import { Icon } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/Brand";
import TechBackdrop from "@/components/ui/TechBackdrop";
import { DarkSteps, Faq, SectionNav } from "@/components/ui/ProductBlocks";
import { ChatbotHeroMockup } from "@/components/ui/ProductMockups";
import ToolExplorer from "@/components/ui/ToolExplorer";
import { FinalCta } from "@/components/home/Sections";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = await getChatbot(locale as Locale);
  return { title: `${c.title} — ${c.tagline.replace(/\*/g, "")}`, description: c.description, openGraph: { images: [{ url: c.image }] } };
}

/**
 * DMS Chat Bot — product page (src/content/chatbot.ts), same design language as the NOVA AI page, marked "coming
 * soon": hero + coded product screen, features, a tools explorer (each tool with its screen), channels & tools,
 * solutions, vision & a step path, FAQ.
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
            <div className="relative" aria-hidden>
              <ChatbotHeroMockup locale={locale === "ar" ? "ar" : "en"} />
              <span className="absolute -bottom-4 start-6 hidden items-center gap-2 rounded-2xl border border-mist bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-lg sm:flex">
                <BrandIcon slug="whatsapp" size={16} colored /> WhatsApp Business Platform
              </span>
            </div>
          </div>
          <SectionNav label={c.title} items={c.sectionNav} />
        </div>
      </section>

      {/* 2 — features */}
      <section className="section">
        <div className="container-site">
          <SectionHeading title={c.featuresTitle} sub={c.description} />
          <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
            {c.features.map((f) => (
              <div key={f.title} className="card card-hover grid content-start gap-3 p-4 sm:gap-4 sm:p-7">
                <span className="grid size-10 place-items-center rounded-xl bg-lilac text-iris sm:size-11">
                  <Icon name={f.icon} size={20} />
                </span>
                <h3 className="text-[15px] font-bold sm:text-lg">{f.title}</h3>
                <p className="text-[13px] leading-relaxed text-iron sm:text-[15px]">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 — the tools, each with its screen */}
      <section id="services" className="section scroll-mt-24 bg-cloud">
        <div className="container-site">
          <SectionHeading title={c.servicesTitle} sub={c.servicesSub} />
          <ToolExplorer tools={c.services} />
        </div>
      </section>

      {/* 4 — channels & tools */}
      <section id="channels" className="section scroll-mt-24">
        <div className="container-site">
          <SectionHeading title={c.channelsTitle} sub={c.channelsSub} />
          <div className="grid gap-6 lg:grid-cols-2">
            {/* channels: what plugs in */}
            <div className="grid content-start gap-4 rounded-card border border-mist bg-cloud p-6">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <Icon name="Cable" size={18} className="text-iris" /> {c.channelsLabel}
              </h3>
              <ul className="grid gap-2.5">
                {c.channels.map((it) => (
                  <li key={it.title} className={`flex items-center gap-3 rounded-2xl border bg-white p-4 ${it.soon ? "border-dashed border-line" : "border-mist shadow-card"}`}>
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-cloud text-iris">
                      {it.brand ? <BrandIcon slug={it.brand} size={20} colored /> : <Icon name={it.icon} size={19} />}
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="font-semibold text-ink">{it.title}</span>
                      <span className="text-sm leading-relaxed text-iron">{it.text}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${it.soon ? "bg-lilac text-iris" : "bg-mint text-fern"}`}>
                      {it.soon ? c.ui.soon : c.channelReady}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {/* tools: what you work with */}
            <div className="grid content-start gap-4 rounded-card border border-mist bg-cloud p-6">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <Icon name="LayoutDashboard" size={18} className="text-iris" /> {c.toolsLabel}
              </h3>
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {c.tools.map((it, i) => (
                  <li key={it.title} className={`grid content-start gap-2 rounded-2xl border border-mist bg-white p-4 shadow-card ${i === c.tools.length - 1 && c.tools.length % 2 ? "sm:col-span-2" : ""}`}>
                    <span className="grid size-10 place-items-center rounded-xl bg-lilac text-iris">
                      <Icon name={it.icon} size={18} />
                    </span>
                    <span className="font-semibold text-ink">{it.title}</span>
                    <span className="text-sm leading-relaxed text-iron">{it.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-8 flex items-center justify-center gap-2 text-sm font-semibold text-graphite">
            <BrandIcon slug="whatsapp" size={16} colored /> {c.hubLabel}
          </p>
        </div>
      </section>

      {/* 5 — solutions */}
      <section id="solutions" className="section scroll-mt-24 bg-cloud">
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
            <DarkSteps steps={c.method} />
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
          <Faq items={c.faq} />
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
