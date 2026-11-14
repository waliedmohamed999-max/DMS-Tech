"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createLeadAction } from "@/lib/os/crm-actions";
import { Modal } from "@/components/os/client";
import { type Opt, type Res, useFieldErrors, useCreateModal } from "./shared";
import { LeadFields } from "./LeadFields";

export function LeadCreate({ owners, autoOpen = true }: { owners: Opt[] | null; autoOpen?: boolean }) {
  const t = useTranslations("os");
  const m = useCreateModal(autoOpen ? "new" : null, (id) => `/app/crm/leads/${id}`);
  const [state, action, pending] = useActionState(async (p: Res, fd: FormData) => {
    const r = (await createLeadAction(p, fd)) as Res;
    m.done(r);
    return r;
  }, null);
  const e = useFieldErrors(state);
  return (
    <>
      <button type="button" onClick={() => m.setOpen(true)} className="os-btn-primary">
        + {t("crm.a.newLead")}
      </button>
      <Modal open={m.open} onClose={m.close} title={t("crm.a.newLead")} wide>
        <form action={action} className="grid gap-4">
          <LeadFields v={{}} owners={owners} field={e.field} isEdit={false} />
          {e.form && <p className="text-sm text-danger">{e.form}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={m.close} className="os-btn-ghost">
              {t("common.cancel")}
            </button>
            <button disabled={pending} className="os-btn-primary">
              {pending ? t("common.saving") : t("common.create")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
