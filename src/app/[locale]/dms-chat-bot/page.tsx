import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getChatbot } from "@/lib/content";
import { SectionHeading } from "@/components/ui/Section";
import { Icon } from "@/components/ui/Icon";
import TechBackdrop from "@/components/ui/TechBackdrop";
import { FinalCta } from "@/components/home/Sections";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = await getChatbot(locale as Locale);
  return { title: c.title, description: `${c.tagline} — ${c.description}`, openGraph: { images: [{ url: c.image }] } };
}

/** DMS Chat Bot — same layout as the NOVA AI page, marked "coming soon" (src/content/chatbot.ts). */
export default async function ChatbotPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [home, c] = await Promise.all([getTranslations("home"), getChatbot(locale)]);
  const quote = `/quote?service=${c.slug}`;

  return (
    <>
      <section className="on-dark relative overflow-hidden">
        <TechBackdrop />
        <div className="container-site relative grid items-center gap-16 pb-24 pt-14 lg:grid-cols-[1fr_1.08fr] lg:pt-20">
          <div className="grid gap-6">
            <span className="inline-flex w-fit items-center gap-2 rounded-pill border border-white/15 bg-white/5 px-4 py-1.5 text-[13px] font-semibold text-iris-light">
              <Icon name="Timer" size={15} /> {c.ui.soonLong}
            </span>
            <h1 className="h-hero">
              <span className="hl">DMS</span> Chat Bot
            </h1>
            <p className="text-sm font-medium text-[#8d8e8f]">{c.fullName}</p>
            <p className="text-2xl font-semibold leading-snug">{c.tagline}</p>
            <p className="lead">{c.description}</p>
            <div className="flex flex-wrap gap-3">
              <Link href={quote} className="btn btn-primary">
                {c.ui.notify}
              </Link>
            </div>
          </div>
          <div className="px-3 sm:px-6 lg:px-0">
            <div className="overflow-hidden rounded-card border border-white/10 bg-white shadow-sm2">
              <Image src={c.image} alt={c.title} width={1261} height={726} priority sizes="(min-width:1024px) 640px, 92vw" className="h-auto w-full" />
            </div>
          </div>
        </div>
      </section>

      <section className="section bg-cloud">
        <div className="container-site">
          <SectionHeading title={c.ui.features} sub={c.description} />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {c.features.map((f) => (
              <div key={f.title} className="card card-hover grid content-start gap-4 p-8">
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

      <FinalCta
        title={c.tagline}
        sub={c.description}
        input={home("ctaInput")}
        button={c.ui.notify}
        alt={home("ctaAlt")}
        checks={c.features.slice(0, 3).map((f) => f.title)}
      />
    </>
  );
}
