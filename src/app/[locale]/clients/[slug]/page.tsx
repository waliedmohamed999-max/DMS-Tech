import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getCompany, getProject, getProjectSlugs, getProjects, getProjectsCopy } from "@/lib/content";
import { SectionHeading } from "@/components/ui/Section";
import TechBackdrop from "@/components/ui/TechBackdrop";
import { Icon } from "@/components/ui/Icon";
import { FinalCta } from "@/components/home/Sections";
import { ProjectCard, hostOf } from "@/components/clients/ProjectCard";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  const slugs = await getProjectSlugs();
  return routing.locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = await getProject(slug, locale as Locale);
  if (!p) return {};
  return { title: p.name, description: p.description?.split("\n")[0] ?? undefined, openGraph: { images: [{ url: p.cover }] } };
}

export default async function ClientProjectPage({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const project = await getProject(slug, locale);
  if (!project) notFound();

  const [nav, home, pc, all, company] = await Promise.all([getTranslations("nav"), getTranslations("home"), getProjectsCopy(locale), getProjects(locale), getCompany(locale)]);
  const rtl = locale === "ar";
  const host = hostOf(project.link);
  const cover = project.gallery.find((g) => g.src === project.cover) ?? project.gallery[0];
  const paragraphs = project.description?.split(/\n{2,}/).filter(Boolean) ?? [];
  const i = all.findIndex((p) => p.slug === slug);
  const more = [1, 2, 3].map((k) => all[(i + k) % all.length]).filter((p) => p.slug !== slug);

  return (
    <>
      <section className="on-dark relative overflow-hidden">
        <TechBackdrop />
        <div className="container-site relative grid items-center gap-12 py-16 md:py-24 lg:grid-cols-2">
          <div className="grid gap-5">
            <nav className="flex items-center gap-2 text-sm text-[#8d8e8f]" aria-label="Breadcrumb">
              <Link href="/clients#projects" className="hover:text-iris-light">
                {nav("clients")}
              </Link>
              <Icon name={rtl ? "ChevronLeft" : "ChevronRight"} size={14} />
              <span className="text-white">{project.name}</span>
            </nav>
            {project.category && <span className="eyebrow">{project.category}</span>}
            <h1 className="h-display">{project.name}</h1>
            {paragraphs[0] && <p className="lead">{paragraphs[0]}</p>}
            <div className="flex flex-wrap items-center gap-4">
              {project.link && (
                <a href={project.link} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                  {pc.visit} <Icon name="ExternalLink" size={16} />
                </a>
              )}
              <Link href="/quote" className="btn-ghost">
                {pc.cta} <Icon name={rtl ? "ArrowLeft" : "ArrowRight"} size={18} />
              </Link>
            </div>
            {host && (
              <p className="inline-flex items-center gap-2 text-sm text-[#8d8e8f]" dir="ltr">
                <Icon name="Globe" size={14} /> {host}
              </p>
            )}
          </div>
          <div className="overflow-hidden rounded-card border border-white/10 bg-white shadow-sm2">
            <Image
              src={cover.src}
              alt={project.name}
              width={cover.width}
              height={cover.height}
              priority
              sizes="(min-width:1024px) 600px, 92vw"
              className={`h-auto w-full ${project.coverFit === "contain" ? "mx-auto max-h-[420px] object-contain p-10" : ""}`}
            />
          </div>
        </div>
      </section>

      {(paragraphs.length > 1 || project.gallery.length > 1) && (
        <section className="section">
          <div className="container-site grid gap-10">
            {paragraphs.length > 1 && (
              <div className="mx-auto grid max-w-3xl gap-4 text-lg leading-relaxed text-iron">
                {paragraphs.slice(1).map((para) => (
                  <p key={para.slice(0, 32)}>{para}</p>
                ))}
              </div>
            )}
            {project.gallery.length > 1 && (
              <div>
                <SectionHeading title={pc.gallery} />
                <div className="columns-1 gap-6 sm:columns-2 [&>*]:mb-6">
                  {project.gallery.map((g) => (
                    <div key={g.src} className="card break-inside-avoid overflow-hidden">
                      <Image src={g.src} alt={project.name} width={g.width} height={g.height} sizes="(min-width:640px) 50vw, 92vw" className="h-auto w-full" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="section bg-cloud">
        <div className="container-site">
          <SectionHeading title={pc.more}>
            <Link href="/clients#projects" className="btn btn-outline">
              {pc.all}
            </Link>
          </SectionHeading>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {more.map((p) => (
              <ProjectCard key={p.slug} project={p} details={pc.details} rtl={rtl} />
            ))}
          </div>
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
