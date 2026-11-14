"use client";

import { useLocale, useTranslations } from "next-intl";
import { LEAD_SOURCES, LEAD_STAGES, PRIORITIES } from "@/lib/crm/services";
import { Field } from "@/components/os/client";
import { type Opt, dtLocal, ServiceSelect, Select } from "./shared";

export type LeadValues = Partial<{
  id: string; name: string; companyName: string | null; email: string | null; phone: string | null; whatsapp: string | null; country: string | null; city: string | null;
  source: string; interestedService: string | null; serviceId: string | null; budgetMin: string | null; budgetMax: string | null; currency: string; ownerId: string | null; priority: string;
  stage: string; nextFollowUpAt: Date | string | null; notes: string | null;
}>;

export function LeadFields({ v, owners, field, isEdit }: { v: LeadValues; owners: Opt[] | null; field: (k: string) => string | undefined; isEdit: boolean }) {
  const t = useTranslations("os.crm");
  const tp = useTranslations("os.priority");
  const locale = useLocale();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <Field label={t("f.name")} error={field("name")}>
        <input name="name" defaultValue={v.name} required className="os-input" />
      </Field>
      <Field label={t("f.company")}>
        <input name="companyName" defaultValue={v.companyName ?? ""} className="os-input" />
      </Field>
      <Field label={t("f.email")} error={field("email")}>
        <input name="email" type="email" defaultValue={v.email ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.phone")} error={field("phone")}>
        <input name="phone" type="tel" defaultValue={v.phone ?? ""} dir="ltr" placeholder="05xxxxxxxx" className="os-input" />
      </Field>
      <Field label={t("f.whatsapp")} error={field("whatsapp")}>
        <input name="whatsapp" type="tel" defaultValue={v.whatsapp ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.city")}>
        <input name="city" defaultValue={v.city ?? ""} className="os-input" />
      </Field>
      <Field label={t("f.source")}>
        <Select name="source" value={v.source ?? "MANUAL"} options={LEAD_SOURCES.map((s) => ({ value: s, label: t(`source.${s}`) }))} />
      </Field>
      <Field label={t("f.service")}>
        <ServiceSelect value={v.serviceId} />
      </Field>
      <Field label={t("f.budgetMin")} error={field("budgetMin")}>
        <input name="budgetMin" inputMode="decimal" defaultValue={v.budgetMin ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.budgetMax")} error={field("budgetMax")}>
        <input name="budgetMax" inputMode="decimal" defaultValue={v.budgetMax ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("f.priority")}>
        <Select name="priority" value={v.priority ?? "MEDIUM"} options={PRIORITIES.map((p) => ({ value: p, label: tp(p) }))} />
      </Field>
      {isEdit && (
        <Field label={t("f.stage")}>
          <Select name="stage" value={v.stage ?? "NEW"} options={LEAD_STAGES.map((s) => ({ value: s, label: t(`leadStage.${s}`) }))} />
        </Field>
      )}
      <Field label={t("f.followUp")}>
        <input name="nextFollowUpAt" type="datetime-local" defaultValue={dtLocal(v.nextFollowUpAt)} className="os-input" />
      </Field>
      {owners && (
        <Field label={t("f.owner")}>
          <Select name="ownerId" value={v.ownerId} empty={t("f.unassigned")} options={owners.map((o) => ({ value: o.id, label: o.label }))} />
        </Field>
      )}
      <div className="sm:col-span-2">
        <Field label={t("f.notes")}>
          <textarea name="notes" rows={3} defaultValue={v.notes ?? ""} className="os-input" />
        </Field>
      </div>
    </div>
  );
}
