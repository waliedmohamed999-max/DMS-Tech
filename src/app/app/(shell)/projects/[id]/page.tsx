import Link from "next/link";
import { TicketsCard } from "@/components/ops/SupportTabs";
import { DocumentsPanel } from "@/components/ops/DocumentsPanel";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { completionBlockers, getProject } from "@/server/projects/projects";
import { sweepProjectsIfDue } from "@/server/projects/sweep";
import { todayIn, ymd } from "@/server/commercial/dates";
import { personName } from "@/lib/os/crm-page";
import { Badge, fmtDate, PermissionDenied } from "@/components/os/ui";
import { ProjectHeaderActions } from "@/components/projects/Widgets";
import { healthTone, projectStatusTone } from "@/components/projects/tones";
import { ProjectFinanceTab } from "@/components/finance/ProjectFinanceTab";
import type { ProjectTabCtx, Reason } from "./_tabs/context";
import { Overview } from "./_tabs/Overview";
import { Tasks } from "./_tabs/Tasks";
import { Milestones } from "./_tabs/Milestones";
import { Timeline } from "./_tabs/Timeline";
import { Team } from "./_tabs/Team";
import { Time } from "./_tabs/Time";
import { Deliverables } from "./_tabs/Deliverables";
import { Activity } from "./_tabs/Activity";
import { Commercial } from "./_tabs/Commercial";

export const metadata = { title: "Project" };

const TABS = ["overview", "tasks", "milestones", "timeline", "team", "time", "deliverables", "activity", "commercial", "finance", "support", "documents"] as const;

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? sp.tab! : "overview";
  const { ctx, allowed } = await pageCtx("projects.view");
  if (!allowed) return <PermissionDenied permission="projects.view" />;
  // finance visibility is separate from delivery: members never get billing / cost / margin from membership
  const canFinance = can(ctx, "finance.invoices.view") || can(ctx, "finance.profitability.view") || (can(ctx, "finance.expenses.view") && can(ctx, "finance.records.all"));
  await sweepProjectsIfDue(ctx.organizationId);
  const locale = await getLocale();
  const t = await getTranslations("os.projects");
  let data;
  try {
    data = await getProject(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { project: p, access, commercial } = data;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });
  const today = todayIn(org.timezone);
  const name = (u: { name: string; nameAr: string | null } | null | undefined) => personName(u, locale) ?? "—";
  const reasons = (p.healthReasons as Reason[] | null) ?? [];
  const members = p.members.map((m) => ({ id: m.userId, label: name(m.user) }));
  const milestoneOpts = p.milestones.filter((m) => m.status !== "CANCELLED").map((m) => ({ id: m.id, label: m.title }));
  const mgr = access.manager;
  const closed = ["COMPLETED", "CANCELLED", "ARCHIVED"].includes(p.status);

  // header signals
  const [overdueTasks, blockedTasks, myOpen] = await Promise.all([
    prisma.task.count({ where: { projectId: id, archivedAt: null, status: { notIn: ["DONE", "CANCELLED"] }, dueDate: { lt: today } } }),
    prisma.task.count({ where: { projectId: id, archivedAt: null, status: "BLOCKED" } }),
    prisma.task.count({ where: { projectId: id, archivedAt: null, assigneeId: ctx.userId, status: { notIn: ["DONE", "CANCELLED"] } } })
  ]);
  const clientDeps = p.dependencies.filter((d) => d.ownerSide === "CLIENT" && (d.status === "OPEN" || d.status === "WAITING"));
  const nextMilestone = p.milestones.filter((m) => m.status !== "COMPLETED" && m.status !== "CANCELLED").sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
  const blockers = mgr && can(ctx, "projects.complete") ? await completionBlockers(prisma, id) : [];
  const people = mgr && can(ctx, "projects.manage_team") ? (await prisma.user.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true } })).map((u) => ({ id: u.id, label: name(u) })) : members;
  const reasonText = (r: Reason) => t(`reasons.${r.code}` as "reasons.MILESTONE_OVERDUE", r.params);
  const query = new URLSearchParams(Object.entries({ tab: "tasks", view: sp.view, ms: sp.ms }).filter(([, v]) => v) as [string, string][]).toString();
  const c: ProjectTabCtx = { ctx, id, sp, p, access, commercial, today, locale, t, name, reasons, reasonText, members, milestoneOpts, mgr, closed, clientDeps, people, query };

  return (
    <div className="grid gap-4">
      {/* header */}
      <div className="flex flex-wrap items-start gap-3">
        <Link href="/app/projects" className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-os-faint">
            <span dir="ltr">{p.number}</span>
            {p.client ? (
              <Link href={`/app/crm/clients/${p.client.id}`} className="hover:text-iris-light">
                {p.client.displayName}
              </Link>
            ) : (
              <Badge>{t("internal")}</Badge>
            )}
            {p.service && <span>· {locale === "ar" ? p.service.nameAr : p.service.nameEn}</span>}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold">{p.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-os-muted">
            <Badge tone={projectStatusTone(p.status)} dot>
              {t(`status.${p.status}` as "status.ACTIVE")}
            </Badge>
            <Badge tone={healthTone(p.health)}>{t(`health.${p.health}` as "health.HEALTHY")}</Badge>
            <span>
              {t("pm")}: {name(p.projectManager)}
            </span>
            {p.targetEndDate && (
              <span>
                · {t("target")}: {fmtDate(p.targetEndDate, locale)}
              </span>
            )}
          </div>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:min-w-[220px]">
          <div className="flex items-center justify-between gap-3 text-xs text-os-muted">
            <span>{t("progress")}</span>
            <span className="font-semibold text-os-text tabular">{p.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-os-raised">
            <div className="h-full rounded-full bg-iris" style={{ width: `${p.progress}%` }} />
          </div>
          <ProjectHeaderActions
            id={p.id}
            status={p.status}
            blockers={blockers}
            people={people}
            project={{ name: p.name, description: p.description ?? "", startDate: ymd(p.startDate) ?? "", targetEndDate: ymd(p.targetEndDate) ?? "", priority: p.priority, projectManagerId: p.projectManagerId ?? "" }}
            can={{ status: mgr && can(ctx, "projects.change_status"), complete: mgr && can(ctx, "projects.complete"), edit: mgr && can(ctx, "projects.edit"), archive: mgr && can(ctx, "projects.archive"), team: mgr && can(ctx, "projects.manage_team") }}
          />
        </div>
      </div>

      {/* operational signals */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Signal href="?tab=tasks&view=list&due=overdue" tone={overdueTasks ? "danger" : "muted"} label={t("sig.overdue", { n: overdueTasks })} />
        <Signal href="?tab=tasks&view=board" tone={blockedTasks ? "danger" : "muted"} label={t("sig.blocked", { n: blockedTasks })} />
        <Signal href="?tab=deliverables" tone={clientDeps.length ? "warning" : "muted"} label={t("sig.clientDeps", { n: clientDeps.length })} />
        {nextMilestone && !closed && <Signal href="?tab=milestones" tone={nextMilestone.dueDate < today ? "danger" : "muted"} label={t.rich("sig.next", { title: nextMilestone.title, date: fmtDate(nextMilestone.dueDate, locale), b: (c) => <bdi>{c}</bdi> })} />}
        {myOpen > 0 && <Signal href="?tab=tasks&view=list&mine=1" tone="iris" label={t("sig.mine", { n: myOpen })} />}
      </div>

      <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b border-os-line">
        {TABS.filter((k) => (k !== "time" || can(ctx, "projects.time.view")) && (k !== "finance" || canFinance) && (k !== "support" || can(ctx, "support.tickets.view") || can(ctx, "support.tickets.manage"))).map((k) => (
          <Link key={k} href={`?tab=${k}`} scroll={false} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === k ? "border-iris text-os-text" : "border-transparent text-os-muted hover:text-os-text"}`}>
            {t(`tabs.${k}` as "tabs.overview")}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <Overview c={c} />}
      {tab === "tasks" && <Tasks c={c} />}
      {tab === "milestones" && <Milestones c={c} />}
      {tab === "timeline" && <Timeline c={c} />}
      {tab === "team" && <Team c={c} />}
      {tab === "time" && <Time c={c} />}
      {tab === "deliverables" && <Deliverables c={c} />}
      {tab === "activity" && <Activity c={c} />}
      {tab === "commercial" && <Commercial c={c} />}
      {tab === "finance" && canFinance && <ProjectFinanceTab ctx={ctx} projectId={id} />}
      {tab === "support" && <TicketsCard ctx={ctx} project={id} />}
      {tab === "documents" && <DocumentsPanel ctx={ctx} entity={{ type: "PROJECT", id }} />}
    </div>
  );

}

function Signal({ href, tone, label }: { href: string; tone: "danger" | "warning" | "muted" | "iris"; label: React.ReactNode }) {
  const cls = tone === "danger" ? "border-danger/30 bg-danger/10 text-danger" : tone === "warning" ? "border-warning/30 bg-warning/10 text-warning" : tone === "iris" ? "border-iris/30 bg-iris/10 text-iris-light" : "border-os-line text-os-muted";
  return (
    <Link href={href} scroll={false} className={`rounded-full border px-2.5 py-1 ${cls}`}>
      {label}
    </Link>
  );
}
