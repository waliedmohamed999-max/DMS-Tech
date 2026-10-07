import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getServices } from "@/lib/content";
import { PageHero } from "@/components/ui/Section";
import { Icon, type IconName } from "@/components/ui/Icon";
import { LeadForm } from "@/components/forms/LeadForm";
import { chatbotNav } from "@/content/chatbot-nav";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages" });
  return { title: t("quoteTitle").replace(/\*/g, ""), description: t("quoteSub") };
}

export default async function QuotePage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ service?: string }>;
}) {
  const { locale: raw } = await params;
  const { service } = await searchParams;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [t, nav, services] = await Promise.all([getTranslations("pages"), getTranslations("nav"), getServices(locale)]);

  const options = [...services.map(({ slug, title }) => ({ slug, title })), { slug: "nova-ai", title: nav("nova") }, { slug: chatbotNav.href.slice(1), title: chatbotNav.title[locale === "ar" ? "ar" : "en"] }];
  const steps: { icon: IconName; text: string }[] = [
    { icon: "MessagesSquare", text: t("quoteStep1") },
    { icon: "Lightbulb", text: t("quoteStep2") },
    { icon: "FileText", text: t("quoteStep3") }
  ];

  return (
    <>
      <PageHero eyebrow={nav("quote")} title={t("quoteTitle")} sub={t("quoteSub")} />
      <section className="section">
        <div className="container-site grid items-start gap-12 lg:grid-cols-[1.5fr_1fr]">
          <LeadForm services={options} defaultService={options.some((o) => o.slug === service) ? service : undefined} source="quote" />
          <aside className="card grid gap-6 bg-cloud p-8 lg:sticky lg:top-28">
            <h2 className="text-xl font-bold">{t("quoteSteps")}</h2>
            <ol className="grid gap-5">
              {steps.map((s, i) => (
                <li key={s.text} className="flex items-start gap-4">
                  <span className="badge-icon relative">
                    <Icon name={s.icon} />
                    <b className="absolute -end-2 -top-2 grid size-6 place-items-center rounded-full bg-ink text-[11px] text-white">{i + 1}</b>
                  </span>
                  <p className="pt-2 text-[15px] text-iron">{s.text}</p>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>
    </>
  );
}
