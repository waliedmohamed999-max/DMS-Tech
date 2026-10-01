import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { site, whatsappLink } from "@/content/site";
import { getServices } from "@/lib/content";
import { PageHero } from "@/components/ui/Section";
import { Icon } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/Brand";
import { LeadForm } from "@/components/forms/LeadForm";
import { SocialLinks } from "@/components/layout/Footer";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages" });
  return { title: t("contactTitle").replace(/\*/g, ""), description: t("contactSub") };
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [t, common, nav, services] = await Promise.all([getTranslations("pages"), getTranslations("common"), getTranslations("nav"), getServices(locale)]);

  const cards = [
    { href: whatsappLink(), label: common("whatsapp"), value: site.phoneDisplay, icon: <BrandIcon slug="whatsapp" size={20} />, external: true },
    { href: `mailto:${site.email}`, label: common("email"), value: site.email, icon: <Icon name="Mail" />, external: false }
  ];

  return (
    <>
      <PageHero eyebrow={nav("contact")} title={t("contactTitle")} sub={t("contactSub")} />
      <section className="section">
        <div className="container-site grid items-start gap-12 lg:grid-cols-[1fr_1.5fr]">
          <div className="grid gap-4">
            {cards.map((c) => (
              <a
                key={c.label}
                href={c.href}
                {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="card flex items-center gap-4 bg-cloud p-6 transition hover:bg-lilac"
              >
                <span className="badge-icon">{c.icon}</span>
                <span>
                  <small className="block text-[13px] text-iron">{c.label}</small>
                  <strong className="block text-lg" dir="ltr">
                    {c.value}
                  </strong>
                </span>
              </a>
            ))}
            <div className="card grid gap-4 bg-cloud p-6">
              <span className="flex items-center gap-4">
                <span className="badge-icon">
                  <Icon name="Share2" />
                </span>
                <span>
                  <small className="block text-[13px] text-iron">{common("followUs")}</small>
                  <strong className="block text-lg">{site.socialHandle}</strong>
                </span>
              </span>
              <SocialLinks />
            </div>
          </div>
          <LeadForm services={services.map(({ slug, title }) => ({ slug, title }))} source="contact" />
        </div>
      </section>
    </>
  );
}
