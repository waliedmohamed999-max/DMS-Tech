import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getCompany } from "@/lib/content";
import { SectionHeading } from "@/components/ui/Section";
import { Icon } from "@/components/ui/Icon";
import DashboardMockup from "@/components/home/DashboardMockup";
import TechBackdrop from "@/components/ui/TechBackdrop";
import { FinalCta } from "@/components/home/Sections";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const { nova } = await getCompany(locale as Locale);
  return { title: "NOVA AI", description: nova.description, openGraph: { images: [{ url: nova.image }] } };
}

export default async function NovaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [t, home, company] = await Promise.all([getTranslations("pages"), getTranslations("home"), getCompany(locale)]);
  const { nova } = company;

  return (
    <>
      <section className="on-dark relative overflow-hidden">
        <TechBackdrop />
        <div className="container-site relative grid items-center gap-16 pb-24 pt-14 lg:grid-cols-[1fr_1.08fr] lg:pt-20">
          <div className="grid gap-6">
            <span className="inline-flex w-fit items-center gap-2 rounded-pill border border-white/15 bg-white/5 px-4 py-1.5 text-[13px] font-semibold text-iris-light">
              <Icon name="Sparkles" size={15} /> {home("novaEyebrow")}
            </span>
            <h1 className="h-hero">
              <span className="hl">NOVA</span> AI
            </h1>
            <p className="text-2xl font-semibold leading-snug">{nova.tagline}</p>
            <p className="lead">{nova.description}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/quote?service=nova-ai" className="btn btn-primary">
                {home("novaCta")}
              </Link>
            </div>
            <ul className="flex flex-wrap gap-2.5">
              {nova.badges.map((b) => (
                <li key={b.label} className="pill">
                  <Icon name={b.icon} size={16} className="text-iris-light" /> {b.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="px-3 sm:px-6 lg:px-0">
            <DashboardMockup locale={locale} />
          </div>
        </div>
      </section>

      <section className="section bg-cloud">
        <div className="container-site">
          <SectionHeading title={t("novaFeatures")} sub={nova.description} />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {nova.features.map((f, i) => (
              <div key={f.title} className={`card card-hover grid content-start gap-4 p-8 ${i === 0 ? "lg:row-span-2 lg:content-between" : ""}`}>
                <div className="grid gap-4">
                  <span className="badge-icon">
                    <Icon name={f.icon} />
                  </span>
                  <h3 className="text-xl font-bold">{f.title}</h3>
                  <p className="text-[15px] text-iron">{f.description}</p>
                </div>
                {i === 0 && (
                  <div className="relative mt-4 aspect-square overflow-hidden rounded-2xl">
                    <Image src={nova.image} alt="NOVA AI" fill sizes="400px" className="object-cover" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <FinalCta
        title={home("novaTitle")}
        sub={nova.tagline}
        input={home("ctaInput")}
        button={home("novaCta")}
        alt={home("ctaAlt")}
        checks={nova.badges.slice(1).map((b) => b.label)}
      />
    </>
  );
}
