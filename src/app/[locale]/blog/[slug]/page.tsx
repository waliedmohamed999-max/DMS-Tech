import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getPost, getPostSlugs, getPosts } from "@/lib/content";
import { Icon } from "@/components/ui/Icon";
import { formatDate } from "@/lib/format";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  const slugs = await getPostSlugs();
  return routing.locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = await getPost(slug, locale as Locale);
  if (!p) return {};
  return { title: p.title, description: p.excerpt, openGraph: { type: "article", images: [{ url: p.image }] } };
}

export default async function PostPage({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const post = await getPost(slug, locale);
  if (!post) notFound();
  const [common, nav, all] = await Promise.all([getTranslations("common"), getTranslations("nav"), getPosts(locale)]);
  const more = all.filter((p) => p.slug !== slug).slice(0, 2);

  return (
    <article>
      <header className="bg-cloud">
        <div className="container-site grid max-w-4xl gap-5 py-16 text-center md:py-20">
          <Link href="/blog" className="link-arrow justify-center">
            <Icon name={locale === "ar" ? "ArrowRight" : "ArrowLeft"} size={18} /> {common("backToBlog")}
          </Link>
          <span className="eyebrow justify-center">{post.category}</span>
          <h1 className="h-display">{post.title}</h1>
          <p className="text-sm text-iron">
            {formatDate(post.date, locale)} · {post.readMinutes} {common("minRead")}
          </p>
        </div>
      </header>
      <div className="container-site max-w-4xl">
        <div className="relative -mt-2 aspect-[16/8] overflow-hidden rounded-card shadow-lg">
          <Image src={post.image} alt={post.title} fill priority sizes="900px" className="object-cover" />
        </div>
        <div className="mx-auto grid max-w-2xl gap-6 py-14 text-lg leading-[1.9] text-iron">
          <p className="text-xl font-semibold text-ink">{post.excerpt}</p>
          {post.body.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-card bg-lilac p-7">
            <p className="font-semibold text-ink">{nav("featuredText")}</p>
            <Link href="/quote" className="btn btn-primary">
              {nav("quote")}
            </Link>
          </div>
        </div>
        {more.length > 0 && (
          <div className="grid gap-6 border-t border-mist py-14 md:grid-cols-2">
            {more.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="card card-hover flex gap-4 border border-mist p-4">
                <div className="relative size-24 shrink-0 overflow-hidden rounded-xl">
                  <Image src={p.image} alt="" fill sizes="96px" className="object-cover" />
                </div>
                <div className="grid content-center gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.125em] text-iron">{p.category}</span>
                  <span className="font-bold leading-snug">{p.title}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
