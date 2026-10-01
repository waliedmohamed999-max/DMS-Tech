"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/os/action";
import {
  acceptQuotationAction,
  cancelQuotationAction,
  createContractAction,
  duplicateQuotationAction,
  rejectQuotationAction,
  reopenQuotationAction,
  reviewQuotationAction,
  reviseQuotationAction,
  sendQuotationAction,
  submitQuotationAction,
  viewedQuotationAction,
  withdrawQuotationAction
} from "@/lib/os/sales-actions";
import { Field, Modal, useErrorText } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";

export type QuoteCan = { edit: boolean; submit: boolean; send: boolean; accept: boolean; reject: boolean; cancel: boolean; create: boolean; contract: boolean; markWon: boolean };

function B({ onClick, children, primary, danger, disabled }: { onClick: () => void; children: React.ReactNode; primary?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={primary ? "os-btn-primary" : danger ? "os-btn-ghost text-danger" : "os-btn-secondary"}>
      {children}
    </button>
  );
}

export default function QuoteActions({
  id,
  versionId,
  status,
  isCurrent,
  can,
  hasOpenOpportunity,
  contractId
}: {
  id: string;
  versionId: string;
  status: string;
  isCurrent: boolean;
  can: QuoteCan;
  hasOpenOpportunity: boolean;
  contractId: string | null;
}) {
  const t = useTranslations("os.sales.qa");
  const ts = useTranslations("os.sales");
  const router = useRouter();
  const errText = useErrorText();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "send" | "accept" | "reject" | "cancel">(null);
  const [method, setMethod] = useState("EMAIL_MANUAL");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [won, setWon] = useState(true);

  const err = (code: string) => (ts.has(`errors.${code}`) ? ts(`errors.${code}` as "errors.QUOTE_NEEDS_ITEMS") : errText(code));
  const run = (fn: () => Promise<ActionResult<unknown>>, after?: (r: ActionResult<unknown>) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(err(r.error));
      setModal(null);
      setNote("");
      setConfirm(false);
      after?.(r);
      router.refresh();
    });
  const openModal = (m: typeof modal) => {
    setError(null);
    setNote("");
    setConfirm(false);
    setModal(m);
  };
  const go = (r: ActionResult<unknown>) => {
    const d = r.ok ? (r.data as { id?: string } | undefined) : undefined;
    if (d?.id) router.push(`/app/sales/quotations/${d.id}`);
  };

  if (!isCurrent) return null;

  return (
    <div className="grid justify-items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        {status === "DRAFT" && can.edit && (
          <Link href={`/app/sales/quotations/${id}/edit`} className="os-btn-secondary">
            <Icon name="Pencil" size={14} /> {t("edit")}
          </Link>
        )}
        {status === "DRAFT" && can.edit && <B disabled={pending} onClick={() => run(() => reviewQuotationAction(id))}>{t("review")}</B>}
        {(status === "DRAFT" || status === "INTERNAL_REVIEW") && can.submit && (
          <B disabled={pending} primary onClick={() => run(() => submitQuotationAction(id))}>
            {t("submit")}
          </B>
        )}
        {status === "INTERNAL_REVIEW" && can.edit && <B disabled={pending} onClick={() => run(() => reopenQuotationAction(id))}>{t("backToDraft")}</B>}
        {status === "PENDING_APPROVAL" && can.submit && <B disabled={pending} onClick={() => run(() => withdrawQuotationAction(id))}>{t("withdraw")}</B>}
        {status === "APPROVED" && can.send && (
          <B disabled={pending} primary onClick={() => openModal("send")}>
            <Icon name="Send" size={14} /> {t("send")}
          </B>
        )}
        {status === "APPROVED" && can.edit && <B disabled={pending} onClick={() => window.confirm(t("reopenConfirm")) && run(() => reopenQuotationAction(id))}>{t("reopen")}</B>}
        {status === "SENT" && can.send && <B disabled={pending} onClick={() => run(() => viewedQuotationAction(id))}>{t("viewed")}</B>}
        {(status === "SENT" || status === "VIEWED") && can.accept && (
          <B disabled={pending} primary onClick={() => openModal("accept")}>
            <Icon name="CircleCheck" size={14} /> {t("accept")}
          </B>
        )}
        {(status === "SENT" || status === "VIEWED") && can.reject && <B disabled={pending} onClick={() => openModal("reject")}>{t("clientRejected")}</B>}
        {["SENT", "VIEWED", "REJECTED", "EXPIRED"].includes(status) && can.edit && <B disabled={pending} onClick={() => run(() => reviseQuotationAction(id))}>{t("revise")}</B>}
        {status === "ACCEPTED" && !contractId && can.contract && (
          <B disabled={pending} primary onClick={() => run(() => createContractAction(id), (r) => r.ok && router.push(`/app/sales/contracts/${(r.data as { id: string }).id}`))}>
            <Icon name="Handshake" size={14} /> {t("createContract")}
          </B>
        )}
        {status === "ACCEPTED" && contractId && (
          <Link href={`/app/sales/contracts/${contractId}`} className="os-btn-secondary">
            <Icon name="Handshake" size={14} /> {t("openContract")}
          </Link>
        )}
        {can.create && <B disabled={pending} onClick={() => window.confirm(t("duplicateConfirm")) && run(() => duplicateQuotationAction(id), go)}>{t("duplicate")}</B>}
        {!["ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED", "SUPERSEDED"].includes(status) && can.cancel && (
          <B disabled={pending} danger onClick={() => openModal("cancel")}>
            {t("cancel")}
          </B>
        )}
      </div>
      {error && !modal && <p className="max-w-md rounded-md border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">{error}</p>}

      <Modal open={modal === "send"} onClose={() => setModal(null)} title={t("sendTitle")}>
        <div className="grid gap-3 text-sm">
          <p className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">{t("sendNote")}</p>
          <Field label={t("method")}>
            <select className="os-input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {["EMAIL_MANUAL", "WHATSAPP_MANUAL", "IN_PERSON", "OTHER"].map((m) => (
                <option key={m} value={m}>
                  {t(`methods.${m}` as "methods.OTHER")}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("noteOptional")}>
            <textarea className="os-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <label className="flex items-start gap-2 text-xs text-os-muted">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 accent-[#624de3]" /> {t("sendConfirm")}
          </label>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={() => setModal(null)}>
              {t("close")}
            </button>
            <button type="button" className="os-btn-primary" disabled={!confirm || pending} onClick={() => run(() => sendQuotationAction(id, method, note))}>
              {t("markSent")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === "accept"} onClose={() => setModal(null)} title={t("acceptTitle")}>
        <div className="grid gap-3 text-sm">
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">{t("acceptNote")}</p>
          <Field label={t("noteOptional")}>
            <textarea className="os-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("acceptPlaceholder")} />
          </Field>
          {hasOpenOpportunity && can.markWon && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={won} onChange={(e) => setWon(e.target.checked)} className="accent-[#624de3]" /> {t("markWon")}
            </label>
          )}
          <label className="flex items-start gap-2 text-xs text-os-muted">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 accent-[#624de3]" /> {t("acceptConfirm")}
          </label>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={() => setModal(null)}>
              {t("close")}
            </button>
            <button type="button" className="os-btn-primary" disabled={!confirm || pending} onClick={() => run(() => acceptQuotationAction(id, versionId, note, won && hasOpenOpportunity))}>
              {t("recordAcceptance")}
            </button>
          </div>
        </div>
      </Modal>

      {(["reject", "cancel"] as const).map((k) => (
        <Modal key={k} open={modal === k} onClose={() => setModal(null)} title={t(k === "reject" ? "rejectTitle" : "cancelTitle")}>
          <div className="grid gap-3">
            <textarea className="os-input" rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("reasonPlaceholder")} />
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="os-btn-ghost" onClick={() => setModal(null)}>
                {t("close")}
              </button>
              <button
                type="button"
                className="os-btn-danger"
                disabled={note.trim().length < 3 || pending}
                onClick={() => run(() => (k === "reject" ? rejectQuotationAction(id, note.trim()) : cancelQuotationAction(id, note.trim())))}
              >
                {t("confirm")}
              </button>
            </div>
          </div>
        </Modal>
      ))}
    </div>
  );
}
