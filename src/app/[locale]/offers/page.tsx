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
import { Countdown, PackagesBrowser } from "@/components/offers/OfferWidgets";
import { CardSlider } from "@/components/offers/CardSlider";
import { alternatesFor } from "@/lib/seo";
import { offerCatalog } from "@/lib/offers-schema";
import { requestCatalog } from "@/lib/catalog-request";

// rendered per request: a campaign appears and ends on its own dates; fresh renders also get the public CSP nonce
// (a cached re-render would no longer match the build-time script hashes)
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = await getOffersCopy(locale as Locale);
  return { ...alternatesFor(locale, "/offers"), title: c.eyebrow, description: c.sub, openGraph: { title: c.eyebrow, description: c.sub } };
}

/**
 * Packages & offers, in this order: the hero (service tiles), OFFER BANNERS (approved offers while their dates run —
 * each lists its packages and their current prices), PACKAGES (with what "package", "offer" and "custom quote" mean,
 * billing, VAT and a comparison table), BUSINESS SOLUTIONS (quote-led), how we start, real projects, why us, FAQ with
 * the general terms, and a closing call to action. Every package / offer has its own page (/offers/<key>) to link ads to.
 */
export default async function OffersPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const { cat, preview } = await requestCatalog((await searchParams).preview);
  const [c, groups, offers, projects] = await Promise.all([getOffersCopy(locale, cat), getPackageGroups(locale, cat), getActiveOffers(locale, cat), getProjects(locale)]);
  const smb = groups.filter((g) => g.segment === "smb");
  const business = groups.filter((g) => g.segment === "business");
  const browserLabels = { mostPopular: c.mostPopular, from: c.from, indicative: c.indicative, onRequest: c.onRequest, choose: c.choose, customQuote: c.customQuote, delivery: c.delivery, revisions: c.revisions, scopeNote: c.scopeNote, youProvide: c.youProvide, after: c.after, moreDetails: c.moreDetails, idealFor: c.idealFor, notIncluded: c.notIncluded, journeyTitle: c.journeyTitle, journeySub: c.journeySub, journeyStep: c.journeyStep, aboutService: c.aboutService, prev: c.prev, next: c.next, quote: c.quote, yearly: c.yearly, save: c.save, inclVat: c.inclVat, monthlyAvg: c.monthlyAvg, billing: c.billing, draft: c.draft };
  const catalog = offerCatalog(groups, locale, c.eyebrow);
  const arrow = locale === "ar" ? "ArrowLeft" : "ArrowRight";
  const cd = { endsIn: c.endsIn, days: c.days, hours: c.hours, minutes: c.minutes };

  return (
    <>
      {preview && (
        <p className="sticky top-16 z-30 flex items-center justify-center gap-2 bg-[#fffbeb] px-4 py-2 text-center text-sm font-semibold text-[#92400e] shadow-sm">
          <Icon name="Pencil" size={15} /> {locale === "ar" ? "معاينة المسودة من لوحة التحكم — لا يراها الزوار حتى تُنشر" : "Previewing the dashboard draft — visitors won't see it until it is published"}
        </p>
      )}
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
              <a href="#packages" className="btn btn-primary">
                {c.seePackages} <Icon name={arrow} size={17} />
              </a>
              {offers.length > 0 ? (
                <a href="#deals" className="btn btn-outline">
                  <Icon name="Tag" size={16} /> {offers[0].campaign}
                </a>
              ) : (
                <Link href="/quote" className="btn btn-outline">
                  {c.customQuote}
                </Link>
              )}
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
            </div>
          </div>
        </div>
      </section>

      {/* offer banners: approved offers only, while their dates run — each one is its packages at a lower total */}
      {offers.length > 0 && (
        <section id="deals" className="section scroll-mt-24">
          <div className="container-site">
            <SectionHeading title={offers[0].campaign} sub={c.offersNote}>
              <span className="inline-flex items-center gap-2 rounded-full bg-lilac px-4 py-2 text-sm font-semibold text-iris">
                <Icon name="Calendar" size={16} /> {offers[0].dates}
              </span>
            </SectionHeading>
            <CardSlider className="grid gap-6 md:grid-cols-2" labels={{ prev: c.prev, next: c.next }} rtl={locale === "ar"}>
              {offers.map((o) => (
                <article key={o.slug} className="flex flex-col overflow-hidden rounded-card border border-mist bg-white shadow-card transition hover:-translate-y-1 hover:shadow-lg">
                  <div className="relative grid gap-3 overflow-hidden bg-gradient-to-br from-[#1d1647] via-iris to-iris-soft p-6 text-white">
                    <span aria-hidden className="absolute -end-16 -top-16 size-48 rounded-full bg-white/10 blur-2xl" />
                    <span className="relative flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white/80">{o.campaign}</span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-iris">{c.off.replace("{n}", String(o.percent))}</span>
                    </span>
                    <h3 className="relative flex items-start gap-3 text-xl font-bold leading-snug">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15">
                        <Icon name={o.icon} size={19} />
                      </span>
                      {o.name}
                    </h3>
                    <p className="relative text-[14.5px] leading-relaxed text-white/85">{o.pitch}</p>
                  </div>
                  <div className="grid content-start gap-3 p-6">
                    <span className="text-xs font-semibold text-graphite">{c.components}</span>
                    <ul className="grid gap-2.5">
                      {o.parts.map((p) => (
                        <li key={p.key} className="flex items-start justify-between gap-3 text-[14.5px]">
                          <span className="flex items-start gap-2">
                            <Icon name="CircleCheck" size={16} className="mt-0.5 shrink-0 text-iris" />
                            <span className="grid">
                              <b className="font-semibold">
                                {p.name}
                                {p.term && <span className="font-normal text-iron"> — {p.term}</span>}
                              </b>
                              <span className="text-xs text-iron">{p.group}</span>
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    {o.upcoming ? (
                      <p className="rounded-xl bg-[#fffbeb] px-3 py-2 text-xs font-semibold text-[#92400e]">{c.upcoming.replace("{date}", o.startLabel)}</p>
                    ) : (
                      <Countdown endsAt={o.endsAtInstant} labels={cd} />
                    )}
                  </div>
                  <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-mist bg-cloud/60 px-6 py-5">
                    <span className="grid gap-0.5">
                      <span className="text-xs text-graphite">{c.offerPrice}</span>
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="text-3xl font-bold" dir="ltr">
                          {o.price}
                        </span>
                        <span className="text-sm text-graphite">
                          {c.partsTotal}{" "}
                          <s className="decoration-2" dir="ltr">
                            {o.oldPrice}
                          </s>
                        </span>
                      </span>
                      <span className="text-xs text-graphite">
                        <span dir="ltr">{o.priceVat}</span> {c.inclVat}
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
          {/* what the page means by package, offer and custom quote */}
          <dl className="mb-8 grid gap-3 sm:grid-cols-3">
            {c.glossary.map((g) => (
              <div key={g.title} className="rounded-2xl border border-mist bg-white px-4 py-3">
                <dt className="text-sm font-bold text-iris">{g.title}</dt>
                <dd className="text-[13.5px] leading-relaxed text-iron">{g.text}</dd>
              </div>
            ))}
          </dl>
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

      <section className="section border-t border-mist">
        <div className="container-site grid gap-8">
          <SectionHeading title={c.howTitle} />
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {c.how.map((h, i) => (
              <li key={h.title} className="card grid content-start gap-3 p-6">
                <span className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-xl bg-iris text-white">
                    <Icon name={h.icon as IconName} size={19} />
                  </span>
                  <span className="text-3xl font-black text-mist">{i + 1}</span>
                </span>
                <b className="text-lg">{h.title}</b>
                <p className="text-[14.5px] leading-relaxed text-iron">{h.text}</p>
              </li>
            ))}
          </ol>
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
