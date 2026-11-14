"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createClientAction } from "@/lib/os/crm-actions";
import { Modal } from "@/components/os/client";
import { type Opt, type Res, useFieldErrors, useCreateModal } from "./shared";
import { ClientFields } from "./ClientFields";

export function ClientCreate({ owners }: { owners: Opt[] | null }) {
  const t = useTranslations("os");
  const m = useCreateModal("new", (id) => `/app/crm/clients/${id}`);
  const [state, action, pending] = useActionState(async (p: Res, fd: FormData) => {
    const r = (await createClientAction(p, fd)) as Res;
    m.done(r);
    return r;
  }, null);
  const e = useFieldErrors(state);
  return (
    <>
      <button type="button" onClick={() => m.setOpen(true)} className="os-btn-primary">
        + {t("crm.a.newClient")}
      </button>
      <Modal open={m.open} onClose={m.close} title={t("crm.a.newClient")} wide>
        <form action={action} className="grid gap-4">
          <ClientFields v={{}} field={e.field} owners={owners} isEdit={false} />
          {e.form && <p className="text-sm text-danger">{e.form}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={m.close} className="os-btn-ghost">
              {t("common.cancel")}
            </button>
            <button disabled={pending} className="os-btn-primary">
              {t("common.create")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
