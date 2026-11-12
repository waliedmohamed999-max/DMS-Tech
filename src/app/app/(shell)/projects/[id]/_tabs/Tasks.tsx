import Link from "next/link";
import { can } from "@/server/context";
import { listTasks, projectBoard } from "@/server/projects/work";
import { ymd } from "@/server/commercial/dates";
import { Badge, EmptyState, fmtDate } from "@/components/os/ui";
import TaskBoard from "@/components/projects/TaskBoard";
import { TaskCreate, TaskStatusControl } from "@/components/projects/Widgets";
import { taskStatusTone } from "@/components/projects/tones";
import { TaskPanel } from "./TaskPanel";
import type { ProjectTabCtx } from "./context";

export async function Tasks({ c }: { c: ProjectTabCtx }) {
  const { ctx, id, sp, access, today, locale, t, name, members, milestoneOpts, mgr, closed, query } = c;
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
  const panel = sp.task ? await TaskPanel(c, sp.task) : null;
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
