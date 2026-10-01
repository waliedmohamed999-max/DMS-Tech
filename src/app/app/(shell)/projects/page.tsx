import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { listProjects, projectOptions } from "@/server/projects/projects";
import { projectKpis } from "@/server/projects/insights";
import { sweepProjectsIfDue } from "@/server/projects/sweep";
import { personName } from "@/lib/os/crm-page";
import { Badge, EmptyState, flatParams, fmtDate, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { healthTone, projectStatusTone } from "@/components/projects/tones";
import { MilestoneQuickCreate } from "@/components/projects/QuickCreate";

export const metadata = { title: "Projects" };

const VIEWS = ["all", "mine", "at_risk", "completed"] as const;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("projects.view");
  if (!allowed) return <PermissionDenied permission="projects.view" />;
  await sweepProjectsIfDue(ctx.organizationId);
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.projects");
  const [data, k, msProjects] = await Promise.all([listProjects(ctx, sp), projectKpis(ctx), sp.new === "milestone" ? projectOptions(ctx, "projects.milestones.manage") : Promise.resolve(null)]);
  const view = data.view;
  const sortHref = (key: string) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    p.set("sort", key);
    p.set("dir", sp.sort === key && sp.dir !== "asc" ? "asc" : "desc");
    p.delete("page");
    return `?${p}`;
  };
  const metrics: [string, number, string, string?][] = [
    ["active", k.active, "?status=open"],
    ["healthy", k.healthy, "?health=HEALTHY&status=open", "text-success"],
    ["attention", k.attention, "?health=NEEDS_ATTENTION&status=open", "text-warning"],
    ["atRisk", k.atRisk, "?view=at_risk", "text-danger"],
    ["completedMonth", k.completed, "?view=completed"],
    ["overdueMilestones", k.overdueMilestones, "?status=open", k.overdueMilestones ? "text-danger" : undefined],
    ["blockedTasks", k.blockedTasks, "?status=open", k.blockedTasks ? "text-danger" : undefined]
  ];

  return (
    <div className="grid gap-5">
      <PageHeader
        icon="Layers"
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <div className="flex flex-wrap gap-1.5">
            {can(ctx, "projects.templates.manage") && (
              <Link href="/app/projects/templates" className="os-btn-ghost">
                {t("templates")}
              </Link>
            )}
            {can(ctx, "projects.create") && (
              <Link href="/app/projects/new" className="os-btn-primary">
                + {t("newProject")}
              </Link>
            )}
          </div>
        }
      />
      {msProjects && <MilestoneQuickCreate projects={msProjects} />}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-os-line bg-os-line sm:grid-cols-4 xl:grid-cols-7">
        {metrics.map(([key, value, href, cls]) => (
          <Link key={key} href={href} className="bg-os-surface px-4 py-3 transition hover:bg-os-panel">
            <p className="text-[11.5px] text-os-muted">{t(`m.${key}` as "m.active")}</p>
            <p className={`mt-0.5 text-xl font-semibold tabular ${cls ?? ""}`}>{value}</p>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 border-b border-os-line">
        {VIEWS.map((v) => (
          <Link key={v} href={`?view=${v}`} className={`-mb-px border-b-2 px-3 py-2 text-sm ${view === v ? "border-iris text-os-text" : "border-transparent text-os-muted hover:text-os-text"}`}>
            {t(`views.${v}` as "views.all")}
          </Link>
        ))}
      </div>
      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ placeholder: t("searchPh") }}
          selects={[
            { name: "status", allLabel: `${t("f.status")}: ${t("all")}`, options: [{ value: "open", label: t("openOnly") }, ...["PLANNING", "ACTIVE", "WAITING_CLIENT", "BLOCKED", "AT_RISK", "ON_HOLD", "COMPLETED", "CANCELLED", "ARCHIVED"].map((s) => ({ value: s, label: t(`status.${s}` as "status.ACTIVE") }))] },
            { name: "health", allLabel: `${t("f.health")}: ${t("all")}`, options: ["HEALTHY", "NEEDS_ATTENTION", "AT_RISK"].map((h) => ({ value: h, label: t(`health.${h}` as "health.HEALTHY") })) }
          ]}
        />
        {data.items.length === 0 ? (
          <EmptyState icon="Layers" title={t("emptyTitle")} text={t("emptyText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>
                    <Link href={sortHref("number")}>{t("f.project")}</Link>
                  </th>
                  <th className="hidden md:table-cell">{t("f.client")}</th>
                  <th className="hidden xl:table-cell">{t("f.service")}</th>
                  <th className="hidden lg:table-cell">{t("f.pm")}</th>
                  <th>{t("f.status")}</th>
                  <th>{t("f.health")}</th>
                  <th>
                    <Link href={sortHref("progress")}>{t("progress")}</Link>
                  </th>
                  <th className="hidden sm:table-cell">
                    <Link href={sortHref("targetEndDate")}>{t("target")}</Link>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td className="min-w-[220px]">
                      <Link href={`/app/projects/${p.id}`} className="font-medium hover:text-iris-light">
                        {p.name}
                      </Link>
                      <span className="block text-[11px] text-os-faint" dir="ltr">
                        {p.number}
                      </span>
                    </td>
                    <td className="hidden max-w-[180px] truncate text-xs md:table-cell">{p.client?.displayName ?? <Badge>{t("internal")}</Badge>}</td>
                    <td className="hidden max-w-[160px] truncate text-xs text-os-muted xl:table-cell">{p.service ? (locale === "ar" ? p.service.nameAr : p.service.nameEn) : "—"}</td>
                    <td className="hidden text-xs text-os-muted lg:table-cell">{personName(p.projectManager, locale) ?? "—"}</td>
                    <td>
                      <Badge tone={projectStatusTone(p.status)} dot>
                        {t(`status.${p.status}` as "status.ACTIVE")}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={healthTone(p.health)}>{t(`health.${p.health}` as "health.HEALTHY")}</Badge>
                    </td>
                    <td className="min-w-[110px]">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-os-raised">
                          <span className="block h-full rounded-full bg-iris" style={{ width: `${p.progress}%` }} />
                        </span>
                        <span className="text-xs tabular">{p.progress}%</span>
                      </span>
                    </td>
                    <td className="hidden text-xs text-os-muted sm:table-cell">{p.targetEndDate ? fmtDate(p.targetEndDate, locale) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/projects" params={sp} />
      </div>
    </div>
  );
}
