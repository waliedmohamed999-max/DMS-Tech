import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getCompany, getServices } from "@/lib/content";
import { PageHero } from "@/components/ui/Section";
import { Icon } from "@/components/ui/Icon";
import { FinalCta } from "@/components/home/Sections";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages" });
  return { title: t("servicesTitle").replace(/\*/g, ""), description: t("servicesSub") };
}

export default async function ServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [t, home, common, services, company] = await Promise.all([
    getTranslations("pages"),
    getTranslations("home"),
    getTranslations("common"),
    getServices(locale),
    getCompany(locale)
  ]);
  const arrow = locale === "ar" ? "ArrowLeft" : "ArrowRight";

  return (
    <>
      <PageHero eyebrow={common("viewAll")} title={t("servicesTitle")} sub={t("servicesSub")}>
        <Link href="/quote" className="btn btn-primary mt-2">
          {common("getQuote")}
        </Link>
      </PageHero>

      <section className="section">
        <div className="container-site grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <article key={s.slug} className="card card-hover group flex flex-col p-6">
              <span className="badge-icon">
                <Icon name={s.icon} />
              </span>
              <span className="chip mt-5 w-fit">{s.eyebrow}</span>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.74px]">{s.title}</h2>
              <p className="mt-3 text-[15px] text-iron">{s.description}</p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {s.features.map((f) => (
                  <li key={f.title} className="chip">
                    {f.title}
                  </li>
                ))}
              </ul>
              <Link href={`/services/${s.slug}`} className="link-arrow mt-auto pt-6">
                {common("learnMore")} <Icon name={arrow} size={18} />
              </Link>
            </article>
          ))}
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
