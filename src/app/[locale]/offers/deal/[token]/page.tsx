import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getDeal, getOffersCopy, getServices } from "@/lib/content";
import { chatbotNav } from "@/content/chatbot-nav";
import { Icon } from "@/components/ui/Icon";
import TechBackdrop from "@/components/ui/TechBackdrop";
import { LeadForm } from "@/components/forms/LeadForm";
import { Countdown } from "@/components/offers/OfferWidgets";

type Props = { params: Promise<{ locale: string; token: string }> };

// rendered per request: offers start / end by date, and the public CSP gives fresh renders a nonce (a cached
// re-render would no longer match the build-time script hashes)
export const dynamic = "force-dynamic";

/** Private deals are never listed or indexed: only someone holding the link sees them. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, token } = await params;
  const d = await getDeal(token, locale as Locale);
  return { title: d ? d.title : "DMS Tech", robots: { index: false, follow: false }, ...(d ? { description: d.text } : {}) };
}

/** A single client's private deal: greeting, what's included, the total (or "after a short discussion"), expiry and the form. */
export default async function DealPage({ params }: Props) {
  const { locale: raw, token } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [c, d, services, nav] = await Promise.all([getOffersCopy(locale), getDeal(token, locale), getServices(locale), getTranslations("nav")]);
  if (!d) notFound();

  if (d.expired)
    return (
      <section className="section">
        <div className="container-site grid max-w-xl justify-items-center gap-4 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-lilac text-iris">
            <Icon name="Timer" size={26} />
          </span>
          <h1 className="text-2xl font-bold">{c.ended}</h1>
          <p className="text-iron">{c.endedText}</p>
          <Link href="/quote" className="btn btn-primary">
            {c.customCta}
          </Link>
        </div>
      </section>
    );

  const options = [...services.map(({ slug, title }) => ({ slug, title })), { slug: "nova-ai", title: nav("nova") }, { slug: chatbotNav.href.slice(1), title: chatbotNav.title[locale === "ar" ? "ar" : "en"] }];
  const valid = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${d.expiresAt}T12:00:00Z`));

  return (
    <>
      <section className="on-dark relative overflow-hidden">
        <TechBackdrop />
        <div className="container-site relative grid gap-5 py-14 md:py-20">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[13px] font-semibold text-iris-light">
            <Icon name="Gem" size={15} /> {c.dealFor}: {d.client}
          </span>
          <h1 className="h-display max-w-3xl">{d.title}</h1>
          <p className="lead max-w-2xl">{d.text}</p>
          <Countdown endsAt={d.expiresAtInstant} labels={{ endsIn: c.endsIn, days: c.days, hours: c.hours, minutes: c.minutes }} dark />
          {d.preview && <span className="w-fit rounded-full bg-warning/20 px-3 py-1 text-xs font-semibold text-warning">{c.preview}</span>}
        </div>
      </section>

      <section className="section">
        <div className="container-site grid items-start gap-10 lg:grid-cols-[1fr_1.25fr]">
          <aside className="grid gap-4 rounded-card border border-mist bg-cloud p-7 lg:sticky lg:top-28">
            <h2 className="font-bold">{c.dealItems}</h2>
            <ul className="grid gap-2">
              {d.items.map((i) => (
                <li key={i.label} className="flex items-start justify-between gap-3 rounded-xl bg-white px-4 py-3 text-[15px] shadow-card">
                  <span className="flex items-start gap-2">
                    <Icon name="CircleCheck" size={17} className="mt-0.5 shrink-0 text-iris" />
                    {i.label}
                  </span>
                  {i.price && (
                    <span className="shrink-0 font-semibold" dir="ltr">
                      {i.price}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="grid gap-1 border-t border-mist pt-4">
              <span className="text-sm text-graphite">{c.dealTotal}</span>
              {d.total ? (
                <span className="text-3xl font-bold" dir="ltr">
                  {d.total}
                </span>
              ) : (
                <span className="font-semibold text-iris">{c.dealOnRequest}</span>
              )}
              <span className="text-xs text-graphite">{c.vatNote}</span>
            </div>
            <p className="flex items-center gap-2 text-sm text-iron">
              <Icon name="CalendarClock" size={15} className="text-iris" /> {c.dealValid}: {valid}
            </p>
          </aside>
          <div className="grid gap-5">
            <div className="grid gap-1">
              <h2 className="text-2xl font-bold">{c.formTitle}</h2>
              <p className="text-iron">{c.formSub}</p>
            </div>
            <LeadForm services={options} source="offer" offer={{ key: d.key, label: d.title, caption: c.chosen }} />
          </div>
        </div>
      </section>
    </>
  );
}
