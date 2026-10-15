import type { Metadata } from "next";
import Image from "next/image";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { site } from "@/content/site";
import { getActiveOffers, getOffersCopy, getPackageGroups, getProjects } from "@/lib/content";
import { Highlight, SectionHeading } from "@/components/ui/Section";
import { Icon, type IconName } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/Brand";
import TechBackdrop from "@/components/ui/TechBackdrop";
import { Countdown, DealsCarousel, PackagesBrowser } from "@/components/offers/OfferWidgets";
import { ServiceVisual } from "@/components/offers/ServiceVisual";
import { CardSlider } from "@/components/offers/CardSlider";

// rendered per request: the deals of the day change at midnight and weekly offers renew every Sunday; fresh renders
// also get the public CSP nonce (a cached re-render would no longer match the build-time script hashes)
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = await getOffersCopy(locale as Locale);
  return { title: c.eyebrow, description: c.sub, alternates: { canonical: locale === "ar" ? "/offers" : `/${locale}/offers` }, openGraph: { title: c.eyebrow, description: c.sub } };
}

/**
 * Packages & offers, in three groups: DEALS (today's 24-hour deals + this week's offers), PACKAGES (everyday services
 * with fixed prices) and BUSINESS SOLUTIONS (AI, systems, tech team — quote-led). Then real projects, why us, FAQ with
 * the general terms, and a closing call to action. Every package / offer has its own page (/offers/<key>) to link ads to.
 */
export default async function OffersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [c, groups, offers, projects] = await Promise.all([getOffersCopy(locale), getPackageGroups(locale), getActiveOffers(locale), getProjects(locale)]);
  const smb = groups.filter((g) => g.segment === "smb");
  const business = groups.filter((g) => g.segment === "business");
  const browserLabels = { mostPopular: c.mostPopular, from: c.from, onRequest: c.onRequest, choose: c.choose, delivery: c.delivery, idealFor: c.idealFor, notIncluded: c.notIncluded, journeyTitle: c.journeyTitle, journeySub: c.journeySub, journeyStep: c.journeyStep, aboutService: c.aboutService, prev: c.prev, next: c.next, quote: c.quote, yearly: c.yearly, save: c.save };
  // structured data: the published packages as an offer catalogue (prices before VAT, in SAR)
  const base = site.url.replace(/\/$/, "");
  const prefix = locale === "ar" ? "" : `/${locale}`;
  const catalog = {
    "@context": "https://schema.org",
    "@type": "OfferCatalog",
    name: c.eyebrow,
    url: `${base}${prefix}/offers`,
    itemListElement: groups.map((g) => ({
      "@type": "OfferCatalog",
      name: g.title,
      itemListElement: g.tiers
        .filter((t) => t.price)
        .map((t) => ({
          "@type": "Offer",
          name: `${g.title} — ${t.name}`,
          url: `${base}${prefix}/offers/${t.key}`,
          priceSpecification: { "@type": "PriceSpecification", price: Number(String(t.price).replace(/[^0-9.]/g, "")), priceCurrency: "SAR", valueAddedTaxIncluded: false },
          seller: { "@type": "Organization", name: site.name }
        }))
    }))
  };
  const arrow = locale === "ar" ? "ArrowLeft" : "ArrowRight";
  const cd = { endsIn: c.endsIn, days: c.days, hours: c.hours, minutes: c.minutes };
  const today = offers.today;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(catalog).replace(/</g, "\\u003c") }} />
      <section className="on-dark relative overflow-hidden">
        <TechBackdrop />
        <div className="container-site relative grid items-center gap-10 py-14 md:py-20 lg:grid-cols-[1.05fr_1fr]">
          <div className="grid content-start justify-items-start gap-6">
            <span className="eyebrow">{c.eyebrow}</span>
            <h1 className="h-display max-w-2xl">
              <Highlight text={c.title} />
            </h1>
            <p className="lead max-w-xl">{c.sub}</p>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {c.heroPoints.map((p) => (
                <li key={p} className="flex items-center gap-2 text-[15px] text-white/85">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-iris/30 text-iris-light">
                    <Icon name="Check" size={13} />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <a href="#deals" className="btn btn-primary">
                {c.seeOffers} <Icon name={arrow} size={17} />
              </a>
              <Link href="/quote" className="btn btn-outline">
                {c.consult}
              </Link>
              <a href={`https://wa.me/${site.whatsapp}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost text-white">
                <BrandIcon slug="whatsapp" size={17} /> {c.whatsapp}
              </a>
            </div>
          </div>

          {/* one tile per service — each opens its packages tab */}
          <div className="grid gap-3">
            <span className="text-sm font-semibold text-white/70">{c.pickService}</span>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {groups.map((g, i) => (
                <a
                  key={g.id}
                  href={`#pkg-${g.id}`}
                  className="hero-tile grid content-start gap-2 rounded-2xl border border-white/10 bg-white/[.06] p-4 backdrop-blur-sm transition hover:-translate-y-1 hover:border-iris-light/60 hover:bg-white/10"
                  style={{ animationDelay: `${i * 0.08}s` }}
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-iris to-iris-soft text-white">
                    <Icon name={g.icon} size={19} />
                  </span>
                  <b className="text-[15px] leading-snug">{g.short}</b>
                  {g.startsAt?.price && (
                    <span className="text-xs text-white/65">
                      {c.startsAt}{" "}
                      <b className="text-sm text-white" dir="ltr">
                        {g.startsAt.price}
                      </b>
                      {g.startsAt.period && ` / ${g.startsAt.period}`}
                    </span>
                  )}
                </a>
              ))}
              {today.length > 0 && (
                <a href="#deals" className="hero-tile grid content-start gap-2 rounded-2xl bg-gradient-to-br from-[#f59e0b] to-[#ef4444] p-4 text-white transition hover:-translate-y-1" style={{ animationDelay: `${groups.length * 0.08}s` }}>
                  <span className="grid size-10 place-items-center rounded-xl bg-white/20">
                    <Icon name="Zap" size={19} />
                  </span>
                  <b className="text-[15px]">{c.todayTile}</b>
                  <span className="text-xs text-white/85">{c.todayTileText}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {today.length > 0 && (
        <section id="deals" className="scroll-mt-24 pt-12 md:pt-16">
          <div className="container-site">
            <DealsCarousel deals={today} labels={{ ...cd, seconds: c.seconds, dayTitle: c.dayTitle, dayNote: c.dayNote, seeDeal: c.seeDeal, save: c.save, off: c.off, prev: c.prev, next: c.next }} locale={locale} />
          </div>
        </section>
      )}

      {offers.weekly.length > 0 && (
        <section className="section">
          <div className="container-site">
            <SectionHeading title={c.offersTitle} sub={c.weeklyNote}>
              <Countdown endsAt={offers.weekEndsAt} labels={cd} />
            </SectionHeading>
            <CardSlider className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" labels={{ prev: c.prev, next: c.next }} rtl={locale === "ar"}>
              {offers.weekly.map((o) => (
                <article key={o.slug} className="card grid content-start overflow-hidden transition hover:-translate-y-1 hover:shadow-lg">
                  <ServiceVisual service={o.service} locale={locale} className="h-52 rounded-none border-b border-mist" />
                  <div className="grid content-start gap-4 p-6">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs font-semibold text-iris">
                        <Icon name={o.icon} size={15} /> {o.badge}
                      </span>
                      <span className="rounded-full bg-[#ef4444] px-3 py-1 text-sm font-extrabold text-white shadow">
                        {c.off.replace("{n}", String(o.percent))}
                      </span>
                    </span>
                    <h3 className="text-xl font-bold leading-snug">{o.title}</h3>
                    <p className="text-[14.5px] leading-relaxed text-iron">{o.text}</p>
                    <ul className="grid gap-2">
                      {o.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-[14.5px]">
                          <Icon name="CircleCheck" size={16} className="mt-0.5 shrink-0 text-iris" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <p className="flex items-start gap-1.5 text-sm text-iron">
                      <Icon name="Clock" size={14} className="mt-0.5 shrink-0 text-iris" />
                      <span>
                        {c.delivery}: <b className="font-semibold text-ink">{o.delivery}</b>
                      </span>
                    </p>
                  </div>
                  <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-mist px-6 py-5">
                    <span className="grid">
                      <span className="text-base font-semibold text-graphite line-through decoration-2" dir="ltr">
                        {o.oldPrice}
                      </span>
                      <span className="text-3xl font-bold" dir="ltr">
                        {o.price}
                      </span>
                      <span className="mt-1 w-fit rounded-full bg-mint px-2.5 py-0.5 text-xs font-bold text-fern">
                        {c.save} {o.saving}
                      </span>
                    </span>
                    <Link href={`/offers/${o.slug}`} className="btn btn-primary">
                      {c.details} <Icon name={arrow} size={16} />
                    </Link>
                  </div>
                </article>
              ))}
            </CardSlider>
          </div>
        </section>
      )}

      <section id="packages" className="section scroll-mt-24 bg-cloud">
        <div className="container-site">
          <SectionHeading title={c.packagesTitle} sub={c.packagesSub} />
          <PackagesBrowser groups={smb} labels={browserLabels} locale={locale} />
          <p className="mt-6 text-center text-xs text-graphite">{c.vatNote}</p>
        </div>
      </section>

      {/* business solutions: AI, systems and the tech team — quote-led */}
      <section id="solutions" className="section scroll-mt-24">
        <div className="container-site">
          <SectionHeading title={c.solutionsTitle} sub={c.solutionsSub}>
            <Link href="/quote" className="btn btn-dark">
              {c.quote} <Icon name={arrow} size={16} />
            </Link>
          </SectionHeading>
          <PackagesBrowser groups={business} labels={browserLabels} locale={locale} anchor="solutions" />
          <p className="mt-6 text-center text-xs text-graphite">{c.vatNote}</p>
        </div>
      </section>

      {/* real client projects only (src/content/projects.ts) */}
      {projects.length > 0 && (
        <section className="section bg-cloud">
          <div className="container-site">
            <SectionHeading title={c.projectsTitle} sub={c.projectsSub}>
              <Link href="/clients" className="link-arrow">
                {c.allProjects} <Icon name={arrow} size={15} />
              </Link>
            </SectionHeading>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {projects.slice(0, 6).map((pr) => (
                <Link key={pr.slug} href={`/clients/${pr.slug}`} className="card group grid content-start overflow-hidden transition hover:-translate-y-1 hover:shadow-lg">
                  <span className="relative block aspect-[16/10] overflow-hidden bg-white">
                    <Image src={pr.cover} alt={pr.name} fill sizes="(min-width: 768px) 33vw, 50vw" className={`transition duration-500 group-hover:scale-105 ${pr.coverFit === "contain" ? "object-contain p-6" : "object-cover"}`} />
                  </span>
                  <span className="grid gap-1 p-4">
                    <b className="text-[15px]">{pr.name}</b>
                    <span className="text-xs text-iris">{pr.category}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container-site">
          <SectionHeading title={c.whyTitle} sub={c.whySub} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.why.map((w) => (
              <div key={w.title} className="card grid content-start gap-3 p-6 transition hover:-translate-y-1 hover:border-iris/30">
                <span className="grid size-11 place-items-center rounded-xl bg-lilac text-iris">
                  <Icon name={w.icon as IconName} size={20} />
                </span>
                <b className="text-lg">{w.title}</b>
                <p className="text-[14.5px] leading-relaxed text-iron">{w.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section bg-cloud">
        <div className="container-site grid max-w-3xl gap-8">
          <SectionHeading title={c.faqTitle} />
          <div className="grid gap-3">
            {c.faqs.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-mist bg-white p-5 shadow-card open:border-iris/30">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <Icon name="ChevronDown" size={18} className="shrink-0 text-iris transition group-open:rotate-180" />
                </summary>
                <p className="mt-3 leading-relaxed text-iron">{f.a}</p>
              </details>
            ))}
          </div>
          <div className="grid gap-3 rounded-2xl border border-mist bg-white p-6">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <Icon name="ClipboardList" size={18} className="text-iris" /> {c.termsTitle}
            </h3>
            <ul className="grid gap-2">
              {c.generalTerms.map((t) => (
                <li key={t} className="flex items-start gap-2 text-[14.5px] text-iron">
                  <Icon name="Check" size={15} className="mt-1 shrink-0 text-iris" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container-site">
          <div className="on-dark relative grid items-center gap-6 overflow-hidden rounded-card p-8 md:grid-cols-[1.4fr_1fr] md:p-12">
            <TechBackdrop />
            <div className="relative grid gap-2">
              <p className="text-2xl font-bold md:text-3xl">{c.ctaTitle}</p>
              <p className="text-white/75">{c.ctaText}</p>
            </div>
            <div className="relative flex flex-wrap gap-3 md:justify-end">
              <a href={`https://wa.me/${site.whatsapp}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                <BrandIcon slug="whatsapp" size={17} /> {c.whatsapp}
              </a>
              <Link href="/quote" className="btn btn-outline">
                {c.customCta} <Icon name={arrow} size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
