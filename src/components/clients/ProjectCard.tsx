import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/Icon";

export type ProjectCardData = {
  slug: string;
  name: string;
  category: string | null;
  description: string | null;
  link: string | null;
  cover: string;
  coverFit: "cover" | "contain";
};

/** Hostname shown under a project ("shalfa.co"), never the full URL. */
export const hostOf = (url: string | null) => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** Client project card (Clients page + "more projects"): cover, category, name, short description, link to details. */
export function ProjectCard({ project, details, rtl }: { project: ProjectCardData; details: string; rtl: boolean }) {
  const host = hostOf(project.link);
  return (
    <article className="card card-hover group relative flex flex-col overflow-hidden">
      <div className={`relative aspect-[7/3] overflow-hidden border-b border-mist ${project.coverFit === "contain" ? "bg-cloud" : "bg-white"}`}>
        <Image
          src={project.cover}
          alt={project.name}
          fill
          sizes="(min-width:1024px) 400px, (min-width:768px) 50vw, 92vw"
          className={project.coverFit === "contain" ? "object-contain p-6 transition duration-500 group-hover:scale-105" : "object-cover transition duration-500 group-hover:scale-105"}
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-7">
        {project.category && (
          <span className="w-fit rounded-full bg-lilac px-3 py-1 text-xs font-semibold text-iris">{project.category}</span>
        )}
        <h3 className="text-xl font-bold">
          {/* the whole card is clickable; the link text stays the project name for screen readers */}
          <Link href={`/clients/${project.slug}`} className="after:absolute after:inset-0">
            {project.name}
          </Link>
        </h3>
        {project.description && <p className="line-clamp-3 text-[15px] leading-relaxed text-iron">{project.description}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-mist pt-4 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
            {details} <Icon name={rtl ? "ArrowLeft" : "ArrowRight"} size={15} />
          </span>
          {host && (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-graphite" dir="ltr">
              <Icon name="Globe" size={14} className="shrink-0" />
              <span className="truncate">{host}</span>
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
