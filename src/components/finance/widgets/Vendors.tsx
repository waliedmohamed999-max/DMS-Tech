"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { archiveVendorAction, createVendorAction, updateVendorAction } from "@/lib/os/finance-actions";
import { Field, Modal } from "@/components/os/client";
import { useFinRun } from "../shared";
import { Err } from "./shared";

// ---------------------------------------------------------------------------
// Vendors, categories, cost rates
// ---------------------------------------------------------------------------

type VendorValue = { name: string; contactName: string; phone: string; email: string; taxNumber: string; category: string; paymentTerms: string; notes: string };

export function VendorForm({ id, initial, trigger, autoOpen }: { id?: string; initial?: VendorValue; trigger: string; autoOpen?: boolean }) {
  const t = useTranslations("os.finance");
  const router = useRouter();
  const { pending, error, run } = useFinRun();
  const [open, setOpen] = useState(Boolean(autoOpen));
  const [f, setF] = useState<VendorValue>(initial ?? { name: "", contactName: "", phone: "", email: "", taxNumber: "", category: "", paymentTerms: "", notes: "" });
  const close = () => {
    setOpen(false);
    if (autoOpen) router.replace("/app/finance/vendors"); // vendors stay on the list page after saving
  };
  const fields: (keyof VendorValue)[] = ["name", "contactName", "phone", "email", "taxNumber", "category", "paymentTerms"];
  return (
    <>
      <button type="button" className={id ? "os-btn-ghost h-7 px-2 text-xs" : "os-btn-primary"} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <Modal open={open} onClose={close} title={trigger}>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          {fields.map((k) => (
            <Field key={k} label={t(`v.${k}` as "v.name")}>
              <input className="os-input" dir={["phone", "email", "taxNumber"].includes(k) ? "ltr" : undefined} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </Field>
          ))}
          <div className="sm:col-span-2">
            <Field label={t("v.notes")}>
              <textarea className="os-input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Err e={error} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="os-btn-ghost" onClick={close}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending || f.name.trim().length < 2} onClick={() => run(() => (id ? updateVendorAction(id, f) : createVendorAction(f)), close)}>
              {t("save")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function ArchiveVendor({ id, archived }: { id: string; archived: boolean }) {
  const t = useTranslations("os.finance");
  const { pending, run } = useFinRun();
  return (
    <button type="button" className="os-btn-ghost h-7 px-2 text-xs" disabled={pending} onClick={() => run(() => archiveVendorAction(id, !archived))}>
      {archived ? t("a.restore") : t("a.archive")}
    </button>
  );
}
