"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { loginAction } from "@/lib/os/actions";

export default function LoginForm({ next }: { next: string }) {
  const t = useTranslations("os.login");
  const [state, action, pending] = useActionState(loginAction, {});
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="grid">
        <span className="os-label">{t("email")}</span>
        <input key={state?.email ?? ""} name="email" type="email" required autoComplete="username" dir="ltr" className="os-input" defaultValue={state?.email} autoFocus={!state?.email} />
      </label>
      <label className="grid">
        <span className="os-label">{t("password")}</span>
        <input name="password" type="password" required autoComplete="current-password" dir="ltr" className="os-input" autoFocus={Boolean(state?.email)} />
      </label>
      {state?.error && (
        <p role="alert" data-login-error className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {t(state.error as "INVALID")}
        </p>
      )}
      <button type="submit" disabled={pending} className="os-btn-primary h-10 w-full">
        {pending ? "…" : t("submit")}
      </button>
    </form>
  );
}
