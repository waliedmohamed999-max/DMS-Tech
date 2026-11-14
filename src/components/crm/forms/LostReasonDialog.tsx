"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/os/client";

/** Ask for a lost reason (required) before running `onConfirm`. */
export function LostReasonDialog({ open, onClose, onConfirm, pending, error }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void; pending?: boolean; error?: string }) {
  const t = useTranslations("os");
  const [reason, setReason] = useState("");
  return (
    <Modal open={open} onClose={onClose} title={t("crm.lost.title")}>
      <div className="grid gap-3">
        <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder={t("crm.lost.placeholder")} className="os-input" />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="os-btn-ghost">
            {t("common.cancel")}
          </button>
          <button type="button" disabled={pending || reason.trim().length < 3} onClick={() => onConfirm(reason.trim())} className="os-btn-danger">
            {t("crm.a.confirm")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
