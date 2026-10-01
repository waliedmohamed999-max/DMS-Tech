"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/os/action";
import { archiveServiceAction, createServiceAction, savePackageAction, updateServiceAction } from "@/lib/os/sales-actions";
import { Field, Modal, useErrorText } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";

export type ServiceRow = {
  id: string; code: string; key: string | null; nameAr: string; nameEn: string; shortDescriptionAr: string | null; shortDescriptionEn: string | null; descriptionAr: string | null; descriptionEn: string | null;
  category: string | null; pricingModel: string; basePrice: string; currency: string; taxBehavior: string; estimatedDeliveryDays: number | null; departmentId: string | null; active: boolean;
  quotationDescriptionAr: string | null; quotationDescriptionEn: string | null; defaultTermsAr: string | null; defaultTermsEn: string | null;
};
const MODELS = ["FIXED", "HOURLY", "MONTHLY", "ANNUAL", "PER_USER", "PER_UNIT", "CUSTOM"];
const TAX = ["STANDARD", "ZERO_RATED", "EXEMPT"];
type Res = ActionResult<{ id: string } | undefined> | null;

export function ServiceForm({ service, departments, trigger }: { service?: ServiceRow; departments: { id: string; label: string }[]; trigger: "new" | "edit" }) {
  const t = useTranslations("os.sales.s");
  const params = useSearchParams();
  const router = useRouter();
  const errText = useErrorText();
  const [open, setOpen] = useState(trigger === "new" && params.get("new") === "1");
  const [state, action, pending] = useActionState(async (p: Res, fd: FormData) => {
    const r = (service ? await updateServiceAction(p, fd) : await createServiceAction(p, fd)) as Res;
    if (r?.ok) {
      setOpen(false);
      router.refresh();
    }
    return r;
  }, null);
  const v = service;
  const fe = (k: string) => (state && !state.ok && state.field?.[k] ? errText("VALIDATION") : undefined);
  return (
    <>
      <button type="button" className={trigger === "new" ? "os-btn-primary" : "os-btn-ghost h-8 px-2"} onClick={() => setOpen(true)} aria-label={t("edit")}>
        {trigger === "new" ? `+ ${t("new")}` : <Icon name="Pencil" size={14} />}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={service ? `${t("edit")} · ${service.code}` : t("new")} wide>
        <form action={action} className="grid gap-3 sm:grid-cols-2">
          {v && <input type="hidden" name="id" value={v.id} />}
          <Field label={t("f.nameAr")} error={fe("nameAr")}>
            <input name="nameAr" defaultValue={v?.nameAr} required className="os-input" dir="rtl" />
          </Field>
          <Field label={t("f.nameEn")} error={fe("nameEn")}>
            <input name="nameEn" defaultValue={v?.nameEn} required className="os-input" dir="ltr" />
          </Field>
          <Field label={t("f.category")}>
            <input name="category" defaultValue={v?.category ?? ""} className="os-input" />
          </Field>
          <Field label={t("f.key")} hint={t("keyHint")} error={fe("key")}>
            <input name="key" defaultValue={v?.key ?? ""} className="os-input" dir="ltr" />
          </Field>
          <Field label={t("f.pricingModel")}>
            <select name="pricingModel" defaultValue={v?.pricingModel ?? "FIXED"} className="os-input">
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {t(`models.${m}` as "models.FIXED")}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <Field label={t("f.basePrice")} error={fe("basePrice")}>
              <input name="basePrice" defaultValue={v?.basePrice ?? "0"} inputMode="decimal" className="os-input" dir="ltr" />
            </Field>
            <Field label={t("f.currency")}>
              <input name="currency" defaultValue={v?.currency ?? "SAR"} maxLength={3} className="os-input" dir="ltr" />
            </Field>
          </div>
          <Field label={t("f.tax")}>
            <select name="taxBehavior" defaultValue={v?.taxBehavior ?? "STANDARD"} className="os-input">
              {TAX.map((m) => (
                <option key={m} value={m}>
                  {t(`tax.${m}` as "tax.STANDARD")}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("f.days")}>
              <input name="estimatedDeliveryDays" type="number" min={0} defaultValue={v?.estimatedDeliveryDays ?? ""} className="os-input" dir="ltr" />
            </Field>
            <Field label={t("f.department")}>
              <select name="departmentId" defaultValue={v?.departmentId ?? ""} className="os-input">
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t("f.shortAr")}>
            <textarea name="shortDescriptionAr" rows={2} defaultValue={v?.shortDescriptionAr ?? ""} className="os-input" dir="rtl" />
          </Field>
          <Field label={t("f.shortEn")}>
            <textarea name="shortDescriptionEn" rows={2} defaultValue={v?.shortDescriptionEn ?? ""} className="os-input" dir="ltr" />
          </Field>
          <Field label={t("f.quoteDescAr")} hint={t("quoteDescHint")}>
            <textarea name="quotationDescriptionAr" rows={3} defaultValue={v?.quotationDescriptionAr ?? ""} className="os-input" dir="rtl" />
          </Field>
          <Field label={t("f.quoteDescEn")}>
            <textarea name="quotationDescriptionEn" rows={3} defaultValue={v?.quotationDescriptionEn ?? ""} className="os-input" dir="ltr" />
          </Field>
          <Field label={t("f.termsAr")}>
            <textarea name="defaultTermsAr" rows={3} defaultValue={v?.defaultTermsAr ?? ""} className="os-input" dir="rtl" />
          </Field>
          <Field label={t("f.termsEn")}>
            <textarea name="defaultTermsEn" rows={3} defaultValue={v?.defaultTermsEn ?? ""} className="os-input" dir="ltr" />
          </Field>
          {v && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              {/* unchecked boxes send nothing — the hidden value makes "off" explicit (last value wins) */}
              <input type="hidden" name="active" value="false" />
              <input type="checkbox" name="active" defaultChecked={v.active} className="accent-[#624de3]" /> {t("f.active")}
            </label>
          )}
          <p className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-xs text-info sm:col-span-2">{t("snapshotNote")}</p>
          {state && !state.ok && <p className="text-sm text-danger sm:col-span-2">{errText(state.error)}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </button>
            <button className="os-btn-primary" disabled={pending}>
              {t("save")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ArchiveService({ id }: { id: string }) {
  const t = useTranslations("os.sales.s");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="os-btn-ghost h-8 px-2 text-xs" disabled={pending} onClick={() => window.confirm(t("archiveConfirm")) && start(async () => void ((await archiveServiceAction(id)).ok && router.refresh()))}>
      {t("archive")}
    </button>
  );
}

type PkgItem = { serviceId: string; quantity: string; optional: boolean };
export type PackageRow = { id: string; nameAr: string; nameEn: string; descriptionAr: string | null; descriptionEn: string | null; defaultPrice: string; currency: string; taxBehavior: string; active: boolean; items: PkgItem[] };

export function PackageForm({ pkg, services }: { pkg?: PackageRow; services: { id: string; nameAr: string; nameEn: string }[] }) {
  const t = useTranslations("os.sales.s");
  const locale = useLocale();
  const router = useRouter();
  const errText = useErrorText();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Omit<PackageRow, "id">>(pkg ?? { nameAr: "", nameEn: "", descriptionAr: "", descriptionEn: "", defaultPrice: "0", currency: "SAR", taxBehavior: "STANDARD", active: true, items: [] });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await savePackageAction({ ...f, id: pkg?.id, items: f.items.map((i) => ({ ...i, quantity: Number(i.quantity) })) });
      if (!r.ok) return setError(errText(r.error));
      setOpen(false);
      router.refresh();
    });
  return (
    <>
      <button type="button" className={pkg ? "os-btn-ghost h-8 px-2" : "os-btn-secondary"} onClick={() => setOpen(true)}>
        {pkg ? <Icon name="Pencil" size={14} /> : `+ ${t("newPackage")}`}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={pkg ? t("editPackage") : t("newPackage")} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("f.nameAr")}>
            <input className="os-input" dir="rtl" value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} />
          </Field>
          <Field label={t("f.nameEn")}>
            <input className="os-input" dir="ltr" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} />
          </Field>
          <Field label={t("f.descAr")}>
            <textarea className="os-input" rows={2} dir="rtl" value={f.descriptionAr ?? ""} onChange={(e) => setF({ ...f, descriptionAr: e.target.value })} />
          </Field>
          <Field label={t("f.descEn")}>
            <textarea className="os-input" rows={2} dir="ltr" value={f.descriptionEn ?? ""} onChange={(e) => setF({ ...f, descriptionEn: e.target.value })} />
          </Field>
          <Field label={t("f.defaultPrice")}>
            <input className="os-input" dir="ltr" inputMode="decimal" value={f.defaultPrice} onChange={(e) => setF({ ...f, defaultPrice: e.target.value })} />
          </Field>
          <Field label={t("f.tax")}>
            <select className="os-input" value={f.taxBehavior} onChange={(e) => setF({ ...f, taxBehavior: e.target.value })}>
              {TAX.map((m) => (
                <option key={m} value={m}>
                  {t(`tax.${m}` as "tax.STANDARD")}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <span className="os-label mb-0">{t("pkgItems")}</span>
              <select className="os-input h-8 w-auto py-0 text-xs" value="" onChange={(e) => e.target.value && !f.items.some((i) => i.serviceId === e.target.value) && setF({ ...f, items: [...f.items, { serviceId: e.target.value, quantity: "1", optional: false }] })}>
                <option value="">+ {t("addService")}</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {locale === "ar" ? s.nameAr : s.nameEn}
                  </option>
                ))}
              </select>
            </div>
            {f.items.map((i, n) => {
              const s = services.find((x) => x.id === i.serviceId);
              return (
                <div key={i.serviceId} className="grid grid-cols-[1fr_70px_auto_32px] items-center gap-2 rounded-lg border border-os-line bg-os-panel p-2 text-sm">
                  <span className="truncate">{s ? (locale === "ar" ? s.nameAr : s.nameEn) : i.serviceId}</span>
                  <input className="os-input h-8" dir="ltr" value={i.quantity} onChange={(e) => setF({ ...f, items: f.items.map((x, j) => (j === n ? { ...x, quantity: e.target.value } : x)) })} />
                  <label className="flex items-center gap-1 text-xs text-os-muted">
                    <input type="checkbox" checked={i.optional} className="accent-[#624de3]" onChange={(e) => setF({ ...f, items: f.items.map((x, j) => (j === n ? { ...x, optional: e.target.checked } : x)) })} /> {t("optional")}
                  </label>
                  <button type="button" className="os-btn-ghost size-8 px-0 text-danger" onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== n) })} aria-label="remove">
                    <Icon name="X" size={14} />
                  </button>
                </div>
              );
            })}
          </div>
          {pkg && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={f.active} className="accent-[#624de3]" onChange={(e) => setF({ ...f, active: e.target.checked })} /> {t("f.active")}
            </label>
          )}
          {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending || !f.items.length} onClick={save}>
              {t("save")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
