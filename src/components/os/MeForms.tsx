"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { changePasswordAction } from "@/lib/os/actions";
import type { ActionResult } from "@/lib/os/action";
import { Field, useErrorText } from "./client";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const t = useTranslations("os");
  const err = useErrorText();
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => {
    const r = await changePasswordAction(prev, fd);
    if (r.ok && forced) router.push("/app");
    return r;
  }, null as ActionResult<void> | null);
  return (
    <form action={action} className="grid gap-4 p-4">
      <Field label={t("me.current")}>
        <input name="current" type="password" required autoComplete="current-password" dir="ltr" className="os-input" />
      </Field>
      <Field label={t("me.newPw")} hint={t("errors.PASSWORD_TOO_SHORT")}>
        <input name="next" type="password" required minLength={10} autoComplete="new-password" dir="ltr" className="os-input" />
      </Field>
      <Field label={t("me.confirm")}>
        <input name="confirm" type="password" required minLength={10} autoComplete="new-password" dir="ltr" className="os-input" />
      </Field>
      <div className="flex items-center justify-end gap-3">
        {state && (state.ok ? <span className="text-xs text-success">{t("me.changed")}</span> : <span className="text-xs text-danger">{err(state.error)}</span>)}
        <button type="submit" disabled={pending} className="os-btn-primary">
          {pending ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </form>
  );
}
