"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/os/action";
import { Modal, useErrorText } from "@/components/os/client";

/** Run a server action, translate its error code, refresh the RSC tree on success. */
export function useRun() {
  const tp = useTranslations("os.projects");
  const errText = useErrorText();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const text = (code: string) => (tp.has(`errors.${code}`) ? tp(`errors.${code}` as "errors.REASON_REQUIRED") : errText(code));
  const run = (fn: () => Promise<ActionResult<unknown>>, done?: (r: ActionResult<unknown>) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(text(r.error));
      done?.(r);
      router.refresh();
    });
  return { pending, error, setError, run, text };
}

/** Small modal that asks for a (required) reason or note. */
export function ReasonModal({ open, title, hint, minLength = 3, confirmLabel, danger, onClose, onConfirm, pending, error }: { open: boolean; title: string; hint?: string; minLength?: number; confirmLabel: string; danger?: boolean; onClose: () => void; onConfirm: (reason: string) => void; pending?: boolean; error?: string | null }) {
  const t = useTranslations("os.projects");
  const [v, setV] = useState("");
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="grid gap-3">
        {hint && <p className="text-xs text-os-muted">{hint}</p>}
        <textarea className="os-input" rows={3} autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={t("reasonPh")} />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="os-btn-ghost" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="button" className={danger ? "os-btn-danger" : "os-btn-primary"} disabled={pending || v.trim().length < minLength} onClick={() => onConfirm(v.trim())}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export const dateValue = (d?: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
