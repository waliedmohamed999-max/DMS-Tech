"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Decimal } from "@/lib/commercial/calc";
import { cancelExpenseAction, createExpenseAction, payExpenseAction, submitExpenseAction, updateExpenseAction, withdrawExpenseAction } from "@/lib/os/finance-actions";
import { Field, Modal } from "@/components/os/client";
import { useFinRun } from "../shared";
import { type Opt, localToday, Err } from "./shared";

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export type ExpenseValue = { categoryId: string; vendorId: string; projectId: string; date: string; amount: string; taxAmount: string; currency: string; paymentMethod: string; description: string; reference: string };

export function ExpenseForm({ id, initial, categories, vendors, projects, trigger, autoOpen, vatRate, today = localToday() }: { id?: string; initial?: ExpenseValue; categories: Opt[]; vendors: Opt[]; projects: Opt[]; trigger: string; autoOpen?: boolean; vatRate: string; today?: string }) {
  const t = useTranslations("os.finance");
  const router = useRouter();
  const { pending, error, run } = useFinRun();
  const [open, setOpen] = useState(Boolean(autoOpen));
  const [f, setF] = useState<ExpenseValue>(initial ?? { categoryId: categories[0]?.id ?? "", vendorId: "", projectId: "", date: today, amount: "", taxAmount: "", currency: "SAR", paymentMethod: "", description: "", reference: "" });
  const saved = useRef(false);
  const close = () => {
    setOpen(false);
    if (autoOpen && !saved.current) router.replace("/app/finance/expenses");
  };
  const body = () => ({ ...f, vendorId: f.vendorId || null, projectId: f.projectId || null, paymentMethod: f.paymentMethod || null, reference: f.reference || null, taxAmount: f.taxAmount || "0" });
  return (
    <>
      <button type="button" className={id ? "os-btn-ghost" : "os-btn-primary"} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <Modal open={open} onClose={close} title={trigger} wide>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={t("f.description")}>
              <input className="os-input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </Field>
          </div>
          <Field label={t("f.category")}>
            <select className="os-input" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.date")}>
            <input type="date" className="os-input" max={today} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label={t("f.amountNet")}>
            <input className="os-input" dir="ltr" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </Field>
          <Field label={t("f.vatAmount")} hint={t("vatHint", { r: vatRate })}>
            <div className="flex gap-1">
              <input className="os-input" dir="ltr" inputMode="decimal" value={f.taxAmount} onChange={(e) => setF({ ...f, taxAmount: e.target.value })} />
              <button type="button" className="os-btn-ghost h-9 shrink-0 px-2 text-[11px]" onClick={() => { try { setF({ ...f, taxAmount: new Decimal(f.amount || 0).mul(vatRate).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2) }); } catch { /* invalid amount */ } }}>
                {vatRate}%
              </button>
            </div>
          </Field>
          <Field label={t("f.vendor")}>
            <select className="os-input" value={f.vendorId} onChange={(e) => setF({ ...f, vendorId: e.target.value })}>
              <option value="">—</option>
              {vendors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.project")}>
            <select className="os-input" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}>
              <option value="">—</option>
              {projects.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.method")}>
            <select className="os-input" value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>
              <option value="">—</option>
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
          <p className="text-[11px] text-os-faint sm:col-span-2">{t("receiptNote")}</p>
          <div className="sm:col-span-2">
            <Err e={error} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="os-btn-ghost" onClick={close}>
              {t("cancel")}
            </button>
            <button
              type="button"
              className="os-btn-primary"
              disabled={pending || f.description.trim().length < 3 || !f.amount}
              onClick={() => run(() => (id ? updateExpenseAction(id, body()) : createExpenseAction(body())), (r) => {
                saved.current = true;
                setOpen(false);
                if (!id && r.ok) router.push(`/app/finance/expenses/${(r.data as { id: string }).id}`);
              })}
            >
              {t("save")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function ExpenseActions({ id, status, can, today = localToday() }: { id: string; status: string; can: { submit: boolean; withdraw: boolean; pay: boolean; cancel: boolean }; today?: string }) {
  const t = useTranslations("os.finance");
  const { pending, error, run } = useFinRun();
  const [pay, setPay] = useState(false);
  const [f, setF] = useState({ paymentMethod: "BANK_TRANSFER", paymentReference: "", paidDate: today });
  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex flex-wrap gap-1.5">
        {can.submit && (status === "DRAFT" || status === "REJECTED") && (
          <button type="button" className="os-btn-primary" disabled={pending} onClick={() => run(() => submitExpenseAction(id))}>
            {t("a.submitExpense")}
          </button>
        )}
        {can.withdraw && status === "PENDING_APPROVAL" && (
          <button type="button" className="os-btn-ghost" disabled={pending} onClick={() => run(() => withdrawExpenseAction(id))}>
            {t("a.withdraw")}
          </button>
        )}
        {can.pay && status === "APPROVED" && (
          <button type="button" className="os-btn-primary" onClick={() => setPay(true)}>
            {t("a.markPaid")}
          </button>
        )}
        {can.cancel && ["DRAFT", "REJECTED", "APPROVED"].includes(status) && (
          <button type="button" className="os-btn-ghost text-danger" disabled={pending} onClick={() => run(() => cancelExpenseAction(id))}>
            {t("a.cancelExpense")}
          </button>
        )}
      </div>
      {error && !pay && <span className="text-[11px] text-danger">{error}</span>}
      <Modal open={pay} onClose={() => setPay(false)} title={t("a.markPaid")}>
        <div className="grid gap-3 text-sm">
          <p className="rounded-md border border-os-line px-3 py-2 text-xs text-os-muted">{t("recordOnlyExpense")}</p>
          <Field label={t("f.paidDate")}>
            <input type="date" className="os-input" max={today} value={f.paidDate} onChange={(e) => setF({ ...f, paidDate: e.target.value })} />
          </Field>
          <Field label={t("f.method")}>
            <select className="os-input" value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>
              {["BANK_TRANSFER", "CASH", "CARD", "PAYMENT_GATEWAY", "OTHER"].map((m) => (
                <option key={m} value={m}>
                  {t(`method.${m}` as "method.CASH")}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.reference")}>
            <input className="os-input" dir="ltr" value={f.paymentReference} onChange={(e) => setF({ ...f, paymentReference: e.target.value })} />
          </Field>
          <Err e={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={() => setPay(false)}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending} onClick={() => run(() => payExpenseAction(id, { ...f, paymentReference: f.paymentReference || null }), () => setPay(false))}>
              {t("a.markPaid")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
