import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { site } from "@/content/site";
import { getActiveOffers, getOffersCopy, getPackageGroups } from "@/lib/content";
import { Highlight, SectionHeading } from "@/components/ui/Section";
import { Icon } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/Brand";
import TechBackdrop from "@/components/ui/TechBackdrop";
import { Countdown, DealsCarousel, PackagesBrowser } from "@/components/offers/OfferWidgets";

// rendered per request: the deal of the day changes at midnight and weekly offers renew every Sunday; fresh renders
// also get the public CSP nonce (a cached re-render would no longer match the build-time script hashes)
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = await getOffersCopy(locale as Locale);
  return { title: c.eyebrow, description: c.sub };
}

/** Packages & offers: today's 24-hour deals (sliding banner), this week's offers (one countdown to Saturday midnight), then packages. */
export default async function OffersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [c, groups, offers] = await Promise.all([getOffersCopy(locale), getPackageGroups(locale), getActiveOffers(locale)]);
  const arrow = locale === "ar" ? "ArrowLeft" : "ArrowRight";
  const cd = { endsIn: c.endsIn, days: c.days, hours: c.hours, minutes: c.minutes };
  const today = offers.today;

  return (
    <>
      <section className="on-dark relative overflow-hidden">
        <TechBackdrop />
        <div className="container-site relative grid justify-items-center gap-6 py-16 text-center md:py-24">
          <span className="eyebrow">{c.eyebrow}</span>
          <h1 className="h-display max-w-3xl">
            <Highlight text={c.title} />
          </h1>
          <p className="lead max-w-2xl">{c.sub}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a href="#packages" className="btn btn-primary">
              {c.seePackages} <Icon name={arrow} size={17} />
            </a>
            <a href={`https://wa.me/${site.whatsapp}`} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
              <BrandIcon slug="whatsapp" size={17} /> {c.whatsapp}
            </a>
          </div>
        </div>
      </section>

      {today.length > 0 && (
        <section className="pt-12 md:pt-16">
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
            <div className="grid gap-5 lg:grid-cols-3">
              {offers.weekly.map((o) => (
                <article key={o.slug} className="card grid content-start gap-4 p-6">
                  <div className="flex items-center justify-between gap-3">
                    <span className="grid size-11 place-items-center rounded-xl bg-iris text-white">
                      <Icon name={o.icon} size={20} />
                    </span>
                    <span className="rounded-full bg-mint px-3 py-1 text-xs font-bold text-fern">
                      {c.off} {o.percent}% · {c.save} {o.saving}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-iris">{o.badge}</span>
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
                  <p className="flex items-center gap-1.5 text-sm text-iron">
                    <Icon name="Clock" size={14} className="text-iris" /> {c.delivery}: <b className="font-semibold text-ink">{o.delivery}</b>
                  </p>
                  <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-mist pt-4">
                    <span className="grid">
                      <span className="text-base font-semibold text-graphite line-through decoration-2" dir="ltr">
                        {o.oldPrice}
                      </span>
                      <span className="text-2xl font-bold" dir="ltr">
                        {o.price}
                      </span>
                    </span>
                    <Link href={`/offers/${o.slug}`} className="btn btn-primary">
                      {c.details} <Icon name={arrow} size={16} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="packages" className="section scroll-mt-24 bg-cloud">
        <div className="container-site">
          <SectionHeading title={c.packagesTitle} sub={c.packagesSub} />
          <PackagesBrowser groups={groups} labels={{ mostPopular: c.mostPopular, from: c.from, onRequest: c.onRequest, choose: c.choose, delivery: c.delivery, idealFor: c.idealFor, notIncluded: c.notIncluded, journeyTitle: c.journeyTitle, journeySub: c.journeySub, journeyStep: c.journeyStep }} locale={locale} />
          <p className="mt-6 text-center text-xs text-graphite">{c.vatNote}</p>
        </div>
      </section>

      <section className="py-20">
        <div className="container-site">
          <div className="flex flex-wrap items-center justify-between gap-5 rounded-card border border-mist bg-cloud p-8 md:p-10">
            <div className="grid gap-1">
              <p className="text-xl font-bold">{c.custom}</p>
              <p className="text-iron">{c.customText}</p>
            </div>
            <Link href="/quote" className="btn btn-dark">
              {c.customCta} <Icon name={arrow} size={16} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
