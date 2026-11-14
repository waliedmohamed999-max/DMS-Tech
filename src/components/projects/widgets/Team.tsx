"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { addMemberAction, removeMemberAction } from "@/lib/os/project-actions";
import { Field, Modal } from "@/components/os/client";
import { useRun } from "../shared";
import { type Opt } from "./shared";

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

const ROLES = ["PROJECT_MANAGER", "TECH_LEAD", "DEVELOPER", "DESIGNER", "MARKETING", "QA", "ACCOUNT_MANAGER", "CONTRIBUTOR", "OBSERVER"];

export function AddMember({ projectId, users }: { projectId: string; users: Opt[] }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ userId: "", role: "DEVELOPER", allocationPercent: "" });
  return (
    <>
      <button type="button" className="os-btn-primary h-8 px-3 text-xs" onClick={() => setOpen(true)}>
        + {t("addMember")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("addMember")}>
        <div className="grid gap-3">
          <Field label={t("f.person")}>
            <select className="os-input" value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}>
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.projectRole")} hint={t("roleHint")}>
            <select className="os-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}` as "roles.DEVELOPER")}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.allocation")} hint={t("allocationHint")}>
            <input type="number" min={0} max={100} dir="ltr" className="os-input" value={f.allocationPercent} onChange={(e) => setF({ ...f, allocationPercent: e.target.value })} />
          </Field>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending || !f.userId} onClick={() => run(() => addMemberAction(projectId, f), () => setOpen(false))}>
              {t("add")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function RemoveMember({ projectId, userId }: { projectId: string; userId: string }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  return (
    <span className="inline-grid">
      <button type="button" className="os-btn-ghost h-7 px-2 text-[11px] text-danger" disabled={pending} onClick={() => window.confirm(t("removeMemberConfirm")) && run(() => removeMemberAction(projectId, userId))}>
        {t("remove")}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}
