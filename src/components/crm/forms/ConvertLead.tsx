"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/os/action";
import { clientOptionsAction, convertLeadAction } from "@/lib/os/crm-actions";
import { Field, Modal } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";
import { type Opt, type Res, useFieldErrors } from "./shared";

export function ConvertLead({ lead, stages, owners }: { lead: { id: string; name: string; companyName: string | null; budgetMax: string | null; budgetMin: string | null; ownerId: string | null }; stages: Opt[]; owners: Opt[] | null }) {
  const t = useTranslations("os");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [clients, setClients] = useState<Opt[] | null>(null);
  const [state, action, pending] = useActionState(async (p: Res, fd: FormData) => {
    const r = (await convertLeadAction(p, fd)) as ActionResult<{ opportunityId: string }>;
    if (r.ok && r.data) {
      setOpen(false);
      router.push(`/app/crm/opportunities/${r.data.opportunityId}`);
    }
    return r as Res;
  }, null);
  const e = useFieldErrors(state);
  useEffect(() => {
    if (!open || mode !== "existing" || clients) return;
    void clientOptionsAction().then((r) => r.ok && r.data && setClients(r.data.map((c) => ({ id: c.id, label: c.label }))));
  }, [open, mode, clients]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="os-btn-primary">
        <Icon name="ArrowRight" size={14} className="rtl:rotate-180" /> {t("crm.a.convert")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("crm.convert.title")} wide>
        <form action={action} className="grid gap-5">
          <input type="hidden" name="leadId" value={lead.id} />
          <p className="rounded-md border border-os-line bg-os-panel px-3 py-2 text-xs text-os-muted">{t("crm.convert.intro")}</p>
          <fieldset className="grid gap-3">
            <legend className="os-label">{t("crm.f.client")}</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {(["new", "existing"] as const).map((m) => (
                <label key={m} className="flex items-center gap-2">
                  <input type="radio" name="clientMode" value={m} checked={mode === m} onChange={() => setMode(m)} className="accent-[#624de3]" />
                  {t(m === "new" ? "crm.convert.clientNew" : "crm.convert.clientExisting")}
                </label>
              ))}
            </div>
            {mode === "new" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("crm.f.displayName")}>
                  <input name="clientName" defaultValue={lead.companyName ?? lead.name} className="os-input" />
                </Field>
                <Field label={t("crm.f.type")}>
                  <select name="clientType" defaultValue={lead.companyName ? "COMPANY" : "INDIVIDUAL"} className="os-input">
                    <option value="COMPANY">{t("crm.clientType.COMPANY")}</option>
                    <option value="INDIVIDUAL">{t("crm.clientType.INDIVIDUAL")}</option>
                  </select>
                </Field>
              </div>
            ) : (
              <Field label={t("crm.convert.pickClient")}>
                <select name="clientId" required className="os-input" defaultValue="">
                  <option value="" disabled>
                    {clients ? "—" : t("common.loading")}
                  </option>
                  {clients?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <label className="flex items-center gap-2 text-sm">
              {/* unchecked → "none" (the hidden field comes first; a checked box overrides it) */}
              <input type="hidden" name="contactMode" value="none" />
              <input type="checkbox" name="contactMode" value="new" defaultChecked className="accent-[#624de3]" />
              {t("crm.convert.contactNew")}
            </label>
          </fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="os-label sm:col-span-2">{t("crm.convert.oppSection")}</legend>
            <Field label={t("crm.f.title")}>
              <input name="title" placeholder="—" className="os-input" />
            </Field>
            <Field label={t("crm.f.value")} error={e.field("estimatedValue")}>
              <input name="estimatedValue" inputMode="decimal" defaultValue={lead.budgetMax ?? lead.budgetMin ?? ""} dir="ltr" className="os-input" />
            </Field>
            <Field label={t("crm.f.stage")}>
              <select name="stageId" className="os-input" defaultValue="">
                <option value="">—</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("crm.f.expectedClose")}>
              <input name="expectedCloseDate" type="date" className="os-input" />
            </Field>
            {owners && (
              <Field label={t("crm.f.owner")}>
                <select name="ownerId" defaultValue={lead.ownerId ?? ""} className="os-input">
                  <option value="">—</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </fieldset>
          {e.form && <p className="text-sm text-danger">{e.form}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="os-btn-ghost">
              {t("common.cancel")}
            </button>
            <button disabled={pending} className="os-btn-primary">
              {pending ? t("common.saving") : t("crm.convert.submit")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
