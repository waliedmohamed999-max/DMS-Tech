import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { completionBlockers, getProject } from "@/server/projects/projects";
import { getTask, listTasks, projectBoard } from "@/server/projects/work";
import { projectTime } from "@/server/projects/time";
import { contractMilestoneEligibility, projectActivity, teamWorkload } from "@/server/projects/insights";
import { sweepProjectsIfDue } from "@/server/projects/sweep";
import { getContract } from "@/server/commercial/contracts";
import { todayIn, ymd } from "@/server/commercial/dates";
import { personName } from "@/lib/os/crm-page";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, fmtDate, fmtDateTime, fmtRelative, PermissionDenied, SectionCard } from "@/components/os/ui";
import { Icon } from "@/components/ui/Icon";
import TaskBoard from "@/components/projects/TaskBoard";
import {
  AddMember,
  CommentBox,
  DeleteComment,
  DeleteTime,
  DeliverableActions,
  DeliverableForm,
  DependencyActions,
  DependencyForm,
  MilestoneForm,
  MilestoneStatusControl,
  ProjectHeaderActions,
  RemoveMember,
  SubmitTimesheet,
  TaskAssign,
  TaskCreate,
  TaskStatusControl,
  TimeEntryForm
} from "@/components/projects/Widgets";
import { healthTone, projectStatusTone, taskStatusTone } from "@/components/projects/tones";

export const metadata = { title: "Project" };

const TABS = ["overview", "tasks", "milestones", "timeline", "team", "time", "deliverables", "activity", "commercial"] as const;
type Reason = { code: string; severity: string; cause: string; params: Record<string, string | number> };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? sp.tab! : "overview";
  const { ctx, allowed } = await pageCtx("projects.view");
  if (!allowed) return <PermissionDenied permission="projects.view" />;
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
        {TABS.filter((k) => k !== "time" || can(ctx, "projects.time.view")).map((k) => (
          <Link key={k} href={`?tab=${k}`} scroll={false} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === k ? "border-iris text-os-text" : "border-transparent text-os-muted hover:text-os-text"}`}>
            {t(`tabs.${k}` as "tabs.overview")}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <Overview />}
      {tab === "tasks" && <Tasks />}
      {tab === "milestones" && <Milestones />}
      {tab === "timeline" && <Timeline />}
      {tab === "team" && <Team />}
      {tab === "time" && <Time />}
      {tab === "deliverables" && <Deliverables />}
      {tab === "activity" && <Activity />}
      {tab === "commercial" && <Commercial />}
    </div>
  );

  // -------------------------------------------------------------------------
  async function Overview() {
    const [workload, activity, overdue, blocked] = await Promise.all([
      teamWorkload(ctx, id),
      projectActivity(ctx, id),
      prisma.task.findMany({ where: { projectId: id, archivedAt: null, status: { notIn: ["DONE", "CANCELLED"] }, dueDate: { lt: today } }, orderBy: { dueDate: "asc" }, take: 6, include: { assignee: { select: { name: true, nameAr: true } } } }),
      prisma.task.findMany({ where: { projectId: id, archivedAt: null, status: "BLOCKED" }, take: 6, include: { assignee: { select: { name: true, nameAr: true } } } })
    ]);
    const upcoming = p.milestones.filter((m) => m.status !== "COMPLETED" && m.status !== "CANCELLED").sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()).slice(0, 4);
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-4">
          <SectionCard title={t("healthTitle")} action={<Badge tone={healthTone(p.health)}>{t(`health.${p.health}` as "health.HEALTHY")}</Badge>}>
            {reasons.length === 0 ? (
              <p className="p-4 text-sm text-os-muted">{t("healthOk")}</p>
            ) : (
              <ul className="divide-y divide-os-line">
                {reasons.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 px-4 py-2 text-sm">
                    <span className={`size-2 shrink-0 rounded-full ${r.severity === "risk" ? "bg-danger" : "bg-warning"}`} />
                    <span className="flex-1">{reasonText(r)}</span>
                    <Badge tone={r.cause === "client" ? "info" : r.cause === "blocked" ? "danger" : "neutral"}>{t(`cause.${r.cause}` as "cause.internal")}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {p.healthCheckedAt && <p className="border-t border-os-line px-4 py-1.5 text-[11px] text-os-faint">{t("healthChecked", { at: fmtRelative(p.healthCheckedAt, locale) })}</p>}
          </SectionCard>
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title={t("upcomingMilestones")}>
              {upcoming.length === 0 ? (
                <p className="p-4 text-sm text-os-muted">—</p>
              ) : (
                <ul className="divide-y divide-os-line text-sm">
                  {upcoming.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 px-4 py-2">
                      <span className="flex-1 truncate">{m.title}</span>
                      <span className={`text-xs ${m.dueDate < today ? "text-danger" : "text-os-muted"}`}>{fmtDate(m.dueDate, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title={t("overdueTasks")}>
              {overdue.length === 0 ? (
                <p className="p-4 text-sm text-os-muted">{t("noneOverdue")}</p>
              ) : (
                <ul className="divide-y divide-os-line text-sm">
                  {overdue.map((x) => (
                    <li key={x.id} className="flex items-center gap-2 px-4 py-2">
                      <Link href={`?tab=tasks&task=${x.id}`} className="min-w-0 flex-1 truncate hover:text-iris-light">
                        {x.title}
                      </Link>
                      <span className="text-xs text-danger">{x.dueDate ? fmtDate(x.dueDate, locale) : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title={t("blockersTitle")}>
              {blocked.length === 0 ? (
                <p className="p-4 text-sm text-os-muted">{t("noBlockers")}</p>
              ) : (
                <ul className="divide-y divide-os-line text-sm">
                  {blocked.map((x) => (
                    <li key={x.id} className="grid px-4 py-2">
                      <Link href={`?tab=tasks&task=${x.id}`} className="truncate font-medium hover:text-iris-light">
                        {x.title}
                      </Link>
                      <span className="text-xs text-danger">{x.blockedReason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title={t("clientOwes")}>
              {clientDeps.length === 0 ? (
                <p className="p-4 text-sm text-os-muted">{t("noClientDeps")}</p>
              ) : (
                <ul className="divide-y divide-os-line text-sm">
                  {clientDeps.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 px-4 py-2">
                      <span className="min-w-0 flex-1 truncate">
                        {d.title} {d.critical && <Badge tone="danger">{t("critical")}</Badge>}
                      </span>
                      <span className={`text-xs ${d.dueDate && d.dueDate < today ? "text-danger" : "text-os-muted"}`}>{d.dueDate ? fmtDate(d.dueDate, locale) : t("waitingSince", { d: fmtRelative(d.requestedAt, locale) })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
          {p.scopeSummary && (
            <SectionCard title={t("scope")}>
              <p className="whitespace-pre-line p-4 text-sm text-os-muted" dir="auto">
                {p.scopeSummary}
              </p>
            </SectionCard>
          )}
        </div>
        <div className="grid content-start gap-4">
          <SectionCard title={t("workload")}>
            <ul className="divide-y divide-os-line text-sm">
              {workload.map((w) => {
                const m = p.members.find((x) => x.userId === w.userId);
                return (
                  <li key={w.userId} className="grid gap-0.5 px-4 py-2">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{name(m?.user)}</span>
                      <span className="text-[11px] text-os-faint">{t(`roles.${w.role}` as "roles.DEVELOPER")}</span>
                    </span>
                    <span className="text-xs text-os-muted">
                      {t("load", { a: w.activeTasks, o: w.overdue, h: Math.round(w.remainingEstimateMinutes / 60) })}
                      {w.allocationPercent != null && ` · ${w.allocationPercent}%`}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-os-line px-4 py-1.5 text-[11px] text-os-faint">{t("workloadNote")}</p>
          </SectionCard>
          <SectionCard title={t("recentActivity")} action={<Link href="?tab=activity" className="text-xs text-os-muted hover:text-os-text">{t("all")}</Link>}>
            <ul className="divide-y divide-os-line text-xs">
              {activity.slice(0, 8).map((a) => (
                <li key={a.id} className="px-4 py-2">
                  <span className="font-medium">{t.has(`ev.${a.type.replace(/\./g, "_")}`) ? t(`ev.${a.type.replace(/\./g, "_")}` as "ev.task_created") : a.type}</span>
                  {typeof a.detail.title === "string" && <span className="text-os-muted"> · {a.detail.title}</span>}
                  <span className="block text-os-faint">
                    {a.actor ? name(a.actor) : t("system")} · {fmtRelative(a.at, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </div>
    );
  }

  async function Tasks() {
    const view = sp.view === "list" ? "list" : "board";
    const canCreate = can(ctx, "projects.tasks.create") && (mgr || Boolean(access.member)) && !closed;
    const header = (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {(["board", "list"] as const).map((v) => (
            <Link key={v} href={`?tab=tasks&view=${v}${sp.ms ? `&ms=${sp.ms}` : ""}`} scroll={false} className={view === v ? "os-btn-primary h-8 px-3 text-xs" : "os-btn-secondary h-8 px-3 text-xs"}>
              {t(`view.${v}` as "view.board")}
            </Link>
          ))}
          <span className="mx-1 w-px bg-os-line" />
          <Link href={`?tab=tasks&view=${view}`} scroll={false} className={!sp.ms ? "os-btn-secondary h-8 px-2.5 text-xs" : "os-btn-ghost h-8 px-2.5 text-xs"}>
            {t("allMilestones")}
          </Link>
          {milestoneOpts.slice(0, 8).map((m) => (
            <Link key={m.id} href={`?tab=tasks&view=${view}&ms=${m.id}`} scroll={false} className={sp.ms === m.id ? "os-btn-secondary h-8 max-w-[180px] truncate px-2.5 text-xs" : "os-btn-ghost h-8 max-w-[180px] truncate px-2.5 text-xs"}>
              {m.label}
            </Link>
          ))}
        </div>
        {canCreate && <TaskCreate projectId={id} milestones={milestoneOpts} members={members} canAssign={mgr && can(ctx, "projects.tasks.assign")} />}
      </div>
    );
    const panel = sp.task ? await TaskPanel(sp.task) : null;
    if (view === "board") {
      const cols = await projectBoard(ctx, id, { milestoneId: sp.ms });
      return (
        <div className="grid gap-3">
          {header}
          <TaskBoard
            projectId={id}
            today={ymd(today)!}
            query={query}
            canMoveAll={mgr && can(ctx, "projects.tasks.change_status")}
            columns={cols.map((c) => ({
              status: c.status,
              total: c.total,
              items: c.items.map((x) => ({ id: x.id, number: x.number, title: x.title, status: x.status, priority: x.priority, dueDate: ymd(x.dueDate), assignee: x.assignee ? name(x.assignee) : null, milestone: x.milestone?.title ?? null, subtasks: x._count.subtasks, blockedReason: x.blockedReason, mine: x.assigneeId === ctx.userId && can(ctx, "projects.tasks.change_status") }))
            }))}
          />
          {panel}
        </div>
      );
    }
    const list = await listTasks(ctx, { project: id, milestone: sp.ms, due: sp.due, assignee: sp.mine ? "me" : undefined, page: sp.page }, today);
    return (
      <div className="grid gap-3">
        {header}
        <div className="os-card overflow-x-auto">
          {list.items.length === 0 ? (
            <EmptyState icon="CircleCheck" title={t("noTasks")} text="" />
          ) : (
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.task")}</th>
                  <th>{t("f.status")}</th>
                  <th className="hidden md:table-cell">{t("f.assignee")}</th>
                  <th className="hidden sm:table-cell">{t("f.due")}</th>
                  <th className="hidden lg:table-cell">{t("f.milestone")}</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((x) => (
                  <tr key={x.id}>
                    <td className="min-w-[220px]">
                      <Link href={`?tab=tasks&view=list&task=${x.id}`} scroll={false} className="font-medium hover:text-iris-light">
                        {x.title}
                      </Link>
                      <span className="block text-[11px] text-os-faint" dir="ltr">
                        {x.number}
                      </span>
                    </td>
                    <td>{(mgr || x.assigneeId === ctx.userId) && can(ctx, "projects.tasks.change_status") && !closed ? <TaskStatusControl id={x.id} status={x.status} compact /> : <Badge tone={taskStatusTone(x.status)}>{t(`taskStatus.${x.status}` as "taskStatus.TODO")}</Badge>}</td>
                    <td className="hidden text-xs text-os-muted md:table-cell">{x.assignee ? name(x.assignee) : "—"}</td>
                    <td className={`hidden text-xs sm:table-cell ${x.dueDate && x.dueDate < today && x.status !== "DONE" ? "text-danger" : "text-os-muted"}`}>{x.dueDate ? fmtDate(x.dueDate, locale) : "—"}</td>
                    <td className="hidden max-w-[180px] truncate text-xs text-os-muted lg:table-cell">{x.milestone?.title ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {panel}
      </div>
    );
  }

  async function TaskPanel(taskId: string) {
    let d;
    try {
      d = await getTask(ctx, taskId);
    } catch {
      return null;
    }
    const x = d.task;
    if (x.projectId !== id) return null;
    const canStatus = (mgr || x.assigneeId === ctx.userId) && can(ctx, "projects.tasks.change_status") && !closed;
    const back = `?${query}`;
    return (
      <aside className="fixed inset-y-0 end-0 z-40 flex w-full max-w-[460px] flex-col border-s border-os-line bg-os-panel shadow-sm2">
        <div className="flex h-14 items-center justify-between gap-2 border-b border-os-line px-4">
          <span className="text-xs text-os-faint" dir="ltr">
            {x.number}
          </span>
          <Link href={back} scroll={false} className="os-btn-ghost size-8 px-0" aria-label="close">
            <Icon name="X" size={16} />
          </Link>
        </div>
        <div className="grid content-start gap-4 overflow-y-auto p-4">
          <div>
            <h2 className="text-base font-semibold">{x.title}</h2>
            {x.parent && <p className="text-xs text-os-faint">↳ {x.parent.title}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canStatus ? <TaskStatusControl id={x.id} status={x.status} /> : <Badge tone={taskStatusTone(x.status)}>{t(`taskStatus.${x.status}` as "taskStatus.TODO")}</Badge>}
            {mgr && can(ctx, "projects.tasks.assign") && !closed ? <TaskAssign id={x.id} assigneeId={x.assigneeId} members={members} /> : <span className="text-xs text-os-muted">{x.assignee ? name(x.assignee) : t("unassigned")}</span>}
          </div>
          {x.blockedReason && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">⛔ {x.blockedReason}</p>}
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-os-muted">{t("f.priority")}</dt>
            <dd>{t(`priority.${x.priority}` as "priority.MEDIUM")}</dd>
            <dt className="text-os-muted">{t("f.due")}</dt>
            <dd className={x.dueDate && x.dueDate < today && x.status !== "DONE" ? "text-danger" : ""}>{x.dueDate ? fmtDate(x.dueDate, locale) : "—"}</dd>
            <dt className="text-os-muted">{t("f.milestone")}</dt>
            <dd>{x.milestone?.title ?? "—"}</dd>
            <dt className="text-os-muted">{t("f.estimate")}</dt>
            <dd>
              {x.estimateMinutes ? `${(x.estimateMinutes / 60).toFixed(1)}h` : "—"} · {t("logged")} {(d.loggedMinutes / 60).toFixed(1)}h
            </dd>
            <dt className="text-os-muted">{t("createdBy")}</dt>
            <dd>{name(x.createdBy)}</dd>
          </dl>
          {x.description && (
            <p className="whitespace-pre-line text-sm text-os-muted" dir="auto">
              {x.description}
            </p>
          )}
          {x.subtasks.length > 0 && (
            <div>
              <p className="os-label">{t("subtasks")}</p>
              <ul className="grid gap-1 text-sm">
                {x.subtasks.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <Badge tone={taskStatusTone(s.status)}>{t(`taskStatus.${s.status}` as "taskStatus.TODO")}</Badge>
                    <Link href={`?${query}&task=${s.id}`} scroll={false} className="truncate hover:text-iris-light">
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-2">
            <p className="os-label mb-0">{t("comments")}</p>
            {d.comments.map((c) => (
              <div key={c.id} className="rounded-lg border border-os-line bg-os-surface px-3 py-2 text-sm">
                <p className="flex items-center justify-between gap-2 text-[11px] text-os-faint">
                  <span>
                    {name(c.author)} · {fmtRelative(c.createdAt, locale)}
                  </span>
                  {(c.authorId === ctx.userId || mgr) && <DeleteComment id={c.id} />}
                </p>
                <p className="mt-0.5 whitespace-pre-line" dir="auto">
                  {c.body}
                </p>
              </div>
            ))}
            {(mgr || access.member) && <CommentBox taskId={x.id} />}
          </div>
          <p className="text-[11px] text-os-faint">{t("filesLater")}</p>
        </div>
      </aside>
    );
  }

  async function Milestones() {
    const contractMilestones = mgr && commercial?.contractId ? (await prisma.contractMilestone.findMany({ where: { contractId: commercial.contractId }, orderBy: { sortOrder: "asc" } })).map((m) => ({ id: m.id, label: m.title })) : null;
    const counts = await prisma.task.groupBy({ by: ["milestoneId", "status"], where: { projectId: id, archivedAt: null, milestoneId: { not: null } }, _count: { _all: true } });
    const manage = mgr && can(ctx, "projects.milestones.manage") && !closed;
    return (
      <SectionCard title={t("tabs.milestones")} action={manage ? <MilestoneForm trigger="new" projectId={id} people={members} contractMilestones={contractMilestones} /> : undefined}>
        {p.milestones.length === 0 ? (
          <EmptyState icon="Target" title={t("noMilestones")} text={t("noMilestonesText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.milestone")}</th>
                  <th>{t("f.status")}</th>
                  <th className="hidden sm:table-cell">{t("f.due")}</th>
                  <th className="hidden md:table-cell">{t("f.weight")}</th>
                  <th className="hidden md:table-cell">{t("f.tasks")}</th>
                  <th className="hidden lg:table-cell">{t("f.contractMilestone")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {p.milestones.map((m) => {
                  const mine = counts.filter((c) => c.milestoneId === m.id);
                  const total = mine.filter((c) => c.status !== "CANCELLED").reduce((s, c) => s + c._count._all, 0);
                  const done = mine.filter((c) => c.status === "DONE").reduce((s, c) => s + c._count._all, 0);
                  return (
                    <tr key={m.id}>
                      <td className="min-w-[200px]">
                        <span className="font-medium">{m.title}</span>
                        {!m.required && <span className="ms-1 text-[11px] text-os-faint">({t("optional")})</span>}
                        {m.blockedReason && <span className="block text-[11px] text-danger">{m.blockedReason}</span>}
                      </td>
                      <td>{manage ? <MilestoneStatusControl id={m.id} status={m.status} /> : <Badge>{t(`msStatus.${m.status}` as "msStatus.NOT_STARTED")}</Badge>}</td>
                      <td className={`hidden text-xs sm:table-cell ${m.dueDate < today && m.status !== "COMPLETED" && m.status !== "CANCELLED" ? "text-danger" : "text-os-muted"}`}>{fmtDate(m.dueDate, locale)}</td>
                      <td className="hidden tabular text-xs md:table-cell">{m.weight}</td>
                      <td className="hidden md:table-cell">
                        <span className="text-xs tabular text-os-muted">
                          {done}/{total}
                        </span>
                      </td>
                      <td className="hidden text-xs text-os-muted lg:table-cell">{m.contractMilestone?.title ?? "—"}</td>
                      <td className="text-end">
                        {manage && (
                          <MilestoneForm
                            trigger="edit"
                            projectId={id}
                            people={members}
                            contractMilestones={contractMilestones}
                            value={{ id: m.id, title: m.title, description: m.description ?? "", startDate: ymd(m.startDate) ?? "", dueDate: ymd(m.dueDate)!, weight: String(m.weight), required: m.required, ownerId: m.ownerId ?? "", contractMilestoneId: m.contractMilestoneId ?? "" }}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("progressRule")}</p>
      </SectionCard>
    );
  }

  async function Timeline() {
    const items = p.milestones.filter((m) => m.status !== "CANCELLED");
    const start = p.startDate ?? items.map((m) => m.startDate ?? m.dueDate).sort((a, b) => a.getTime() - b.getTime())[0] ?? today;
    const end = [p.targetEndDate, ...items.map((m) => m.dueDate), today].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0]!;
    const span = Math.max(1, end.getTime() - start.getTime());
    const pos = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - start.getTime()) / span) * 100));
    return (
      <SectionCard title={t("tabs.timeline")}>
        <div className="grid gap-2 p-4">
          <div className="flex justify-between text-[11px] text-os-faint">
            <span>{fmtDate(start, locale)}</span>
            <span>{fmtDate(end, locale)}</span>
          </div>
          <div className="relative grid gap-2">
            <div className="pointer-events-none absolute inset-y-0 w-px bg-danger/60" style={{ insetInlineStart: `${pos(today)}%` }} title={t("today")} />
            {items.length === 0 && <p className="text-sm text-os-muted">{t("noMilestones")}</p>}
            {items.map((m, i) => {
              const s = m.startDate ?? (i === 0 ? start : items[i - 1].dueDate);
              const a = pos(s);
              const b = Math.max(a + 1.5, pos(m.dueDate));
              const tone = m.status === "COMPLETED" ? "bg-success/70" : m.dueDate < today ? "bg-danger/70" : m.status === "BLOCKED" ? "bg-warning/70" : "bg-iris/70";
              return (
                <div key={m.id} className="grid gap-0.5">
                  <span className="text-xs">
                    {m.title} <span className="text-os-faint">· {fmtDate(m.dueDate, locale)}</span>
                  </span>
                  <div className="relative h-3 rounded bg-os-raised">
                    <div className={`absolute inset-y-0 rounded ${tone}`} style={{ insetInlineStart: `${a}%`, width: `${b - a}%` }} />
                  </div>
                </div>
              );
            })}
            {p.targetEndDate && (
              <p className="text-[11px] text-os-faint">
                {t("target")}: {fmtDate(p.targetEndDate, locale)}
              </p>
            )}
          </div>
        </div>
      </SectionCard>
    );
  }

  async function Team() {
    const workload = await teamWorkload(ctx, id);
    const manage = mgr && can(ctx, "projects.manage_team") && !closed;
    const candidates = people.filter((u) => !p.members.some((m) => m.userId === u.id));
    return (
      <SectionCard title={t("tabs.team")} action={manage ? <AddMember projectId={id} users={candidates} /> : undefined}>
        <div className="overflow-x-auto">
          <table className="os-table">
            <thead>
              <tr>
                <th>{t("f.person")}</th>
                <th>{t("f.projectRole")}</th>
                <th>{t("f.activeTasks")}</th>
                <th className="hidden sm:table-cell">{t("f.overdue")}</th>
                <th className="hidden md:table-cell">{t("f.remaining")}</th>
                <th className="hidden md:table-cell">{t("f.allocation")}</th>
                <th className="hidden lg:table-cell">{t("f.otherProjects")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {p.members.map((m) => {
                const w = workload.find((x) => x.userId === m.userId);
                return (
                  <tr key={m.id}>
                    <td>
                      <span className="font-medium">{name(m.user)}</span>
                      <span className="block text-[11px] text-os-faint">{m.user.jobTitle ?? ""}</span>
                    </td>
                    <td className="text-xs">{t(`roles.${m.role}` as "roles.DEVELOPER")}</td>
                    <td className="tabular">{w?.activeTasks ?? 0}</td>
                    <td className={`hidden tabular sm:table-cell ${w?.overdue ? "text-danger" : ""}`}>{w?.overdue ?? 0}</td>
                    <td className="hidden tabular text-xs md:table-cell">{Math.round((w?.remainingEstimateMinutes ?? 0) / 60)}h</td>
                    <td className="hidden tabular text-xs md:table-cell">{m.allocationPercent != null ? `${m.allocationPercent}%` : "—"}</td>
                    <td className="hidden tabular text-xs lg:table-cell">{w?.openTasksOtherProjects ?? 0}</td>
                    <td className="text-end">{manage && m.userId !== p.projectManagerId && <RemoveMember projectId={id} userId={m.userId} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("workloadNote")}</p>
      </SectionCard>
    );
  }

  async function Time() {
    const data = await projectTime(ctx, id);
    const canLog = can(ctx, "projects.time.create") && (mgr || Boolean(access.member)) && !closed;
    const tasks = canLog ? await prisma.task.findMany({ where: { projectId: id, archivedAt: null, status: { not: "CANCELLED" } }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true } }) : [];
    const myDraft = data.entries.filter((e) => e.userId === ctx.userId && (e.status === "DRAFT" || e.status === "REJECTED")).length;
    const fmtH = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
    return (
      <div className="grid gap-4">
        {canLog && (
          <SectionCard title={t("logTime")} action={can(ctx, "projects.time.submit") ? <SubmitTimesheet projectId={id} count={myDraft} /> : undefined}>
            <div className="p-4">
              <TimeEntryForm projects={[{ id, label: `${p.number} · ${p.name}` }]} tasksByProject={{ [id]: tasks.map((x) => ({ id: x.id, label: `${x.number} · ${x.title}` })) }} defaultProjectId={id} today={ymd(today)!} />
            </div>
          </SectionCard>
        )}
        <SectionCard title={data.manager ? t("teamTime") : t("myTime")}>
          {data.entries.length === 0 ? (
            <EmptyState icon="Timer" title={t("noTime")} text="" />
          ) : (
            <div className="overflow-x-auto">
              <table className="os-table">
                <thead>
                  <tr>
                    <th>{t("f.date")}</th>
                    {data.manager && <th>{t("f.person")}</th>}
                    <th>{t("f.task")}</th>
                    <th>{t("f.duration")}</th>
                    <th>{t("f.status")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap text-xs">{fmtDate(e.date, locale)}</td>
                      {data.manager && <td className="text-xs">{name(e.user)}</td>}
                      <td className="max-w-[260px] text-xs">
                        <span className="block truncate">{e.task ? `${e.task.number} · ${e.task.title}` : "—"}</span>
                        {e.description && <span className="block truncate text-os-faint">{e.description}</span>}
                        {e.rejectionReason && <span className="block text-danger">{e.rejectionReason}</span>}
                      </td>
                      <td className="tabular" dir="ltr">
                        {fmtH(e.minutes)}
                      </td>
                      <td>
                        <Badge tone={e.status === "APPROVED" ? "success" : e.status === "REJECTED" ? "danger" : e.status === "SUBMITTED" ? "warning" : "neutral"}>{t(`timeStatus.${e.status}` as "timeStatus.DRAFT")}</Badge>
                      </td>
                      <td className="text-end">{e.userId === ctx.userId && (e.status === "DRAFT" || e.status === "REJECTED") && <DeleteTime id={e.id} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
        {data.submissions.length > 0 && (
          <SectionCard title={t("submissions")}>
            <ul className="divide-y divide-os-line text-sm">
              {data.submissions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                  <span className="flex-1">
                    {name(s.user)} · {fmtDate(s.periodStart, locale)} – {fmtDate(s.periodEnd, locale)}
                  </span>
                  <span className="tabular text-xs" dir="ltr">
                    {fmtH(s.totalMinutes)}
                  </span>
                  <Badge tone={s.status === "APPROVED" ? "success" : s.status === "REJECTED" ? "danger" : s.status === "SUBMITTED" ? "warning" : "neutral"}>{t(`sheetStatus.${s.status}` as "sheetStatus.SUBMITTED")}</Badge>
                  {s.status === "SUBMITTED" && s.approvalId && data.manager && s.userId !== ctx.userId && (
                    <Link href={`/app/approvals?focus=${s.approvalId}`} className="text-xs text-iris-light hover:underline">
                      {t("review")}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>
    );
  }

  async function Deliverables() {
    const manage = mgr && can(ctx, "projects.deliverables.manage") && !closed;
    const editDeps = mgr && can(ctx, "projects.edit") && !closed;
    return (
      <div className="grid gap-4">
        <SectionCard title={t("tabs.deliverables")} action={manage ? <DeliverableForm projectId={id} milestones={milestoneOpts} members={members} /> : undefined}>
          {p.deliverables.length === 0 ? (
            <EmptyState icon="FileText" title={t("noDeliverables")} text={t("noDeliverablesText")} />
          ) : (
            <ul className="divide-y divide-os-line">
              {p.deliverables.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {d.name} {!d.required && <span className="text-[11px] text-os-faint">({t("optional")})</span>}
                    </p>
                    <p className="text-xs text-os-faint">
                      {[d.milestone?.title, d.owner ? name(d.owner) : null, d.dueDate ? fmtDate(d.dueDate, locale) : null].filter(Boolean).join(" · ")}
                      {d.clientApprovalRequired && ` · ${t("clientApprovalLabel")}: ${t(`clientApproval.${d.clientApprovalStatus}` as "clientApproval.PENDING")}`}
                    </p>
                    {d.clientDecisionNote && <p className="text-xs text-os-muted">“{d.clientDecisionNote}”</p>}
                  </div>
                  <Badge tone={d.status === "ACCEPTED" ? "success" : d.status === "REJECTED" ? "danger" : d.status === "READY" ? "warning" : d.status === "DELIVERED" ? "info" : "neutral"}>{t(`dStatus.${d.status}` as "dStatus.READY")}</Badge>
                  {(manage || (d.ownerId === ctx.userId && can(ctx, "projects.deliverables.manage"))) && <DeliverableActions id={d.id} status={d.status} clientApprovalRequired={d.clientApprovalRequired} manager={mgr} />}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title={t("dependencies")} action={editDeps ? <DependencyForm projectId={id} /> : undefined}>
          {p.dependencies.length === 0 ? (
            <EmptyState icon="Network" title={t("noDependencies")} text={t("noDependenciesText")} />
          ) : (
            <ul className="divide-y divide-os-line">
              {p.dependencies.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {d.title} {d.critical && <Badge tone="danger">{t("critical")}</Badge>}
                    </p>
                    <p className="text-xs text-os-faint">
                      {t(`side.${d.ownerSide}` as "side.CLIENT")} · {t(`depType.${d.type}` as "depType.OTHER")} · {t("requested")} {fmtRelative(d.requestedAt, locale)}
                      {d.dueDate && ` · ${t("f.due")} ${fmtDate(d.dueDate, locale)}`}
                      {d.resolvedAt && ` · ${t("resolved")} ${fmtDate(d.resolvedAt, locale)}`}
                    </p>
                  </div>
                  <Badge tone={d.status === "RESOLVED" ? "success" : d.status === "CANCELLED" ? "neutral" : d.dueDate && d.dueDate < today ? "danger" : "warning"}>{t(`depStatus.${d.status}` as "depStatus.OPEN")}</Badge>
                  {editDeps && <DependencyActions id={d.id} status={d.status} />}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    );
  }

  async function Activity() {
    const rows = await projectActivity(ctx, id);
    return (
      <SectionCard title={t("tabs.activity")}>
        {rows.length === 0 ? (
          <EmptyState icon="ChartLine" title={t("noActivity")} text="" />
        ) : (
          <ul className="divide-y divide-os-line text-sm">
            {rows.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-2 px-4 py-2">
                <span className="font-medium">{t.has(`ev.${a.type.replace(/\./g, "_")}`) ? t(`ev.${a.type.replace(/\./g, "_")}` as "ev.task_created") : a.type}</span>
                {typeof a.detail.title === "string" && <span className="text-os-muted">· {a.detail.title}</span>}
                {typeof a.detail.reason === "string" && a.detail.reason && <span className="text-xs text-os-faint">· {a.detail.reason}</span>}
                <span className="ms-auto text-xs text-os-faint">
                  {a.actor ? name(a.actor) : t("system")} · {fmtDateTime(a.at, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    );
  }

  async function Commercial() {
    if (!commercial) return <EmptyState icon="FileText" title={t("noCommercialAccess")} text={t("noCommercialAccessText")} />;
    if (!commercial.contractId && !commercial.quotationId) return <EmptyState icon="FileText" title={t("noCommercialSource")} text={t("internalText")} />;
    let contract = null;
    if (commercial.contractId) {
      try {
        contract = await getContract(ctx, commercial.contractId);
      } catch {
        contract = null;
      }
    }
    const eligibility = commercial.contractId ? await contractMilestoneEligibility(commercial.contractId) : {};
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={t("commercialSummary")}>
          <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 p-4 text-sm">
            <dt className="text-os-muted">{t("budget")}</dt>
            <dd className="tabular" dir="ltr">
              {commercial.budgetAmount ? formatMoney(commercial.budgetAmount, locale, p.currency) : "—"}
            </dd>
            <dt className="text-os-muted">{t("contract")}</dt>
            <dd>
              {contract ? (
                <Link href={`/app/sales/contracts/${contract.id}`} className="hover:text-iris-light" dir="ltr">
                  {contract.number}
                </Link>
              ) : (
                t("notVisible")
              )}
            </dd>
            {contract && (
              <>
                <dt className="text-os-muted">{t("contractValue")}</dt>
                <dd className="tabular" dir="ltr">
                  {formatMoney(contract.contractValue.toFixed(2), locale, contract.currency)}
                </dd>
                <dt className="text-os-muted">{t("quotation")}</dt>
                <dd dir="ltr">{contract.quotation ? `${contract.quotation.number} V${contract.quotationVersion?.versionNumber}` : "—"}</dd>
              </>
            )}
            {p.deliveryTerms && (
              <>
                <dt className="text-os-muted">{t("deliveryTerms")}</dt>
                <dd className="whitespace-pre-line text-os-muted" dir="auto">
                  {p.deliveryTerms}
                </dd>
              </>
            )}
          </dl>
          <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("snapshotNote")}</p>
        </SectionCard>
        {contract && (
          <SectionCard title={t("contractMilestones")}>
            <ul className="divide-y divide-os-line text-sm">
              {contract.milestones.map((m) => {
                const e = eligibility[m.id];
                return (
                  <li key={m.id} className="flex items-center gap-2 px-4 py-2">
                    <span className="min-w-0 flex-1 truncate">{m.title}</span>
                    {m.percentage && (
                      <span className="text-xs tabular text-os-muted" dir="ltr">
                        {m.percentage.toFixed(0)}%
                      </span>
                    )}
                    {e ? <Badge tone={e.eligible ? "success" : "neutral"}>{e.eligible ? t("eligible") : `${e.completed}/${e.linked}`}</Badge> : <span className="text-[11px] text-os-faint">{t("notLinked")}</span>}
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("eligibilityNote")}</p>
          </SectionCard>
        )}
      </div>
    );
  }
}

function Signal({ href, tone, label }: { href: string; tone: "danger" | "warning" | "muted" | "iris"; label: React.ReactNode }) {
  const cls = tone === "danger" ? "border-danger/30 bg-danger/10 text-danger" : tone === "warning" ? "border-warning/30 bg-warning/10 text-warning" : tone === "iris" ? "border-iris/30 bg-iris/10 text-iris-light" : "border-os-line text-os-muted";
  return (
    <Link href={href} scroll={false} className={`rounded-full border px-2.5 py-1 ${cls}`}>
      {label}
    </Link>
  );
}
