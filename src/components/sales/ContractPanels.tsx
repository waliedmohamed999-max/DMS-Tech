"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/os/action";
import { activateContractAction, cancelContractAction, contractTransitionAction, milestoneStatusAction, terminateContractAction, updateContractAction } from "@/lib/os/sales-actions";
import { Field, Modal, useErrorText } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";

type Milestone = { key: string; title: string; description: string; amount: string; percentage: string; dueDate: string; status: "PENDING" | "COMPLETED" | "CANCELLED" };
export type ContractForm = { title: string; startDate: string; endDate: string; renewalDate: string; paymentTerms: string; scopeOfWork: string; terms: string; milestones: Milestone[] };

let n = 0;
const k = () => `m-${Date.now()}-${n++}`;

function useRun() {
  const ts = useTranslations("os.sales");
  const errText = useErrorText();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult<unknown>>, done?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(ts.has(`errors.${r.error}`) ? ts(`errors.${r.error}` as "errors.QUOTE_NEEDS_ITEMS") : errText(r.error));
      done?.();
      router.refresh();
    });
  return { pending, error, run, setError };
}

/** Editable only in DRAFT / INTERNAL_REVIEW (server enforces; DB freezes active contracts). */
export function ContractEditor({ id, initial, currency }: { id: string; initial: ContractForm; currency: string }) {
  const t = useTranslations("os.sales.c");
  const [f, setF] = useState(initial);
  const { pending, error, run } = useRun();
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof ContractForm>(key: K, v: ContractForm[K]) => {
    setSaved(false);
    setF((x) => ({ ...x, [key]: v }));
  };
  const setM = (key: string, patch: Partial<Milestone>) => set("milestones", f.milestones.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-4">
          <Field label={t("f.title")}>
            <input className="os-input" value={f.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
        </div>
        <Field label={t("f.start")}>
          <input type="date" className="os-input" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label={t("f.end")}>
          <input type="date" className="os-input" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </Field>
        <Field label={t("f.renewal")}>
          <input type="date" className="os-input" value={f.renewalDate} onChange={(e) => set("renewalDate", e.target.value)} />
        </Field>
      </div>
      <Field label={t("f.scope")}>
        <textarea className="os-input" rows={6} value={f.scopeOfWork} onChange={(e) => set("scopeOfWork", e.target.value)} />
      </Field>
      <div className="grid gap-3 lg:grid-cols-2">
        <Field label={t("f.payment")}>
          <textarea className="os-input" rows={4} value={f.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} />
        </Field>
        <Field label={t("f.terms")}>
          <textarea className="os-input" rows={4} value={f.terms} onChange={(e) => set("terms", e.target.value)} />
        </Field>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="os-label mb-0">{t("milestones")}</span>
          <button type="button" className="os-btn-secondary h-8 px-2.5 text-xs" onClick={() => set("milestones", [...f.milestones, { key: k(), title: "", description: "", amount: "", percentage: "", dueDate: "", status: "PENDING" }])}>
            + {t("addMilestone")}
          </button>
        </div>
        {f.milestones.length === 0 ? (
          <p className="rounded-lg border border-dashed border-os-line py-5 text-center text-xs text-os-muted">{t("noMilestones")}</p>
        ) : (
          <div className="grid gap-2">
            {f.milestones.map((m) => (
              <div key={m.key} className="grid gap-2 rounded-lg border border-os-line bg-os-panel p-2 md:grid-cols-[minmax(0,1fr)_120px_90px_150px_32px] md:items-center">
                <input className="os-input h-8" placeholder={t("f.milestone")} value={m.title} onChange={(e) => setM(m.key, { title: e.target.value })} />
                <input className="os-input h-8" dir="ltr" inputMode="decimal" placeholder={`${t("f.amount")} ${currency}`} value={m.amount} onChange={(e) => setM(m.key, { amount: e.target.value })} />
                <input className="os-input h-8" dir="ltr" inputMode="decimal" placeholder="%" value={m.percentage} onChange={(e) => setM(m.key, { percentage: e.target.value })} />
                <input type="date" className="os-input h-8" value={m.dueDate} onChange={(e) => setM(m.key, { dueDate: e.target.value })} />
                <button type="button" className="os-btn-ghost size-8 px-0 text-danger" aria-label="remove" onClick={() => set("milestones", f.milestones.filter((x) => x.key !== m.key))}>
                  <Icon name="X" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        {saved && <span className="text-xs text-success">{t("saved")}</span>}
        <button
          type="button"
          className="os-btn-primary"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                updateContractAction(id, {
                  ...f,
                  milestones: f.milestones.map((m) => ({ title: m.title, description: m.description, amount: m.amount, percentage: m.percentage, dueDate: m.dueDate, status: m.status }))
                }),
              () => setSaved(true)
            )
          }
        >
          {t("save")}
        </button>
      </div>
    </div>
  );
}

export function ContractActions({ id, status, can }: { id: string; status: string; can: { edit: boolean; activate: boolean; terminate: boolean } }) {
  const t = useTranslations("os.sales.c");
  const { pending, error, run } = useRun();
  const [modal, setModal] = useState<null | "activate" | "terminate" | "cancel">(null);
  const [reason, setReason] = useState("");
  const [signedAt, setSignedAt] = useState("");
  const [confirm, setConfirm] = useState(false);
  const open = (m: typeof modal) => {
    setReason("");
    setConfirm(false);
    setModal(m);
  };
  return (
    <div className="grid justify-items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        {status === "DRAFT" && can.edit && (
          <button type="button" className="os-btn-secondary" disabled={pending} onClick={() => run(() => contractTransitionAction(id, "review"))}>
            {t("toReview")}
          </button>
        )}
        {(status === "INTERNAL_REVIEW" || status === "AWAITING_SIGNATURE") && can.edit && (
          <button type="button" className="os-btn-secondary" disabled={pending} onClick={() => run(() => contractTransitionAction(id, "draft"))}>
            {t("toDraft")}
          </button>
        )}
        {(status === "DRAFT" || status === "INTERNAL_REVIEW") && can.edit && (
          <button type="button" className="os-btn-primary" disabled={pending} onClick={() => run(() => contractTransitionAction(id, "signature"))}>
            {t("toSignature")}
          </button>
        )}
        {status === "AWAITING_SIGNATURE" && can.activate && (
          <button type="button" className="os-btn-primary" disabled={pending} onClick={() => open("activate")}>
            {t("activate")}
          </button>
        )}
        {(status === "ACTIVE" || status === "EXPIRING") && can.terminate && (
          <button type="button" className="os-btn-ghost text-danger" disabled={pending} onClick={() => open("terminate")}>
            {t("terminate")}
          </button>
        )}
        {["DRAFT", "INTERNAL_REVIEW", "AWAITING_SIGNATURE"].includes(status) && can.edit && (
          <button type="button" className="os-btn-ghost text-danger" disabled={pending} onClick={() => open("cancel")}>
            {t("cancel")}
          </button>
        )}
      </div>
      {error && !modal && <p className="max-w-md rounded-md border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">{error}</p>}
      <Modal open={modal === "activate"} onClose={() => setModal(null)} title={t("activateTitle")}>
        <div className="grid gap-3 text-sm">
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">{t("activateNote")}</p>
          <Field label={t("signedAt")}>
            <input type="date" className="os-input" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
          </Field>
          <label className="flex items-start gap-2 text-xs text-os-muted">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 accent-[#624de3]" /> {t("activateConfirm")}
          </label>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={() => setModal(null)}>
              {t("close")}
            </button>
            <button type="button" className="os-btn-primary" disabled={!confirm || !signedAt || pending} onClick={() => run(() => activateContractAction(id, signedAt), () => setModal(null))}>
              {t("activate")}
            </button>
          </div>
        </div>
      </Modal>
      {(["terminate", "cancel"] as const).map((m) => (
        <Modal key={m} open={modal === m} onClose={() => setModal(null)} title={t(m === "terminate" ? "terminateTitle" : "cancelTitle")}>
          <div className="grid gap-3">
            <textarea className="os-input" rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reason")} />
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="os-btn-ghost" onClick={() => setModal(null)}>
                {t("close")}
              </button>
              <button type="button" className="os-btn-danger" disabled={reason.trim().length < 3 || pending} onClick={() => run(() => (m === "terminate" ? terminateContractAction(id, reason.trim()) : cancelContractAction(id, reason.trim())), () => setModal(null))}>
                {t("confirm")}
              </button>
            </div>
          </div>
        </Modal>
      ))}
    </div>
  );
}

export function MilestoneStatus({ contractId, milestoneId, status, enabled }: { contractId: string; milestoneId: string; status: string; enabled: boolean }) {
  const t = useTranslations("os.sales.c");
  const { pending, run } = useRun();
  if (!enabled) return <span className="text-xs text-os-muted">{t(`ms.${status}` as "ms.PENDING")}</span>;
  return (
    <select className="os-input h-7 w-auto py-0 text-xs" disabled={pending} value={status} onChange={(e) => run(() => milestoneStatusAction(contractId, milestoneId, e.target.value as "PENDING"))}>
      {["PENDING", "COMPLETED", "CANCELLED"].map((s) => (
        <option key={s} value={s}>
          {t(`ms.${s}` as "ms.PENDING")}
        </option>
      ))}
    </select>
  );
}
