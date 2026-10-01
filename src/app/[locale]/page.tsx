import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { Integration } from "@/content/types";
import { getCompany, getIndustries, getIntegrations, getServices } from "@/lib/content";
import ServiceCards from "@/components/home/ServiceCards";
import FeatureShowcase from "@/components/home/FeatureShowcase";
import CaseCarousel from "@/components/home/CaseCarousel";
import { Heading, Heart, Hero, JourneyBand, LovedBy, Setup, SixFeatures } from "@/components/home/Landing";
import { Link } from "@/i18n/navigation";

// Section order and rhythm follow the Specify homepage.
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const [t, company, industries, integrations, services] = await Promise.all([
    getTranslations("home"),
    getCompany(locale),
    getIndustries(locale),
    getIntegrations(),
    getServices(locale)
  ]);

  const all = integrations.flat();
  const by = (n: string) => all.find((i) => i.name === n) ?? null;
  const appGrid: (Integration | null | "core")[][] = [
    [null, null, null, by("Notion"), null, null, null],
    [null, by("Shopify"), by("WhatsApp"), "core", by("HubSpot"), by("Odoo"), null],
    [null, null, by("Google Analytics"), by("Stripe"), by("Zapier"), null, null]
  ];

  return (
    <>
      <Hero pill={t("heroPill")} title={t("heroTitle")} sub={t("heroSub")} locale={locale} />
      <LovedBy
        label={t("lovedBy")}
        items={["Zid", "Salla", "Shopify", "WhatsApp", "Meta", "TikTok", "Google Ads", "HubSpot", "Odoo", "Stripe"].map((n) => by(n)).filter((x): x is Integration => !!x)}
      />

      <section className="pt-24 md:pt-32">
        <div className="container-site">
          <Heading title={t("svcTitle")} sub={t("svcSub")} />
          <div className="mt-14">
            <ServiceCards services={services} locale={locale} cta={t("svcCta")} />
          </div>
        </div>
      </section>

      <section className="py-24 md:py-32">
        <div className="container-site">
          <Heading title={t("nextTitle")} sub={t("nextSub")}>
            <Link href="/about" className="btn btn-outline">
              {t("nextCta")}
            </Link>
          </Heading>
          <div className="mx-auto mt-20 max-w-5xl">
            <FeatureShowcase
              features={[
                { icon: "Layers", title: t("f1Title"), text: t("f1Text") },
                { icon: "Users", title: t("f2Title"), text: t("f2Text") },
                { icon: "Workflow", title: t("f3Title"), text: t("f3Text") }
              ]}
            />
          </div>
        </div>
      </section>

      <section className="pb-8">
        <CaseCarousel items={industries} label={t("appsLabel")} cta={t("caseCta")} />
      </section>

      <Setup
        locale={locale}
        apps={appGrid}
        chips={company.capabilities}
        copy={{
          title: t("setupTitle"),
          sub: t("setupSub"),
          cta: t("setupCta"),
          syncTitle: t("syncTitle"),
          syncText: t("syncText"),
          syncCta: t("syncCta"),
          customTitle: t("customTitle"),
          customText: t("customText"),
          customCta: t("customCta")
        }}
      />

      <SixFeatures items={[...company.values, ...company.trustCards.map(({ icon, title, description }) => ({ icon, title, description }))]} />

      <JourneyBand title={t("journeyTitle")} sub={t("journeySub")} steps={company.phases} />

      <Heart
        title={t("heartTitle")}
        locale={locale}
        copy={{ h1Title: t("h1Title"), h1Text: t("h1Text"), h1Cta: t("h1Cta"), h2Title: t("h2Title"), h2Text: t("h2Text"), h2Cta: t("h2Cta") }}
        labels={{ identity: t("miniIdentity"), automation: t("miniAutomation"), reports: t("miniReports"), content: t("miniContent"), lines: t("miniLines").split("|") }}
      />
    </>
  );
}
