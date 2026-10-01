import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { myWork } from "@/server/projects/insights";
import { projectOptions } from "@/server/projects/projects";
import { sweepProjectsIfDue } from "@/server/projects/sweep";
import { Badge, EmptyState, fmtDate, PageHeader, PermissionDenied, SectionCard } from "@/components/os/ui";
import { TaskCreate, TaskStatusControl } from "@/components/projects/Widgets";
import { healthTone, projectStatusTone } from "@/components/projects/tones";

export const metadata = { title: "My Work" };

type Row = Awaited<ReturnType<typeof myWork>>["overdue"][number];

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { ctx, allowed } = await pageCtx("projects.tasks.view");
  if (!allowed) return <PermissionDenied permission="projects.tasks.view" />;
  await sweepProjectsIfDue(ctx.organizationId);
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("os.projects");
  const [w, projects] = await Promise.all([myWork(ctx), can(ctx, "projects.tasks.create") ? projectOptions(ctx, "projects.tasks.create") : Promise.resolve([])]);
  const canStatus = can(ctx, "projects.tasks.change_status");

  const bucket = (key: "overdue" | "dueToday" | "blocked" | "review" | "upcoming", rows: Row[], tone: "danger" | "warning" | "info" | "neutral") => (
    <SectionCard title={t(`my.${key}` as "my.overdue")} action={<Badge tone={rows.length ? tone : "neutral"}>{rows.length}</Badge>}>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-os-muted">{t("my.empty")}</p>
      ) : (
        <ul className="divide-y divide-os-line">
          {rows.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <Link href={`/app/projects/${x.project.id}?tab=tasks&task=${x.id}`} className="block truncate font-medium hover:text-iris-light">
                  {x.title}
                </Link>
                <span className="block truncate text-[11px] text-os-faint">
                  <span dir="ltr">{x.number}</span> · {x.project.number} {x.project.name}
                  {x.milestone && ` · ◆ ${x.milestone.title}`}
                </span>
                {x.blockedReason && <span className="block text-[11px] text-danger">⛔ {x.blockedReason}</span>}
              </div>
              {x.dueDate && <span className={`text-xs ${x.dueDate < w.today ? "text-danger" : "text-os-muted"}`}>{fmtDate(x.dueDate, locale)}</span>}
              {canStatus ? <TaskStatusControl id={x.id} status={x.status} compact /> : <Badge>{t(`taskStatus.${x.status}` as "taskStatus.TODO")}</Badge>}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );

  return (
    <div className="grid gap-5">
      <PageHeader icon="ClipboardList" title={t("my.title")} subtitle={t("my.subtitle")} actions={projects.length ? <TaskCreate projects={projects} milestones={[]} members={[]} canAssign={false} autoOpen={sp.new === "task"} /> : null} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid content-start gap-4">
          {bucket("overdue", w.overdue, "danger")}
          {bucket("dueToday", w.dueToday, "warning")}
          <div className="grid gap-4 lg:grid-cols-2">
            {bucket("blocked", w.blocked, "danger")}
            {bucket("review", w.review, "info")}
          </div>
          {bucket("upcoming", w.upcoming, "neutral")}
        </div>
        <SectionCard title={t("my.projects")}>
          {w.projects.length === 0 ? (
            <EmptyState icon="Layers" title={t("my.noProjects")} text="" />
          ) : (
            <ul className="divide-y divide-os-line text-sm">
              {w.projects.map((p) => (
                <li key={p.id} className="grid gap-1 px-4 py-2.5">
                  <Link href={`/app/projects/${p.id}`} className="truncate font-medium hover:text-iris-light">
                    {p.name}
                  </Link>
                  <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-os-faint">
                    <span dir="ltr">{p.number}</span>
                    <Badge tone={projectStatusTone(p.status)}>{t(`status.${p.status}` as "status.ACTIVE")}</Badge>
                    <Badge tone={healthTone(p.health)}>{t(`health.${p.health}` as "health.HEALTHY")}</Badge>
                    <span className="tabular">{p.progress}%</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
