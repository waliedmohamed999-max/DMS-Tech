"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createDependencyAction, dependencyStatusAction } from "@/lib/os/project-actions";
import { Field, Modal } from "@/components/os/client";
import { ReasonModal, useRun } from "../shared";

const DEP_TYPES = ["CONTENT", "BRAND_ASSETS", "ACCESS", "CREDENTIALS", "DATA", "APPROVAL", "FEEDBACK", "OTHER"];

export function DependencyForm({ projectId }: { projectId: string }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", description: "", type: "CONTENT", ownerSide: "CLIENT", critical: false, dueDate: "" });
  return (
    <>
      <button type="button" className="os-btn-secondary h-8 px-3 text-xs" onClick={() => setOpen(true)}>
        + {t("newDependency")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("newDependency")} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={t("f.title")}>
              <input className="os-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t("dependencyPh")} />
            </Field>
          </div>
          <Field label={t("f.depType")}>
            <select className="os-input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {DEP_TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`depType.${x}` as "depType.OTHER")}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.side")}>
            <select className="os-input" value={f.ownerSide} onChange={(e) => setF({ ...f, ownerSide: e.target.value })}>
              {["CLIENT", "INTERNAL", "THIRD_PARTY"].map((x) => (
                <option key={x} value={x}>
                  {t(`side.${x}` as "side.CLIENT")}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.due")}>
            <input type="date" className="os-input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={f.critical} onChange={(e) => setF({ ...f, critical: e.target.checked })} className="accent-[#624de3]" /> {t("f.critical")}
          </label>
          {error && <p className="text-xs text-danger sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending || f.title.trim().length < 2} onClick={() => run(() => createDependencyAction(projectId, { ...f, dueDate: f.dueDate || null }), () => setOpen(false))}>
              {t("create")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function DependencyActions({ id, status }: { id: string; status: string }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  const [resolve, setResolve] = useState(false);
  const open = status === "OPEN" || status === "WAITING";
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      {status === "OPEN" && (
        <button type="button" className="os-btn-ghost h-7 px-2 text-[11px]" disabled={pending} onClick={() => run(() => dependencyStatusAction(id, "WAITING"))}>
          {t("depWaiting")}
        </button>
      )}
      {open && (
        <button type="button" className="os-btn-secondary h-7 px-2 text-[11px]" disabled={pending} onClick={() => setResolve(true)}>
          {t("depResolve")}
        </button>
      )}
      {open && (
        <button type="button" className="os-btn-ghost h-7 px-2 text-[11px] text-os-faint" disabled={pending} onClick={() => run(() => dependencyStatusAction(id, "CANCELLED"))}>
          {t("cancel")}
        </button>
      )}
      {!open && (
        <button type="button" className="os-btn-ghost h-7 px-2 text-[11px]" disabled={pending} onClick={() => run(() => dependencyStatusAction(id, "OPEN"))}>
          {t("reopen")}
        </button>
      )}
      {error && <span className="w-full text-end text-[11px] text-danger">{error}</span>}
      <ReasonModal open={resolve} title={t("depResolveTitle")} minLength={0} confirmLabel={t("depResolve")} pending={pending} error={error} onClose={() => setResolve(false)} onConfirm={(note) => run(() => dependencyStatusAction(id, "RESOLVED", note || undefined), () => setResolve(false))} />
    </span>
  );
}
