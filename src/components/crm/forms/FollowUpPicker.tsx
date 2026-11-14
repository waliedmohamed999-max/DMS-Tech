"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/os/action";
import { useErrorText } from "@/components/os/client";
import { dtLocal } from "./shared";

/** Quick follow-up scheduling (works well on mobile): presets + datetime input. */
export function FollowUpPicker({ value, onSave }: { value: Date | string | null; onSave: (iso: string | null) => Promise<ActionResult<unknown>> }) {
  const t = useTranslations("os.crm.a");
  const router = useRouter();
  const err = useErrorText();
  const [v, setV] = useState(dtLocal(value));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const save = (local: string | null) =>
    start(async () => {
      const r = await onSave(local ? new Date(local).toISOString() : null);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  const preset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(10, 0, 0, 0);
    const s = dtLocal(d);
    setV(s);
    save(s);
  };
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={pending} onClick={() => preset(0)} className="os-btn-secondary h-8 px-2.5 text-xs">
          {t("today")}
        </button>
        <button type="button" disabled={pending} onClick={() => preset(1)} className="os-btn-secondary h-8 px-2.5 text-xs">
          {t("tomorrow")}
        </button>
        <button type="button" disabled={pending} onClick={() => preset(7)} className="os-btn-secondary h-8 px-2.5 text-xs">
          {t("nextWeek")}
        </button>
        {value && (
          <button type="button" disabled={pending} onClick={() => (setV(""), save(null))} className="os-btn-ghost h-8 px-2.5 text-xs">
            {t("clear")}
          </button>
        )}
      </div>
      <div className="flex gap-1.5">
        <input type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} className="os-input" />
        <button type="button" disabled={pending || !v} onClick={() => save(v)} className="os-btn-primary px-3">
          {t("save")}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{err(error)}</p>}
    </div>
  );
}
