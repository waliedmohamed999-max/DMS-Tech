"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createMilestoneAction, milestoneStatusAction, updateMilestoneAction } from "@/lib/os/project-actions";
import { Field, Modal } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";
import { ReasonModal, useRun } from "../shared";
import { type Opt } from "./shared";

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
