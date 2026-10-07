import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getCompany, getService, getServiceExtrasCopy, getServiceSlugs, getServices } from "@/lib/content";
import { SectionHeading } from "@/components/ui/Section";
import TechBackdrop from "@/components/ui/TechBackdrop";
import { Icon } from "@/components/ui/Icon";
import { FinalCta } from "@/components/home/Sections";
import { Faq } from "@/components/ui/ProductBlocks";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  const slugs = await getServiceSlugs();
  return routing.locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const s = await getService(slug, locale as Locale);
  if (!s) return {};
  return { title: s.title, description: s.description, openGraph: { images: [{ url: s.image }] } };
}

export default async function ServicePage({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const service = await getService(slug, locale);
  if (!service) notFound();

  const [t, home, common, all, company, x] = await Promise.all([
    getTranslations("pages"),
    getTranslations("home"),
    getTranslations("common"),
    getServices(locale),
    getCompany(locale),
    getServiceExtrasCopy(locale)
  ]);
  const quote = `/quote?service=${service.slug}`;
  const related = all.filter((s) => s.slug !== slug).slice(0, 3);
  const arrow = locale === "ar" ? "ArrowLeft" : "ArrowRight";

  return (
    <>
      {/* Hero — two-column like Wrike product pages */}
      <section className="on-dark relative overflow-hidden">
        <TechBackdrop />
        <div className="container-site relative grid items-center gap-12 py-16 md:py-24 lg:grid-cols-2">
          <div className="grid gap-5">
            <nav className="flex items-center gap-2 text-sm text-[#8d8e8f]" aria-label="Breadcrumb">
              <Link href="/services" className="hover:text-iris-light">
                {t("servicesTitle").replace(/\*/g, "")}
              </Link>
              <Icon name={locale === "ar" ? "ChevronLeft" : "ChevronRight"} size={14} />
              <span className="text-white">{service.eyebrow}</span>
            </nav>
            <h1 className="h-display">{service.title}</h1>
            <p className="lead">{service.description}</p>
            <div className="flex flex-wrap items-center gap-4">
              <Link href={`/quote?service=${service.slug}`} className="btn btn-primary">
                {common("requestService")}
              </Link>
              <Link href="/contact" className="btn-ghost">
                {common("talkToUs")} <Icon name={arrow} size={18} />
              </Link>
            </div>
            <ul className="mt-2 flex flex-wrap gap-2.5">
              {service.benefits.map((b) => (
                <li key={b.label} className="pill">
                  <Icon name={b.icon} size={16} className="text-iris-light" /> {b.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <div className="overflow-hidden rounded-card border border-white/10 bg-[#1e2122] shadow-sm2">
              <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                <span className="grid size-9 place-items-center rounded-icon bg-iris text-white">
                  <Icon name={service.icon} size={18} />
                </span>
                <span className="font-semibold">{service.eyebrow}</span>
                <span className="ms-auto rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[11px] text-iris-light" dir="ltr">
                  {service.slug}
                </span>
              </div>
              <ul className="divide-y divide-white/5">
                {service.features.map((f) => (
                  <li key={f.title} className="flex items-start gap-3 px-5 py-4">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-icon bg-white/5 text-graphite">
                      <Icon name={f.icon} size={16} />
                    </span>
                    <span>
                      <span className="block text-[15px] font-semibold text-white">{f.title}</span>
                      <span className="mt-0.5 block text-sm text-graphite">{f.description}</span>
                    </span>
                    <Icon name="CircleCheck" size={18} className="ms-auto mt-1 shrink-0 text-iris-light" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Optional: who the service is for */}
      {service.audience && (
        <section className="section bg-cloud">
          <div className="container-site">
            <SectionHeading title={x.audienceTitle} sub={service.description} />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {service.audience.map((a) => (
                <div key={a.title} className="card grid content-start gap-4 p-8">
                  <span className="badge-icon">
                    <Icon name={a.icon} />
                  </span>
                  <h3 className="text-xl font-bold">{a.title}</h3>
                  <p className="text-[15px] text-iron">{a.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="section">
        <div className="container-site">
          <SectionHeading eyebrow={service.eyebrow} title={service.plans ? x.teamTitle : t("serviceFeatures")} sub={service.summary} />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {service.features.map((f) => (
              <div key={f.title} className="card card-hover grid content-start gap-4 bg-cloud p-8">
                <span className="badge-icon">
                  <Icon name={f.icon} />
                </span>
                <h3 className="text-xl font-bold">{f.title}</h3>
                <p className="text-[15px] text-iron">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Optional: in-house vs us */}
      {service.comparison && (
        <section className="section pt-0 md:pt-0">
          <div className="container-site max-w-5xl">
            <SectionHeading title={x.comparisonTitle} />
            <div className="overflow-hidden rounded-card border border-mist shadow-card">
              <div className="grid grid-cols-[0.7fr_1fr_1fr] bg-cloud text-sm font-bold max-sm:text-xs">
                <span className="p-4" />
                <span className="flex items-center gap-2 p-4 text-iron">
                  <Icon name="Building2" size={16} /> {x.inHouse}
                </span>
                <span className="flex items-center gap-2 bg-ink p-4 text-white">
                  <Icon name="Sparkles" size={16} className="text-iris-light" /> {x.withUs}
                </span>
              </div>
              {service.comparison.map((r) => (
                <div key={r.label} className="grid grid-cols-[0.7fr_1fr_1fr] border-t border-mist text-[15px] max-sm:text-[13px]">
                  <span className="p-4 font-semibold text-ink">{r.label}</span>
                  <span className="flex items-start gap-2 p-4 text-iron">
                    <Icon name="CircleX" size={16} className="mt-1 shrink-0 text-[#c2410c]" /> {r.inHouse}
                  </span>
                  <span className="flex items-start gap-2 bg-lilac/40 p-4 font-medium text-ink">
                    <Icon name="CircleCheck" size={16} className="mt-1 shrink-0 text-fern" /> {r.withUs}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Optional: subscription terms (no prices: quoted per team) */}
      {service.plans && (
        <section id="plans" className="section scroll-mt-24 bg-cloud">
          <div className="container-site">
            <SectionHeading title={x.plansTitle} sub={x.plansSub} />
            <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
              {service.plans.map((p) => (
                <div key={p.name} className={`grid content-between gap-8 rounded-card border p-8 ${p.featured ? "border-ink bg-ink text-white shadow-sm2 md:-translate-y-3" : "border-mist bg-white shadow-card"}`}>
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`grid size-11 place-items-center rounded-icon ${p.featured ? "bg-white/10 text-iris-light" : "bg-lilac text-iris"}`}>
                        <Icon name={p.icon} size={20} />
                      </span>
                      {p.featured && <span className="rounded-full bg-iris px-2.5 py-0.5 text-xs font-semibold text-white">{x.popular}</span>}
                    </div>
                    <h3 className="text-2xl font-bold">{p.name}</h3>
                    <p className={`text-sm font-semibold ${p.featured ? "text-iris-light" : "text-iris"}`}>{p.term}</p>
                    <p className={`text-sm ${p.featured ? "text-white/70" : "text-iron"}`}>{p.for}</p>
                    <ul className="grid gap-2.5">
                      {p.features.map((pf) => (
                        <li key={pf} className="flex items-start gap-2 text-[15px]">
                          <Icon name="Check" size={17} className={`mt-0.5 shrink-0 ${p.featured ? "text-iris-light" : "text-iris"}`} />
                          {pf}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Link href={quote} className={`btn w-full justify-center ${p.featured ? "bg-white text-ink hover:bg-cloud" : "btn-primary"}`}>
                    {x.planCta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Process: the service's own steps when it has them, otherwise the company delivery process */}
      <section className={`section ${service.plans ? "" : "bg-cloud"}`}>
        <div className="container-site">
          <SectionHeading title={service.process ? x.processTitle : t("serviceProcess")} />
          <ol className="grid gap-6 md:grid-cols-5">
            {(service.process ?? company.phases.map((p) => ({ icon: p.icon, title: p.tab, description: p.description }))).map((p, i) => (
              <li key={p.title} className="relative grid justify-items-center gap-3 text-center">
                <span className="relative grid size-20 place-items-center rounded-full border border-mist bg-white text-iris shadow-lg">
                  <Icon name={p.icon} size={28} />
                  <b className="badge-icon absolute -end-1 -top-1 size-7 rounded-full text-[11px]">{String(i + 1).padStart(2, "0")}</b>
                </span>
                <h3 className="text-lg font-bold">{p.title}</h3>
                <p className="text-sm text-iron">{p.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Optional: FAQ */}
      {service.faq && (
        <section className="section bg-cloud">
          <div className="container-site max-w-3xl">
            <SectionHeading title={x.faqTitle} />
            <Faq items={service.faq} />
          </div>
        </section>
      )}

      {/* Related */}
      <section className="section">
        <div className="container-site">
          <SectionHeading align="start" title={t("relatedServices")} />
          <div className="grid gap-6 md:grid-cols-3">
            {related.map((s) => (
              <Link key={s.slug} href={`/services/${s.slug}`} className="card card-hover group flex items-start gap-4 border border-mist p-6">
                <span className="soft-icon group-hover:bg-iris group-hover:text-white">
                  <Icon name={s.icon} />
                </span>
                <span>
                  <span className="block text-lg font-bold">{s.title}</span>
                  <span className="mt-1 block text-sm text-iron">{s.summary}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <FinalCta
        title={t("serviceCtaTitle")}
        sub={t("serviceCtaText")}
        input={home("ctaInput")}
        button={home("ctaButton")}
        alt={home("ctaAlt")}
        checks={company.promises.slice(0, 3).map((p) => p.label)}
      />
    </>
  );
}
