import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { site } from "@/content/site";
import { getCompany, getJobs } from "@/lib/content";
import { PageHero, SectionHeading } from "@/components/ui/Section";
import { Icon } from "@/components/ui/Icon";
import { ValueBadges } from "@/components/home/Sections";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages" });
  return { title: t("careersTitle").replace(/\*/g, ""), description: t("careersSub") };
}

export default async function CareersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [t, nav, jobs, company] = await Promise.all([getTranslations("pages"), getTranslations("nav"), getJobs(locale), getCompany(locale)]);
  const mail = (subject: string) => `mailto:${site.email}?subject=${encodeURIComponent(subject)}`;

  return (
    <>
      <PageHero eyebrow={nav("careers")} title={t("careersTitle")} sub={t("careersSub")} />

      <section className="section">
        <div className="container-site">
          <SectionHeading align="start" title={t("careersOpen")} />
          <ul className="grid gap-4">
            {jobs.map((j) => (
              <li key={j.slug} className="card grid items-center gap-4 border border-mist p-6 transition hover:border-iris md:grid-cols-[1fr_auto] md:p-8">
                <div className="grid gap-2">
                  <h2 className="text-xl font-bold">{j.title}</h2>
                  <p className="text-[15px] text-iron">{j.description}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <span className="chip inline-flex items-center gap-1.5"><Icon name="Layers" size={14} /> {j.team}</span>
                    <span className="chip inline-flex items-center gap-1.5"><Icon name="Clock" size={14} /> {j.type}</span>
                    <span className="chip inline-flex items-center gap-1.5"><Icon name="MapPin" size={14} /> {j.location}</span>
                  </div>
                </div>
                <a href={mail(`${t("careersApply")} — ${j.title}`)} className="btn btn-primary">
                  {t("careersApply")}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-5 rounded-card bg-cloud p-8">
            <p className="max-w-xl text-lg font-semibold">{t("careersGeneral")}</p>
            <a href={mail(t("careersGeneralCta"))} className="btn btn-dark">
              <Icon name="Send" size={18} /> {t("careersGeneralCta")}
            </a>
          </div>
        </div>
      </section>

      <section className="section bg-cloud">
        <div className="container-site">
          <SectionHeading title={t("aboutValues")} />
          <ValueBadges values={company.values} />
        </div>
      </section>
    </>
  );
}
