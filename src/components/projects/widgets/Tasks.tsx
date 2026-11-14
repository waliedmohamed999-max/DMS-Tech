"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { assignTaskAction, commentAction, createTaskAction, editCommentAction, taskStatusAction } from "@/lib/os/project-actions";
import { Field, Modal } from "@/components/os/client";
import { ReasonModal, useRun } from "../shared";
import { type Opt } from "./shared";

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function TaskCreate({ projects, projectId, milestones, members, canAssign, autoOpen, label }: { projects?: Opt[]; projectId?: string; milestones: Opt[]; members: Opt[]; canAssign: boolean; autoOpen?: boolean; label?: string }) {
  const t = useTranslations("os.projects");
  const router = useRouter();
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(Boolean(autoOpen));
  const [f, setF] = useState({ projectId: projectId ?? "", title: "", description: "", milestoneId: "", assigneeId: "", priority: "MEDIUM", dueDate: "", estimateHours: "", status: "TODO" });
  return (
    <>
      <button type="button" className="os-btn-primary h-8 px-3 text-xs" onClick={() => setOpen(true)}>
        + {label ?? t("newTask")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("newTask")} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          {projects && (
            <div className="sm:col-span-2">
              <Field label={t("f.project")}>
                <select className="os-input" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}>
                  <option value="">—</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          <div className="sm:col-span-2">
            <Field label={t("f.title")}>
              <input className="os-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </Field>
          </div>
          {milestones.length > 0 && (
            <Field label={t("f.milestone")}>
              <select className="os-input" value={f.milestoneId} onChange={(e) => setF({ ...f, milestoneId: e.target.value })}>
                <option value="">—</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {canAssign && members.length > 0 && (
            <Field label={t("f.assignee")}>
              <select className="os-input" value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })}>
                <option value="">—</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={t("f.priority")}>
            <select className="os-input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
              {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
                <option key={p} value={p}>
                  {t(`priority.${p}` as "priority.LOW")}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.due")}>
            <input type="date" className="os-input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </Field>
          <Field label={t("f.estimate")}>
            <input inputMode="decimal" dir="ltr" className="os-input" value={f.estimateHours} onChange={(e) => setF({ ...f, estimateHours: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("f.description")}>
              <textarea className="os-input" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </Field>
          </div>
          {error && <p className="text-xs text-danger sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </button>
            <button
              type="button"
              className="os-btn-primary"
              disabled={pending || !f.projectId || f.title.trim().length < 2}
              onClick={() =>
                run(
                  () => createTaskAction({ ...f, milestoneId: f.milestoneId || null, assigneeId: f.assigneeId || null, dueDate: f.dueDate || null, estimateHours: f.estimateHours || null }),
                  (r) => {
                    setOpen(false);
                    const id = r.ok ? (r.data as { id: string }).id : null;
                    if (id && projects) router.push(`/app/projects/${f.projectId}?tab=tasks&task=${id}`);
                  }
                )
              }
            >
              {t("create")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

const TASK_MOVES: Record<string, string[]> = { BACKLOG: ["TODO", "IN_PROGRESS", "CANCELLED"], TODO: ["BACKLOG", "IN_PROGRESS", "BLOCKED", "CANCELLED"], IN_PROGRESS: ["TODO", "REVIEW", "BLOCKED", "DONE", "CANCELLED"], REVIEW: ["IN_PROGRESS", "DONE", "BLOCKED"], BLOCKED: ["TODO", "IN_PROGRESS"], DONE: ["IN_PROGRESS"], CANCELLED: ["BACKLOG"] };

/** Status select with the allowed next states only; BLOCKED asks for a reason. */
export function TaskStatusControl({ id, status, compact }: { id: string; status: string; compact?: boolean }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  const [block, setBlock] = useState(false);
  return (
    <span className="inline-grid gap-0.5">
      <select
        className={`os-input w-auto py-0 text-xs ${compact ? "h-7" : "h-8"}`}
        value=""
        disabled={pending}
        aria-label={t("changeStatus")}
        onChange={(e) => {
          const to = e.target.value;
          if (!to) return;
          if (to === "BLOCKED") setBlock(true);
          else run(() => taskStatusAction(id, to, { from: status }));
        }}
      >
        <option value="">{t(`taskStatus.${status}` as "taskStatus.TODO")}</option>
        {(TASK_MOVES[status] ?? []).map((s) => (
          <option key={s} value={s}>
            {t(`taskStatus.${s}` as "taskStatus.TODO")}
          </option>
        ))}
      </select>
      {error && <span className="max-w-[220px] text-[11px] text-danger">{error}</span>}
      <ReasonModal open={block} title={t("blockTitle")} hint={t("blockHint")} confirmLabel={t("block")} danger pending={pending} error={error} onClose={() => setBlock(false)} onConfirm={(r) => run(() => taskStatusAction(id, "BLOCKED", { from: status, reason: r }), () => setBlock(false))} />
    </span>
  );
}

export function TaskAssign({ id, assigneeId, members }: { id: string; assigneeId: string | null; members: Opt[] }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  return (
    <span className="inline-grid gap-0.5">
      <select className="os-input h-8 w-auto py-0 text-xs" value={assigneeId ?? ""} disabled={pending} aria-label={t("f.assignee")} onChange={(e) => run(() => assignTaskAction(id, e.target.value || null))}>
        <option value="">{t("unassigned")}</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}

export function CommentBox({ taskId }: { taskId: string }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  const [v, setV] = useState("");
  return (
    <div className="grid gap-1.5">
      <textarea className="os-input text-sm" rows={2} value={v} onChange={(e) => setV(e.target.value)} placeholder={t("commentPh")} />
      {error && <span className="text-[11px] text-danger">{error}</span>}
      <button type="button" className="os-btn-secondary h-8 w-fit px-3 text-xs" disabled={pending || !v.trim()} onClick={() => run(() => commentAction(taskId, v.trim()), () => setV(""))}>
        {t("comment")}
      </button>
    </div>
  );
}

export function DeleteComment({ id }: { id: string }) {
  const t = useTranslations("os.projects");
  const { pending, run } = useRun();
  return (
    <button type="button" className="text-[11px] text-os-faint hover:text-danger" disabled={pending} onClick={() => window.confirm(t("deleteCommentConfirm")) && run(() => editCommentAction(id, null))}>
      {t("delete")}
    </button>
  );
}
