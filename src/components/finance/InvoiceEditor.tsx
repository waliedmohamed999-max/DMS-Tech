"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { calcTotals, formatMoney, type LineInput } from "@/lib/commercial/calc";
import { createInvoiceAction, updateInvoiceDraftAction } from "@/lib/os/finance-actions";
import { Field } from "@/components/os/client";
import { useFinRun } from "./shared";

type Opt = { id: string; label: string };
export type DraftLine = { description: string; serviceId: string; unit: string; quantity: string; unitPrice: string; discountType: "NONE" | "PERCENT" | "FIXED"; discountValue: string; taxBehavior: "STANDARD" | "ZERO_RATED" | "EXEMPT"; projectId?: string | null };
export type DraftValue = { clientId: string; contactId: string; language: "ar" | "en"; currency: string; issueDate: string; dueDate: string; paymentTerms: string; notes: string; items: DraftLine[] };

const blank = (): DraftLine => ({ description: "", serviceId: "", unit: "", quantity: "1", unitPrice: "", discountType: "NONE", discountValue: "", taxBehavior: "STANDARD" });

/**
 * Draft invoice editor (manual invoices and editing any DRAFT). The preview uses the same
 * calc.ts as the server; the server recalculates everything on save and ignores browser totals.
 */
export function InvoiceEditor({ id, initial, clients, contactsByClient, services, vatRate, clientLocked, timeLines }: { id?: string; initial: DraftValue; clients: Opt[]; contactsByClient: Record<string, Opt[]>; services: (Opt & { price: string; nameAr: string; nameEn: string })[]; vatRate: string; clientLocked?: boolean; timeLines?: number }) {
  const t = useTranslations("os.finance");
  const locale = useLocale();
  const router = useRouter();
  const { pending, error, run } = useFinRun();
  const [f, setF] = useState<DraftValue>({ ...initial, items: initial.items.length ? initial.items : [blank()] });
  const setLine = (i: number, patch: Partial<DraftLine>) => setF({ ...f, items: f.items.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const preview = useMemo(() => {
    try {
      const rows = f.items.filter((l) => l.description.trim() || l.unitPrice);
      return calcTotals(rows.map((l): LineInput => ({ quantity: l.quantity || "0", unitPrice: l.unitPrice || "0", discountType: l.discountType, discountValue: l.discountValue || "0", taxBehavior: l.taxBehavior })), vatRate);
    } catch {
      return null;
    }
  }, [f.items, vatRate]);
  const m = (v: string) => formatMoney(v, locale, f.currency);
  const save = () =>
    run(
      () => {
        const body = { ...f, contactId: f.contactId || null, issueDate: f.issueDate || null, dueDate: f.dueDate || null, items: f.items.filter((l) => l.description.trim()).map((l) => ({ ...l, serviceId: l.serviceId || null, unit: l.unit || null, discountValue: l.discountValue || "0" })) };
        return id ? updateInvoiceDraftAction(id, body) : createInvoiceAction(body);
      },
      (r) => {
        if (!id && r.ok) router.push(`/app/finance/invoices/${(r.data as { id: string }).id}`);
        else if (id) router.push(`/app/finance/invoices/${id}`);
      }
    );
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid content-start gap-4">
        <div className="os-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("f.client")}>
            <select className="os-input" value={f.clientId} disabled={clientLocked} onChange={(e) => setF({ ...f, clientId: e.target.value, contactId: "" })}>
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.contact")}>
            <select className="os-input" value={f.contactId} onChange={(e) => setF({ ...f, contactId: e.target.value })}>
              <option value="">—</option>
              {(contactsByClient[f.clientId] ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.language")}>
            <select className="os-input" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value as "ar" | "en" })}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label={t("f.issueDate")}>
            <input type="date" className="os-input" value={f.issueDate} onChange={(e) => setF({ ...f, issueDate: e.target.value })} />
          </Field>
          <Field label={t("f.dueDate")}>
            <input type="date" className="os-input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </Field>
          <Field label={t("f.currency")}>
            <input className="os-input" dir="ltr" maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} />
          </Field>
        </div>

        <div className="os-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-os-line px-4 py-3">
            <h2 className="text-sm font-semibold">{t("items")}</h2>
            {timeLines ? <span className="text-xs text-os-muted">{t("timeLinked", { n: timeLines })}</span> : null}
          </div>
          <div className="grid gap-3 p-3">
            {f.items.map((l, i) => {
              const r = preview?.lines[f.items.filter((x, j) => j < i && (x.description.trim() || x.unitPrice)).length];
              return (
                <div key={i} className="grid gap-2 rounded-lg border border-os-line p-3">
                  <div className="flex flex-wrap gap-2">
                    <input className="os-input min-w-[220px] flex-1" placeholder={t("f.description")} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                    <select
                      className="os-input w-auto"
                      aria-label={t("f.service")}
                      value={l.serviceId}
                      onChange={(e) => {
                        const s = services.find((x) => x.id === e.target.value);
                        setLine(i, { serviceId: e.target.value, ...(s && !l.description ? { description: f.language === "ar" ? s.nameAr : s.nameEn } : {}), ...(s && !l.unitPrice && Number(s.price) > 0 ? { unitPrice: s.price } : {}) });
                      }}
                    >
                      <option value="">{t("customLine")}</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[90px_120px_110px_100px_130px_minmax(0,1fr)_auto] sm:items-center">
                    <input className="os-input" dir="ltr" inputMode="decimal" aria-label={t("f.qty")} placeholder={t("f.qty")} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                    <input className="os-input" dir="ltr" inputMode="decimal" aria-label={t("f.unitPrice")} placeholder={t("f.unitPrice")} value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
                    <select className="os-input" aria-label={t("f.discount")} value={l.discountType} onChange={(e) => setLine(i, { discountType: e.target.value as DraftLine["discountType"] })}>
                      <option value="NONE">{t("disc.NONE")}</option>
                      <option value="PERCENT">%</option>
                      <option value="FIXED">{t("disc.FIXED")}</option>
                    </select>
                    <input className="os-input" dir="ltr" inputMode="decimal" disabled={l.discountType === "NONE"} aria-label={t("f.discountValue")} value={l.discountValue} onChange={(e) => setLine(i, { discountValue: e.target.value })} />
                    <select className="os-input" aria-label={t("f.tax")} value={l.taxBehavior} onChange={(e) => setLine(i, { taxBehavior: e.target.value as DraftLine["taxBehavior"] })}>
                      <option value="STANDARD">{t("tax.STANDARD", { r: vatRate })}</option>
                      <option value="ZERO_RATED">{t("tax.ZERO_RATED")}</option>
                      <option value="EXEMPT">{t("tax.EXEMPT")}</option>
                    </select>
                    <span className="text-end text-sm font-semibold tabular" dir="ltr">
                      {r ? m(r.total) : "—"}
                    </span>
                    <button type="button" className="os-btn-ghost h-9 px-2 text-xs text-danger" disabled={f.items.length === 1} onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== i) })}>
                      {t("remove")}
                    </button>
                  </div>
                </div>
              );
            })}
            <button type="button" className="os-btn-secondary h-8 justify-self-start px-3 text-xs" onClick={() => setF({ ...f, items: [...f.items, blank()] })}>
              + {t("addLine")}
            </button>
          </div>
        </div>

        <div className="os-card grid gap-3 p-4 sm:grid-cols-2">
          <Field label={t("f.paymentTerms")}>
            <textarea className="os-input" rows={3} value={f.paymentTerms} onChange={(e) => setF({ ...f, paymentTerms: e.target.value })} />
          </Field>
          <Field label={t("f.notes")}>
            <textarea className="os-input" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </Field>
        </div>
      </div>

      <aside className="os-card grid content-start gap-2 p-4 text-sm xl:sticky xl:top-20">
        <p className="font-semibold">{t("summary")}</p>
        {preview ? (
          <dl className="grid gap-1.5">
            {(
              [
                [t("subtotal"), preview.subtotal],
                [t("discount"), preview.discountTotal],
                [t("vat"), preview.taxTotal]
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 text-os-muted">
                <dt>{k}</dt>
                <dd className="tabular" dir="ltr">
                  {m(v)}
                </dd>
              </div>
            ))}
            <div className="mt-1 flex justify-between gap-2 border-t border-os-line pt-2 text-base font-semibold">
              <dt>{t("total")}</dt>
              <dd className="tabular" dir="ltr">
                {m(preview.total)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-danger">{t("previewInvalid")}</p>
        )}
        <p className="text-[11px] text-os-faint">{t("serverCalcNote")}</p>
        {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
        <button type="button" className="os-btn-primary" disabled={pending || !f.clientId} onClick={save}>
          {id ? t("saveDraft") : t("createDraft")}
        </button>
      </aside>
    </div>
  );
}
