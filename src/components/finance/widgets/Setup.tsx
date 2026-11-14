"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { saveCategoryAction, setCostRateAction } from "@/lib/os/finance-actions";
import { Field, Modal } from "@/components/os/client";
import { useFinRun } from "../shared";
import { type Opt, localToday, Err } from "./shared";

export function CategoryForm({ id, initial, trigger }: { id?: string; initial?: { nameAr: string; nameEn: string; active: boolean }; trigger: string }) {
  const t = useTranslations("os.finance");
  const { pending, error, run } = useFinRun();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(initial ?? { nameAr: "", nameEn: "", active: true });
  return (
    <>
      <button type="button" className={id ? "os-btn-ghost h-7 px-2 text-xs" : "os-btn-secondary h-8 px-3 text-xs"} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={trigger}>
        <div className="grid gap-3 text-sm">
          <Field label={t("v.nameAr")}>
            <input className="os-input" dir="rtl" value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} />
          </Field>
          <Field label={t("v.nameEn")}>
            <input className="os-input" dir="ltr" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="accent-[#624de3]" /> {t("active")}
          </label>
          <Err e={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending || f.nameAr.trim().length < 2 || f.nameEn.trim().length < 2} onClick={() => run(() => saveCategoryAction({ id, ...f }), () => setOpen(false))}>
              {t("save")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function CostRateForm({ users, today = localToday() }: { users: Opt[]; today?: string }) {
  const t = useTranslations("os.finance");
  const { pending, error, run } = useFinRun();
  const [f, setF] = useState({ userId: "", hourlyCost: "", effectiveFrom: today });
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_160px_auto] sm:items-end">
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
      <Field label={t("f.hourlyCost")}>
        <input className="os-input" dir="ltr" inputMode="decimal" value={f.hourlyCost} onChange={(e) => setF({ ...f, hourlyCost: e.target.value })} />
      </Field>
      <Field label={t("f.effectiveFrom")}>
        <input type="date" className="os-input" value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} />
      </Field>
      <button type="button" className="os-btn-primary h-9" disabled={pending || !f.userId || !f.hourlyCost} onClick={() => run(() => setCostRateAction(f), () => setF({ ...f, hourlyCost: "" }))}>
        {t("save")}
      </button>
      {error && (
        <div className="sm:col-span-4">
          <Err e={error} />
        </div>
      )}
    </div>
  );
}
