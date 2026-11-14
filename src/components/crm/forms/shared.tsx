"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/os/action";
import { serviceChoicesAction } from "@/lib/os/crm-actions";
import { useErrorText } from "@/components/os/client";

export type Opt = { id: string; label: string };
export type Res = ActionResult<{ id: string } | undefined> | null;

/** datetime-local value in the viewer's local time */
export const dtLocal = (d?: Date | string | null) => {
  if (!d) return "";
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const dateOnly = (d?: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export function useFieldErrors(state: Res) {
  const err = useErrorText();
  const tc = useTranslations("os.crm.errors");
  return {
    field: (k: string) => {
      if (!state || state.ok || !state.field?.[k]) return undefined;
      const code = state.field[k];
      return tc.has(code) ? tc(code as "MONEY_FORMAT") : err("VALIDATION");
    },
    form: state && !state.ok ? (tc.has(state.error) ? tc(state.error as "MONEY_FORMAT") : err(state.error)) : undefined
  };
}

/** Modal that opens from a button or automatically from `?new=1`, then navigates to the created record. */
export function useCreateModal(autoOpenParam: string | null, after: (id: string) => string) {
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(autoOpenParam ? params.get(autoOpenParam) === "1" : false);
  // closing the <dialog> fires onClose → close(); after a successful create that must not
  // replace the URL, or it would race (and win) against the push to the new record
  const navigating = useRef(false);
  const close = () => {
    setOpen(false);
    if (!navigating.current && autoOpenParam && params.get(autoOpenParam)) {
      const q = new URLSearchParams(params.toString());
      q.delete(autoOpenParam);
      router.replace(`?${q}`);
    }
  };
  const done = (r: Res) => {
    if (r?.ok && r.data && "id" in r.data) {
      navigating.current = true;
      setOpen(false);
      router.push(after(r.data.id));
    }
  };
  return { open, setOpen, close, done };
}

/** Catalog service picker (DB-backed). Legacy-only values stay visible as the current selection label. */
let serviceCache: Promise<{ id: string; nameAr: string; nameEn: string; category: string | null }[]> | null = null;
export function ServiceSelect({ value }: { value?: string | null }) {
  const locale = useLocale();
  const [opts, setOpts] = useState<{ id: string; nameAr: string; nameEn: string; category: string | null }[] | null>(null);
  useEffect(() => {
    serviceCache ??= serviceChoicesAction().then((r) => (r.ok && r.data ? r.data : []));
    let live = true;
    void serviceCache.then((o) => live && setOpts(o));
    return () => {
      live = false;
    };
  }, []);
  return (
    <select name="serviceId" defaultValue={value ?? ""} key={opts ? "ready" : "loading"} className="os-input">
      <option value="">—</option>
      {opts?.map((s) => (
        <option key={s.id} value={s.id}>
          {locale === "ar" ? s.nameAr : s.nameEn}
        </option>
      ))}
    </select>
  );
}

export const Select = ({ name, value, options, empty, required }: { name: string; value?: string | null; options: { value: string; label: string }[]; empty?: string; required?: boolean }) => (
  <select name={name} defaultValue={value ?? ""} required={required} className="os-input">
    {empty !== undefined && <option value="">{empty}</option>}
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);
