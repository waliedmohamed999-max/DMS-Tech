import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { site } from "@/content/site";
import { getCareersCopy, getJobs, getServices } from "@/lib/content";
import { Highlight, PageHero, SectionHeading } from "@/components/ui/Section";
import { Icon, type IconName } from "@/components/ui/Icon";
import JobsBrowser from "@/components/careers/JobsBrowser";
import TechBackdrop from "@/components/ui/TechBackdrop";
import { DarkSteps } from "@/components/ui/ProductBlocks";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages" });
  return { title: t("careersTitle").replace(/\*/g, ""), description: t("careersSub") };
}

/** Careers: open roles filtered by department (each links to its full page), why work with us, the hiring process, and a general CV call. */
export default async function CareersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [t, nav, jobs, c, services] = await Promise.all([getTranslations("pages"), getTranslations("nav"), getJobs(locale), getCareersCopy(locale), getServices(locale)]);
  // the list only needs the card fields — the full text stays on each job page
  const cards = jobs.map(({ slug, service, title, description, team, type, location, experience, icon }) => ({ slug, service, title, description, team, type, location, experience, icon }));
  // one filter per website service that has open roles, in the services order
  const groups = services
    .map((s) => ({ slug: s.slug, title: s.eyebrow, icon: s.icon as IconName, count: jobs.filter((j) => j.service === s.slug).length }))
    .filter((g) => g.count > 0);
  const arrow = locale === "ar" ? "ArrowLeft" : "ArrowRight";
  const generalMail = `mailto:${site.email}?subject=${encodeURIComponent(`${c.mailSubject} — ${t("careersGeneralCta")}`)}`;

  return (
    <>
      <PageHero eyebrow={nav("careers")} title={t("careersTitle")} sub={t("careersSub")}>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a href="#jobs" className="btn btn-primary">
            {c.browse} <Icon name={arrow} size={17} />
          </a>
          <span className="pill">
            <span className="size-2 rounded-full bg-fern" /> {jobs.length} {c.rolesCount}
          </span>
        </div>
      </PageHero>

      {/* open roles */}
      <section id="jobs" className="section scroll-mt-24">
        <div className="container-site">
          <SectionHeading align="start" title={t("careersOpen")} />
          <JobsBrowser jobs={cards} groups={groups} labels={{ all: c.all, details: c.details }} locale={locale} />
        </div>
      </section>

      {/* why work with us */}
      <section className="section bg-cloud">
        <div className="container-site">
          <SectionHeading title={c.perksTitle} />
          <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
            {c.perks.map((p) => (
              <div key={p.title} className="card grid content-start gap-3 p-4 sm:p-7">
                <span className="grid size-10 place-items-center rounded-xl bg-lilac text-iris sm:size-11">
                  <Icon name={p.icon} size={19} />
                </span>
                <h3 className="text-[15px] font-bold sm:text-lg">{p.title}</h3>
                <p className="text-[13px] leading-relaxed text-iron sm:text-[15px]">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* hiring process */}
      <section className="on-dark relative overflow-hidden">
        <TechBackdrop />
        <div className="container-site relative grid gap-12 py-20 md:py-28">
          <h2 className="text-center text-3xl font-bold md:text-4xl">
            <Highlight text={c.processTitle} />
          </h2>
          <DarkSteps steps={c.process} />
        </div>
      </section>

      {/* open application */}
      <section className="section">
        <div className="container-site">
          <div className="flex flex-wrap items-center justify-between gap-5 rounded-card border border-mist bg-cloud p-8 md:p-10">
            <div className="flex items-center gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-iris text-white">
                <Icon name="FileText" size={22} />
              </span>
              <p className="max-w-xl text-lg font-semibold">{t("careersGeneral")}</p>
            </div>
            <a href={generalMail} className="btn btn-dark">
              <Icon name="Send" size={18} /> {t("careersGeneralCta")}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
