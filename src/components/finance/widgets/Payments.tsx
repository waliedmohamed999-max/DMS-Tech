"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Decimal, formatMoney } from "@/lib/commercial/calc";
import { openInvoicesAction, recordPaymentAction, reversePaymentAction } from "@/lib/os/finance-actions";
import { Field, Modal } from "@/components/os/client";
import { Money, newKey, useFinRun } from "../shared";
import { type Opt, localToday, Err } from "./shared";

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

type OpenInv = { id: string; number: string | null; dueDate: string; total: string; balance: string; currency: string; status: string };

export function PaymentForm({ clients, initialClient, initialInvoice, onDone, today = localToday() }: { clients: (Opt & { balance: string })[]; initialClient?: string; initialInvoice?: string; onDone?: () => void; today?: string }) {
  const t = useTranslations("os.finance");
  const locale = useLocale();
  const router = useRouter();
  const { pending, error, run } = useFinRun();
  const [clientId, setClientId] = useState(initialClient ?? "");
  const [open, setOpen] = useState<OpenInv[]>([]);
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [f, setF] = useState({ paymentDate: today, method: "BANK_TRANSFER", reference: "", notes: "" });
  const [key] = useState(newKey);
  const loader = useFinRun();
  useEffect(() => {
    if (!clientId) return;
    loader.run(
      () => openInvoicesAction(clientId),
      (r) => {
        const rows = (r.ok ? r.data : []) as OpenInv[];
        setOpen(rows);
        setAlloc(initialInvoice ? Object.fromEntries(rows.filter((x) => x.id === initialInvoice).map((x) => [x.id, x.balance])) : {});
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);
  const sum = useMemo(() => Object.values(alloc).reduce((s, v) => { try { return s.plus(v || 0); } catch { return s; } }, new Decimal(0)), [alloc]);
  const currency = open.find((x) => alloc[x.id])?.currency ?? open[0]?.currency ?? "SAR";
  const allocations = Object.entries(alloc).filter(([, v]) => v && Number(v) > 0).map(([invoiceId, amount]) => ({ invoiceId, amount }));
  return (
    <div className="grid gap-3 text-sm">
      <Field label={t("f.client")}>
        <select className="os-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">—</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} — {formatMoney(c.balance, locale)}
            </option>
          ))}
        </select>
      </Field>
      {clientId && (
        <div className="grid gap-1.5">
          <p className="text-xs font-semibold">{t("allocate")}</p>
          {open.length === 0 && <p className="text-xs text-os-muted">{t("noOpenInvoices")}</p>}
          {open.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-os-line px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium" dir="ltr">
                  {i.number}
                </p>
                <p className="text-[11px] text-os-faint">
                  {t("due")} {i.dueDate} · {t("balance")} <Money v={i.balance} currency={i.currency} />
                </p>
              </div>
              <button type="button" className="os-btn-ghost h-7 px-2 text-[11px]" onClick={() => setAlloc({ ...alloc, [i.id]: i.balance })}>
                {t("full")}
              </button>
              <input className="os-input h-8 w-32" dir="ltr" inputMode="decimal" placeholder="0.00" value={alloc[i.id] ?? ""} onChange={(e) => setAlloc({ ...alloc, [i.id]: e.target.value })} aria-label={`${t("allocate")} ${i.number}`} />
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label={t("f.paymentDate")}>
          <input type="date" className="os-input" max={today} value={f.paymentDate} onChange={(e) => setF({ ...f, paymentDate: e.target.value })} />
        </Field>
        <Field label={t("f.method")}>
          <select className="os-input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
            {["BANK_TRANSFER", "CASH", "CARD", "PAYMENT_GATEWAY", "OTHER"].map((m) => (
              <option key={m} value={m}>
                {t(`method.${m}` as "method.CASH")}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("f.reference")}>
          <input className="os-input" dir="ltr" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
        </Field>
      </div>
      <Field label={t("f.notes")}>
        <input className="os-input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </Field>
      <div className="flex items-center justify-between rounded-lg bg-os-panel px-3 py-2">
        <span className="text-xs text-os-muted">{t("paymentAmount")}</span>
        <span className="text-base font-semibold tabular" dir="ltr">
          {formatMoney(sum.toFixed(2), locale, currency)}
        </span>
      </div>
      <p className="text-[11px] text-os-faint">{t("allocationPolicy")}</p>
      <Err e={error} />
      <button
        type="button"
        className="os-btn-primary"
        disabled={pending || !allocations.length || sum.lte(0)}
        onClick={() =>
          run(() => recordPaymentAction({ clientId, amount: sum.toFixed(2), currency, ...f, reference: f.reference || null, notes: f.notes || null, idempotencyKey: key, allocations }), (r) => {
            onDone?.();
            if (r.ok) router.push(`/app/finance/payments/${(r.data as { id: string }).id}`);
          })
        }
      >
        {t("a.recordPayment")}
      </button>
    </div>
  );
}

export function NewPaymentButton({ clients, initialClient, initialInvoice, autoOpen, today }: { clients: (Opt & { balance: string })[]; initialClient?: string; initialInvoice?: string; autoOpen?: boolean; today?: string }) {
  const t = useTranslations("os.finance");
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(autoOpen));
  // the dialog's close event also fires after a successful save — only a dismissal clears ?new=1
  const saved = useRef(false);
  const close = () => {
    setOpen(false);
    if (autoOpen && !saved.current) router.replace("/app/finance/payments");
  };
  return (
    <>
      <button type="button" className="os-btn-primary" onClick={() => setOpen(true)}>
        + {t("a.recordPayment")}
      </button>
      <Modal open={open} onClose={close} title={t("a.recordPayment")} wide>
        {/* Phase 10 wording review: recording only — the OS never moves money */}
        <p className="mb-3 rounded-md border border-os-line px-3 py-2 text-xs text-os-muted">{t("recordOnlyPayment")}</p>
        <PaymentForm
          clients={clients}
          initialClient={initialClient}
          initialInvoice={initialInvoice}
          today={today}
          onDone={() => {
            saved.current = true;
            setOpen(false);
          }}
        />
      </Modal>
    </>
  );
}

export function ReversePayment({ id }: { id: string }) {
  const t = useTranslations("os.finance");
  const { pending, error, run } = useFinRun();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <button type="button" className="os-btn-ghost text-danger" onClick={() => setOpen(true)}>
        {t("a.reverse")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("a.reverse")}>
        <div className="grid gap-3 text-sm">
          <p className="text-xs text-os-muted">{t("reverseNote")}</p>
          <textarea className="os-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPh")} />
          <Err e={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-danger" disabled={pending || reason.trim().length < 5} onClick={() => run(() => reversePaymentAction(id, reason.trim()), () => setOpen(false))}>
              {t("a.reverse")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
