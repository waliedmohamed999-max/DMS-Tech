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
import { Countdown, PackagesBrowser } from "@/components/offers/OfferWidgets";

// rendered per request: offers start / end by date, and the public CSP gives fresh renders a nonce (a cached
// re-render would no longer match the build-time script hashes)
export const dynamic = "force-dynamic";


export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = await getOffersCopy(locale as Locale);
  return { title: c.eyebrow, description: c.sub };
}

/** Packages & offers: limited-time offers (with a countdown), then packages per service; every card links to its own page. */
export default async function OffersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [c, groups, offers] = await Promise.all([getOffersCopy(locale), getPackageGroups(locale), getActiveOffers(locale)]);
  const arrow = locale === "ar" ? "ArrowLeft" : "ArrowRight";
  const countdown = { endsIn: c.endsIn, days: c.days, hours: c.hours, minutes: c.minutes };

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

      {offers.length > 0 && (
        <section className="section bg-cloud">
          <div className="container-site">
            <SectionHeading title={c.offersTitle} />
            <div className={`grid gap-5 ${offers.length === 1 ? "mx-auto max-w-2xl" : "md:grid-cols-2"}`}>
              {offers.map((o) => (
                <article key={o.slug} className="card relative grid content-start gap-4 overflow-hidden p-7">
                  {o.preview && <span className="absolute end-0 top-0 rounded-es-xl bg-warning/15 px-3 py-1 text-[11px] font-semibold text-warning">{c.preview}</span>}
                  <div className="flex items-center gap-3">
                    <span className="grid size-12 place-items-center rounded-xl bg-iris text-white">
                      <Icon name={o.icon} size={22} />
                    </span>
                    <span className="rounded-full bg-lilac px-3 py-1 text-xs font-bold text-iris">{o.badge}</span>
                  </div>
                  <h2 className="text-2xl font-bold">{o.title}</h2>
                  <p className="text-[15px] leading-relaxed text-iron">{o.text}</p>
                  <ul className="grid gap-2">
                    {o.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-[15px]">
                        <Icon name="CircleCheck" size={17} className="mt-0.5 shrink-0 text-iris" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Countdown endsAt={o.endsAtInstant} labels={countdown} />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-mist pt-4">
                    <span className="grid">
                      {o.price ? (
                        <>
                          {o.oldPrice && (
                            <span className="text-sm text-graphite line-through" dir="ltr">
                              {o.oldPrice}
                            </span>
                          )}
                          <span className="text-2xl font-bold" dir="ltr">
                            {o.price}
                          </span>
                        </>
                      ) : (
                        <span className="font-semibold text-iris">{c.onRequest}</span>
                      )}
                    </span>
                    <Link href={`/offers/${o.slug}`} className="btn btn-primary">
                      {c.getOffer} <Icon name={arrow} size={16} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="packages" className="section scroll-mt-24">
        <div className="container-site">
          <SectionHeading title={c.packagesTitle} sub={c.packagesSub} />
          <PackagesBrowser groups={groups} labels={{ mostPopular: c.mostPopular, from: c.from, onRequest: c.onRequest, choose: c.choose }} locale={locale} />
          <p className="mt-6 text-center text-xs text-graphite">{c.vatNote}</p>
        </div>
      </section>

      <section className="pb-20">
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
