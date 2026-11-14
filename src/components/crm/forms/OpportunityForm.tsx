"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { clientOptionsAction, createOpportunityAction, updateOpportunityAction } from "@/lib/os/crm-actions";
import { Field, Modal } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";
import { type Opt, type Res, dtLocal, dateOnly, useFieldErrors, useCreateModal, ServiceSelect, Select } from "./shared";

type OppValues = Partial<{ id: string; title: string; description: string | null; serviceCategory: string | null; serviceId: string | null; estimatedValue: string; currency: string; probability: number; primaryContactId: string | null; ownerId: string | null; expectedCloseDate: Date | string | null; nextFollowUpAt: Date | string | null }>;

export function OpportunityForm({ opp, owners, fixedClientId, contacts, trigger, stages }: { opp?: OppValues; owners: Opt[] | null; fixedClientId?: string; contacts?: Opt[]; trigger: "new" | "edit" | "newAuto"; stages?: Opt[] }) {
  const t = useTranslations("os");
  const locale = useLocale();
  const router = useRouter();
  const m = useCreateModal(trigger === "newAuto" ? "new" : null, (id) => `/app/crm/opportunities/${id}`);
  const [clients, setClients] = useState<{ id: string; label: string; contacts: (Opt & { isPrimary: boolean })[] }[] | null>(null);
  const [clientId, setClientId] = useState(fixedClientId ?? "");
  const [, start] = useTransition();
  useEffect(() => {
    if (!m.open || fixedClientId || clients || opp?.id) return;
    start(async () => {
      const r = await clientOptionsAction();
      if (r.ok && r.data) setClients(r.data);
    });
  }, [m.open, fixedClientId, clients, opp?.id]);
  const [state, action, pending] = useActionState(async (p: Res, fd: FormData) => {
    const r = (opp?.id ? await updateOpportunityAction(p, fd) : await createOpportunityAction(p, fd)) as Res;
    if (r?.ok) {
      if (opp?.id) {
        m.close();
        router.refresh();
      } else m.done(r);
    }
    return r;
  }, null);
  const e = useFieldErrors(state);
  const v = opp ?? {};
  const contactOpts = contacts ?? clients?.find((c) => c.id === clientId)?.contacts ?? [];
  return (
    <>
      <button type="button" onClick={() => m.setOpen(true)} className={trigger === "edit" ? "os-btn-secondary" : "os-btn-primary"}>
        {trigger === "edit" ? (
          <>
            <Icon name="Pencil" size={14} /> {t("crm.a.edit")}
          </>
        ) : (
          `+ ${t("crm.a.newOpportunity")}`
        )}
      </button>
      <Modal open={m.open} onClose={m.close} title={trigger === "edit" ? t("crm.a.edit") : t("crm.a.newOpportunity")} wide>
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          {v.id && <input type="hidden" name="id" value={v.id} />}
          {!v.id &&
            (fixedClientId ? (
              <input type="hidden" name="clientId" value={fixedClientId} />
            ) : (
              <div className="sm:col-span-2">
                <Field label={t("crm.f.client")} error={e.field("clientId")}>
                  <select name="clientId" required value={clientId} onChange={(ev) => setClientId(ev.target.value)} className="os-input">
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
              </div>
            ))}
          <div className="sm:col-span-2">
            <Field label={t("crm.f.title")} error={e.field("title")}>
              <input name="title" defaultValue={v.title} required className="os-input" />
            </Field>
          </div>
          <Field label={t("crm.f.service")}>
            <ServiceSelect value={v.serviceId} />
          </Field>
          <Field label={t("crm.f.value")} error={e.field("estimatedValue")}>
            <input name="estimatedValue" inputMode="decimal" defaultValue={v.estimatedValue ?? ""} dir="ltr" className="os-input" />
          </Field>
          {v.id && (
            <Field label={`${t("crm.f.probability")} %`} error={e.field("probability")}>
              <input name="probability" type="number" min={0} max={100} defaultValue={v.probability} dir="ltr" className="os-input" />
            </Field>
          )}
          {!v.id && stages && (
            <Field label={t("crm.f.stage")}>
              <Select name="stageId" empty="—" options={stages.map((s) => ({ value: s.id, label: s.label }))} />
            </Field>
          )}
          <Field label={t("crm.f.contact")}>
            <Select name="primaryContactId" value={v.primaryContactId} empty="—" options={contactOpts.map((c) => ({ value: c.id, label: c.label }))} />
          </Field>
          <Field label={t("crm.f.expectedClose")}>
            <input name="expectedCloseDate" type="date" defaultValue={dateOnly(v.expectedCloseDate)} className="os-input" />
          </Field>
          <Field label={t("crm.f.followUp")}>
            <input name="nextFollowUpAt" type="datetime-local" defaultValue={dtLocal(v.nextFollowUpAt)} className="os-input" />
          </Field>
          {owners && (
            <Field label={t("crm.f.owner")}>
              <Select name="ownerId" value={v.ownerId} options={owners.map((o) => ({ value: o.id, label: o.label }))} />
            </Field>
          )}
          <div className="sm:col-span-2">
            <Field label={t("crm.f.description")}>
              <textarea name="description" rows={3} defaultValue={v.description ?? ""} className="os-input" />
            </Field>
          </div>
          {e.form && <p className="text-sm text-danger sm:col-span-2">{e.form}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={m.close} className="os-btn-ghost">
              {t("common.cancel")}
            </button>
            <button disabled={pending} className="os-btn-primary">
              {pending ? t("common.saving") : v.id ? t("common.save") : t("common.create")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
