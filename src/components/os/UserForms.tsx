"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createUserAction, resetPasswordAction, setUserRolesAction, setUserStatusAction, updateUserAction } from "@/lib/os/actions";
import type { ActionResult } from "@/lib/os/action";
import { CopyText, Field, Modal, useErrorText } from "./client";

type RoleOpt = { id: string; key: string; label: string; privileged: boolean };
type DeptOpt = { id: string; label: string };

function RolePicker({ roles, selected, onChange }: { roles: RoleOpt[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const t = useTranslations("os.users");
  return (
    <div className="grid max-h-60 gap-1 overflow-y-auto rounded-md border border-os-line-strong bg-os-panel p-1.5 sm:grid-cols-2">
      {roles.map((r) => {
        const on = selected.includes(r.id);
        return (
          <label key={r.id} className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm ${on ? "bg-iris/10" : "hover:bg-os-raised"}`}>
            <input type="checkbox" checked={on} onChange={() => onChange(on ? selected.filter((x) => x !== r.id) : [...selected, r.id])} className="mt-0.5 accent-[#624de3]" />
            <span>
              <span className="block text-os-text">{r.label}</span>
              {r.privileged && <span className="block text-[11px] text-warning">{t("privileged")}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** "New user" button + modal. Opens automatically with ?new=1 (from the Create menu). */
export function NewUserButton({ roles, departments }: { roles: RoleOpt[]; departments: DeptOpt[] }) {
  const t = useTranslations("os");
  const params = useSearchParams();
  const router = useRouter();
  const err = useErrorText();
  const [open, setOpen] = useState(params.get("new") === "1");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [state, action, pending] = useActionState(createUserAction, null as ActionResult<{ id: string; tempPassword: string; pendingRoles: string[] }> | null);
  const result = state?.ok ? state.data : undefined;

  const close = () => {
    setOpen(false);
    setRoleIds([]);
    if (params.get("new")) router.replace("/app/admin/users");
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="os-btn-primary">
        + {t("users.new")}
      </button>
      <Modal open={open} onClose={close} title={t("users.new")} wide>
        {result ? (
          <div className="grid gap-4">
            <p className="text-sm text-success">{t("users.created")}</p>
            <div className="rounded-lg border border-os-line bg-os-panel p-3">
              <p className="os-label">{t("users.tempPassword")}</p>
              <div className="flex items-center justify-between gap-3">
                <code dir="ltr" className="font-mono text-base text-os-text">
                  {result.tempPassword}
                </code>
                <CopyText value={result.tempPassword} label={t("common.copy")} />
              </div>
              <p className="mt-2 text-xs text-os-faint">{t("users.tempPasswordHint")}</p>
            </div>
            {result.pendingRoles.length > 0 && <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">{t("users.pendingRoles", { roles: result.pendingRoles.join(", ") })}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => router.push(`/app/admin/users/${result.id}`)} className="os-btn-secondary">
                {t("common.open")}
              </button>
              <button type="button" onClick={close} className="os-btn-primary">
                {t("common.close")}
              </button>
            </div>
          </div>
        ) : (
          <form action={action} className="grid gap-4 sm:grid-cols-2">
            <Field label={t("common.name")} error={state && !state.ok ? state.field?.name : undefined}>
              <input name="name" required className="os-input" />
            </Field>
            <Field label={t("users.nameAr")}>
              <input name="nameAr" className="os-input" />
            </Field>
            <Field label={t("common.email")} error={state && !state.ok ? state.field?.email : undefined}>
              <input name="email" type="email" required dir="ltr" className="os-input" />
            </Field>
            <Field label={t("users.jobTitle")}>
              <input name="jobTitle" className="os-input" />
            </Field>
            <Field label={t("users.phone")}>
              <input name="phone" dir="ltr" className="os-input" />
            </Field>
            <Field label={t("users.department")}>
              <select name="departmentId" className="os-input" defaultValue="">
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <span className="os-label">{t("users.roles")}</span>
              <RolePicker roles={roles} selected={roleIds} onChange={setRoleIds} />
              {roleIds.map((id) => (
                <input key={id} type="hidden" name="roleIds[]" value={id} />
              ))}
            </div>
            {state && !state.ok && <p className="text-sm text-danger sm:col-span-2">{err(state.error)}</p>}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" onClick={close} className="os-btn-ghost">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={pending || roleIds.length === 0} className="os-btn-primary">
                {pending ? t("common.saving") : t("common.create")}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

export function UserProfileForm({ user, departments }: { user: { id: string; name: string; nameAr: string | null; jobTitle: string | null; phone: string | null; departmentId: string | null; locale: string }; departments: DeptOpt[] }) {
  const t = useTranslations("os");
  const err = useErrorText();
  const [state, action, pending] = useActionState(updateUserAction, null as ActionResult<unknown> | null);
  return (
    <form action={action} className="grid gap-4 p-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={user.id} />
      <Field label={t("common.name")}>
        <input name="name" defaultValue={user.name} required className="os-input" />
      </Field>
      <Field label={t("users.nameAr")}>
        <input name="nameAr" defaultValue={user.nameAr ?? ""} className="os-input" />
      </Field>
      <Field label={t("users.jobTitle")}>
        <input name="jobTitle" defaultValue={user.jobTitle ?? ""} className="os-input" />
      </Field>
      <Field label={t("users.phone")}>
        <input name="phone" defaultValue={user.phone ?? ""} dir="ltr" className="os-input" />
      </Field>
      <Field label={t("users.department")}>
        <select name="departmentId" defaultValue={user.departmentId ?? ""} className="os-input">
          <option value="">—</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Language">
        <select name="locale" defaultValue={user.locale} className="os-input">
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
      </Field>
      <div className="flex items-center justify-end gap-3 sm:col-span-2">
        {state && (state.ok ? <span className="text-xs text-success">{t("common.saved")}</span> : <span className="text-xs text-danger">{err(state.error)}</span>)}
        <button type="submit" disabled={pending} className="os-btn-primary">
          {pending ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </form>
  );
}

export function UserRolesEditor({ userId, roles, current }: { userId: string; roles: RoleOpt[]; current: string[] }) {
  const t = useTranslations("os");
  const err = useErrorText();
  const [sel, setSel] = useState(current);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const dirty = sel.slice().sort().join() !== current.slice().sort().join();
  return (
    <div className="grid gap-3 p-4">
      <RolePicker roles={roles} selected={sel} onChange={setSel} />
      <div className="flex items-center justify-end gap-3">
        {msg && <span className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</span>}
        <button
          type="button"
          disabled={!dirty || pending || sel.length === 0}
          className="os-btn-primary"
          onClick={() =>
            start(async () => {
              const r = await setUserRolesAction(userId, sel);
              if (!r.ok) return setMsg({ ok: false, text: err(r.error) });
              const pendingRoles = (r.data as { pendingApproval: string[] }).pendingApproval;
              setMsg({ ok: true, text: pendingRoles.length ? t("users.pendingRoles", { roles: pendingRoles.join(", ") }) : t("common.saved") });
            })
          }
        >
          {t("users.saveRoles")}
        </button>
      </div>
    </div>
  );
}

export function UserSecurityActions({ userId, status, self }: { userId: string; status: string; self: boolean }) {
  const t = useTranslations("os");
  const err = useErrorText();
  const [pending, start] = useTransition();
  const [temp, setTemp] = useState<string>();
  const [error, setError] = useState<string>();
  if (self) return null;
  return (
    <div className="grid gap-3 p-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className="os-btn-secondary"
          onClick={() => {
            if (!window.confirm(t("users.resetConfirm"))) return;
            start(async () => {
              const r = await resetPasswordAction(userId);
              if (r.ok) setTemp((r.data as { tempPassword: string }).tempPassword);
              else setError(r.error);
            });
          }}
        >
          {t("users.resetPassword")}
        </button>
        <button
          type="button"
          disabled={pending}
          className={status === "DISABLED" ? "os-btn-success" : "os-btn-danger"}
          onClick={() => {
            if (status !== "DISABLED" && !window.confirm(t("users.disableConfirm"))) return;
            start(async () => {
              const r = await setUserStatusAction(userId, status === "DISABLED" ? "ACTIVE" : "DISABLED");
              if (!r.ok) setError(r.error);
            });
          }}
        >
          {status === "DISABLED" ? t("users.enable") : t("users.disable")}
        </button>
      </div>
      {temp && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-os-line bg-os-panel p-3">
          <code dir="ltr" className="font-mono text-sm">
            {temp}
          </code>
          <CopyText value={temp} label={t("common.copy")} />
          <p className="w-full text-xs text-os-faint">{t("users.tempPasswordHint")}</p>
        </div>
      )}
      {error && <p className="text-xs text-danger">{err(error)}</p>}
    </div>
  );
}
