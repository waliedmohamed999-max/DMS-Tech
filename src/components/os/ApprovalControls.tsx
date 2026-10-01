"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { decideApprovalAction } from "@/lib/os/actions";
import { Modal, useErrorText } from "./client";

/** Approve / reject buttons for one approval. Rejection requires a reason (enforced server-side too). */
export default function ApprovalControls({ approvalId, compact }: { approvalId: string; compact?: boolean }) {
  const t = useTranslations("os");
  const router = useRouter();
  const err = useErrorText();
  const [pending, start] = useTransition();
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<"APPROVED" | "REJECTED">();

  const decide = (decision: "APPROVED" | "REJECTED") =>
    start(async () => {
      const r = await decideApprovalAction(approvalId, decision, decision === "REJECTED" ? reason : undefined);
      if (r.ok) {
        setDone(decision);
        setReject(false);
        router.refresh();
      } else setError(r.error);
    });

  if (done) return <span className={`text-xs font-medium ${done === "APPROVED" ? "text-success" : "text-danger"}`}>{t(done === "APPROVED" ? "approvals.approved" : "approvals.rejected")}</span>;

  const size = compact ? "h-7 px-2.5 text-xs" : "";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <button type="button" disabled={pending} onClick={() => decide("APPROVED")} className={`os-btn-success ${size}`}>
        {t("common.approve")}
      </button>
      <button type="button" disabled={pending} onClick={() => setReject(true)} className={`os-btn-danger ${size}`}>
        {t("common.reject")}
      </button>
      {error && !reject && <span className="text-xs text-danger">{err(error)}</span>}
      <Modal open={reject} onClose={() => setReject(false)} title={t("approvals.rejectTitle")}>
        <div className="grid gap-3">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder={t("approvals.rejectPlaceholder")} className="os-input" />
          {error && <p className="text-xs text-danger">{err(error)}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setReject(false)} className="os-btn-ghost">
              {t("common.cancel")}
            </button>
            <button type="button" disabled={pending || !reason.trim()} onClick={() => decide("REJECTED")} className="os-btn-danger">
              {t("common.reject")}
            </button>
          </div>
        </div>
      </Modal>
    </span>
  );
}
