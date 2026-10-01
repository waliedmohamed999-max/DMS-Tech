"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { calcLine, calcTotals, CalcError, Decimal, formatMoney, type DiscountKind, type TaxKind } from "@/lib/commercial/calc";
import { clientOptionsAction } from "@/lib/os/crm-actions";
import { opportunityOptionsAction, saveQuotationAction, submitQuotationAction } from "@/lib/os/sales-actions";
import { Field, useErrorText } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";

export type CatalogService = { id: string; code: string; nameAr: string; nameEn: string; category: string | null; basePrice?: string; pricingModel?: string; taxBehavior?: string; quotationDescriptionAr?: string | null; quotationDescriptionEn?: string | null; defaultTermsAr?: string | null; defaultTermsEn?: string | null };
export type CatalogPackage = { id: string; code: string; nameAr: string; nameEn: string; descriptionAr: string | null; descriptionEn: string | null; defaultPrice: string; taxBehavior: string; items: { nameAr: string; nameEn: string; quantity: string; optional: boolean }[] };
export type BuilderItem = { key: string; serviceId?: string | null; packageId?: string | null; name: string; description: string; unit: string; quantity: string; unitPrice: string; discountType: DiscountKind; discountValue: string; taxBehavior: TaxKind };
export type BuilderInitial = {
  clientId: string;
  clientLabel?: string;
  contactId: string;
  opportunityId: string;
  ownerId: string;
  language: "ar" | "en";
  currency: string;
  issueDate: string;
  validUntil: string;
  paymentTerms: string;
  deliveryTerms: string;
  termsAndConditions: string;
  notes: string;
  clientMessage: string;
  items: BuilderItem[];
};
type Opt = { id: string; label: string };
type ClientOpt = Opt & { contacts: (Opt & { isPrimary: boolean })[] };

let seq = 0;
const newKey = () => `row-${Date.now()}-${seq++}`;
const blankItem = (): BuilderItem => ({ key: newKey(), name: "", description: "", unit: "", quantity: "1", unitPrice: "0", discountType: "NONE", discountValue: "0", taxBehavior: "STANDARD" });

export default function QuoteBuilder({
  quotationId,
  initial,
  services,
  packages,
  owners,
  settings,
  lockedClient
}: {
  quotationId: string | null;
  initial: BuilderInitial;
  services: CatalogService[];
  packages: CatalogPackage[];
  owners: Opt[] | null;
  settings: { vatRate: string; currency: string; quoteApprovalThreshold: string; discountApprovalPercent: string; quoteExecutiveApprovalThreshold: string | null; customPricingRule: boolean };
  lockedClient: boolean;
}) {
  const t = useTranslations("os.sales");
  const tq = useTranslations("os.sales.q");
  const locale = useLocale();
  const router = useRouter();
  const err = useErrorText();
  const [f, setF] = useState(initial);
  const [clients, setClients] = useState<ClientOpt[] | null>(null);
  const [opps, setOpps] = useState<Opt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof BuilderInitial>(k: K, v: BuilderInitial[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    let live = true;
    void clientOptionsAction().then((r) => live && r.ok && r.data && setClients(r.data));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!f.clientId) return;
    let live = true;
    void opportunityOptionsAction(f.clientId).then((r) => live && setOpps(r.ok && r.data ? r.data : []));
    return () => {
      live = false;
    };
  }, [f.clientId]);

  const contacts = clients?.find((c) => c.id === f.clientId)?.contacts ?? [];

  // live preview — same arithmetic as the server; the server recomputes on save
  const preview = useMemo(() => {
    const lines = f.items.map((i, n) => {
      try {
        return { ok: true as const, r: calcLine({ quantity: i.quantity, unitPrice: i.unitPrice, discountType: i.discountType, discountValue: i.discountValue, taxBehavior: i.taxBehavior }, settings.vatRate, n) };
      } catch (e) {
        return { ok: false as const, code: e instanceof CalcError ? e.code : "VALIDATION" };
      }
    });
    let totals = null;
    try {
      totals = calcTotals(f.items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice, discountType: i.discountType, discountValue: i.discountValue, taxBehavior: i.taxBehavior })), settings.vatRate);
    } catch {
      totals = null;
    }
    const reasons: string[] = [];
    if (totals) {
      if (f.currency !== settings.currency) reasons.push("NON_BASE_CURRENCY");
      else if (settings.quoteExecutiveApprovalThreshold && new Decimal(totals.total).gte(settings.quoteExecutiveApprovalThreshold)) reasons.push("EXECUTIVE_THRESHOLD");
      else if (new Decimal(totals.total).gt(settings.quoteApprovalThreshold)) reasons.push("TOTAL_ABOVE_THRESHOLD");
      if (Decimal.max(new Decimal(totals.discountPercent), new Decimal(totals.maxLineDiscountPercent)).gt(settings.discountApprovalPercent)) reasons.push("DISCOUNT_ABOVE_THRESHOLD");
      if (settings.customPricingRule && f.items.some((i) => !i.serviceId && !i.packageId)) reasons.push("CUSTOM_PRICING");
    }
    return { lines, totals, reasons };
  }, [f.items, f.currency, settings]);

  const updateItem = (key: string, patch: Partial<BuilderItem>) => setF((x) => ({ ...x, items: x.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));
  const removeItem = (key: string) => setF((x) => ({ ...x, items: x.items.filter((i) => i.key !== key) }));
  const moveItem = (key: string, dir: -1 | 1) =>
    setF((x) => {
      const i = x.items.findIndex((r) => r.key === key);
      const j = i + dir;
      if (j < 0 || j >= x.items.length) return x;
      const items = [...x.items];
      [items[i], items[j]] = [items[j], items[i]];
      return { ...x, items };
    });
  const addService = (id: string) => {
    const s = services.find((x) => x.id === id);
    if (!s) return;
    const ar = f.language === "ar";
    setF((x) => ({
      ...x,
      items: [
        ...x.items,
        {
          ...blankItem(),
          serviceId: s.id,
          name: ar ? s.nameAr : s.nameEn,
          description: (ar ? s.quotationDescriptionAr : s.quotationDescriptionEn) ?? "",
          unit: s.pricingModel === "HOURLY" ? (ar ? "ساعة" : "hour") : s.pricingModel === "MONTHLY" ? (ar ? "شهر" : "month") : s.pricingModel === "ANNUAL" ? (ar ? "سنة" : "year") : s.pricingModel === "PER_USER" ? (ar ? "مستخدم" : "user") : "",
          unitPrice: s.basePrice ?? "0",
          taxBehavior: (s.taxBehavior as TaxKind) ?? "STANDARD"
        }
      ],
      termsAndConditions: x.termsAndConditions || ((ar ? s.defaultTermsAr : s.defaultTermsEn) ?? "")
    }));
  };
  const addPackage = (id: string) => {
    const p = packages.find((x) => x.id === id);
    if (!p) return;
    const ar = f.language === "ar";
    const lines = p.items.map((i) => `• ${ar ? i.nameAr : i.nameEn}${Number(i.quantity) !== 1 ? ` × ${i.quantity}` : ""}${i.optional ? (ar ? " (اختياري)" : " (optional)") : ""}`);
    setF((x) => ({ ...x, items: [...x.items, { ...blankItem(), packageId: p.id, name: ar ? p.nameAr : p.nameEn, description: [(ar ? p.descriptionAr : p.descriptionEn) ?? "", ...lines].filter(Boolean).join("\n"), unitPrice: p.defaultPrice, taxBehavior: p.taxBehavior as TaxKind }] }));
  };

  const payload = () => ({
    clientId: f.clientId,
    contactId: f.contactId || null,
    opportunityId: f.opportunityId || null,
    ownerId: f.ownerId || null,
    language: f.language,
    currency: f.currency,
    issueDate: f.issueDate || null,
    validUntil: f.validUntil || null,
    paymentTerms: f.paymentTerms,
    deliveryTerms: f.deliveryTerms,
    termsAndConditions: f.termsAndConditions,
    notes: f.notes,
    clientMessage: f.clientMessage,
    items: f.items.map((i) => ({ serviceId: i.serviceId ?? null, packageId: i.packageId ?? null, name: i.name, description: i.description, unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice, discountType: i.discountType, discountValue: i.discountValue, taxBehavior: i.taxBehavior }))
  });

  const save = (submit: boolean) =>
    start(async () => {
      setError(null);
      if (!f.clientId) return setError(tq("needClient"));
      const r = await saveQuotationAction(quotationId, payload());
      if (!r.ok) {
        const line = r.field?._detail;
        return setError(t.has(`calc.${r.error}`) ? t(`calc.${r.error}` as "calc.QTY_INVALID") : err(r.error) + (line ? ` (${line})` : ""));
      }
      const id = r.data!.id;
      if (submit) {
        const s = await submitQuotationAction(id);
        if (!s.ok) {
          router.push(`/app/sales/quotations/${id}`);
          return setError(t.has(`errors.${s.error}`) ? t(`errors.${s.error}` as "errors.QUOTE_NEEDS_ITEMS") : err(s.error));
        }
      }
      router.push(`/app/sales/quotations/${id}`);
      router.refresh();
    });

  const money = (v: string) => formatMoney(v, locale, f.currency);
  const sectionCls = "os-card p-4 sm:p-5";
  const h = "mb-3 text-[13px] font-semibold uppercase tracking-wide text-os-muted";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <div className="grid min-w-0 gap-5">
        {/* CLIENT */}
        <section className={sectionCls}>
          <h2 className={h}>{tq("client")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={tq("f.client")}>
              {lockedClient ? (
                <input className="os-input" value={f.clientLabel ?? ""} disabled readOnly />
              ) : (
                <select className="os-input" value={f.clientId} onChange={(e) => setF((x) => ({ ...x, clientId: e.target.value, contactId: "", opportunityId: "" }))}>
                  <option value="">{clients ? "—" : "…"}</option>
                  {clients?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={tq("f.contact")}>
              <select className="os-input" value={f.contactId} onChange={(e) => set("contactId", e.target.value)} disabled={!f.clientId}>
                <option value="">—</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={tq("f.opportunity")}>
              <select className="os-input" value={f.opportunityId} onChange={(e) => set("opportunityId", e.target.value)} disabled={!f.clientId}>
                <option value="">—</option>
                {opps?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={tq("f.language")}>
              <select className="os-input" value={f.language} onChange={(e) => set("language", e.target.value as "ar" | "en")}>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </Field>
            <Field label={tq("f.currency")} hint={f.currency !== settings.currency ? tq("currencyHint") : undefined}>
              <input className="os-input" dir="ltr" maxLength={3} value={f.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
            </Field>
            {owners && (
              <Field label={tq("f.owner")}>
                <select className="os-input" value={f.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        </section>

        {/* ITEMS */}
        <section className={sectionCls}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className={`${h} mb-0`}>{tq("items")}</h2>
            <div className="flex flex-wrap gap-1.5">
              <select className="os-input h-8 w-auto py-0 text-xs" value="" onChange={(e) => e.target.value && addService(e.target.value)} aria-label={tq("addService")}>
                <option value="">+ {tq("addService")}</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {locale === "ar" ? s.nameAr : s.nameEn}
                  </option>
                ))}
              </select>
              {packages.length > 0 && (
                <select className="os-input h-8 w-auto py-0 text-xs" value="" onChange={(e) => e.target.value && addPackage(e.target.value)} aria-label={tq("addPackage")}>
                  <option value="">+ {tq("addPackage")}</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {locale === "ar" ? p.nameAr : p.nameEn}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" className="os-btn-secondary h-8 px-2.5 text-xs" onClick={() => set("items", [...f.items, blankItem()])}>
                + {tq("addCustom")}
              </button>
            </div>
          </div>

          {f.items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-os-line py-8 text-center text-sm text-os-muted">{tq("noItems")}</p>
          ) : (
            <div className="grid gap-2">
              {f.items.map((i, n) => {
                const p = preview.lines[n];
                return (
                  <div key={i.key} className="grid gap-2 rounded-lg border border-os-line bg-os-panel p-2.5">
                    {/* line 1: name · line total · actions */}
                    <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
                      <span className="mt-1.5 w-5 shrink-0 text-center text-xs text-os-faint tabular">{n + 1}</span>
                      <div className="grid min-w-0 flex-1 basis-[calc(100%-3rem)] gap-1.5 sm:basis-auto">
                        <div className="flex items-center gap-1.5">
                          {(i.serviceId || i.packageId) && <span className="shrink-0 rounded bg-iris/15 px-1.5 py-0.5 text-[10px] text-iris-light">{i.packageId ? tq("pkg") : tq("svc")}</span>}
                          <input className="os-input h-8 font-medium" placeholder={tq("f.itemName")} value={i.name} onChange={(e) => updateItem(i.key, { name: e.target.value })} />
                        </div>
                        <textarea className="os-input min-h-[34px] py-1.5 text-xs" rows={i.description ? 2 : 1} placeholder={tq("f.description")} value={i.description} onChange={(e) => updateItem(i.key, { description: e.target.value })} />
                      </div>
                      <div className="ms-7 shrink-0 pt-1 sm:ms-0 sm:w-[118px] sm:text-end">
                        <span className="block text-[10px] text-os-faint">{tq("f.lineTotal")}</span>
                        {p?.ok ? (
                          <span className="text-sm font-semibold tabular" dir="ltr">
                            {money(p.r.total)}
                            {p.r.discount !== "0.00" && <span className="block text-[10.5px] font-normal text-os-faint">−{money(p.r.discount)}</span>}
                            {p.r.gross === "0.00" && <span className="block text-[10.5px] font-normal text-warning">{tq("zeroPrice")}</span>}
                          </span>
                        ) : (
                          <span className="text-xs text-danger">{t.has(`calc.${p?.code}`) ? t(`calc.${p?.code}` as "calc.QTY_INVALID") : "!"}</span>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col">
                        <button type="button" className="os-btn-ghost size-6 px-0" onClick={() => moveItem(i.key, -1)} aria-label="up" disabled={n === 0}>
                          <Icon name="ChevronDown" size={13} className="rotate-180" />
                        </button>
                        <button type="button" className="os-btn-ghost size-6 px-0" onClick={() => moveItem(i.key, 1)} aria-label="down" disabled={n === f.items.length - 1}>
                          <Icon name="ChevronDown" size={13} />
                        </button>
                        <button type="button" className="os-btn-ghost size-6 px-0 text-danger" onClick={() => removeItem(i.key)} aria-label={tq("remove")}>
                          <Icon name="X" size={13} />
                        </button>
                      </div>
                    </div>
                    {/* line 2: commercial fields */}
                    <div className="grid grid-cols-2 gap-2 ps-7 sm:grid-cols-[90px_130px_minmax(150px,1fr)_minmax(120px,1fr)]">
                      <label className="grid gap-0.5">
                        <span className="text-[10px] text-os-faint">{tq("f.qty")}</span>
                        <input className="os-input h-8" dir="ltr" inputMode="decimal" value={i.quantity} onChange={(e) => updateItem(i.key, { quantity: e.target.value })} />
                      </label>
                      <label className="grid gap-0.5">
                        <span className="text-[10px] text-os-faint">{tq("f.price")}</span>
                        <input className="os-input h-8" dir="ltr" inputMode="decimal" value={i.unitPrice} onChange={(e) => updateItem(i.key, { unitPrice: e.target.value })} />
                      </label>
                      <label className="grid gap-0.5">
                        <span className="text-[10px] text-os-faint">{tq("f.discount")}</span>
                        <span className="flex gap-1">
                          <select className="os-input h-8 w-[70px] shrink-0 px-1.5 text-xs" value={i.discountType} onChange={(e) => updateItem(i.key, { discountType: e.target.value as DiscountKind })}>
                            <option value="NONE">—</option>
                            <option value="PERCENT">%</option>
                            <option value="FIXED">{f.currency}</option>
                          </select>
                          <input className="os-input h-8 min-w-0" dir="ltr" inputMode="decimal" disabled={i.discountType === "NONE"} value={i.discountType === "NONE" ? "" : i.discountValue} onChange={(e) => updateItem(i.key, { discountValue: e.target.value })} />
                        </span>
                      </label>
                      <label className="grid gap-0.5">
                        <span className="text-[10px] text-os-faint">{tq("f.tax")}</span>
                        <select className="os-input h-8 text-xs" value={i.taxBehavior} onChange={(e) => updateItem(i.key, { taxBehavior: e.target.value as TaxKind })}>
                          <option value="STANDARD">{tq("tax.STANDARD", { r: settings.vatRate })}</option>
                          <option value="ZERO_RATED">{tq("tax.ZERO_RATED")}</option>
                          <option value="EXEMPT">{tq("tax.EXEMPT")}</option>
                        </select>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* TERMS */}
        <section className={sectionCls}>
          <h2 className={h}>{tq("terms")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tq("f.issueDate")}>
              <input type="date" className="os-input" value={f.issueDate} onChange={(e) => set("issueDate", e.target.value)} />
            </Field>
            <Field label={tq("f.validUntil")}>
              <input type="date" className="os-input" value={f.validUntil} onChange={(e) => set("validUntil", e.target.value)} />
            </Field>
            <Field label={tq("f.paymentTerms")}>
              <textarea className="os-input" rows={3} value={f.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} />
            </Field>
            <Field label={tq("f.deliveryTerms")}>
              <textarea className="os-input" rows={3} value={f.deliveryTerms} onChange={(e) => set("deliveryTerms", e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label={tq("f.terms")}>
                <textarea className="os-input" rows={5} value={f.termsAndConditions} onChange={(e) => set("termsAndConditions", e.target.value)} />
              </Field>
            </div>
            <Field label={tq("f.clientMessage")} hint={tq("clientMessageHint")}>
              <textarea className="os-input" rows={3} value={f.clientMessage} onChange={(e) => set("clientMessage", e.target.value)} />
            </Field>
            <Field label={tq("f.notes")} hint={tq("notesHint")}>
              <textarea className="os-input" rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
        </section>
      </div>

      {/* SUMMARY */}
      <aside className="os-card grid gap-3 p-4 xl:sticky xl:top-20">
        <h2 className={`${h} mb-0`}>{tq("summary")}</h2>
        {preview.totals ? (
          <dl className="grid gap-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-os-muted">{tq("subtotal")}</dt>
              <dd className="tabular" dir="ltr">{money(preview.totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-os-muted">
                {tq("discount")} <span className="text-[11px] text-os-faint">({preview.totals.discountPercent}%)</span>
              </dt>
              <dd className="tabular text-danger" dir="ltr">−{money(preview.totals.discountTotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-os-muted">{tq("vat", { r: settings.vatRate })}</dt>
              <dd className="tabular" dir="ltr">{money(preview.totals.taxTotal)}</dd>
            </div>
            <div className="mt-1 flex justify-between gap-3 border-t border-os-line pt-2 text-base font-semibold">
              <dt>{tq("total")}</dt>
              <dd className="tabular" dir="ltr">{money(preview.totals.total)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-danger">{tq("fixLines")}</p>
        )}
        <div className={`rounded-lg border px-3 py-2 text-xs ${preview.reasons.length ? "border-warning/30 bg-warning/10 text-warning" : "border-success/30 bg-success/10 text-success"}`}>
          {preview.reasons.length ? (
            <>
              <p className="font-medium">{tq("needsApproval")}</p>
              <ul className="mt-1 list-inside list-disc">
                {preview.reasons.map((r) => (
                  <li key={r}>{t(`reasons.${r}` as "reasons.TOTAL_ABOVE_THRESHOLD")}</li>
                ))}
              </ul>
            </>
          ) : (
            tq("noApproval")
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-os-faint">{tq("serverNote")}</p>
        {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
        <div className="grid gap-2">
          <button type="button" className="os-btn-secondary" disabled={pending} onClick={() => save(false)}>
            {pending ? "…" : tq("saveDraft")}
          </button>
          <button type="button" className="os-btn-primary" disabled={pending || !f.items.length} onClick={() => save(true)}>
            {tq("saveSubmit")}
          </button>
        </div>
      </aside>
    </div>
  );
}
