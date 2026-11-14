"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { completeProjectAction, projectStatusAction, updateProjectAction } from "@/lib/os/project-actions";
import { Field, Modal } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";
import { ReasonModal, useRun } from "../shared";
import { type Opt } from "./shared";

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
