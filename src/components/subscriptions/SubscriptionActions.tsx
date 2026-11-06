"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, Modal } from "@/components/os/client";
import type { ActionResult } from "@/lib/os/action";
import {
  cancelSubscriptionAction, changePlanAction, pauseSubscriptionAction, resumeSubscriptionAction, revokeCancellationAction, startBillingAction, subscriptionNoteAction, updateTermsAction
} from "@/lib/os/subscription-actions";
import { SUB_T, subError } from "@/lib/os/subscription-labels";

type Opt = { id: string; label: string };
type Sub = {
  id: string;
  status: "ACTIVE" | "PAUSED" | "ENDING" | "ENDED";
  name: string;
  description: string | null;
  price: string;
  interval: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL";
  serviceId: string | null;
  planKey: string | null;
  taxBehavior: string;
  autoRenew: boolean;
  renewalMonths: number;
  ownerId: string | null;
  contactId: string | null;
  contractId: string | null;
  notes: string | null;
  termEndDate: string | null;
  commitmentEnd: string | null;
  billing: boolean;
};

/** Every action of a subscription page: each opens a small form; the server re-checks permission and state. */
export function SubscriptionActions({
  locale,
  s,
  canManage,
  canBill,
  today,
  options
}: {
  locale: "ar" | "en";
  s: Sub;
  canManage: boolean;
  canBill: boolean;
  today: string;
  options: { owners: Opt[]; contacts: Opt[]; contracts: Opt[]; services: Opt[] };
}) {
  const t = SUB_T[locale];
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<Record<string, string | boolean>>({});
  if (!canManage || s.status === "ENDED") return null;

  const openForm = (k: string, init: Record<string, string | boolean>) => {
    setError(null);
    setV(init);
    setOpen(k);
  };
  const run = (fn: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(subError(t, r));
      setOpen(null);
      router.refresh();
    });
  const set = (k: string, x: string | boolean) => setV((o) => ({ ...o, [k]: x }));
  const str = (k: string) => String(v[k] ?? "");

  const btn = "os-btn-ghost h-8 px-3 text-xs";
  const early = open === "cancel" && s.commitmentEnd && ((v.when === "date" && str("date") && str("date") < s.commitmentEnd) || (v.when === "now" && today < s.commitmentEnd));

  const foot = (onSave: () => void, danger = false) => (
    <>
      {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="os-btn-ghost" onClick={() => setOpen(null)}>
          {t.cancel}
        </button>
        <button type="button" className={danger ? "os-btn-danger" : "os-btn-primary"} disabled={pending} onClick={onSave}>
          {t.save}
        </button>
      </div>
    </>
  );
  const select = (k: string, opts: Opt[]) => (
    <select className="os-input" value={str(k)} onChange={(e) => set(k, e.target.value)}>
      <option value="">—</option>
      {opts.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className={btn} onClick={() => openForm("plan", { name: s.name, description: s.description ?? "", price: s.price, serviceId: s.serviceId ?? "", note: "" })}>
        {t.a.changePlan}
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => openForm("terms", { autoRenew: s.autoRenew, renewalMonths: String(s.renewalMonths), ownerId: s.ownerId ?? "", contactId: s.contactId ?? "", contractId: s.contractId ?? "", notes: s.notes ?? "" })}
      >
        {t.a.terms}
      </button>
      {s.status === "ACTIVE" && (
        <button type="button" className={btn} onClick={() => openForm("pause", { reason: "" })}>
          {t.a.pause}
        </button>
      )}
      {s.status === "PAUSED" && (
        <button type="button" className={btn} onClick={() => openForm("resume", {})}>
          {t.a.resume}
        </button>
      )}
      {s.status === "ENDING" ? (
        <button type="button" className={btn} onClick={() => openForm("revoke", {})}>
          {t.a.revoke}
        </button>
      ) : (
        <button type="button" className={`${btn} text-red-600 dark:text-red-400`} onClick={() => openForm("cancel", { when: s.termEndDate ? "term_end" : "date", date: "", reason: "" })}>
          {t.a.cancel}
        </button>
      )}
      {!s.billing && canBill && (
        <button type="button" className="os-btn-secondary h-8 px-3 text-xs" onClick={() => openForm("billing", { dueDays: "7", language: locale, autoIssue: false, autoSend: false, sendTo: "", paymentTerms: "" })}>
          {t.a.startBilling}
        </button>
      )}
      <button type="button" className={btn} onClick={() => openForm("note", { note: "" })}>
        {t.a.note}
      </button>

      <Modal open={open === "plan"} onClose={() => setOpen(null)} title={t.a.changePlan}>
        <div className="grid gap-3 text-sm">
          <p className="text-xs text-os-muted">{t.planChangeNote}</p>
          <Field label={t.name}>
            <input className="os-input" value={str("name")} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label={`${t.price} (${t.per[s.interval]})`}>
            <input className="os-input" inputMode="decimal" dir="ltr" value={str("price")} onChange={(e) => set("price", e.target.value)} />
          </Field>
          <Field label={t.service}>{select("serviceId", options.services)}</Field>
          <Field label={t.description}>
            <textarea className="os-input min-h-[60px]" value={str("description")} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field label={t.changeNote}>
            <input className="os-input" value={str("note")} onChange={(e) => set("note", e.target.value)} />
          </Field>
          {foot(() => run(() => changePlanAction(s.id, { ...v, serviceId: str("serviceId") || null, planKey: s.planKey })))}
        </div>
      </Modal>

      <Modal open={open === "terms"} onClose={() => setOpen(null)} title={t.a.terms}>
        <div className="grid gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(v.autoRenew)} onChange={(e) => set("autoRenew", e.target.checked)} /> {t.autoRenew}
          </label>
          <Field label={t.renewalMonths}>
            <input className="os-input" type="number" min={1} max={36} dir="ltr" value={str("renewalMonths")} onChange={(e) => set("renewalMonths", e.target.value)} />
          </Field>
          <Field label={t.owner}>{select("ownerId", options.owners)}</Field>
          <Field label={t.contact}>{select("contactId", options.contacts)}</Field>
          <Field label={t.contract}>{select("contractId", options.contracts)}</Field>
          <Field label={t.notes}>
            <textarea className="os-input min-h-[60px]" value={str("notes")} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          {foot(() => run(() => updateTermsAction(s.id, { ...v, ownerId: str("ownerId") || null, contactId: str("contactId") || null, contractId: str("contractId") || null })))}
        </div>
      </Modal>

      <Modal open={open === "pause"} onClose={() => setOpen(null)} title={t.a.pause}>
        <div className="grid gap-3 text-sm">
          <p className="text-xs text-os-muted">{t.pauseNote}</p>
          <Field label={t.reason}>
            <textarea className="os-input min-h-[60px]" value={str("reason")} onChange={(e) => set("reason", e.target.value)} />
          </Field>
          {foot(() => run(() => pauseSubscriptionAction(s.id, { reason: str("reason") })))}
        </div>
      </Modal>

      <Modal open={open === "resume"} onClose={() => setOpen(null)} title={t.a.resume}>
        <div className="grid gap-3 text-sm">
          <p>{t.resumeConfirm}</p>
          {foot(() => run(() => resumeSubscriptionAction(s.id)))}
        </div>
      </Modal>

      <Modal open={open === "revoke"} onClose={() => setOpen(null)} title={t.a.revoke}>
        <div className="grid gap-3 text-sm">
          <p>{t.revokeConfirm}</p>
          {foot(() => run(() => revokeCancellationAction(s.id)))}
        </div>
      </Modal>

      <Modal open={open === "cancel"} onClose={() => setOpen(null)} title={t.a.cancel}>
        <div className="grid gap-3 text-sm">
          <p className="text-xs text-os-muted">{t.cancelNote}</p>
          <Field label={t.when}>
            <select className="os-input" value={str("when")} onChange={(e) => set("when", e.target.value)}>
              {Object.entries(t.whenOpts)
                .filter(([k]) => k !== "term_end" || s.termEndDate)
                .map(([k, x]) => (
                  <option key={k} value={k}>
                    {k === "term_end" && s.termEndDate ? `${x} (${s.termEndDate})` : x}
                  </option>
                ))}
            </select>
          </Field>
          {v.when === "date" && (
            <Field label={t.date}>
              <input type="date" className="os-input" dir="ltr" min={today} value={str("date")} onChange={(e) => set("date", e.target.value)} />
            </Field>
          )}
          {early && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">{t.early}</p>}
          <Field label={t.reason}>
            <textarea className="os-input min-h-[60px]" value={str("reason")} onChange={(e) => set("reason", e.target.value)} />
          </Field>
          {foot(() => run(() => cancelSubscriptionAction(s.id, { when: str("when"), date: str("date"), reason: str("reason") })), true)}
        </div>
      </Modal>

      <Modal open={open === "billing"} onClose={() => setOpen(null)} title={t.a.startBilling}>
        <div className="grid gap-3 text-sm">
          <p className="text-xs text-os-muted">{t.billingFrom}</p>
          <Field label={t.dueDays}>
            <input className="os-input" type="number" min={0} max={365} dir="ltr" value={str("dueDays")} onChange={(e) => set("dueDays", e.target.value)} />
          </Field>
          <Field label={t.language}>
            <select className="os-input" value={str("language")} onChange={(e) => set("language", e.target.value)}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </Field>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(v.autoIssue)} onChange={(e) => setV((o) => ({ ...o, autoIssue: e.target.checked, autoSend: e.target.checked && Boolean(o.autoSend) }))} /> {t.autoIssue}
          </label>
          <label className={`flex items-center gap-2 ${v.autoIssue ? "" : "opacity-50"}`}>
            <input type="checkbox" disabled={!v.autoIssue} checked={Boolean(v.autoSend)} onChange={(e) => set("autoSend", e.target.checked)} /> {t.autoSend}
          </label>
          {Boolean(v.autoSend) && (
            <Field label={t.sendTo}>
              <input className="os-input" type="email" dir="ltr" value={str("sendTo")} onChange={(e) => set("sendTo", e.target.value)} />
            </Field>
          )}
          <Field label={t.paymentTerms}>
            <input className="os-input" value={str("paymentTerms")} onChange={(e) => set("paymentTerms", e.target.value)} />
          </Field>
          {foot(() => run(() => startBillingAction(s.id, v)))}
        </div>
      </Modal>

      <Modal open={open === "note"} onClose={() => setOpen(null)} title={t.a.note}>
        <div className="grid gap-3 text-sm">
          <Field label={t.noteLabel}>
            <textarea className="os-input min-h-[80px]" value={str("note")} onChange={(e) => set("note", e.target.value)} />
          </Field>
          {foot(() => run(() => subscriptionNoteAction(s.id, { note: str("note") })))}
        </div>
      </Modal>
    </div>
  );
}
