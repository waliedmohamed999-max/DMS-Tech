import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getOfferItem, getOffersCopy, getServices, offerExists } from "@/lib/content";
import { chatbotNav } from "@/content/chatbot-nav";
import { Icon } from "@/components/ui/Icon";
import TechBackdrop from "@/components/ui/TechBackdrop";
import { LeadForm } from "@/components/forms/LeadForm";
import { Countdown, ShareLink } from "@/components/offers/OfferWidgets";

type Props = { params: Promise<{ locale: string; slug: string }> };

// rendered per request: offers start / end by date, and the public CSP gives fresh renders a nonce (a cached
// re-render would no longer match the build-time script hashes)
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const item = await getOfferItem(slug, locale as Locale);
  if (!item) return {};
  const services = await getServices(locale as Locale);
  const image = services.find((s) => s.slug === item.service)?.image;
  // the preview card WhatsApp / social apps show for the shared link
  return { title: `${item.name} — ${item.group}`, description: item.tagline, openGraph: { title: `${item.name} — ${item.group}`, description: item.tagline, ...(image ? { images: [{ url: image }] } : {}) } };
}

/** One package or offer: what it includes, the price (or "priced to your needs"), share tools and the request form. */
export default async function OfferItemPage({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [c, item, services, nav] = await Promise.all([getOffersCopy(locale), getOfferItem(slug, locale), getServices(locale), getTranslations("nav")]);
  const arrow = locale === "ar" ? "ArrowLeft" : "ArrowRight";

  if (!item) {
    // an offer that existed but has ended gets a friendly page instead of a 404
    if (!offerExists(slug)) notFound();
    return (
      <section className="section">
        <div className="container-site grid max-w-xl justify-items-center gap-4 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-lilac text-iris">
            <Icon name="Timer" size={26} />
          </span>
          <h1 className="text-2xl font-bold">{c.ended}</h1>
          <p className="text-iron">{c.endedText}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/offers" className="btn btn-primary">
              {c.allOffers}
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
  const label = `${item.group} — ${item.name}`;

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
            <span className="text-white">{item.name}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-5">
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-iris to-iris-soft text-white shadow-[0_0_0_6px_rgba(98,77,227,.18)]">
              <Icon name={item.icon} size={28} />
            </span>
            <div className="grid gap-1">
              <span className="text-sm font-semibold text-iris-light">{item.group}</span>
              <h1 className="h-display">{item.name}</h1>
              <p className="lead">{item.tagline}</p>
            </div>
          </div>
          {item.endsAtInstant && <Countdown endsAt={item.endsAtInstant} labels={{ endsIn: c.endsIn, days: c.days, hours: c.hours, minutes: c.minutes }} dark />}
          {"preview" in item && item.preview && <span className="w-fit rounded-full bg-warning/20 px-3 py-1 text-xs font-semibold text-warning">{c.preview}</span>}
        </div>
      </section>

      <section className="section">
        <div className="container-site grid items-start gap-10 lg:grid-cols-[1fr_1.25fr]">
          <aside className="grid gap-5 rounded-card border border-mist bg-cloud p-7 lg:sticky lg:top-28">
            <div className="grid gap-1 border-b border-mist pb-4">
              {item.price ? (
                <>
                  <span className="text-xs text-graphite">{item.kind === "package" ? c.from : ""}</span>
                  {item.oldPrice && (
                    <span className="text-sm text-graphite line-through" dir="ltr">
                      {item.oldPrice}
                    </span>
                  )}
                  <span className="text-3xl font-bold" dir="ltr">
                    {item.price}
                    {item.period && <span className="text-base font-medium text-iron"> / {item.period}</span>}
                  </span>
                </>
              ) : (
                <span className="text-xl font-bold text-iris">{c.onRequest}</span>
              )}
              <span className="text-xs text-graphite">{c.vatNote}</span>
            </div>
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
