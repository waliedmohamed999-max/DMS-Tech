"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, Modal } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";
import { createSubscriptionAction } from "@/lib/os/subscription-actions";
import { SUB_T, subError } from "@/lib/os/subscription-labels";

type Opt = { id: string; label: string };
/** A website package that can be subscribed to (monthly plans, term plans), with its yearly price when it has one. */
export type PlanPreset = { key: string; group: string; name: string; price: number; interval: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL"; annual: number | null; commitment: number };

const MONTHS = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6, ANNUAL: 12 } as const;

export function SubscriptionForm({
  locale,
  data,
  presets,
  canBill,
  autoOpen,
  fixedClientId
}: {
  locale: "ar" | "en";
  data: { today: string; vatRate: string; clients: Opt[]; contactsByClient: Record<string, Opt[]>; contractsByClient: Record<string, Opt[]>; owners: { id: string; name: string; nameAr: string | null }[]; services: { id: string; nameAr: string; nameEn: string }[] };
  presets: PlanPreset[];
  canBill: boolean;
  autoOpen?: boolean;
  fixedClientId?: string;
}) {
  const t = SUB_T[locale];
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(autoOpen));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState("");
  const [f, setF] = useState({
    clientId: fixedClientId ?? "",
    contactId: "",
    ownerId: "",
    contractId: "",
    serviceId: "",
    name: "",
    description: "",
    interval: "MONTHLY" as keyof typeof MONTHS,
    price: "",
    taxBehavior: "STANDARD",
    startDate: data.today,
    commitmentMonths: "0",
    autoRenew: true,
    renewalMonths: "1",
    notes: ""
  });
  const [bill, setBill] = useState({ on: canBill, dueDays: "7", language: locale as string, autoIssue: false, autoSend: false, sendTo: "", paymentTerms: "" });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const pick = (value: string) => {
    setPlan(value);
    const [key, mode] = value.split("|");
    const p = presets.find((x) => x.key === key);
    if (!p) return;
    const yearly = mode === "annual" && p.annual;
    const interval = yearly ? "ANNUAL" : p.interval;
    setF((x) => ({
      ...x,
      name: `${p.group} — ${p.name}`,
      price: String(yearly ? p.annual : p.price),
      interval,
      commitmentMonths: String(yearly ? 12 : p.commitment),
      renewalMonths: String(MONTHS[interval]),
      // term plans (e.g. 90 days) end with their term unless renewed on purpose
      autoRenew: p.interval === "MONTHLY" || Boolean(yearly)
    }));
  };

  const groups = useMemo(() => {
    const out: Record<string, PlanPreset[]> = {};
    for (const p of presets) (out[p.group] ??= []).push(p);
    return out;
  }, [presets]);

  const fmt = (v: string) => (Number(v) > 0 ? new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", { maximumFractionDigits: 2 }).format(Number(v)) + (locale === "ar" ? " ر.س" : " SAR") : "—");
  const pastStart = f.startDate < data.today && bill.on;

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await createSubscriptionAction({
        ...f,
        planKey: plan ? plan.split("|")[0] : null,
        contactId: f.contactId || null,
        ownerId: f.ownerId || null,
        contractId: f.contractId || null,
        serviceId: f.serviceId || null,
        billing: bill.on && canBill ? { dueDays: bill.dueDays, language: bill.language, autoIssue: bill.autoIssue, autoSend: bill.autoSend, sendTo: bill.sendTo, paymentTerms: bill.paymentTerms } : null
      });
      if (!r.ok) return setError(subError(t, r));
      setOpen(false);
      router.push(`/app/subscriptions/${r.data?.id}`);
    });

  return (
    <>
      <button type="button" className={fixedClientId ? "os-btn-ghost h-8 px-3 text-xs" : "os-btn-primary"} onClick={() => setOpen(true)}>
        <Icon name="CalendarClock" size={14} /> {t.new}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t.new} wide>
        <div className="grid gap-4 text-sm">
          {presets.length > 0 && (
            <Field label={t.plan} hint={t.planHint}>
              <select className="os-input" value={plan} onChange={(e) => pick(e.target.value)}>
                <option value="">{t.planPick}</option>
                {Object.entries(groups).map(([g, ps]) => (
                  <optgroup key={g} label={g}>
                    {ps.map((p) => (
                      <PresetOptions key={p.key} p={p} t={t} fmt={fmt} />
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {!fixedClientId && (
              <Field label={t.client}>
                <select className="os-input" value={f.clientId} onChange={(e) => setF((x) => ({ ...x, clientId: e.target.value, contactId: "", contractId: "" }))}>
                  <option value="">—</option>
                  {data.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={t.contact}>
              <select className="os-input" value={f.contactId} onChange={(e) => set("contactId", e.target.value)}>
                <option value="">—</option>
                {(data.contactsByClient[f.clientId] ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.name}>
              <input className="os-input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={t.namePh} />
            </Field>
            <Field label={t.owner}>
              <select className="os-input" value={f.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
                <option value="">—</option>
                {data.owners.map((u) => (
                  <option key={u.id} value={u.id}>
                    {(locale === "ar" && u.nameAr) || u.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.interval}>
              <select
                className="os-input"
                value={f.interval}
                onChange={(e) => {
                  const v = e.target.value as keyof typeof MONTHS;
                  setF((x) => ({ ...x, interval: v, renewalMonths: String(MONTHS[v]), commitmentMonths: Number(x.commitmentMonths) % MONTHS[v] ? "0" : x.commitmentMonths }));
                }}
              >
                {Object.entries(t.intervals).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.price} hint={Number(f.price) > 0 ? t.summary(fmt(f.price), t.per[f.interval], data.vatRate) : undefined}>
              <input className="os-input" inputMode="decimal" dir="ltr" value={f.price} onChange={(e) => set("price", e.target.value)} />
            </Field>
            <Field label={t.start}>
              <input type="date" className="os-input" dir="ltr" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </Field>
            <Field label={t.tax}>
              <select className="os-input" value={f.taxBehavior} onChange={(e) => set("taxBehavior", e.target.value)}>
                {Object.entries(t.taxes).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.commitment} hint={t.commitmentHint}>
              <input className="os-input" type="number" min={0} max={60} step={MONTHS[f.interval]} dir="ltr" value={f.commitmentMonths} onChange={(e) => set("commitmentMonths", e.target.value)} />
            </Field>
            <Field label={t.renewalMonths}>
              <input className="os-input" type="number" min={1} max={36} step={MONTHS[f.interval]} dir="ltr" value={f.renewalMonths} disabled={!f.autoRenew} onChange={(e) => set("renewalMonths", e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" checked={f.autoRenew} onChange={(e) => set("autoRenew", e.target.checked)} /> {t.autoRenew}
            </label>
            <Field label={t.service}>
              <select className="os-input" value={f.serviceId} onChange={(e) => set("serviceId", e.target.value)}>
                <option value="">—</option>
                {data.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {locale === "ar" ? s.nameAr : s.nameEn}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.contract}>
              <select className="os-input" value={f.contractId} onChange={(e) => set("contractId", e.target.value)}>
                <option value="">—</option>
                {(data.contractsByClient[f.clientId] ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label={t.description}>
                <textarea className="os-input min-h-[60px]" value={f.description} onChange={(e) => set("description", e.target.value)} />
              </Field>
            </div>
          </div>

          <fieldset className="grid gap-3 rounded-lg border border-os-line p-3">
            <legend className="px-1 text-xs font-semibold">{t.billingTitle}</legend>
            {canBill ? (
              <>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={bill.on} onChange={(e) => setBill((b) => ({ ...b, on: e.target.checked }))} /> {t.billingOn}
                </label>
                {bill.on && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t.dueDays}>
                      <input className="os-input" type="number" min={0} max={365} dir="ltr" value={bill.dueDays} onChange={(e) => setBill((b) => ({ ...b, dueDays: e.target.value }))} />
                    </Field>
                    <Field label={t.language}>
                      <select className="os-input" value={bill.language} onChange={(e) => setBill((b) => ({ ...b, language: e.target.value }))}>
                        <option value="ar">العربية</option>
                        <option value="en">English</option>
                      </select>
                    </Field>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={bill.autoIssue} onChange={(e) => setBill((b) => ({ ...b, autoIssue: e.target.checked, autoSend: e.target.checked && b.autoSend }))} /> {t.autoIssue}
                    </label>
                    <label className={`flex items-center gap-2 ${bill.autoIssue ? "" : "opacity-50"}`}>
                      <input type="checkbox" disabled={!bill.autoIssue} checked={bill.autoSend} onChange={(e) => setBill((b) => ({ ...b, autoSend: e.target.checked }))} /> {t.autoSend}
                    </label>
                    {bill.autoSend && (
                      <Field label={t.sendTo}>
                        <input className="os-input" type="email" dir="ltr" value={bill.sendTo} onChange={(e) => setBill((b) => ({ ...b, sendTo: e.target.value }))} />
                      </Field>
                    )}
                    <Field label={t.paymentTerms}>
                      <input className="os-input" value={bill.paymentTerms} onChange={(e) => setBill((b) => ({ ...b, paymentTerms: e.target.value }))} />
                    </Field>
                  </div>
                )}
                {pastStart && <p className="text-xs text-amber-600 dark:text-amber-400">{t.pastStart}</p>}
              </>
            ) : (
              <p className="text-xs text-os-muted">{t.billingNoPerm}</p>
            )}
          </fieldset>

          <Field label={t.notes}>
            <textarea className="os-input min-h-[60px]" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>

          {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {t.cancel}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending} onClick={submit}>
              {t.create}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function PresetOptions({ p, t, fmt }: { p: PlanPreset; t: (typeof SUB_T)["ar"]; fmt: (v: string) => string }) {
  return (
    <>
      <option value={`${p.key}|period`}>
        {p.name} — {fmt(String(p.price))} {t.per[p.interval]}
      </option>
      {p.annual ? (
        <option value={`${p.key}|annual`}>
          {p.name} — {fmt(String(p.annual))} {t.per.ANNUAL}
        </option>
      ) : null}
    </>
  );
}
