import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getCompany, getIndustries, getIntegrations } from "@/lib/content";
import { PageHero, SectionHeading } from "@/components/ui/Section";
import { Icon } from "@/components/ui/Icon";
import { FinalCta, IntegrationsWall } from "@/components/home/Sections";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages" });
  return { title: t("clientsTitle").replace(/\*/g, ""), description: t("clientsSub") };
}

export default async function ClientsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [t, home, nav, industries, integrations, company] = await Promise.all([
    getTranslations("pages"),
    getTranslations("home"),
    getTranslations("nav"),
    getIndustries(locale),
    getIntegrations(),
    getCompany(locale)
  ]);

  return (
    <>
      <PageHero eyebrow={nav("industries")} title={t("clientsTitle")} sub={t("clientsSub")} />

      <section className="section">
        <div className="container-site grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {industries.map((ind) => (
            <article key={ind.slug} className="card card-hover flex flex-col overflow-hidden border border-mist">
              <div className="relative aspect-[16/10]">
                <Image src={ind.image} alt={ind.title} fill sizes="(min-width:1024px) 400px, 90vw" className="object-cover" />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-7">
                <span className="badge-icon -mt-12">
                  <Icon name={ind.icon} />
                </span>
                <h2 className="text-xl font-bold">{ind.title}</h2>
                <p className="text-[15px] text-iron">{ind.description}</p>
                <p className="mt-auto border-t border-mist pt-4 font-semibold">“{ind.quote}”</p>
              </div>
            </article>
          ))}
        </div>
        <ul className="container-site mt-12 flex flex-wrap justify-center gap-3">
          {company.promises.slice(3).map((p) => (
            <li key={p.label} className="pill">
              <Icon name={p.icon} size={16} className="text-iris" /> {p.label}
            </li>
          ))}
        </ul>
      </section>

      <section id="platforms" className="section overflow-hidden bg-cloud">
        <div className="container-site">
          <SectionHeading title={t("platformsTitle")} sub={home("integrationsSub")} />
        </div>
        <IntegrationsWall rows={integrations} />
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
