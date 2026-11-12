import Link from "next/link";
import { can } from "@/server/context";
import { getTask } from "@/server/projects/work";
import { Badge, fmtDate, fmtRelative } from "@/components/os/ui";
import { Icon } from "@/components/ui/Icon";
import { CommentBox, DeleteComment, TaskAssign, TaskStatusControl } from "@/components/projects/Widgets";
import { taskStatusTone } from "@/components/projects/tones";
import type { ProjectTabCtx } from "./context";

export async function TaskPanel(c: ProjectTabCtx, taskId: string) {
  const { ctx, id, access, today, locale, t, name, members, mgr, closed, query } = c;
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
