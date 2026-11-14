"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { updateLeadAction } from "@/lib/os/crm-actions";
import { Modal } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";
import { type Opt, type Res, useFieldErrors } from "./shared";
import { type LeadValues, LeadFields } from "./LeadFields";

export function LeadEdit({ lead, owners }: { lead: LeadValues; owners: Opt[] | null }) {
  const t = useTranslations("os");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (p: Res, fd: FormData) => {
    const r = (await updateLeadAction(p, fd)) as Res;
    if (r?.ok) {
      setOpen(false);
      router.refresh();
    }
    return r;
  }, null);
  const e = useFieldErrors(state);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="os-btn-secondary">
        <Icon name="Pencil" size={14} /> {t("crm.a.edit")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("crm.a.edit")} wide>
        <form action={action} className="grid gap-4">
          <LeadFields v={lead} owners={owners} field={e.field} isEdit />
          {e.form && <p className="text-sm text-danger">{e.form}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="os-btn-ghost">
              {t("common.cancel")}
            </button>
            <button disabled={pending} className="os-btn-primary">
              {pending ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
