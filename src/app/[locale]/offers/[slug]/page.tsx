import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getOfferItem, getOffersCopy, getServices, offerUnavailable } from "@/lib/content";
import { chatbotNav } from "@/content/chatbot-nav";
import { Icon, type IconName } from "@/components/ui/Icon";
import TechBackdrop from "@/components/ui/TechBackdrop";
import { LeadForm } from "@/components/forms/LeadForm";
import { Countdown, ShareLink } from "@/components/offers/OfferWidgets";

type Props = { params: Promise<{ locale: string; slug: string }> };

// rendered per request: offers renew by day / week, and the public CSP gives fresh renders a nonce (a cached
// re-render would no longer match the build-time script hashes)
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const item = await getOfferItem(slug, locale as Locale);
  if (!item) return {};
  const services = await getServices(locale as Locale);
  const image = services.find((s) => s.slug === item.service)?.image;
  const title = item.kind === "offer" ? `${item.name} — ${item.price}` : `${item.name} — ${item.group}`;
  // the preview card WhatsApp / social apps show for the shared link
  return { title, description: item.tagline, openGraph: { title, description: item.tagline, ...(image ? { images: [{ url: image }] } : {}) } };
}

/** A titled detail card of the offer page. */
function Block({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <div className="card grid content-start gap-3 p-6">
      <h3 className="flex items-center gap-2 font-bold">
        <span className="grid size-8 place-items-center rounded-lg bg-lilac text-iris">
          <Icon name={icon} size={15} />
        </span>
        {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * One package or offer (also /offers/today = today's 24-hour deal): price, what's included, and for offers the full
 * detail — who it is for, exact deliverables, delivery time, conditions, what's not included — then the request form.
 */
export default async function OfferItemPage({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [c, item, services, nav] = await Promise.all([getOffersCopy(locale), getOfferItem(slug, locale), getServices(locale), getTranslations("nav")]);
  const arrow = locale === "ar" ? "ArrowLeft" : "ArrowRight";

  if (!item) {
    // a past weekly offer or a daily deal on another day gets a friendly page instead of a 404
    const why = offerUnavailable(slug);
    if (!why) notFound();
    return (
      <section className="section">
        <div className="container-site grid max-w-xl justify-items-center gap-4 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-lilac text-iris">
            <Icon name="Timer" size={26} />
          </span>
          <h1 className="text-2xl font-bold">{why === "notToday" ? c.notToday : c.ended}</h1>
          <p className="text-iron">{why === "notToday" ? c.notTodayText : c.endedText}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href={why === "notToday" ? "/offers/today" : "/offers"} className="btn btn-primary">
              {why === "notToday" ? c.seeToday : c.allOffers}
            </Link>
            <Link href="/quote" className="btn btn-outline">
              {c.customCta}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const options = [...services.map(({ slug: s, title }) => ({ slug: s, title })), { slug: "nova-ai", title: nav("nova") }, { slug: chatbotNav.href.slice(1), title: chatbotNav.title[locale === "ar" ? "ar" : "en"] }];
  const label = item.kind === "offer" ? `${item.group}: ${item.name}` : `${item.group} — ${item.name}`;
  const daily = item.kind === "offer" && item.cycle === "daily";
  const d = item.details;

  return (
    <>
      <section className="on-dark relative overflow-hidden">
        <TechBackdrop />
        <div className="container-site relative grid gap-6 py-14 md:py-20">
          <nav className="flex items-center gap-2 text-sm text-[#8d8e8f]" aria-label="Breadcrumb">
            <Link href="/offers" className="hover:text-iris-light">
              {c.eyebrow}
            </Link>
            <Icon name={locale === "ar" ? "ChevronLeft" : "ChevronRight"} size={14} />
            <span className="text-white">{daily ? c.dayTitle : item.name}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-5">
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-iris to-iris-soft text-white shadow-[0_0_0_6px_rgba(98,77,227,.18)]">
              <Icon name={item.icon} size={28} />
            </span>
            <div className="grid max-w-3xl gap-2">
              <span className="text-sm font-semibold text-iris-light">{item.group}</span>
              <h1 className="h-display">{item.name}</h1>
              <p className="lead">{item.tagline}</p>
            </div>
          </div>
          {item.endsAtInstant && <Countdown endsAt={item.endsAtInstant} labels={{ endsIn: c.endsIn, days: c.days, hours: c.hours, minutes: c.minutes, ...(daily ? { seconds: c.seconds } : {}) }} dark big={daily} />}
        </div>
      </section>

      {d && (
        <section className="section bg-cloud">
          <div className="container-site grid gap-6">
            <div className="grid gap-5 md:grid-cols-[1.2fr_1fr]">
              <Block icon="Users" title={c.forWho}>
                <p className="leading-relaxed text-iron">{d.forWho}</p>
              </Block>
              <Block icon="Clock" title={c.delivery}>
                <p className="text-lg font-semibold">{item.delivery}</p>
              </Block>
            </div>
            <div className="grid gap-4">
              <h2 className="text-2xl font-bold">{c.deliverables}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {d.deliverables.map((x) => (
                  <div key={x.title} className="card grid content-start gap-2 p-5">
                    <span className="flex items-center gap-2 font-bold">
                      <Icon name="CircleCheck" size={17} className="text-iris" /> {x.title}
                    </span>
                    <p className="text-[14.5px] leading-relaxed text-iron">{x.text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <Block icon="ClipboardList" title={c.terms}>
                <ul className="grid gap-2">
                  {d.terms.map((t) => (
                    <li key={t} className="flex items-start gap-2 text-[14.5px]">
                      <Icon name="Check" size={15} className="mt-0.5 shrink-0 text-iris" />
                      {t}
                    </li>
                  ))}
                </ul>
              </Block>
              <Block icon="CircleX" title={c.excludes}>
                <ul className="grid gap-2">
                  {d.excludes.map((t) => (
                    <li key={t} className="flex items-start gap-2 text-[14.5px] text-iron">
                      <Icon name="X" size={15} className="mt-0.5 shrink-0 text-graphite" />
                      {t}
                    </li>
                  ))}
                </ul>
              </Block>
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container-site grid items-start gap-10 lg:grid-cols-[1fr_1.25fr]">
          <aside className="grid gap-5 rounded-card border border-mist bg-cloud p-7 lg:sticky lg:top-28">
            <div className="grid gap-1 border-b border-mist pb-4">
              {item.price ? (
                <>
                  {item.kind === "package" && <span className="text-xs text-graphite">{c.from}</span>}
                  {item.oldPrice && (
                    <span className="text-sm text-graphite line-through" dir="ltr">
                      {item.oldPrice}
                    </span>
                  )}
                  <span className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-3xl font-bold" dir="ltr">
                      {item.price}
                    </span>
                    {item.period && <span className="text-base font-medium text-iron">/ {item.period}</span>}
                  </span>
                  {item.saving && (
                    <span className="mt-1 w-fit rounded-full bg-mint px-2.5 py-0.5 text-xs font-bold text-fern">
                      {c.save} {item.saving}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xl font-bold text-iris">{c.onRequest}</span>
              )}
              <span className="mt-1 text-xs text-graphite">{c.vatNote}</span>
            </div>
            {item.kind === "package" && (
              <p className="flex items-center gap-1.5 text-sm text-iron">
                <Icon name="Clock" size={14} className="text-iris" /> {c.delivery}: <b className="font-semibold text-ink">{item.delivery}</b>
              </p>
            )}
            <h2 className="font-bold">{c.included}</h2>
            <ul className="grid gap-2.5">
              {item.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[15px]">
                  <Icon name="CircleCheck" size={17} className="mt-0.5 shrink-0 text-iris" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="border-t border-mist pt-4">
              <ShareLink title={label} labels={{ share: c.share, copy: c.copy, copied: c.copied, shareWa: c.shareWa }} />
            </div>
            <Link href="/offers" className="link-arrow">
              {c.allOffers} <Icon name={arrow} size={15} />
            </Link>
          </aside>

          <div className="grid gap-5">
            <div className="grid gap-1">
              <h2 className="text-2xl font-bold">{c.formTitle}</h2>
              <p className="text-iron">{c.formSub}</p>
            </div>
            <LeadForm services={options} defaultService={options.some((o) => o.slug === item.service) ? item.service : undefined} source="offer" offer={{ key: item.key, label, caption: c.chosen }} />
          </div>
        </div>
      </section>
    </>
  );
}
