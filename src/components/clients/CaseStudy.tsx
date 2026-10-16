import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Highlight } from "@/components/ui/Section";

type CaseView = {
  slug: string;
  approved: boolean;
  name: string;
  category: string | null;
  cover: string;
  coverFit: "cover" | "contain";
  summary: string;
  challenge: string;
  role: string[];
  journey: { icon: IconName; stage: string; text: string }[];
  outcome: string[];
  packageHref: string;
};
type Copy = { title: string; sub: string; read: string; challenge: string; role: string; journey: string; outcome: string; cta: string; draft: string };

/** Draft case studies are marked so nobody mistakes them for approved ones (they never render in production). */
function DraftMark({ text }: { text: string }) {
  return <span className="w-fit rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">{text}</span>;
}

/** Case study cards for /clients: cover, name, the journey in one line, link to the full study. */
export function CaseCards({ cases, copy, rtl }: { cases: CaseView[]; copy: Copy; rtl: boolean }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {cases.map((c) => (
        <Link key={c.slug} href={`/clients/${c.slug}#case`} className="card group grid content-start overflow-hidden transition hover:-translate-y-1 hover:shadow-lg">
          <span className="relative block aspect-[16/9] overflow-hidden border-b border-mist bg-white">
            <Image src={c.cover} alt={c.name} fill sizes="(min-width:1024px) 400px, 92vw" className={`transition duration-500 group-hover:scale-105 ${c.coverFit === "contain" ? "object-contain p-8" : "object-cover"}`} />
          </span>
          <span className="grid gap-3 p-6">
            {!c.approved && <DraftMark text={copy.draft} />}
            <span className="flex flex-wrap items-center gap-2">
              <b className="text-lg">{c.name}</b>
              {c.category && <span className="rounded-full bg-lilac px-2.5 py-0.5 text-xs font-semibold text-iris">{c.category}</span>}
            </span>
            <span className="text-[14.5px] leading-relaxed text-iron">{c.summary}</span>
            <span className="flex flex-wrap gap-1.5">
              {c.journey.map((j) => (
                <span key={j.stage} className="inline-flex items-center gap-1 rounded-full border border-mist px-2.5 py-0.5 text-xs text-iron">
                  <Icon name={j.icon} size={12} className="text-iris" /> {j.stage}
                </span>
              ))}
            </span>
            <span className="link-arrow mt-1 text-sm">
              {copy.read} <Icon name={rtl ? "ArrowLeft" : "ArrowRight"} size={14} />
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

/** The full case study on a project page: challenge, DMS Tech's role, the journey, the outcome and the matching package. */
export function CaseStudyDetail({ c, copy, rtl }: { c: CaseView; copy: Copy; rtl: boolean }) {
  return (
    <section id="case" className="section scroll-mt-24 bg-cloud">
      <div className="container-site grid gap-8">
        {!c.approved && <DraftMark text={copy.draft} />}
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="card grid content-start gap-3 p-7">
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Icon name="Target" size={20} className="text-iris" /> {copy.challenge}
            </h2>
            <p className="leading-relaxed text-iron">{c.challenge}</p>
          </div>
          <div className="card grid content-start gap-3 p-7">
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Icon name="Users" size={20} className="text-iris" /> {copy.role}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {c.role.map((r) => (
                <li key={r} className="flex items-start gap-2 text-[15px]">
                  <Icon name="CircleCheck" size={17} className="mt-0.5 shrink-0 text-iris" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid gap-5">
          <h2 className="text-center text-2xl font-bold md:text-3xl">
            <Highlight text={copy.journey} />
          </h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {c.journey.map((j, i) => (
              <li key={j.stage} className="card relative grid content-start gap-3 p-6 pt-7">
                <span className="absolute -top-3 start-6 grid size-8 place-items-center rounded-full bg-iris text-sm font-bold text-white shadow">{i + 1}</span>
                <span className="flex items-center gap-2 text-lg font-bold">
                  <Icon name={j.icon} size={18} className="text-iris" /> {j.stage}
                </span>
                <p className="text-[14.5px] leading-relaxed text-iron">{j.text}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="on-dark relative grid gap-5 overflow-hidden rounded-card p-7 md:grid-cols-[1.4fr_1fr] md:items-center md:p-9">
          <div className="grid gap-3">
            <h2 className="text-xl font-bold">{copy.outcome}</h2>
            <ul className="grid gap-2">
              {c.outcome.map((o) => (
                <li key={o} className="flex items-start gap-2 text-white/85">
                  <Icon name="Check" size={16} className="mt-1 shrink-0 text-iris-light" />
                  {o}
                </li>
              ))}
            </ul>
          </div>
          <Link href={c.packageHref} className="btn btn-primary w-fit md:justify-self-end">
            {copy.cta} <Icon name={rtl ? "ArrowLeft" : "ArrowRight"} size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
