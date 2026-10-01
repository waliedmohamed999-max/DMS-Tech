import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getPosts } from "@/lib/content";
import { PageHero } from "@/components/ui/Section";
import { Icon } from "@/components/ui/Icon";
import { formatDate } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages" });
  return { title: t("blogTitle").replace(/\*/g, ""), description: t("blogSub") };
}

export default async function BlogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [t, common, nav, posts] = await Promise.all([getTranslations("pages"), getTranslations("common"), getTranslations("nav"), getPosts(locale)]);
  const [featured, ...rest] = posts;
  const arrow = locale === "ar" ? "ArrowLeft" : "ArrowRight";

  return (
    <>
      <PageHero eyebrow={nav("blog")} title={t("blogTitle")} sub={t("blogSub")} />
      <section className="section">
        <div className="container-site grid gap-8">
          {featured && (
            <Link href={`/blog/${featured.slug}`} className="card card-hover group grid overflow-hidden border border-mist lg:grid-cols-2">
              <div className="relative aspect-[16/10] lg:aspect-auto">
                <Image src={featured.image} alt={featured.title} fill sizes="(min-width:1024px) 600px, 90vw" className="object-cover transition duration-500 group-hover:scale-105" />
              </div>
              <div className="grid content-center gap-4 p-8 md:p-12">
                <span className="eyebrow">{featured.category}</span>
                <h2 className="h-lg">{featured.title}</h2>
                <p className="lead">{featured.excerpt}</p>
                <span className="text-sm text-iron">
                  {formatDate(featured.date, locale)} · {featured.readMinutes} {common("minRead")}
                </span>
                <span className="link-arrow">
                  {common("readMore")} <Icon name={arrow} size={18} />
                </span>
              </div>
            </Link>
          )}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="card card-hover group flex flex-col overflow-hidden border border-mist">
                <div className="relative aspect-video overflow-hidden">
                  <Image src={p.image} alt={p.title} fill sizes="400px" className="object-cover transition duration-500 group-hover:scale-105" />
                </div>
                <div className="flex flex-1 flex-col gap-3 p-7">
                  <span className="eyebrow">{p.category}</span>
                  <h2 className="text-[19px] font-bold leading-snug">{p.title}</h2>
                  <p className="text-[15px] text-iron">{p.excerpt}</p>
                  <span className="mt-auto pt-2 text-sm text-iron">
                    {formatDate(p.date, locale)} · {p.readMinutes} {common("minRead")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
