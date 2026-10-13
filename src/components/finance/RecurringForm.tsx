"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Field, Modal } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";
import { createRecurringAction, setRecurringStatusAction } from "@/lib/os/finance-actions";
import { RECURRING_T } from "@/lib/os/recurring-labels";

type Opt = { id: string; label: string };
type Line = { description: string; quantity: string; unitPrice: string };

export function RecurringForm({ clients, contactsByClient, autoOpen, today }: { clients: Opt[]; contactsByClient: Record<string, Opt[]>; autoOpen?: boolean; today: string }) {
  const locale = useLocale() === "ar" ? "ar" : "en";
  const t = RECURRING_T[locale];
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(autoOpen));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ clientId: "", contactId: "", title: "", interval: "MONTHLY", startDate: today, endDate: "", maxOccurrences: "", dueDays: "30", language: locale as string, autoIssue: false, autoSend: false, sendTo: "", paymentTerms: "", notes: "" });
  const [lines, setLines] = useState<Line[]>([{ description: "", quantity: "1", unitPrice: "" }]);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v, ...(k === "autoIssue" && !v ? { autoSend: false } : {}) }));
  const setLine = (i: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await createRecurringAction({ ...f, contactId: f.contactId || null, items: lines.filter((l) => l.description.trim()) });
      if (!r.ok) {
        const field = r.field ? Object.values(r.field)[0] : null;
        setError(t.errors[field ?? ""] ?? t.errors[r.error] ?? t.fallback);
        return;
      }
      setOpen(false);
      router.push(`/app/finance/recurring/${r.data?.id}`);
    });

  return (
    <>
      <button type="button" className="os-btn-primary" onClick={() => setOpen(true)}>
        <Icon name="RotateCcw" size={14} /> {t.new}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t.new} wide>
        <div className="grid gap-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.client}>
              <select className="os-input" value={f.clientId} onChange={(e) => setF((x) => ({ ...x, clientId: e.target.value, contactId: "" }))}>
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.contact}>
              <select className="os-input" value={f.contactId} onChange={(e) => set("contactId", e.target.value)}>
                <option value="">—</option>
                {(contactsByClient[f.clientId] ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.title}>
              <input className="os-input" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder={t.titlePh} />
            </Field>
            <Field label={t.interval}>
              <select className="os-input" value={f.interval} onChange={(e) => set("interval", e.target.value)}>
                {Object.entries(t.intervals).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.start}>
              <input type="date" className="os-input" dir="ltr" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </Field>
            <Field label={t.end}>
              <input type="date" className="os-input" dir="ltr" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} />
            </Field>
            <Field label={t.max}>
              <input type="number" min={1} className="os-input" dir="ltr" value={f.maxOccurrences} onChange={(e) => set("maxOccurrences", e.target.value)} />
            </Field>
            <Field label={t.dueDays}>
              <input type="number" min={0} max={365} className="os-input" dir="ltr" value={f.dueDays} onChange={(e) => set("dueDays", e.target.value)} />
            </Field>
            <Field label={t.language}>
              <select className="os-input" value={f.language} onChange={(e) => set("language", e.target.value)}>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-2 rounded-lg border border-os-line p-3">
            <p className="text-xs font-semibold">{t.lines}</p>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_120px_auto] items-end gap-2">
                <Field label={i === 0 ? t.desc : ""}>
                  <input className="os-input" value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} placeholder={t.descPh} dir="auto" />
                </Field>
                <Field label={i === 0 ? t.qty : ""}>
                  <input className="os-input" dir="ltr" value={l.quantity} onChange={(e) => setLine(i, "quantity", e.target.value)} />
                </Field>
                <Field label={i === 0 ? t.price : ""}>
                  <input className="os-input" dir="ltr" value={l.unitPrice} onChange={(e) => setLine(i, "unitPrice", e.target.value)} placeholder="0.00" />
                </Field>
                <button type="button" className="os-btn-ghost mb-0.5 size-9 px-0" aria-label="remove" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                  <Icon name="X" size={14} />
                </button>
              </div>
            ))}
            <button type="button" className="os-btn-ghost w-fit" onClick={() => setLines((ls) => [...ls, { description: "", quantity: "1", unitPrice: "" }])}>
              + {t.addLine}
            </button>
          </div>

          <div className="grid gap-2 rounded-lg border border-os-line p-3">
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={f.autoIssue} onChange={(e) => set("autoIssue", e.target.checked)} />
              <span className="grid">
                <span className="font-medium">{t.autoIssue}</span>
                <span className="text-[11px] text-os-faint">{t.autoIssueHint}</span>
              </span>
            </label>
            <label className={`flex items-center gap-2 ${f.autoIssue ? "" : "opacity-50"}`}>
              <input type="checkbox" disabled={!f.autoIssue} checked={f.autoSend} onChange={(e) => set("autoSend", e.target.checked)} />
              <span className="font-medium">{t.autoSend}</span>
            </label>
            {f.autoSend && (
              <Field label={t.sendTo}>
                <input className="os-input" dir="ltr" value={f.sendTo} onChange={(e) => set("sendTo", e.target.value)} />
              </Field>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.terms}>
              <textarea className="os-input min-h-[70px]" value={f.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} dir="auto" />
            </Field>
            <Field label={t.notes}>
              <textarea className="os-input min-h-[70px]" value={f.notes} onChange={(e) => set("notes", e.target.value)} dir="auto" />
            </Field>
          </div>

          {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {t.cancel}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending} onClick={submit}>
              {pending ? t.saving : t.save}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function RecurringActions({ id, status }: { id: string; status: string }) {
  const locale = useLocale() === "ar" ? "ar" : "en";
  const t = RECURRING_T[locale];
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (s: "ACTIVE" | "PAUSED" | "ENDED") =>
    start(async () => {
      if (s === "ENDED" && !window.confirm(t.endConfirm)) return;
      await setRecurringStatusAction(id, s);
      router.refresh();
    });
  if (status === "ENDED") return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {status === "ACTIVE" ? (
        <button type="button" className="os-btn-secondary" disabled={pending} onClick={() => run("PAUSED")}>
          {t.pause}
        </button>
      ) : (
        <button type="button" className="os-btn-primary" disabled={pending} onClick={() => run("ACTIVE")}>
          {t.resume}
        </button>
      )}
      <button type="button" className="os-btn-ghost text-danger" disabled={pending} onClick={() => run("ENDED")}>
        {t.endIt}
      </button>
    </div>
  );
}
