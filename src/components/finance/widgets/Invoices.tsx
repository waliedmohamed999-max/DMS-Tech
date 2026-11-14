"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/commercial/calc";
import { cancelInvoiceAction, collectionNoteAction, issueInvoiceAction, markInvoiceSentAction, voidInvoiceAction } from "@/lib/os/finance-actions";
import { Field, Modal } from "@/components/os/client";
import { useFinRun } from "../shared";
import { Err } from "./shared";

// ---------------------------------------------------------------------------
// Invoice header actions
// ---------------------------------------------------------------------------

export function InvoiceActions({ id, status, sent, paid, can, total, currency }: { id: string; status: string; sent: boolean; paid: boolean; total: string; currency: string; can: { edit: boolean; issue: boolean; send: boolean; cancel: boolean; pay: boolean; create: boolean } }) {
  const t = useTranslations("os.finance");
  const router = useRouter();
  const { pending, error, run } = useFinRun();
  const [modal, setModal] = useState<null | "issue" | "send" | "cancel" | "void">(null);
  const [method, setMethod] = useState("EMAIL_MANUAL");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [replace, setReplace] = useState(true);
  const close = () => {
    setModal(null);
    setNote("");
    setConfirm(false);
  };
  const open = ["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE"].includes(status);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === "DRAFT" && can.edit && (
        <a href={`/app/finance/invoices/${id}?edit=1`} className="os-btn-ghost">
          {t("a.edit")}
        </a>
      )}
      {status === "DRAFT" && can.issue && (
        <button type="button" className="os-btn-primary" onClick={() => setModal("issue")}>
          {t("a.issue")}
        </button>
      )}
      {!sent && ["ISSUED", "OVERDUE", "PARTIALLY_PAID"].includes(status) && can.send && (
        <button type="button" className="os-btn-secondary" onClick={() => setModal("send")}>
          {t("a.markSent")}
        </button>
      )}
      {open && can.pay && (
        <a href={`/app/finance/payments?new=1&invoice=${id}`} className="os-btn-primary">
          {t("a.recordPayment")}
        </a>
      )}
      {status === "DRAFT" && can.cancel && (
        <button type="button" className="os-btn-ghost text-danger" onClick={() => setModal("cancel")}>
          {t("a.cancel")}
        </button>
      )}
      {["ISSUED", "SENT", "OVERDUE"].includes(status) && !paid && can.cancel && (
        <button type="button" className="os-btn-ghost text-danger" onClick={() => setModal("void")}>
          {t("a.void")}
        </button>
      )}

      <Modal open={modal === "issue"} onClose={close} title={t("a.issue")}>
        <div className="grid gap-3 text-sm">
          <p>{t("issueText", { total: formatMoney(total, "en", currency) })}</p>
          <p className="text-xs text-os-muted">{t("issueNote")}</p>
          <Err e={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={close}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending} onClick={() => run(() => issueInvoiceAction(id), close)}>
              {t("a.issue")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === "send"} onClose={close} title={t("a.markSent")}>
        <div className="grid gap-3 text-sm">
          <p className="text-xs text-os-muted">{t("sendNote")}</p>
          <Field label={t("f.method")}>
            <select className="os-input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {["EMAIL_MANUAL", "WHATSAPP_MANUAL", "IN_PERSON", "PORTAL_MANUAL", "OTHER"].map((m) => (
                <option key={m} value={m}>
                  {t(`send.${m}` as "send.OTHER")}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.note")}>
            <input className="os-input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 accent-[#624de3]" /> {t("sendConfirm")}
          </label>
          <Err e={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={close}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending || !confirm} onClick={() => run(() => markInvoiceSentAction(id, { method, note, confirm: true }), close)}>
              {t("record")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === "cancel" || modal === "void"} onClose={close} title={modal === "void" ? t("a.void") : t("a.cancel")}>
        <div className="grid gap-3 text-sm">
          <p className="text-xs text-os-muted">{modal === "void" ? t("voidNote") : t("cancelNote")}</p>
          <textarea className="os-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("reasonPh")} />
          {modal === "void" && can.create && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="accent-[#624de3]" /> {t("voidReplace")}
            </label>
          )}
          <Err e={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={close}>
              {t("cancel")}
            </button>
            <button
              type="button"
              className="os-btn-danger"
              disabled={pending || note.trim().length < 5}
              onClick={() =>
                modal === "void"
                  ? run(() => voidInvoiceAction(id, note.trim(), replace && can.create), (r) => {
                      close();
                      const rid = r.ok ? (r.data as { replacementId: string | null })?.replacementId : null;
                      if (rid) router.push(`/app/finance/invoices/${rid}?edit=1`);
                    })
                  : run(() => cancelInvoiceAction(id, note.trim()), close)
              }
            >
              {modal === "void" ? t("a.void") : t("a.cancel")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function CollectionNoteForm({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations("os.finance");
  const { pending, error, run } = useFinRun();
  const [f, setF] = useState({ kind: "NOTE", channel: "", note: "", followUpAt: "" });
  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <select className="os-input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label={t("f.kind")}>
          {["NOTE", "REMINDER", "PROMISE_TO_PAY"].map((k) => (
            <option key={k} value={k}>
              {t(`note.${k}` as "note.NOTE")}
            </option>
          ))}
        </select>
        <select className="os-input" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} aria-label={t("f.channel")}>
          <option value="">{t("f.channel")}…</option>
          {["EMAIL", "PHONE", "WHATSAPP", "IN_PERSON", "OTHER"].map((k) => (
            <option key={k} value={k}>
              {t(`channel.${k}` as "channel.OTHER")}
            </option>
          ))}
        </select>
        <input type="date" className="os-input" value={f.followUpAt} onChange={(e) => setF({ ...f, followUpAt: e.target.value })} aria-label={t("f.followUp")} title={t("f.followUp")} />
      </div>
      <textarea className="os-input" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={t("notePh")} />
      <p className="text-[11px] text-os-faint">{t("manualReminderNote")}</p>
      <Err e={error} />
      <button type="button" className="os-btn-secondary h-8 justify-self-end px-3 text-xs" disabled={pending || f.note.trim().length < 2} onClick={() => run(() => collectionNoteAction(invoiceId, { kind: f.kind, channel: f.channel || null, note: f.note, followUpAt: f.followUpAt || null }), () => setF({ ...f, note: "" }))}>
        {t("addNote")}
      </button>
    </div>
  );
}
