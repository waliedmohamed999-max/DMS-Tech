import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getCompany, getServices } from "@/lib/content";
import { PageHero, SectionHeading } from "@/components/ui/Section";
import { Icon } from "@/components/ui/Icon";
import PhasesTabs from "@/components/home/PhasesTabs";
import { FinalCta, ValueBadges } from "@/components/home/Sections";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages" });
  return { title: t("aboutStoryTitle"), description: t("aboutSub") };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [t, home, nav, company, services] = await Promise.all([
    getTranslations("pages"),
    getTranslations("home"),
    getTranslations("nav"),
    getCompany(locale),
    getServices(locale)
  ]);

  return (
    <>
      <PageHero eyebrow={nav("aboutCompany")} title={t("aboutTitle")} sub={t("aboutSub")} />

      <section className="section">
        <div className="container-site grid items-center gap-14 lg:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-card shadow-lg">
            <Image src="/images/photos/about-team.jpg" alt="DMS Tech" fill sizes="(min-width:1024px) 600px, 90vw" className="object-cover" />
          </div>
          <div className="grid gap-5">
            <span className="eyebrow">{t("aboutStoryTitle")}</span>
            <h2 className="h-lg">{home("trusted")}</h2>
            <p className="lead">{t("aboutStory")}</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {services.map((s) => (
                <li key={s.slug}>
                  <Link href={`/services/${s.slug}`} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-cloud">
                    <span className="soft-icon size-9">
                      <Icon name={s.icon} size={17} />
                    </span>
                    <span className="text-[15px] font-semibold">{s.eyebrow}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="values" className="section bg-cloud">
        <div className="container-site">
          <SectionHeading title={t("aboutValues")} />
          <ValueBadges values={company.values} />
          <ul className="mt-10 flex flex-wrap justify-center gap-3">
            {company.promises.map((p) => (
              <li key={p.label} className="pill bg-white">
                <Icon name={p.icon} size={16} className="text-iris" /> {p.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="process" className="section">
        <div className="container-site">
          <SectionHeading title={home("phasesTitle")} sub={home("phasesSub")} />
          <PhasesTabs phases={company.phases} allLabel={nav("quote")} allHref="/quote" locale={locale} />
        </div>
      </section>

      <FinalCta
        title={home("ctaTitle")}
        sub={home("ctaSub")}
        input={home("ctaInput")}
        button={home("ctaButton")}
        alt={home("ctaAlt")}
        checks={company.promises.slice(0, 3).map((p) => p.label)}
      />
    </>
  );
}
