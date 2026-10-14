import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { site } from "@/content/site";
import {
  getOfferItem,
  getOffersCopy,
  getServices,
  offerUnavailable,
} from "@/lib/content";
import { chatbotNav } from "@/content/chatbot-nav";
import { Highlight } from "@/components/ui/Section";
import { Icon, type IconName } from "@/components/ui/Icon";
import TechBackdrop from "@/components/ui/TechBackdrop";
import { LeadForm } from "@/components/forms/LeadForm";
import {
  Countdown,
  ShareLink,
  WhatsAppOrder,
} from "@/components/offers/OfferWidgets";
import { ServiceVisual } from "@/components/offers/ServiceVisual";

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
  const title =
    item.kind === "offer"
      ? `${item.name} — ${item.price}`
      : `${item.name} — ${item.group}`;
  // the preview card WhatsApp / social apps show for the shared link
  return {
    title,
    description: item.tagline,
    openGraph: {
      title,
      description: item.tagline,
      ...(image ? { images: [{ url: image }] } : {}),
    },
  };
}

/** A titled section card of the item page. */
function Block({
  icon,
  title,
  children,
  tone = "brand",
}: {
  icon: IconName;
  title: string;
  children: React.ReactNode;
  tone?: "brand" | "muted";
}) {
  return (
    <div className="card grid content-start gap-4 p-6">
      <h3 className="flex items-center gap-2.5 text-lg font-bold">
        <span
          className={`grid size-9 place-items-center rounded-xl ${tone === "brand" ? "bg-lilac text-iris" : "bg-cloud text-graphite"}`}
        >
          <Icon name={icon} size={17} />
        </span>
        {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * One package or offer (also /offers/today): a hero with the price card and both ways to order (form / WhatsApp to the
 * company number), what's delivered step by step, conditions and exclusions side by side, how we start, then the form.
 */
export default async function OfferItemPage({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [c, item, services, nav] = await Promise.all([
    getOffersCopy(locale),
    getOfferItem(slug, locale),
    getServices(locale),
    getTranslations("nav"),
  ]);
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
          <h1 className="text-2xl font-bold">
            {why === "notToday" ? c.notToday : c.ended}
          </h1>
          <p className="text-iron">
            {why === "notToday" ? c.notTodayText : c.endedText}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href={why === "notToday" ? "/offers/today" : "/offers"}
              className="btn btn-primary"
            >
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

  const options = [
    ...services.map(({ slug: s, title }) => ({ slug: s, title })),
    { slug: "nova-ai", title: nav("nova") },
    {
      slug: chatbotNav.href.slice(1),
      title: chatbotNav.title[locale === "ar" ? "ar" : "en"],
    },
  ];
  const label =
    item.kind === "offer"
      ? `${item.group}: ${item.name}`
      : `${item.group} — ${item.name}`;
  const daily = item.kind === "offer" && item.cycle === "daily";
  const d = item.details;
  const priceText = item.price
    ? `${item.kind === "package" && item.from ? `${c.from} ` : ""}${item.price}${item.period ? ` / ${item.period}` : ""}`
    : c.onRequest;
  const waLines = [c.waHello, label, `${c.waPrice}: ${priceText}`];
  // packages have no deliverables list: their features become the "what you get" cards
  const deliverables = d
    ? d.deliverables
    : item.features.map((f) => ({ title: f, text: "" }));

  const priceCard = (
    <div className="grid gap-4 rounded-card bg-white p-6 text-ink shadow-lg">
      {item.price ? (
        <div className="grid gap-1">
          {item.kind === "package" && item.from && (
            <span className="text-xs text-graphite">{c.from}</span>
          )}
          {item.oldPrice && (
            <span className="flex flex-wrap items-center gap-2">
              <span
                className="text-xl font-semibold text-graphite line-through decoration-2"
                dir="ltr"
              >
                {item.oldPrice}
              </span>
              {item.percent && (
                <span className="rounded-lg bg-[#ef4444] px-2.5 py-0.5 text-base font-extrabold text-white">
                  {c.off} {item.percent}%
                </span>
              )}
            </span>
          )}
          <span className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-4xl font-bold" dir="ltr">
              {item.price}
            </span>
            {item.period && (
              <span className="text-base font-medium text-iron">
                / {item.period}
              </span>
            )}
          </span>
          {item.saving && (
            <span className="mt-1 w-fit rounded-full bg-mint px-2.5 py-0.5 text-xs font-bold text-fern">
              {c.save} {item.saving}
            </span>
          )}
        </div>
      ) : (
        <span className="text-2xl font-bold text-iris">{c.onRequest}</span>
      )}
      <span className="text-xs text-graphite">{c.vatNote}</span>
      <div className="grid gap-2">
        <a href="#order" className="btn btn-primary w-full justify-center">
          {c.orderNow} <Icon name={arrow} size={16} />
        </a>
        <WhatsAppOrder
          phone={site.whatsapp}
          lines={waLines}
          label={c.orderWa}
          className="w-full"
        />
      </div>
      <p className="flex items-center gap-1.5 border-t border-mist pt-3 text-sm text-iron">
        <Icon name="Clock" size={14} className="shrink-0 text-iris" />{" "}
        {c.delivery}: <b className="font-semibold text-ink">{item.delivery}</b>
      </p>
    </div>
  );

  return (
    <>
      <section className="on-dark relative overflow-hidden">
        <TechBackdrop />
        <div className="container-site relative grid items-center gap-10 py-12 md:py-16 lg:grid-cols-[1.15fr_1fr]">
          <div className="grid content-start gap-5">
            <nav
              className="flex items-center gap-2 text-sm text-[#8d8e8f]"
              aria-label="Breadcrumb"
            >
              <Link href="/offers" className="hover:text-iris-light">
                {c.eyebrow}
              </Link>
              <Icon
                name={locale === "ar" ? "ChevronLeft" : "ChevronRight"}
                size={14}
              />
              <span className="text-white">
                {daily ? c.dayTitle : item.group}
              </span>
            </nav>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-iris-light">
              <Icon name={item.icon} size={15} /> {item.group}
            </span>
            <h1 className="h-display">{item.name}</h1>
            <p className="lead">{item.tagline}</p>
            {item.endsAtInstant && (
              <Countdown
                endsAt={item.endsAtInstant}
                labels={{
                  endsIn: c.endsIn,
                  days: c.days,
                  hours: c.hours,
                  minutes: c.minutes,
                  ...(daily ? { seconds: c.seconds } : {}),
                }}
                dark
                big={daily}
              />
            )}
          </div>
          <ServiceVisual
            service={item.service}
            locale={locale}
            className="h-72 md:h-80"
          />
        </div>
      </section>

      {/* order first: the price card and the form, then the details */}
      <section id="order" className="scroll-mt-24 py-12 md:py-16">
        <div className="container-site grid items-start gap-10 lg:grid-cols-[1fr_1.3fr]">
          <aside className="grid gap-5 lg:sticky lg:top-28">
            {priceCard}
            <div className="rounded-card border border-mist bg-cloud p-5">
              <ShareLink
                title={label}
                labels={{
                  share: c.share,
                  copy: c.copy,
                  copied: c.copied,
                  shareWa: c.shareWa,
                }}
              />
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
            <LeadForm
              services={options}
              defaultService={
                options.some((o) => o.slug === item.service)
                  ? item.service
                  : undefined
              }
              source="offer"
              offer={{ key: item.key, label, caption: c.chosen }}
            />
          </div>
        </div>
      </section>

      {/* the details in one compact section: who it suits + delivery beside what's included / not included */}
      <section className="bg-cloud py-12 md:py-16">
        <div className="container-site grid items-start gap-6 lg:grid-cols-3">
          <div className="grid content-start gap-6">
            <Block icon="Users" title={d ? c.forWho : c.idealFor}>
              <p className="leading-relaxed text-iron">
                {d ? d.forWho : item.kind === "package" ? item.idealFor : ""}
              </p>
            </Block>
            <Block icon="Clock" title={c.delivery}>
              <p className="text-lg font-semibold">{item.delivery}</p>
            </Block>
          </div>
          <div className="grid content-start gap-6 lg:col-span-2">
            <Block icon="CircleCheck" title={c.included}>
              <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {item.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[15px]">
                    <Icon
                      name="CircleCheck"
                      size={17}
                      className="mt-0.5 shrink-0 text-iris"
                    />
                    {f}
                  </li>
                ))}
              </ul>
            </Block>
            {item.kind === "package" && (
              <Block icon="CircleX" title={c.notIncluded} tone="muted">
                <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  {item.excludes.map((t) => (
                    <li
                      key={t}
                      className="flex items-start gap-2 text-[15px] text-iron"
                    >
                      <Icon
                        name="X"
                        size={16}
                        className="mt-0.5 shrink-0 text-graphite"
                      />
                      {t}
                    </li>
                  ))}
                </ul>
                <p className="flex items-start gap-2 rounded-xl border border-iris/20 bg-lilac/60 px-3 py-2.5 text-[13px] leading-relaxed text-ink">
                  <Icon
                    name="Lightbulb"
                    size={15}
                    className="mt-0.5 shrink-0 text-iris"
                  />
                  {item.notice}
                </p>
              </Block>
            )}
          </div>
        </div>
      </section>

      {d && (
        <section className="py-12 md:py-16">
          <div className="container-site grid gap-8">
            <h2 className="text-center text-3xl font-bold">{c.deliverables}</h2>
            <ol className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              {deliverables.map((x, i) => (
                <li
                  key={x.title}
                  className="card relative grid content-start gap-2 p-6 pt-7"
                >
                  <span className="absolute -top-3 start-6 grid size-8 place-items-center rounded-full bg-iris text-sm font-bold text-white shadow">
                    {i + 1}
                  </span>
                  <b className="text-lg">{x.title}</b>
                  {x.text && (
                    <p className="text-[14.5px] leading-relaxed text-iron">
                      {x.text}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {d && (
        <section className="bg-cloud py-12 md:py-16">
          <div className="container-site grid items-start gap-6 md:grid-cols-2">
            <Block icon="ClipboardList" title={c.terms}>
              <ul className="grid gap-2.5">
                {d.terms.map((t) => (
                  <li key={t} className="flex items-start gap-2 text-[15px]">
                    <Icon
                      name="Check"
                      size={16}
                      className="mt-0.5 shrink-0 text-iris"
                    />
                    {t}
                  </li>
                ))}
              </ul>
            </Block>
            <Block icon="CircleX" title={c.excludes} tone="muted">
              <ul className="grid gap-2.5">
                {d.excludes.map((t) => (
                  <li
                    key={t}
                    className="flex items-start gap-2 text-[15px] text-iron"
                  >
                    <Icon
                      name="X"
                      size={16}
                      className="mt-0.5 shrink-0 text-graphite"
                    />
                    {t}
                  </li>
                ))}
              </ul>
            </Block>
          </div>
        </section>
      )}

      <section className="py-12 md:py-16">
        <div className="container-site grid gap-8">
          <h2 className="text-center text-3xl font-bold">
            <Highlight text={c.howTitle} />
          </h2>
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
                <p className="text-[14.5px] leading-relaxed text-iron">
                  {h.text}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* phones: price and both ways to order always in reach */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-mist bg-white/95 px-4 py-3 shadow-[0_-6px_20px_rgba(0,0,0,.08)] backdrop-blur md:hidden">
        <span className="grid min-w-0 flex-1 leading-tight">
          {item.oldPrice && (
            <span className="text-xs text-graphite line-through" dir="ltr">
              {item.oldPrice}
            </span>
          )}
          <b className="truncate text-lg" dir="ltr">
            {item.price ?? c.onRequest}
          </b>
        </span>
        <WhatsAppOrder
          phone={site.whatsapp}
          lines={waLines}
          label={c.orderWa}
          className="!px-3 text-sm"
        />
        <a href="#order" className="btn btn-primary !px-3 text-sm">
          {c.orderNow}
        </a>
      </div>
    </>
  );
}
