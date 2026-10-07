import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { site } from "@/content/site";
import { getCareersCopy, getJob, getJobSlugs, getJobs } from "@/lib/content";
import { Icon, type IconName } from "@/components/ui/Icon";
import TechBackdrop from "@/components/ui/TechBackdrop";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  const slugs = await getJobSlugs();
  return routing.locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const j = await getJob(slug, locale as Locale);
  if (!j) return {};
  return { title: `${j.title} — ${j.team}`, description: j.about };
}

/** A titled section of the job page with a bullet list. */
function JobList({ title, icon, items, muted = false }: { title: string; icon: IconName; items: string[]; muted?: boolean }) {
  return (
    <section className="grid gap-4">
      <SectionTitle icon={icon}>{title}</SectionTitle>
      <ul className="grid gap-3">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-3 text-[15.5px] leading-relaxed text-ink">
            <Icon name={muted ? "Sparkles" : "CircleCheck"} size={18} className={`mt-1 shrink-0 ${muted ? "text-graphite" : "text-iris"}`} />
            {it}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionTitle({ icon, children }: { icon: IconName; children: string }) {
  return (
    <h2 className="flex items-center gap-2.5 text-2xl font-bold">
      <span className="grid size-9 place-items-center rounded-xl bg-lilac text-iris">
        <Icon name={icon} size={17} />
      </span>
      {children}
    </h2>
  );
}

/** One opening: about the role, responsibilities, requirements, nice-to-have, skills, and an apply card by e-mail. */
export default async function JobPage({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const job = await getJob(slug, locale);
  if (!job) notFound();

  const [t, nav, c, all] = await Promise.all([getTranslations("pages"), getTranslations("nav"), getCareersCopy(locale), getJobs(locale)]);
  // same department first, then the rest — six at most
  const others = all
    .filter((j) => j.slug !== slug)
    .sort((a, b) => Number(b.service === job.service) - Number(a.service === job.service))
    .slice(0, 6);
  const arrow = locale === "ar" ? "ArrowLeft" : "ArrowRight";
  const apply = `mailto:${site.email}?subject=${encodeURIComponent(`${c.mailSubject} — ${job.title}`)}&body=${encodeURIComponent(c.mailBody.replace("{job}", job.title))}`;

  const facts: [IconName, string, string][] = [
    ["Layers", job.team, ""],
    ["Clock", job.type, ""],
    ["MapPin", job.location, ""],
    ["Award", job.experience, c.experience]
  ];

  return (
    <>
      <section className="on-dark relative overflow-hidden">
        <TechBackdrop />
        <div className="container-site relative grid gap-6 py-14 md:py-20">
          <nav className="flex items-center gap-2 text-sm text-[#8d8e8f]" aria-label="Breadcrumb">
            <Link href="/careers" className="hover:text-iris-light">
              {nav("careers")}
            </Link>
            <Icon name={locale === "ar" ? "ChevronLeft" : "ChevronRight"} size={14} />
            <span className="text-white">{job.title}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-5">
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-iris to-iris-soft text-white shadow-[0_0_0_6px_rgba(98,77,227,.18)]">
              <Icon name={job.icon} size={28} />
            </span>
            <div className="grid gap-2">
              <h1 className="h-display">{job.title}</h1>
              <p className="lead">{job.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {facts.map(([icon, v]) => (
              <span key={v} className="pill">
                <Icon name={icon} size={14} className="text-iris-light" /> {v}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a href={apply} className="btn btn-primary">
              {t("careersApply")} <Icon name={arrow} size={17} />
            </a>
            <Link href="/careers" className="btn btn-outline">
              {c.back}
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container-site grid items-start gap-12 lg:grid-cols-[1fr_340px]">
          <div className="grid gap-12">
            <section className="grid gap-4">
              <SectionTitle icon="FileText">{c.about}</SectionTitle>
              <p className="text-[16.5px] leading-loose text-iron">{job.about}</p>
            </section>
            <JobList title={c.responsibilities} icon="ClipboardList" items={job.responsibilities} />
            <JobList title={c.requirements} icon="BadgeCheck" items={job.requirements} />
            <JobList title={c.niceToHave} icon="Star" items={job.niceToHave} muted />
            <section className="grid gap-4">
              <SectionTitle icon="Cog">{c.skills}</SectionTitle>
              <div className="flex flex-wrap gap-2 rtl:justify-end" dir="ltr">
                {job.skills.map((s) => (
                  <span key={s} className="rounded-lg border border-mist bg-cloud px-3 py-1.5 text-sm font-semibold text-ink">
                    {s}
                  </span>
                ))}
              </div>
            </section>
          </div>

          {/* apply card */}
          <aside className="grid gap-5 rounded-card border border-mist bg-white p-6 shadow-card lg:sticky lg:top-28">
            <h2 className="text-lg font-bold">{c.summary}</h2>
            <ul className="grid gap-3">
              {facts.map(([icon, v, label]) => (
                <li key={v} className="flex items-center gap-3 text-[15px] text-ink">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-cloud text-iris">
                    <Icon name={icon} size={15} />
                  </span>
                  {label ? `${label}: ${v}` : v}
                </li>
              ))}
            </ul>
            <div className="grid gap-2 border-t border-mist pt-5">
              <h3 className="font-bold">{c.applyTitle}</h3>
              <p className="text-sm leading-relaxed text-iron">{c.applyText}</p>
              <a href={`mailto:${site.email}`} className="text-sm font-semibold text-iris" dir="ltr">
                {site.email}
              </a>
            </div>
            <a href={apply} className="btn btn-primary w-full justify-center">
              <Icon name="Send" size={17} /> {t("careersApply")}
            </a>
          </aside>
        </div>
      </section>

      {others.length > 0 && (
        <section className="section bg-cloud">
          <div className="container-site grid gap-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="h-display">{c.other}</h2>
              <Link href="/careers" className="link-arrow">
                {c.back} <Icon name={arrow} size={15} />
              </Link>
            </div>
            <ul className="grid gap-4 md:grid-cols-3">
              {others.map((j) => (
                <li key={j.slug}>
                  <Link href={`/careers/${j.slug}`} className="card group flex h-full items-center gap-4 p-5 transition hover:-translate-y-1 hover:shadow-lg">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-lilac text-iris transition group-hover:bg-iris group-hover:text-white">
                      <Icon name={j.icon} size={20} />
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="font-bold text-ink">{j.title}</span>
                      <span className="text-sm text-iron">
                        {j.type} · {j.location}
                      </span>
                    </span>
                    <Icon name={arrow} size={16} className="shrink-0 text-iris" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
