"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContactAction, updateContactAction } from "@/lib/os/crm-actions";
import { Field, Modal } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";
import { type Opt, type Res, useFieldErrors, useCreateModal, Select } from "./shared";

type ContactValues = Partial<{ id: string; clientId: string | null; firstName: string; lastName: string | null; jobTitle: string | null; email: string | null; phone: string | null; whatsapp: string | null; isPrimary: boolean; preferredLanguage: string; notes: string | null }>;

export function ContactForm({ contact, clients, fixedClientId, trigger }: { contact?: ContactValues; clients?: Opt[]; fixedClientId?: string; trigger: "new" | "edit" | "newAuto" }) {
  const t = useTranslations("os");
  const router = useRouter();
  const m = useCreateModal(trigger === "newAuto" ? "new" : null, () => "");
  const [state, action, pending] = useActionState(async (p: Res, fd: FormData) => {
    const r = (contact?.id ? await updateContactAction(p, fd) : await createContactAction(p, fd)) as Res;
    if (r?.ok) {
      m.close();
      router.refresh();
    }
    return r;
  }, null);
  const e = useFieldErrors(state);
  const v = contact ?? {};
  return (
    <>
      <button type="button" onClick={() => m.setOpen(true)} className={trigger === "edit" ? "os-btn-ghost h-8 px-2 text-xs" : "os-btn-primary"}>
        {trigger === "edit" ? <Icon name="Pencil" size={13} /> : `+ ${t("crm.a.newContact")}`}
      </button>
      <Modal open={m.open} onClose={m.close} title={trigger === "edit" ? t("crm.a.edit") : t("crm.a.newContact")} wide>
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          {v.id && <input type="hidden" name="id" value={v.id} />}
          {fixedClientId ? (
            <input type="hidden" name="clientId" value={fixedClientId} />
          ) : (
            <div className="sm:col-span-2">
              <Field label={t("crm.f.client")}>
                <Select name="clientId" value={v.clientId} empty={t("crm.contacts.noClient")} options={(clients ?? []).map((c) => ({ value: c.id, label: c.label }))} />
              </Field>
            </div>
          )}
          <Field label={t("crm.f.firstName")} error={e.field("firstName")}>
            <input name="firstName" defaultValue={v.firstName} required className="os-input" />
          </Field>
          <Field label={t("crm.f.lastName")}>
            <input name="lastName" defaultValue={v.lastName ?? ""} className="os-input" />
          </Field>
          <Field label={t("crm.f.jobTitle")}>
            <input name="jobTitle" defaultValue={v.jobTitle ?? ""} className="os-input" />
          </Field>
          <Field label={t("crm.f.email")} error={e.field("email")}>
            <input name="email" type="email" defaultValue={v.email ?? ""} dir="ltr" className="os-input" />
          </Field>
          <Field label={t("crm.f.phone")} error={e.field("phone")}>
            <input name="phone" defaultValue={v.phone ?? ""} dir="ltr" className="os-input" />
          </Field>
          <Field label={t("crm.f.whatsapp")} error={e.field("whatsapp")}>
            <input name="whatsapp" defaultValue={v.whatsapp ?? ""} dir="ltr" className="os-input" />
          </Field>
          <Field label={t("crm.f.language")}>
            <select name="preferredLanguage" defaultValue={v.preferredLanguage ?? "ar"} className="os-input">
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="isPrimary" value="true" defaultChecked={v.isPrimary} className="accent-[#624de3]" />
            {t("crm.f.primary")}
          </label>
          {e.form && <p className="text-sm text-danger sm:col-span-2">{e.form}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={m.close} className="os-btn-ghost">
              {t("common.cancel")}
            </button>
            <button disabled={pending} className="os-btn-primary">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
