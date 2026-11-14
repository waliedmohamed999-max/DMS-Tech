"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { clientDecisionAction, createDeliverableAction, deliverableStatusAction } from "@/lib/os/project-actions";
import { Field, Modal } from "@/components/os/client";
import { useRun } from "../shared";
import { type Opt } from "./shared";

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
