"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/os/action";
import { Field, Modal, useErrorText } from "@/components/os/client";

/**
 * Generic HR forms. Server actions are passed in as props (server references) together with their
 * leading arguments; the server re-validates everything, the browser only collects input.
 */

export type FieldSpec = {
  name: string;
  label: string;
  type?: "hidden" | "text" | "password" | "email" | "date" | "datetime" | "time" | "number" | "textarea" | "select" | "checkbox" | "multiselect";
  options?: { value: string; label: string }[];
  required?: boolean;
  dir?: "ltr" | "rtl";
  hint?: string;
  value?: string | boolean | string[];
  span?: boolean;
  step?: string;
};

type AnyAction = (...args: never[]) => Promise<ActionResult<unknown>>;

export function useHrRun() {
  const t = useTranslations("os.hr");
  const to = useTranslations("os.ops");
  const ti = useTranslations("os.integrations");
  const tsys = useTranslations("os.system");
  const errText = useErrorText();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // HR, operations and integrations / marketing codes share one generic form layer (reused by Phases 7–8)
  const known = (c: string) => (t.has(`errors.${c}`) ? t(`errors.${c}` as "errors.MANAGER_CYCLE") : to.has(`errors.${c}`) ? to(`errors.${c}` as "errors.OVER_RECEIPT") : ti.has(`errors.${c}`) ? ti(`errors.${c}` as "errors.WHATSAPP_NOT_CONNECTED") : tsys.has(`errors.${c}`) ? tsys(`errors.${c}` as "errors.RULE_CONFLICT") : null);
  const text = (r: { error: string; field?: Record<string, string>; ref?: string | null }) => {
    // Phase 9: unexpected errors carry a support reference (request id) — never internals
    const base = (known(r.error) ?? errText(r.error)) + (r.ref ? ` · ref ${r.ref.slice(0, 8)}` : "");
    const detail = r.field?._detail;
    if (r.error === "VALIDATION" && r.field) {
      const [k, v] = Object.entries(r.field)[0] ?? [];
      if (k) return `${base} (${k}${v && !/^Invalid|Too|Expected/.test(v) ? `: ${known(v) ?? v}` : ""})`;
    }
    return detail && !/^[A-Z_,]+$/.test(detail) ? `${base} (${detail})` : base;
  };
  const run = <T,>(fn: () => Promise<ActionResult<T>>, done?: (r: ActionResult<T>) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(text(r as { error: string; field?: Record<string, string>; ref?: string | null }));
      done?.(r);
      router.refresh();
    });
  return { pending, error, setError, run };
}

function collect(fields: FieldSpec[], v: Record<string, string | boolean | string[]>) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const x = v[f.name];
    if (f.type === "checkbox") out[f.name] = Boolean(x);
    else if (f.type === "multiselect") out[f.name] = Array.isArray(x) ? x : [];
    else if (f.type === "datetime") out[f.name] = x ? new Date(String(x)).toISOString() : "";
    else out[f.name] = typeof x === "string" ? x : "";
  }
  return out;
}

export function ActionForm({
  action, args = [], fields, trigger, title, submitLabel, triggerClass, positional, redirect, note, confirm, danger, autoOpen, onCloseHref
}: {
  action: AnyAction;
  args?: unknown[];
  fields: FieldSpec[];
  trigger: string;
  title?: string;
  submitLabel: string;
  triggerClass?: string;
  /** pass field values as positional arguments instead of one object */
  positional?: boolean;
  /** "/app/x/:id" uses the returned { id } */
  redirect?: string;
  note?: string;
  confirm?: string;
  danger?: boolean;
  autoOpen?: boolean;
  onCloseHref?: string;
}) {
  const t = useTranslations("os.hr");
  const router = useRouter();
  const { pending, error, run, setError } = useHrRun();
  const [open, setOpen] = useState(Boolean(autoOpen));
  const [agree, setAgree] = useState(false);
  const saved = useRef(false);
  const init = () => Object.fromEntries(fields.map((f) => [f.name, f.value ?? (f.type === "checkbox" ? false : f.type === "multiselect" ? [] : "")]));
  const [v, setV] = useState<Record<string, string | boolean | string[]>>(init);
  const close = () => {
    setOpen(false);
    setError(null);
    if (onCloseHref && !saved.current) router.replace(onCloseHref);
  };
  const submit = () =>
    run(
      () => {
        const values = collect(fields, v);
        const call = action as unknown as (...a: unknown[]) => Promise<ActionResult<unknown>>;
        return positional ? call(...args, ...fields.map((f) => values[f.name])) : call(...args, values);
      },
      (r) => {
        saved.current = true;
        setOpen(false);
        setV(init());
        setAgree(false);
        const id = r.ok ? (r.data as { id?: string } | undefined)?.id : undefined;
        if (redirect && id) router.push(redirect.replace(":id", id));
      }
    );
  const missing = fields.some((f) => f.required && (v[f.name] === "" || v[f.name] === false ||(Array.isArray(v[f.name]) && !(v[f.name] as string[]).length)));
  return (
    <>
      <button type="button" className={triggerClass ?? "os-btn-primary"} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <Modal open={open} onClose={close} title={title ?? trigger} wide={fields.length > 4}>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          {note && <p className="text-xs text-os-muted sm:col-span-2">{note}</p>}
          {fields.filter((f) => f.type !== "hidden").map((f) => (
            <div key={f.name} className={f.span || f.type === "textarea" || f.type === "multiselect" || fields.length === 1 ? "sm:col-span-2" : ""}>
              {f.type === "multiselect" ? (
                <fieldset className="grid gap-0">
                  <legend className="os-label">{`${f.label}${f.required ? " *" : ""}`}</legend>
                  <div className="grid max-h-40 gap-1 overflow-y-auto rounded-lg border border-os-line p-2">
                    {f.options?.map((o) => {
                      const arr = (v[f.name] as string[]) ?? [];
                      return (
                        <label key={o.value} className="flex items-center gap-2 text-xs">
                          <input type="checkbox" className="accent-[#624de3]" checked={arr.includes(o.value)} onChange={(e) => setV({ ...v, [f.name]: e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value) })} /> {o.label}
                        </label>
                      );
                    })}
                  </div>
                  {f.hint && <span className="mt-1 text-xs text-os-faint">{f.hint}</span>}
                </fieldset>
              ) : f.type === "checkbox" ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={Boolean(v[f.name])} onChange={(e) => setV({ ...v, [f.name]: e.target.checked })} className="accent-[#624de3]" /> {f.label}
                </label>
              ) : (
                <Field label={`${f.label}${f.required ? " *" : ""}`} hint={f.hint}>
                  {f.type === "textarea" ? (
                    <textarea className="os-input" rows={3} dir={f.dir ?? "auto"} value={String(v[f.name] ?? "")} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
                  ) : f.type === "select" ? (
                    <select className="os-input" value={String(v[f.name] ?? "")} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>
                      {!f.required && <option value="">—</option>}
                      {f.required && !v[f.name] && <option value="">—</option>}
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="os-input"
                      type={f.type === "datetime" ? "datetime-local" : f.type === "number" ? "text" : f.type ?? "text"}
                      inputMode={f.type === "number" ? "decimal" : undefined}
                      dir={f.dir ?? (["email", "password", "number", "date", "time", "datetime"].includes(f.type ?? "") ? "ltr" : undefined)}
                      step={f.step}
                      autoComplete={f.type === "password" ? "new-password" : undefined}
                      value={String(v[f.name] ?? "")}
                      onChange={(e) => setV({ ...v, [f.name]: e.target.value })}
                    />
                  )}
                </Field>
              )}
            </div>
          ))}
          {confirm && (
            <label className="flex items-start gap-2 text-xs sm:col-span-2">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-[#624de3]" /> {confirm}
            </label>
          )}
          {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="os-btn-ghost" onClick={close}>
              {t("cancel")}
            </button>
            <button type="button" className={danger ? "os-btn-danger" : "os-btn-primary"} disabled={pending || missing || (Boolean(confirm) && !agree)} onClick={submit}>
              {submitLabel}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** One-click action (optionally with a confirm prompt). */
export function RunButton({ action, args = [], label, className, confirmText, redirect }: { action: AnyAction; args?: unknown[]; label: string; className?: string; confirmText?: string; redirect?: string }) {
  const router = useRouter();
  const { pending, error, run, setError } = useHrRun();
  // the page refreshes after other actions; an old error must not linger next to the button
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(id);
  }, [error, setError]);
  return (
    <span className="inline-grid gap-0.5">
      <button
        type="button"
        className={className ?? "os-btn-secondary"}
        disabled={pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          run(() => (action as unknown as (...a: unknown[]) => Promise<ActionResult<unknown>>)(...args), (r) => {
            const id = r.ok ? (r.data as { id?: string } | undefined)?.id : undefined;
            if (redirect && id) router.push(redirect.replace(":id", id));
          });
        }}
      >
        {pending ? "…" : label}
      </button>
      {error && <span className="max-w-[260px] text-[11px] text-danger">{error}</span>}
    </span>
  );
}

/** Full IBAN on demand (hr.bank.manage) — every reveal is audited on the server; hidden again after 30 s. */
export function RevealIban({ action, id, masked, label }: { action: (id: string) => Promise<ActionResult<string>>; id: string; masked: string; label: string }) {
  const { pending, error, run } = useHrRun();
  const [full, setFull] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono text-xs" dir="ltr">
        {full ?? masked}
      </span>
      {!full && (
        <button
          type="button"
          className="os-btn-ghost h-6 px-2 text-[11px]"
          disabled={pending}
          onClick={() =>
            run(() => action(id), (r) => {
              if (r.ok) {
                setFull(r.data as string);
                setTimeout(() => setFull(null), 30_000);
              }
            })
          }
        >
          {label}
        </button>
      )}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}

export function CheckInOut({ action, state, labels }: { action: (a: "in" | "out", remote?: boolean) => Promise<ActionResult<undefined>>; state: "none" | "in" | "done"; labels: { in: string; remote: string; out: string; done: string } }) {
  const { pending, error, run } = useHrRun();
  if (state === "done") return <span className="text-sm text-success">{labels.done}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {state === "none" ? (
        <>
          <button type="button" className="os-btn-primary" disabled={pending} onClick={() => run(() => action("in", false))}>
            {labels.in}
          </button>
          <button type="button" className="os-btn-secondary" disabled={pending} onClick={() => run(() => action("in", true))}>
            {labels.remote}
          </button>
        </>
      ) : (
        <button type="button" className="os-btn-primary" disabled={pending} onClick={() => run(() => action("out"))}>
          {labels.out}
        </button>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

/** Stage select for an application (server enforces transitions; REJECTED asks for a reason). */
export function StageSelect({ action, applicationId, stage, options, label, reasonPrompt }: { action: (id: string, input: Record<string, unknown>) => Promise<ActionResult<undefined>>; applicationId: string; stage: string; options: { value: string; label: string }[]; label: string; reasonPrompt: string }) {
  const { pending, error, run } = useHrRun();
  return (
    <span className="inline-grid gap-0.5">
      <select
        className="os-input h-8 w-auto py-0 text-xs"
        aria-label={label}
        value=""
        disabled={pending}
        onChange={(e) => {
          const to = e.target.value;
          if (!to) return;
          let reason: string | undefined;
          if (to === "REJECTED") {
            reason = window.prompt(reasonPrompt) ?? undefined;
            if (!reason) return;
          }
          run(() => action(applicationId, { to, from: stage, reason }));
        }}
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <span className="max-w-[240px] text-[11px] text-danger">{error}</span>}
    </span>
  );
}
