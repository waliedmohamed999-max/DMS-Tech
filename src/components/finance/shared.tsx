"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/os/action";
import { useErrorText } from "@/components/os/client";
import { formatMoney } from "@/lib/commercial/calc";

/** Run a finance server action; errors are translated via os.finance.errors, then os.errors. */
export function useFinRun() {
  const tf = useTranslations("os.finance");
  const errText = useErrorText();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const text = (r: { error: string; field?: Record<string, string> }) => {
    const base = tf.has(`errors.${r.error}`) ? tf(`errors.${r.error}` as "errors.INVOICE_FROZEN") : errText(r.error);
    const detail = r.field?._detail;
    return detail && !/^[A-Z_,]+$/.test(detail) ? `${base} (${detail})` : base;
  };
  const run = <T,>(fn: () => Promise<ActionResult<T>>, done?: (r: ActionResult<T>) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(text(r as { error: string; field?: Record<string, string> }));
      done?.(r);
      router.refresh();
    });
  return { pending, error, setError, run };
}

export function Money({ v, currency = "SAR", className = "" }: { v: string | number; currency?: string; className?: string }) {
  const locale = useLocale();
  return (
    <span className={`tabular whitespace-nowrap ${className}`} dir="ltr">
      {formatMoney(String(v), locale, currency)}
    </span>
  );
}

export const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
