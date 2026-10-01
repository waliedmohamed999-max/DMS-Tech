"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { archiveDepartmentAction, createRoleAction, saveDepartmentAction, setRolePermissionsAction, updateSettingsAction } from "@/lib/os/actions";
import type { ActionResult } from "@/lib/os/action";
import { Field, Modal, useErrorText } from "./client";

// ---------------------------------------------------------------------------
// Role permission matrix
// ---------------------------------------------------------------------------

type PermRow = { key: string; group: string; phase: number };

export function RoleMatrix({
  roleId,
  permissions,
  catalog,
  held,
  editable,
  groupLabels
}: {
  roleId: string;
  permissions: string[];
  catalog: PermRow[];
  held: string[];
  editable: boolean;
  groupLabels: Record<string, string>;
}) {
  const t = useTranslations("os");
  const err = useErrorText();
  const [sel, setSel] = useState(new Set(permissions));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const groups = [...new Set(catalog.map((c) => c.group))];
  const dirty = [...sel].sort().join() !== [...permissions].sort().join();
  const heldSet = new Set(held);

  return (
    <div className="grid gap-4 p-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <fieldset key={g} className="rounded-lg border border-os-line p-3">
            <legend className="px-1 text-xs font-semibold text-os-muted">{groupLabels[g] ?? g}</legend>
            <ul className="grid gap-1">
              {catalog
                .filter((c) => c.group === g)
                .map((c) => {
                  const on = sel.has(c.key);
                  const canToggle = editable && heldSet.has(c.key);
                  return (
                    <li key={c.key}>
                      <label className={`flex items-center gap-2 rounded px-1.5 py-1 font-mono text-[12px] ${canToggle ? "cursor-pointer hover:bg-os-raised" : "opacity-60"}`} title={!heldSet.has(c.key) && editable ? t("roles.notHeld") : undefined}>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!canToggle}
                          onChange={() => {
                            const n = new Set(sel);
                            if (on) n.delete(c.key);
                            else n.add(c.key);
                            setSel(n);
                          }}
                          className="accent-[#624de3]"
                        />
                        <span className={`flex-1 ${on ? "text-os-text" : "text-os-faint"}`} dir="ltr">
                          {c.key}
                        </span>
                        {c.phase > 1 && <span className="rounded border border-os-line px-1 font-sans text-[10px] text-os-faint">P{c.phase}</span>}
                      </label>
                    </li>
                  );
                })}
            </ul>
          </fieldset>
        ))}
      </div>
      {editable && (
        <div className="flex items-center justify-end gap-3">
          {msg && <span className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</span>}
          <button
            type="button"
            disabled={!dirty || pending}
            className="os-btn-primary"
            onClick={() =>
              start(async () => {
                const r = await setRolePermissionsAction(roleId, [...sel]);
                setMsg(r.ok ? { ok: true, text: t("common.saved") } : { ok: false, text: err(r.error) });
              })
            }
          >
            {pending ? t("common.saving") : t("common.save")}
          </button>
        </div>
      )}
    </div>
  );
}

export function NewRoleButton() {
  const t = useTranslations("os");
  const err = useErrorText();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => {
    const r = await createRoleAction(prev, fd);
    if (r.ok) {
      setOpen(false);
      router.refresh();
    }
    return r;
  }, null as ActionResult<{ id: string }> | null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="os-btn-primary">
        + {t("roles.new")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("roles.new")}>
        <form action={action} className="grid gap-4">
          <Field label={t("roles.key")} error={state && !state.ok ? (state.field?.key ? err(state.field.key) : undefined) : undefined}>
            <input name="key" required dir="ltr" placeholder="it_admin" className="os-input font-mono" />
          </Field>
          <Field label={t("common.name")}>
            <input name="name" required className="os-input" />
          </Field>
          <Field label={`${t("common.name")} (AR)`}>
            <input name="nameAr" className="os-input" />
          </Field>
          <Field label={t("roles.description")}>
            <input name="description" className="os-input" />
          </Field>
          {state && !state.ok && <p className="text-sm text-danger">{err(state.error)}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="os-btn-ghost">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={pending} className="os-btn-primary">
              {t("common.create")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

type Dept = { id?: string; code: string; name: string; nameAr: string | null; managerId: string | null };

export function DepartmentEditor({ dept, managers, trigger }: { dept?: Dept; managers: { id: string; label: string }[]; trigger: "new" | "edit" }) {
  const t = useTranslations("os");
  const err = useErrorText();
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(trigger === "new" && params.get("new") === "1");
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => {
    const r = await saveDepartmentAction(prev, fd);
    if (r.ok) {
      setOpen(false);
      router.replace("/app/admin/departments");
    }
    return r;
  }, null as ActionResult<unknown> | null);
  const fe = (k: string) => (state && !state.ok && state.field?.[k] ? err(state.field[k]) : undefined);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger === "new" ? "os-btn-primary" : "os-btn-ghost h-8 text-xs"}>
        {trigger === "new" ? `+ ${t("departments.new")}` : t("common.edit")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={trigger === "new" ? t("departments.new") : dept?.name ?? ""}>
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          {dept?.id && <input type="hidden" name="id" value={dept.id} />}
          <Field label={t("departments.code")} error={fe("code")}>
            <input name="code" defaultValue={dept?.code} required dir="ltr" className="os-input font-mono uppercase" />
          </Field>
          <Field label={t("departments.manager")}>
            <select name="managerId" defaultValue={dept?.managerId ?? ""} className="os-input">
              <option value="">{t("departments.noManager")}</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("common.name")} error={fe("name")}>
            <input name="name" defaultValue={dept?.name} required className="os-input" />
          </Field>
          <Field label={`${t("common.name")} (AR)`}>
            <input name="nameAr" defaultValue={dept?.nameAr ?? ""} className="os-input" />
          </Field>
          {state && !state.ok && <p className="text-sm text-danger sm:col-span-2">{err(state.error)}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => setOpen(false)} className="os-btn-ghost">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={pending} className="os-btn-primary">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ArchiveDepartment({ id }: { id: string }) {
  const t = useTranslations("os");
  const err = useErrorText();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <span className="inline-grid">
      <button
        type="button"
        disabled={pending}
        className="os-btn-ghost h-8 text-xs text-danger"
        onClick={() =>
          start(async () => {
            const r = await archiveDepartmentAction(id);
            if (!r.ok) setError(r.error);
          })
        }
      >
        {t("departments.archive")}
      </button>
      {error && <span className="text-[11px] text-danger">{err(error)}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Company settings
// ---------------------------------------------------------------------------

type Settings = {
  name: string; nameAr: string | null; legalName: string | null; vatNumber: string | null; crNumber: string | null; email: string | null; phone: string | null;
  address: string | null; city: string | null; currency: string; vatRate: number; quoteApprovalThreshold: number; discountApprovalPercent: number; defaultLocale: string;
  quoteExecutiveApprovalThreshold: number | null; quoteCustomPricingRequiresApproval: boolean; quoteValidityDays: number; quoteExpiryWarningDays: number; contractExpiryWarningDays: number;
  projectFromQuotationAllowed: boolean; internalProjectsAllowed: boolean; timesheetMaxDailyMinutes: number; projectInactivityDays: number;
};

export function SettingsForm({ s, editable }: { s: Settings; editable: boolean }) {
  const t = useTranslations("os");
  const err = useErrorText();
  const [state, action, pending] = useActionState(updateSettingsAction, null as ActionResult<unknown> | null);
  const fe = (k: string) => (state && !state.ok && state.field?.[k] ? err(state.field[k]) : undefined);
  const input = (name: keyof Settings, opts: { dir?: "ltr"; type?: string; step?: string } = {}) => (
    <input name={name} defaultValue={String(s[name] ?? "")} disabled={!editable} dir={opts.dir} type={opts.type} step={opts.step} className="os-input" />
  );
  return (
    <form action={action} className="grid gap-6">
      <fieldset className="os-card grid gap-4 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">{t("settings.company")}</legend>
        <Field label={t("settings.name")} error={fe("name")}>{input("name")}</Field>
        <Field label={t("settings.nameAr")}>{input("nameAr")}</Field>
        <Field label={t("settings.legalName")}>{input("legalName")}</Field>
        <Field label={t("settings.crNumber")}>{input("crNumber", { dir: "ltr" })}</Field>
        <Field label={t("common.email")} error={fe("email")}>{input("email", { dir: "ltr", type: "email" })}</Field>
        <Field label={t("settings.phone")}>{input("phone", { dir: "ltr" })}</Field>
        <Field label={t("settings.address")}>{input("address")}</Field>
        <Field label={t("settings.city")}>{input("city")}</Field>
      </fieldset>
      <fieldset className="os-card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="px-1 text-sm font-semibold">{t("settings.tax")}</legend>
        <Field label={t("settings.vatNumber")} error={fe("vatNumber")}>{input("vatNumber", { dir: "ltr" })}</Field>
        <Field label={t("settings.vatRate")} error={fe("vatRate")}>{input("vatRate", { dir: "ltr", type: "number", step: "0.01" })}</Field>
        <Field label={t("settings.currency")} error={fe("currency")}>{input("currency", { dir: "ltr" })}</Field>
        <Field label={t("settings.defaultLocale")}>
          <select name="defaultLocale" defaultValue={s.defaultLocale} disabled={!editable} className="os-input">
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </Field>
      </fieldset>
      <fieldset className="os-card grid gap-4 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">{t("settings.rules")}</legend>
        <Field label={t("settings.quoteThreshold")}>{input("quoteApprovalThreshold", { dir: "ltr", type: "number", step: "1" })}</Field>
        <Field label={t("settings.discountThreshold")}>{input("discountApprovalPercent", { dir: "ltr", type: "number", step: "0.5" })}</Field>
        <Field label={t("settings.executiveThreshold")} hint={t("settings.executiveHint")}>{input("quoteExecutiveApprovalThreshold", { dir: "ltr", type: "number", step: "1" })}</Field>
        <Field label={t("settings.validityDays")}>{input("quoteValidityDays", { dir: "ltr", type: "number", step: "1" })}</Field>
        <Field label={t("settings.quoteWarnDays")}>{input("quoteExpiryWarningDays", { dir: "ltr", type: "number", step: "1" })}</Field>
        <Field label={t("settings.contractWarnDays")}>{input("contractExpiryWarningDays", { dir: "ltr", type: "number", step: "1" })}</Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="hidden" name="quoteCustomPricingRequiresApproval" value="false" />
          <input type="checkbox" name="quoteCustomPricingRequiresApproval" defaultChecked={s.quoteCustomPricingRequiresApproval} disabled={!editable} className="accent-[#624de3]" /> {t("settings.customPricing")}
        </label>
        <p className="text-xs text-os-faint sm:col-span-2">{t("settings.rulesNote")}</p>
      </fieldset>
      <fieldset className="os-card grid gap-4 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">{t("settings.delivery")}</legend>
        <Field label={t("settings.maxDailyMinutes")} error={fe("timesheetMaxDailyMinutes")}>{input("timesheetMaxDailyMinutes", { dir: "ltr", type: "number", step: "15" })}</Field>
        <Field label={t("settings.inactivityDays")} error={fe("projectInactivityDays")}>{input("projectInactivityDays", { dir: "ltr", type: "number", step: "1" })}</Field>
        {(["projectFromQuotationAllowed", "internalProjectsAllowed"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="hidden" name={k} value="false" />
            <input type="checkbox" name={k} defaultChecked={s[k]} disabled={!editable} className="accent-[#624de3]" /> {t(`settings.${k}` as "settings.internalProjectsAllowed")}
          </label>
        ))}
        <p className="text-xs text-os-faint sm:col-span-2">{t("settings.deliveryNote")}</p>
      </fieldset>
      {editable && (
        <div className="flex items-center justify-end gap-3">
          {state && (state.ok ? <span className="text-xs text-success">{t("common.saved")}</span> : <span className="text-xs text-danger">{err(state.error)}</span>)}
          <button type="submit" disabled={pending} className="os-btn-primary">
            {pending ? t("common.saving") : t("common.save")}
          </button>
        </div>
      )}
    </form>
  );
}
