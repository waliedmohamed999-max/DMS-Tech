"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  addMemberAction,
  assignTaskAction,
  clientDecisionAction,
  commentAction,
  completeProjectAction,
  createDeliverableAction,
  createDependencyAction,
  createMilestoneAction,
  createTaskAction,
  createTimeAction,
  deleteTimeAction,
  deliverableStatusAction,
  dependencyStatusAction,
  editCommentAction,
  milestoneStatusAction,
  projectStatusAction,
  removeMemberAction,
  submitTimesheetAction,
  taskStatusAction,
  updateMilestoneAction,
  updateProjectAction
} from "@/lib/os/project-actions";
import { Field, Modal } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";
import { ReasonModal, dateValue, useRun } from "./shared";

type Opt = { id: string; label: string };

// ---------------------------------------------------------------------------
// Project header: status + completion + edit
// ---------------------------------------------------------------------------

const PROJECT_MOVES: Record<string, string[]> = {
  DRAFT: ["PLANNING", "CANCELLED"],
  PLANNING: ["ACTIVE", "ON_HOLD", "CANCELLED"],
  ACTIVE: ["WAITING_CLIENT", "BLOCKED", "AT_RISK", "ON_HOLD", "CANCELLED"],
  WAITING_CLIENT: ["ACTIVE", "BLOCKED", "AT_RISK", "ON_HOLD", "CANCELLED"],
  BLOCKED: ["ACTIVE", "WAITING_CLIENT", "ON_HOLD", "CANCELLED"],
  AT_RISK: ["ACTIVE", "WAITING_CLIENT", "BLOCKED", "ON_HOLD", "CANCELLED"],
  ON_HOLD: ["ACTIVE", "PLANNING", "CANCELLED"],
  COMPLETED: ["ACTIVE", "ARCHIVED"],
  CANCELLED: ["ARCHIVED"],
  ARCHIVED: []
};
const NEEDS_REASON = ["BLOCKED", "ON_HOLD", "CANCELLED"];

export function ProjectHeaderActions({
  id,
  status,
  can,
  blockers,
  project,
  people
}: {
  id: string;
  status: string;
  can: { status: boolean; complete: boolean; edit: boolean; archive: boolean; team: boolean };
  blockers: { code: string; params: Record<string, string | number> }[];
  project: { name: string; description: string; startDate: string; targetEndDate: string; priority: string; projectManagerId: string };
  people: Opt[];
}) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(project);
  const [override, setOverride] = useState("");
  const completable = ["ACTIVE", "AT_RISK", "WAITING_CLIENT"].includes(status);
  const go = (to: string, reason?: string) => run(() => projectStatusAction(id, to, reason, status), () => setReasonFor(null));
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {can.edit && !["COMPLETED", "CANCELLED", "ARCHIVED"].includes(status) && (
        <button type="button" className="os-btn-ghost h-8 px-2.5 text-xs" onClick={() => setEdit(true)}>
          <Icon name="Pencil" size={13} /> {t("edit")}
        </button>
      )}
      {can.status && (PROJECT_MOVES[status] ?? []).filter((s) => s !== "ARCHIVED" || can.archive).length > 0 && (
        <select
          className="os-input h-8 w-auto py-0 text-xs"
          value=""
          disabled={pending}
          aria-label={t("changeStatus")}
          onChange={(e) => {
            const to = e.target.value;
            if (!to) return;
            if (NEEDS_REASON.includes(to) || status === "COMPLETED") setReasonFor(to);
            else go(to);
          }}
        >
          <option value="">{t("changeStatus")}…</option>
          {(PROJECT_MOVES[status] ?? [])
            .filter((s) => s !== "ARCHIVED" || can.archive)
            .map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}` as "status.ACTIVE")}
              </option>
            ))}
        </select>
      )}
      {can.complete && completable && (
        <button type="button" className="os-btn-primary h-8 px-3 text-xs" onClick={() => setComplete(true)}>
          <Icon name="CircleCheck" size={14} /> {t("complete")}
        </button>
      )}
      {error && !reasonFor && !complete && <p className="w-full text-end text-xs text-danger">{error}</p>}
      <ReasonModal open={Boolean(reasonFor)} title={t("statusReasonTitle", { s: reasonFor ? t(`status.${reasonFor}` as "status.ACTIVE") : "" })} confirmLabel={t("confirm")} danger={reasonFor === "CANCELLED"} pending={pending} error={error} onClose={() => setReasonFor(null)} onConfirm={(r) => reasonFor && go(reasonFor, r)} />
      <Modal open={complete} onClose={() => setComplete(false)} title={t("completeTitle")}>
        <div className="grid gap-3 text-sm">
          {blockers.length === 0 ? (
            <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">{t("completeReady")}</p>
          ) : (
            <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              <p className="font-medium">{t("completeBlocked")}</p>
              <ul className="mt-1 list-inside list-disc">
                {blockers.map((b, i) => (
                  <li key={i}>{t(`blockers.${b.code}` as "blockers.MILESTONE_OPEN", b.params)}</li>
                ))}
              </ul>
            </div>
          )}
          {blockers.length > 0 && (
            <Field label={t("overrideReason")} hint={t("overrideHint")}>
              <textarea className="os-input" rows={3} value={override} onChange={(e) => setOverride(e.target.value)} />
            </Field>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={() => setComplete(false)}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending || (blockers.length > 0 && override.trim().length < 10)} onClick={() => run(() => completeProjectAction(id, blockers.length ? override.trim() : undefined, status), () => setComplete(false))}>
              {blockers.length ? t("completeOverride") : t("complete")}
            </button>
          </div>
        </div>
      </Modal>
      <Modal open={edit} onClose={() => setEdit(false)} title={t("editProject")} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={t("f.name")}>
              <input className="os-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
          </div>
          <Field label={t("f.start")}>
            <input type="date" className="os-input" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
          </Field>
          <Field label={t("f.target")}>
            <input type="date" className="os-input" value={f.targetEndDate} onChange={(e) => setF({ ...f, targetEndDate: e.target.value })} />
          </Field>
          <Field label={t("f.priority")}>
            <select className="os-input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
              {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
                <option key={p} value={p}>
                  {t(`priority.${p}` as "priority.LOW")}
                </option>
              ))}
            </select>
          </Field>
          {can.team && (
            <Field label={t("f.pm")}>
              <select className="os-input" value={f.projectManagerId} onChange={(e) => setF({ ...f, projectManagerId: e.target.value })}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="sm:col-span-2">
            <Field label={t("f.description")}>
              <textarea className="os-input" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </Field>
          </div>
          {error && <p className="text-xs text-danger sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="os-btn-ghost" onClick={() => setEdit(false)}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending} onClick={() => run(() => updateProjectAction(id, { ...f, projectManagerId: can.team ? f.projectManagerId : undefined }), () => setEdit(false))}>
              {t("save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

type MilestoneValue = { id?: string; title: string; description: string; startDate: string; dueDate: string; weight: string; required: boolean; ownerId: string; contractMilestoneId: string };

export function MilestoneForm({ projectId, value, people, contractMilestones, trigger }: { projectId: string; value?: MilestoneValue; people: Opt[]; contractMilestones: Opt[] | null; trigger: "new" | "edit" }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<MilestoneValue>(value ?? { title: "", description: "", startDate: "", dueDate: "", weight: "10", required: true, ownerId: "", contractMilestoneId: "" });
  const submit = () => {
    const input = { ...f, weight: Number(f.weight), ownerId: f.ownerId || null, contractMilestoneId: f.contractMilestoneId || null, startDate: f.startDate || null };
    run(() => (value?.id ? updateMilestoneAction(value.id, input) : createMilestoneAction(projectId, input)), () => setOpen(false));
  };
  return (
    <>
      <button type="button" className={trigger === "new" ? "os-btn-primary h-8 px-3 text-xs" : "os-btn-ghost size-7 px-0"} onClick={() => setOpen(true)} aria-label={t("editMilestone")}>
        {trigger === "new" ? `+ ${t("newMilestone")}` : <Icon name="Pencil" size={13} />}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={value ? t("editMilestone") : t("newMilestone")} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={t("f.title")}>
              <input className="os-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </Field>
          </div>
          <Field label={t("f.start")}>
            <input type="date" className="os-input" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
          </Field>
          <Field label={t("f.due")}>
            <input type="date" className="os-input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </Field>
          <Field label={t("f.weight")} hint={t("weightHint")}>
            <input type="number" min={1} max={100} className="os-input" dir="ltr" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} />
          </Field>
          <Field label={t("f.owner")}>
            <select className="os-input" value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>
              <option value="">—</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          {contractMilestones && (
            <div className="sm:col-span-2">
              <Field label={t("f.contractMilestone")} hint={t("contractMilestoneHint")}>
                <select className="os-input" value={f.contractMilestoneId} onChange={(e) => setF({ ...f, contractMilestoneId: e.target.value })}>
                  <option value="">—</option>
                  {contractMilestones.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} className="accent-[#624de3]" /> {t("f.requiredMilestone")}
          </label>
          {error && <p className="text-xs text-danger sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending || f.title.trim().length < 2 || !f.dueDate} onClick={submit}>
              {t("save")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

const MS_MOVES: Record<string, string[]> = { NOT_STARTED: ["IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"], IN_PROGRESS: ["NOT_STARTED", "BLOCKED", "COMPLETED", "CANCELLED"], BLOCKED: ["IN_PROGRESS", "NOT_STARTED", "CANCELLED"], COMPLETED: ["IN_PROGRESS"], CANCELLED: ["NOT_STARTED"] };

export function MilestoneStatusControl({ id, status }: { id: string; status: string }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  const [block, setBlock] = useState(false);
  return (
    <span className="inline-grid gap-0.5">
      <select
        className="os-input h-7 w-auto py-0 text-xs"
        value=""
        disabled={pending}
        aria-label={t("changeStatus")}
        onChange={(e) => {
          const to = e.target.value;
          if (!to) return;
          if (to === "BLOCKED") setBlock(true);
          else run(() => milestoneStatusAction(id, to, undefined, status));
        }}
      >
        <option value="">{t(`msStatus.${status}` as "msStatus.NOT_STARTED")}</option>
        {(MS_MOVES[status] ?? []).map((s) => (
          <option key={s} value={s}>
            {t(`msStatus.${s}` as "msStatus.NOT_STARTED")}
          </option>
        ))}
      </select>
      {error && <span className="max-w-[220px] text-[11px] text-danger">{error}</span>}
      <ReasonModal open={block} title={t("blockMilestone")} confirmLabel={t("block")} danger pending={pending} error={error} onClose={() => setBlock(false)} onConfirm={(r) => run(() => milestoneStatusAction(id, "BLOCKED", r, status), () => setBlock(false))} />
    </span>
  );
}

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

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

const ROLES = ["PROJECT_MANAGER", "TECH_LEAD", "DEVELOPER", "DESIGNER", "MARKETING", "QA", "ACCOUNT_MANAGER", "CONTRIBUTOR", "OBSERVER"];

export function AddMember({ projectId, users }: { projectId: string; users: Opt[] }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ userId: "", role: "DEVELOPER", allocationPercent: "" });
  return (
    <>
      <button type="button" className="os-btn-primary h-8 px-3 text-xs" onClick={() => setOpen(true)}>
        + {t("addMember")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("addMember")}>
        <div className="grid gap-3">
          <Field label={t("f.person")}>
            <select className="os-input" value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}>
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.projectRole")} hint={t("roleHint")}>
            <select className="os-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}` as "roles.DEVELOPER")}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.allocation")} hint={t("allocationHint")}>
            <input type="number" min={0} max={100} dir="ltr" className="os-input" value={f.allocationPercent} onChange={(e) => setF({ ...f, allocationPercent: e.target.value })} />
          </Field>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending || !f.userId} onClick={() => run(() => addMemberAction(projectId, f), () => setOpen(false))}>
              {t("add")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function RemoveMember({ projectId, userId }: { projectId: string; userId: string }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  return (
    <span className="inline-grid">
      <button type="button" className="os-btn-ghost h-7 px-2 text-[11px] text-danger" disabled={pending} onClick={() => window.confirm(t("removeMemberConfirm")) && run(() => removeMemberAction(projectId, userId))}>
        {t("remove")}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Deliverables & dependencies
// ---------------------------------------------------------------------------

export function DeliverableForm({ projectId, milestones, members }: { projectId: string; milestones: Opt[]; members: Opt[] }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", description: "", milestoneId: "", ownerId: "", dueDate: "", required: true, clientApprovalRequired: true });
  return (
    <>
      <button type="button" className="os-btn-primary h-8 px-3 text-xs" onClick={() => setOpen(true)}>
        + {t("newDeliverable")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("newDeliverable")} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={t("f.name")}>
              <input className="os-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
          </div>
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
          <Field label={t("f.owner")}>
            <select className="os-input" value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>
              <option value="">—</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.due")}>
            <input type="date" className="os-input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </Field>
          <div className="grid content-end gap-1.5 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={f.clientApprovalRequired} onChange={(e) => setF({ ...f, clientApprovalRequired: e.target.checked })} className="accent-[#624de3]" /> {t("f.clientApproval")}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} className="accent-[#624de3]" /> {t("f.requiredDeliverable")}
            </label>
          </div>
          {error && <p className="text-xs text-danger sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending || f.name.trim().length < 2} onClick={() => run(() => createDeliverableAction(projectId, { ...f, milestoneId: f.milestoneId || null, ownerId: f.ownerId || null, dueDate: f.dueDate || null }), () => setOpen(false))}>
              {t("create")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

const D_MOVES: Record<string, string[]> = { DRAFT: ["IN_PROGRESS"], IN_PROGRESS: ["READY", "DRAFT"], READY: ["DELIVERED", "IN_PROGRESS"], DELIVERED: ["IN_PROGRESS"], REJECTED: ["IN_PROGRESS"], ACCEPTED: [] };

export function DeliverableActions({ id, status, clientApprovalRequired, manager }: { id: string; status: string; clientApprovalRequired: boolean; manager: boolean }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  const [decide, setDecide] = useState<null | "ACCEPTED" | "REJECTED">(null);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      {(D_MOVES[status] ?? []).map((s) => (
        <button key={s} type="button" className="os-btn-ghost h-7 px-2 text-[11px]" disabled={pending} onClick={() => run(() => deliverableStatusAction(id, s))}>
          <span className="inline-block rtl:rotate-180">→</span> {t(`dStatus.${s}` as "dStatus.READY")}
        </button>
      ))}
      {manager && status === "DELIVERED" && clientApprovalRequired && (
        <>
          <button type="button" className="os-btn-secondary h-7 px-2 text-[11px]" onClick={() => setDecide("ACCEPTED")}>
            {t("clientAccepted")}
          </button>
          <button type="button" className="os-btn-ghost h-7 px-2 text-[11px] text-danger" onClick={() => setDecide("REJECTED")}>
            {t("clientRejected")}
          </button>
        </>
      )}
      {error && !decide && <span className="w-full text-end text-[11px] text-danger">{error}</span>}
      <Modal open={Boolean(decide)} onClose={() => setDecide(null)} title={decide === "ACCEPTED" ? t("clientAcceptTitle") : t("clientRejectTitle")}>
        <div className="grid gap-3 text-sm">
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">{t("clientDecisionNote")}</p>
          <textarea className="os-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={decide === "REJECTED" ? t("reasonPh") : t("notePh")} />
          <label className="flex items-start gap-2 text-xs text-os-muted">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 accent-[#624de3]" /> {t("clientDecisionConfirm")}
          </label>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={() => setDecide(null)}>
              {t("cancel")}
            </button>
            <button type="button" className={decide === "REJECTED" ? "os-btn-danger" : "os-btn-primary"} disabled={pending || !confirm || (decide === "REJECTED" && note.trim().length < 3)} onClick={() => decide && run(() => clientDecisionAction(id, decide, note.trim()), () => setDecide(null))}>
              {t("record")}
            </button>
          </div>
        </div>
      </Modal>
    </span>
  );
}

const DEP_TYPES = ["CONTENT", "BRAND_ASSETS", "ACCESS", "CREDENTIALS", "DATA", "APPROVAL", "FEEDBACK", "OTHER"];

export function DependencyForm({ projectId }: { projectId: string }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", description: "", type: "CONTENT", ownerSide: "CLIENT", critical: false, dueDate: "" });
  return (
    <>
      <button type="button" className="os-btn-secondary h-8 px-3 text-xs" onClick={() => setOpen(true)}>
        + {t("newDependency")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("newDependency")} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={t("f.title")}>
              <input className="os-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t("dependencyPh")} />
            </Field>
          </div>
          <Field label={t("f.depType")}>
            <select className="os-input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {DEP_TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`depType.${x}` as "depType.OTHER")}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.side")}>
            <select className="os-input" value={f.ownerSide} onChange={(e) => setF({ ...f, ownerSide: e.target.value })}>
              {["CLIENT", "INTERNAL", "THIRD_PARTY"].map((x) => (
                <option key={x} value={x}>
                  {t(`side.${x}` as "side.CLIENT")}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.due")}>
            <input type="date" className="os-input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={f.critical} onChange={(e) => setF({ ...f, critical: e.target.checked })} className="accent-[#624de3]" /> {t("f.critical")}
          </label>
          {error && <p className="text-xs text-danger sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending || f.title.trim().length < 2} onClick={() => run(() => createDependencyAction(projectId, { ...f, dueDate: f.dueDate || null }), () => setOpen(false))}>
              {t("create")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function DependencyActions({ id, status }: { id: string; status: string }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  const [resolve, setResolve] = useState(false);
  const open = status === "OPEN" || status === "WAITING";
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      {status === "OPEN" && (
        <button type="button" className="os-btn-ghost h-7 px-2 text-[11px]" disabled={pending} onClick={() => run(() => dependencyStatusAction(id, "WAITING"))}>
          {t("depWaiting")}
        </button>
      )}
      {open && (
        <button type="button" className="os-btn-secondary h-7 px-2 text-[11px]" disabled={pending} onClick={() => setResolve(true)}>
          {t("depResolve")}
        </button>
      )}
      {open && (
        <button type="button" className="os-btn-ghost h-7 px-2 text-[11px] text-os-faint" disabled={pending} onClick={() => run(() => dependencyStatusAction(id, "CANCELLED"))}>
          {t("cancel")}
        </button>
      )}
      {!open && (
        <button type="button" className="os-btn-ghost h-7 px-2 text-[11px]" disabled={pending} onClick={() => run(() => dependencyStatusAction(id, "OPEN"))}>
          {t("reopen")}
        </button>
      )}
      {error && <span className="w-full text-end text-[11px] text-danger">{error}</span>}
      <ReasonModal open={resolve} title={t("depResolveTitle")} minLength={0} confirmLabel={t("depResolve")} pending={pending} error={error} onClose={() => setResolve(false)} onConfirm={(note) => run(() => dependencyStatusAction(id, "RESOLVED", note || undefined), () => setResolve(false))} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export function TimeEntryForm({ projects, tasksByProject, defaultProjectId, today }: { projects: Opt[]; tasksByProject: Record<string, Opt[]>; defaultProjectId?: string; today: string }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  const [f, setF] = useState({ projectId: defaultProjectId ?? projects[0]?.id ?? "", taskId: "", date: today, hours: "", minutes: "", description: "", billable: true });
  const total = (Number(f.hours || 0) * 60 + Number(f.minutes || 0)) | 0;
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_140px_70px_70px] sm:items-end">
      <Field label={t("f.project")}>
        <select className="os-input h-9" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value, taskId: "" })}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("f.task")}>
        <select className="os-input h-9" value={f.taskId} onChange={(e) => setF({ ...f, taskId: e.target.value })}>
          <option value="">—</option>
          {(tasksByProject[f.projectId] ?? []).map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("f.date")}>
        <input type="date" className="os-input h-9" max={today} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      </Field>
      <Field label={t("f.hours")}>
        <input inputMode="numeric" dir="ltr" className="os-input h-9" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value.replace(/\D/g, "") })} />
      </Field>
      <Field label={t("f.minutes")}>
        <input inputMode="numeric" dir="ltr" className="os-input h-9" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value.replace(/\D/g, "") })} />
      </Field>
      <div className="sm:col-span-4">
        <input className="os-input h-9" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={t("timeNotePh")} />
      </div>
      <div className="flex items-center justify-end gap-2">
        <label className="flex items-center gap-1 whitespace-nowrap text-xs text-os-muted">
          <input type="checkbox" checked={f.billable} onChange={(e) => setF({ ...f, billable: e.target.checked })} className="accent-[#624de3]" /> {t("billable")}
        </label>
        <button type="button" className="os-btn-primary h-9 px-3 text-xs" disabled={pending || !f.projectId || total <= 0} onClick={() => run(() => createTimeAction({ projectId: f.projectId, taskId: f.taskId || null, date: f.date, minutes: total, description: f.description, billable: f.billable }), () => setF({ ...f, hours: "", minutes: "", description: "" }))}>
          {t("logTime")}
        </button>
      </div>
      {error && <p className="text-xs text-danger sm:col-span-5">{error}</p>}
    </div>
  );
}

export function SubmitTimesheet({ projectId, count }: { projectId: string; count: number }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  return (
    <span className="inline-grid gap-0.5">
      <button type="button" className="os-btn-secondary h-8 px-3 text-xs" disabled={pending || !count} onClick={() => run(() => submitTimesheetAction(projectId))}>
        {t("submitTime", { n: count })}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}

export function DeleteTime({ id }: { id: string }) {
  const t = useTranslations("os.projects");
  const { pending, run } = useRun();
  return (
    <button type="button" className="os-btn-ghost size-7 px-0 text-os-faint hover:text-danger" disabled={pending} aria-label={t("delete")} onClick={() => run(() => deleteTimeAction(id))}>
      <Icon name="X" size={13} />
    </button>
  );
}

export { dateValue };
