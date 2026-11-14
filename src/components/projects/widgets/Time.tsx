"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createTimeAction, deleteTimeAction, submitTimesheetAction } from "@/lib/os/project-actions";
import { Field } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";
import { useRun } from "../shared";
import { type Opt } from "./shared";

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export function TimeEntryForm({ projects, tasksByProject, defaultProjectId, today }: { projects: Opt[]; tasksByProject: Record<string, Opt[]>; defaultProjectId?: string; today: string }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  const [f, setF] = useState({ projectId: defaultProjectId ?? projects[0]?.id ?? "", taskId: "", date: today, hours: "", minutes: "", description: "", billable: true });
  const total = (Number(f.hours || 0) * 60 + Number(f.minutes || 0)) | 0;
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_140px_70px_70px] sm:items-end">
      <Field label={t("f.project")}>
        <select className="os-input h-9" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value, taskId: "" })}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("f.task")}>
        <select className="os-input h-9" value={f.taskId} onChange={(e) => setF({ ...f, taskId: e.target.value })}>
          <option value="">—</option>
          {(tasksByProject[f.projectId] ?? []).map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("f.date")}>
        <input type="date" className="os-input h-9" max={today} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      </Field>
      <Field label={t("f.hours")}>
        <input inputMode="numeric" dir="ltr" className="os-input h-9" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value.replace(/\D/g, "") })} />
      </Field>
      <Field label={t("f.minutes")}>
        <input inputMode="numeric" dir="ltr" className="os-input h-9" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value.replace(/\D/g, "") })} />
      </Field>
      <div className="sm:col-span-4">
        <input className="os-input h-9" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={t("timeNotePh")} />
      </div>
      <div className="flex items-center justify-end gap-2">
        <label className="flex items-center gap-1 whitespace-nowrap text-xs text-os-muted">
          <input type="checkbox" checked={f.billable} onChange={(e) => setF({ ...f, billable: e.target.checked })} className="accent-[#624de3]" /> {t("billable")}
        </label>
        <button type="button" className="os-btn-primary h-9 px-3 text-xs" disabled={pending || !f.projectId || total <= 0} onClick={() => run(() => createTimeAction({ projectId: f.projectId, taskId: f.taskId || null, date: f.date, minutes: total, description: f.description, billable: f.billable }), () => setF({ ...f, hours: "", minutes: "", description: "" }))}>
          {t("logTime")}
        </button>
      </div>
      {error && <p className="text-xs text-danger sm:col-span-5">{error}</p>}
    </div>
  );
}

export function SubmitTimesheet({ projectId, count }: { projectId: string; count: number }) {
  const t = useTranslations("os.projects");
  const { pending, error, run } = useRun();
  return (
    <span className="inline-grid gap-0.5">
      <button type="button" className="os-btn-secondary h-8 px-3 text-xs" disabled={pending || !count} onClick={() => run(() => submitTimesheetAction(projectId))}>
        {t("submitTime", { n: count })}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}

export function DeleteTime({ id }: { id: string }) {
  const t = useTranslations("os.projects");
  const { pending, run } = useRun();
  return (
    <button type="button" className="os-btn-ghost size-7 px-0 text-os-faint hover:text-danger" disabled={pending} aria-label={t("delete")} onClick={() => run(() => deleteTimeAction(id))}>
      <Icon name="X" size={13} />
    </button>
  );
}
