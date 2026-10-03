"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Decimal, formatMoney } from "@/lib/commercial/calc";
import {
  archiveVendorAction, cancelExpenseAction, cancelInvoiceAction, collectionNoteAction, createExpenseAction, createInvoiceFromSourceAction, createVendorAction, issueInvoiceAction,
  markInvoiceSentAction, openInvoicesAction, payExpenseAction, recordPaymentAction, reversePaymentAction, saveCategoryAction, setCostRateAction, submitExpenseAction,
  updateExpenseAction, updateVendorAction, voidInvoiceAction, withdrawExpenseAction
} from "@/lib/os/finance-actions";
import { Field, Modal } from "@/components/os/client";
import { Money, newKey, useFinRun } from "./shared";

type Opt = { id: string; label: string };
/** fallback only — pages pass the company's calendar day (org timezone) as `today` */
const localToday = () => new Date().toISOString().slice(0, 10);

function Err({ e }: { e: string | null }) {
  return e ? <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{e}</p> : null;
}

// ---------------------------------------------------------------------------
// Invoice header actions
// ---------------------------------------------------------------------------

export function InvoiceActions({ id, status, sent, paid, can, total, currency }: { id: string; status: string; sent: boolean; paid: boolean; total: string; currency: string; can: { edit: boolean; issue: boolean; send: boolean; cancel: boolean; pay: boolean; create: boolean } }) {
  const t = useTranslations("os.finance");
  const router = useRouter();
  const { pending, error, run } = useFinRun();
  const [modal, setModal] = useState<null | "issue" | "send" | "cancel" | "void">(null);
  const [method, setMethod] = useState("EMAIL_MANUAL");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [replace, setReplace] = useState(true);
  const close = () => {
    setModal(null);
    setNote("");
    setConfirm(false);
  };
  const open = ["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE"].includes(status);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === "DRAFT" && can.edit && (
        <a href={`/app/finance/invoices/${id}?edit=1`} className="os-btn-ghost">
          {t("a.edit")}
        </a>
      )}
      {status === "DRAFT" && can.issue && (
        <button type="button" className="os-btn-primary" onClick={() => setModal("issue")}>
          {t("a.issue")}
        </button>
      )}
      {!sent && ["ISSUED", "OVERDUE", "PARTIALLY_PAID"].includes(status) && can.send && (
        <button type="button" className="os-btn-secondary" onClick={() => setModal("send")}>
          {t("a.markSent")}
        </button>
      )}
      {open && can.pay && (
        <a href={`/app/finance/payments?new=1&invoice=${id}`} className="os-btn-primary">
          {t("a.recordPayment")}
        </a>
      )}
      {status === "DRAFT" && can.cancel && (
        <button type="button" className="os-btn-ghost text-danger" onClick={() => setModal("cancel")}>
          {t("a.cancel")}
        </button>
      )}
      {["ISSUED", "SENT", "OVERDUE"].includes(status) && !paid && can.cancel && (
        <button type="button" className="os-btn-ghost text-danger" onClick={() => setModal("void")}>
          {t("a.void")}
        </button>
      )}

      <Modal open={modal === "issue"} onClose={close} title={t("a.issue")}>
        <div className="grid gap-3 text-sm">
          <p>{t("issueText", { total: formatMoney(total, "en", currency) })}</p>
          <p className="text-xs text-os-muted">{t("issueNote")}</p>
          <Err e={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={close}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending} onClick={() => run(() => issueInvoiceAction(id), close)}>
              {t("a.issue")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === "send"} onClose={close} title={t("a.markSent")}>
        <div className="grid gap-3 text-sm">
          <p className="text-xs text-os-muted">{t("sendNote")}</p>
          <Field label={t("f.method")}>
            <select className="os-input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {["EMAIL_MANUAL", "WHATSAPP_MANUAL", "IN_PERSON", "PORTAL_MANUAL", "OTHER"].map((m) => (
                <option key={m} value={m}>
                  {t(`send.${m}` as "send.OTHER")}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.note")}>
            <input className="os-input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 accent-[#624de3]" /> {t("sendConfirm")}
          </label>
          <Err e={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={close}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending || !confirm} onClick={() => run(() => markInvoiceSentAction(id, { method, note, confirm: true }), close)}>
              {t("record")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === "cancel" || modal === "void"} onClose={close} title={modal === "void" ? t("a.void") : t("a.cancel")}>
        <div className="grid gap-3 text-sm">
          <p className="text-xs text-os-muted">{modal === "void" ? t("voidNote") : t("cancelNote")}</p>
          <textarea className="os-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("reasonPh")} />
          {modal === "void" && can.create && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="accent-[#624de3]" /> {t("voidReplace")}
            </label>
          )}
          <Err e={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={close}>
              {t("cancel")}
            </button>
            <button
              type="button"
              className="os-btn-danger"
              disabled={pending || note.trim().length < 5}
              onClick={() =>
                modal === "void"
                  ? run(() => voidInvoiceAction(id, note.trim(), replace && can.create), (r) => {
                      close();
                      const rid = r.ok ? (r.data as { replacementId: string | null })?.replacementId : null;
                      if (rid) router.push(`/app/finance/invoices/${rid}?edit=1`);
                    })
                  : run(() => cancelInvoiceAction(id, note.trim()), close)
              }
            >
              {modal === "void" ? t("a.void") : t("a.cancel")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function CollectionNoteForm({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations("os.finance");
  const { pending, error, run } = useFinRun();
  const [f, setF] = useState({ kind: "NOTE", channel: "", note: "", followUpAt: "" });
  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <select className="os-input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label={t("f.kind")}>
          {["NOTE", "REMINDER", "PROMISE_TO_PAY"].map((k) => (
            <option key={k} value={k}>
              {t(`note.${k}` as "note.NOTE")}
            </option>
          ))}
        </select>
        <select className="os-input" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} aria-label={t("f.channel")}>
          <option value="">{t("f.channel")}…</option>
          {["EMAIL", "PHONE", "WHATSAPP", "IN_PERSON", "OTHER"].map((k) => (
            <option key={k} value={k}>
              {t(`channel.${k}` as "channel.OTHER")}
            </option>
          ))}
        </select>
        <input type="date" className="os-input" value={f.followUpAt} onChange={(e) => setF({ ...f, followUpAt: e.target.value })} aria-label={t("f.followUp")} title={t("f.followUp")} />
      </div>
      <textarea className="os-input" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={t("notePh")} />
      <p className="text-[11px] text-os-faint">{t("manualReminderNote")}</p>
      <Err e={error} />
      <button type="button" className="os-btn-secondary h-8 justify-self-end px-3 text-xs" disabled={pending || f.note.trim().length < 2} onClick={() => run(() => collectionNoteAction(invoiceId, { kind: f.kind, channel: f.channel || null, note: f.note, followUpAt: f.followUpAt || null }), () => setF({ ...f, note: "" }))}>
        {t("addNote")}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing sources
// ---------------------------------------------------------------------------

export type CandidateView = { type: string; id: string; label: string; ref: string; clientName: string; eligible: boolean; reasons: string[]; blockers: { code: string; params?: Record<string, string | number> }[]; amount: string | null; currency: string; meta?: Record<string, string | number | null> };

export function SourceList({ items, highlight }: { items: CandidateView[]; highlight?: string }) {
  const t = useTranslations("os.finance");
  const router = useRouter();
  const { pending, error, run } = useFinRun();
  const [busy, setBusy] = useState<string | null>(null);
  if (!items.length) return <p className="px-4 py-6 text-center text-sm text-os-muted">{t("noSources")}</p>;
  return (
    <div className="grid">
      {error && (
        <div className="p-3">
          <Err e={error} />
        </div>
      )}
      <ul className="divide-y divide-os-line">
        {items.map((c) => (
          <li key={`${c.type}-${c.id}`} className={`flex flex-wrap items-center gap-3 px-4 py-3 text-sm ${highlight === c.id ? "bg-iris/5" : ""}`}>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-os-line px-1.5 text-[10.5px] text-os-muted">{t(`source.${c.type}` as "source.MANUAL")}</span>
                <span className="font-medium">{c.label}</span>
              </p>
              <p className="mt-0.5 text-[11px] text-os-faint">
                <span dir="ltr">{c.ref}</span> · {c.clientName}
                {c.meta?.minutes ? ` · ${Math.round(Number(c.meta.minutes) / 6) / 10}h` : ""}
              </p>
              <p className="mt-1 flex flex-wrap gap-1 text-[11px]">
                {c.reasons.map((r) => (
                  <span key={r} className="text-success">
                    ✓ {t(`reason.${r}` as "reason.MILESTONE_DUE")}
                  </span>
                ))}
                {c.blockers.map((b) => (
                  <span key={b.code} className="text-warning">
                    ⛔ {t(`blocker.${b.code}` as "blocker.ALREADY_INVOICED", { number: "", due: "", ...(b.params ?? {}) })}
                  </span>
                ))}
              </p>
            </div>
            {c.amount !== null && <Money v={c.amount} currency={c.currency} className="text-sm font-semibold" />}
            <button
              type="button"
              className={c.eligible ? "os-btn-primary h-8 px-3 text-xs" : "os-btn-secondary h-8 px-3 text-xs"}
              disabled={!c.eligible || pending}
              onClick={() => {
                setBusy(c.id);
                run(() => createInvoiceFromSourceAction({ type: c.type, id: c.id }), (r) => r.ok && router.push(`/app/finance/invoices/${(r.data as { id: string }).id}`));
              }}
            >
              {pending && busy === c.id ? "…" : t("createInvoice")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

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

// ---------------------------------------------------------------------------
// Vendors, categories, cost rates
// ---------------------------------------------------------------------------

type VendorValue = { name: string; contactName: string; phone: string; email: string; taxNumber: string; category: string; paymentTerms: string; notes: string };

export function VendorForm({ id, initial, trigger, autoOpen }: { id?: string; initial?: VendorValue; trigger: string; autoOpen?: boolean }) {
  const t = useTranslations("os.finance");
  const router = useRouter();
  const { pending, error, run } = useFinRun();
  const [open, setOpen] = useState(Boolean(autoOpen));
  const [f, setF] = useState<VendorValue>(initial ?? { name: "", contactName: "", phone: "", email: "", taxNumber: "", category: "", paymentTerms: "", notes: "" });
  const close = () => {
    setOpen(false);
    if (autoOpen) router.replace("/app/finance/vendors"); // vendors stay on the list page after saving
  };
  const fields: (keyof VendorValue)[] = ["name", "contactName", "phone", "email", "taxNumber", "category", "paymentTerms"];
  return (
    <>
      <button type="button" className={id ? "os-btn-ghost h-7 px-2 text-xs" : "os-btn-primary"} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <Modal open={open} onClose={close} title={trigger}>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          {fields.map((k) => (
            <Field key={k} label={t(`v.${k}` as "v.name")}>
              <input className="os-input" dir={["phone", "email", "taxNumber"].includes(k) ? "ltr" : undefined} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </Field>
          ))}
          <div className="sm:col-span-2">
            <Field label={t("v.notes")}>
              <textarea className="os-input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Err e={error} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="os-btn-ghost" onClick={close}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending || f.name.trim().length < 2} onClick={() => run(() => (id ? updateVendorAction(id, f) : createVendorAction(f)), close)}>
              {t("save")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function ArchiveVendor({ id, archived }: { id: string; archived: boolean }) {
  const t = useTranslations("os.finance");
  const { pending, run } = useFinRun();
  return (
    <button type="button" className="os-btn-ghost h-7 px-2 text-xs" disabled={pending} onClick={() => run(() => archiveVendorAction(id, !archived))}>
      {archived ? t("a.restore") : t("a.archive")}
    </button>
  );
}

export function CategoryForm({ id, initial, trigger }: { id?: string; initial?: { nameAr: string; nameEn: string; active: boolean }; trigger: string }) {
  const t = useTranslations("os.finance");
  const { pending, error, run } = useFinRun();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(initial ?? { nameAr: "", nameEn: "", active: true });
  return (
    <>
      <button type="button" className={id ? "os-btn-ghost h-7 px-2 text-xs" : "os-btn-secondary h-8 px-3 text-xs"} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={trigger}>
        <div className="grid gap-3 text-sm">
          <Field label={t("v.nameAr")}>
            <input className="os-input" dir="rtl" value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} />
          </Field>
          <Field label={t("v.nameEn")}>
            <input className="os-input" dir="ltr" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="accent-[#624de3]" /> {t("active")}
          </label>
          <Err e={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending || f.nameAr.trim().length < 2 || f.nameEn.trim().length < 2} onClick={() => run(() => saveCategoryAction({ id, ...f }), () => setOpen(false))}>
              {t("save")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function CostRateForm({ users, today = localToday() }: { users: Opt[]; today?: string }) {
  const t = useTranslations("os.finance");
  const { pending, error, run } = useFinRun();
  const [f, setF] = useState({ userId: "", hourlyCost: "", effectiveFrom: today });
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_160px_auto] sm:items-end">
      <Field label={t("f.person")}>
        <select className="os-input" value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}>
          <option value="">—</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("f.hourlyCost")}>
        <input className="os-input" dir="ltr" inputMode="decimal" value={f.hourlyCost} onChange={(e) => setF({ ...f, hourlyCost: e.target.value })} />
      </Field>
      <Field label={t("f.effectiveFrom")}>
        <input type="date" className="os-input" value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} />
      </Field>
      <button type="button" className="os-btn-primary h-9" disabled={pending || !f.userId || !f.hourlyCost} onClick={() => run(() => setCostRateAction(f), () => setF({ ...f, hourlyCost: "" }))}>
        {t("save")}
      </button>
      {error && (
        <div className="sm:col-span-4">
          <Err e={error} />
        </div>
      )}
    </div>
  );
}
