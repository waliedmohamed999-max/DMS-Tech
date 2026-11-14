"use client";

import { useTranslations } from "next-intl";
import { Field } from "@/components/os/client";
import { type Opt, Select } from "./shared";

export type ClientValues = Partial<Record<"id" | "displayName" | "companyName" | "nameAr" | "nameEn" | "email" | "phone" | "whatsapp" | "website" | "city" | "address" | "industry" | "taxNumber" | "commercialRegistration" | "notes" | "type" | "status" | "ownerId", string | null>>;

export function ClientFields({ v, field, owners, isEdit }: { v: ClientValues; field: (k: string) => string | undefined; owners: Opt[] | null; isEdit: boolean }) {
  const t = useTranslations("os.crm");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <Field label={t("f.displayName")} error={field("displayName")}>
        <input name="displayName" defaultValue={v.displayName ?? ""} required className="os-input" />
      </Field>
      <Field label={t("f.type")}>
        <select name="type" defaultValue={v.type ?? "COMPANY"} className="os-input">
          <option value="COMPANY">{t("clientType.COMPANY")}</option>
          <option value="INDIVIDUAL">{t("clientType.INDIVIDUAL")}</option>
        </select>
      </Field>
      <Field label={t("f.nameAr")}>
        <input name="nameAr" defaultValue={v.nameAr ?? ""} className="os-input" />
      </Field>
      <Field label={t("f.nameEn")}>
        <input name="nameEn" defaultValue={v.nameEn ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.email")} error={field("email")}>
        <input name="email" type="email" defaultValue={v.email ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.phone")} error={field("phone")}>
        <input name="phone" defaultValue={v.phone ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.whatsapp")} error={field("whatsapp")}>
        <input name="whatsapp" defaultValue={v.whatsapp ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.website")} error={field("website")}>
        <input name="website" defaultValue={v.website ?? ""} dir="ltr" placeholder="https://" className="os-input" />
      </Field>
      <Field label={t("f.city")}>
        <input name="city" defaultValue={v.city ?? ""} className="os-input" />
      </Field>
      <Field label={t("f.industry")}>
        <input name="industry" defaultValue={v.industry ?? ""} className="os-input" />
      </Field>
      <Field label={t("f.taxNumber")} error={field("taxNumber")}>
        <input name="taxNumber" defaultValue={v.taxNumber ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.cr")}>
        <input name="commercialRegistration" defaultValue={v.commercialRegistration ?? ""} dir="ltr" className="os-input" />
      </Field>
      {isEdit && (
        <Field label={t("f.status")}>
          <select name="status" defaultValue={v.status ?? "PROSPECT"} className="os-input">
            {(["PROSPECT", "ACTIVE", "INACTIVE"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`clientStatus.${s}`)}
              </option>
            ))}
          </select>
        </Field>
      )}
      {owners && (
        <Field label={t("f.owner")}>
          <Select name="ownerId" value={v.ownerId} options={owners.map((o) => ({ value: o.id, label: o.label }))} />
        </Field>
      )}
      <div className="sm:col-span-2">
        <Field label={t("f.address")}>
          <input name="address" defaultValue={v.address ?? ""} className="os-input" />
        </Field>
      </div>
    </div>
  );
}
