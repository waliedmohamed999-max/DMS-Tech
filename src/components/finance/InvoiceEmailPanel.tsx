"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Field, Modal } from "@/components/os/client";
import { Icon } from "@/components/ui/Icon";
import { emailInvoiceAction, setInvoiceAutoRemindersAction } from "@/lib/os/finance-actions";

type Log = { id: string; kind: string; to: string; status: string; error: string | null; createdAt: Date | string };

const T = {
  ar: {
    title: "الإرسال للعميل",
    send: "إرسال الفاتورة للعميل",
    remind: "إرسال تذكير بالسداد",
    to: "إلى",
    cc: "نسخة إلى (اختياري)",
    lang: "لغة الرسالة والملف",
    message: "رسالة إضافية (اختياري)",
    hint: "افصل بين العناوين بفاصلة. يُرفق ملف الفاتورة PDF تلقائياً.",
    cancel: "إلغاء",
    submit: "إرسال",
    sending: "جارٍ الإرسال…",
    done: "تم الإرسال ✓",
    notConfigured: "إرسال البريد غير مُفعّل على هذا الجهاز — يعمل على السيرفر الحقيقي (cPanel).",
    log: "سجل الإرسال",
    empty: "لم تُرسل هذه الفاتورة بالبريد بعد.",
    auto: "تذكيرات تلقائية لكل الفواتير",
    autoText: "قبل الاستحقاق، ثم بعد التأخير بيوم و7 و14 يوماً — مرة واحدة لكل خطوة، للفواتير المرسلة فقط.",
    on: "مفعّلة",
    off: "متوقفة",
    kinds: { SEND: "إرسال الفاتورة", REMINDER: "تذكير يدوي", AUTO_DUE_SOON: "تذكير قبل الاستحقاق", AUTO_OVERDUE_1: "تذكير: متأخرة يوماً", AUTO_OVERDUE_7: "تذكير: متأخرة أسبوعاً", AUTO_OVERDUE_14: "تذكير: متأخرة أسبوعين" } as Record<string, string>,
    status: { SENT: "أُرسل", FAILED: "فشل", SKIPPED: "لم يُرسل (البريد غير مُعد)", PENDING: "قيد الإرسال" } as Record<string, string>,
    errors: { EMAIL_NOT_CONFIGURED: "البريد غير مُعد على هذا الخادم.", EMAIL_FAILED: "تعذّر الإرسال — راجع سجل الإرسال.", EMAIL_INVALID: "عنوان بريد غير صحيح.", EMAIL_REQUIRED: "أدخل بريد العميل.", ZATCA_NOT_CLEARED: "الفاتورة لم تُعتمد من هيئة الزكاة بعد.", FORBIDDEN: "ليست لديك صلاحية." } as Record<string, string>,
    fallback: "تعذّر تنفيذ الطلب."
  },
  en: {
    title: "Send to client",
    send: "E-mail invoice to client",
    remind: "Send payment reminder",
    to: "To",
    cc: "Cc (optional)",
    lang: "Message and file language",
    message: "Additional message (optional)",
    hint: "Separate addresses with commas. The invoice PDF is attached automatically.",
    cancel: "Cancel",
    submit: "Send",
    sending: "Sending…",
    done: "Sent ✓",
    notConfigured: "E-mail is not set up on this machine — it works on the live server (cPanel).",
    log: "E-mail log",
    empty: "This invoice has not been e-mailed yet.",
    auto: "Automatic reminders for all invoices",
    autoText: "Before the due date, then 1, 7 and 14 days overdue — once per step, sent invoices only.",
    on: "On",
    off: "Off",
    kinds: { SEND: "Invoice sent", REMINDER: "Manual reminder", AUTO_DUE_SOON: "Due-soon reminder", AUTO_OVERDUE_1: "Reminder: 1 day overdue", AUTO_OVERDUE_7: "Reminder: 7 days overdue", AUTO_OVERDUE_14: "Reminder: 14 days overdue" } as Record<string, string>,
    status: { SENT: "Sent", FAILED: "Failed", SKIPPED: "Not sent (no e-mail set up)", PENDING: "Sending" } as Record<string, string>,
    errors: { EMAIL_NOT_CONFIGURED: "E-mail is not set up on this server.", EMAIL_FAILED: "Sending failed — see the e-mail log.", EMAIL_INVALID: "Invalid e-mail address.", EMAIL_REQUIRED: "Enter the client's e-mail.", ZATCA_NOT_CLEARED: "The invoice is not cleared by ZATCA yet.", FORBIDDEN: "You don't have permission." } as Record<string, string>,
    fallback: "The request could not be completed."
  }
};

const tone: Record<string, string> = { SENT: "bg-success/10 text-success", FAILED: "bg-danger/10 text-danger", SKIPPED: "bg-os-raised text-os-muted", PENDING: "bg-warning/10 text-warning" };

/** Invoice page panel: e-mail the invoice (or a reminder) to the client, the e-mail log and the company auto-reminder switch. */
export function InvoiceEmailPanel({
  invoiceId,
  defaults,
  autoReminders,
  canManageSettings
}: {
  invoiceId: string;
  defaults: { to: string; language: "ar" | "en"; sendable: boolean; firstSend: boolean; configured: boolean; log: Log[] };
  autoReminders: boolean;
  canManageSettings: boolean;
}) {
  const locale = useLocale() === "ar" ? "ar" : "en";
  const t = T[locale];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaults.to);
  const [cc, setCc] = useState("");
  const [language, setLanguage] = useState(defaults.language);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const fmt = (d: Date | string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await emailInvoiceAction(invoiceId, { to, cc, language, message });
      if (!r.ok) {
        const field = r.field ? Object.values(r.field)[0] : null;
        setError(t.errors[field ?? ""] ?? t.errors[r.error] ?? t.fallback);
        router.refresh();
        return;
      }
      setSent(true);
      setOpen(false);
      setMessage("");
      router.refresh();
    });
  const toggleAuto = () =>
    start(async () => {
      await setInvoiceAutoRemindersAction(!autoReminders);
      router.refresh();
    });

  return (
    <section className="os-card">
      <div className="flex items-center justify-between gap-2 border-b border-os-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="Send" size={15} className="text-iris-light" /> {t.title}
        </h2>
        {sent && <span className="text-xs font-medium text-success">{t.done}</span>}
      </div>
      <div className="grid gap-3 p-4">
        {!defaults.configured && <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">{t.notConfigured}</p>}
        {defaults.sendable && (
          <button type="button" className="os-btn-primary w-full" onClick={() => setOpen(true)}>
            <Icon name="Send" size={14} /> {defaults.firstSend ? t.send : t.remind}
          </button>
        )}

        <div className="grid gap-1.5">
          <p className="text-xs font-medium text-os-muted">{t.log}</p>
          {defaults.log.length === 0 ? (
            <p className="text-xs text-os-faint">{t.empty}</p>
          ) : (
            <ul className="grid gap-1.5">
              {defaults.log.map((l) => (
                <li key={l.id} className="grid gap-0.5 rounded-md border border-os-line px-2.5 py-2 text-xs">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{t.kinds[l.kind] ?? l.kind}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${tone[l.status] ?? ""}`}>{t.status[l.status] ?? l.status}</span>
                  </span>
                  <span className="truncate text-os-muted" dir="ltr">
                    {l.to}
                  </span>
                  <span className="text-[11px] text-os-faint">{fmt(l.createdAt)}</span>
                  {l.error && <span className="text-[11px] text-danger" dir="ltr">{l.error}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {canManageSettings && (
          <div className="flex items-start justify-between gap-3 border-t border-os-line pt-3">
            <div className="grid gap-0.5">
              <span className="text-xs font-medium">{t.auto}</span>
              <span className="text-[11px] text-os-faint">{t.autoText}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoReminders}
              disabled={pending}
              onClick={toggleAuto}
              className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${autoReminders ? "bg-iris" : "bg-os-line-strong"}`}
              title={autoReminders ? t.on : t.off}
            >
              <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${autoReminders ? "start-[18px]" : "start-0.5"}`} />
            </button>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={defaults.firstSend ? t.send : t.remind}>
        <div className="grid gap-3 text-sm">
          <Field label={t.to}>
            <input className="os-input" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" />
          </Field>
          <Field label={t.cc}>
            <input className="os-input" dir="ltr" value={cc} onChange={(e) => setCc(e.target.value)} />
          </Field>
          <Field label={t.lang}>
            <select className="os-input" value={language} onChange={(e) => setLanguage(e.target.value as "ar" | "en")}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label={t.message}>
            <textarea className="os-input min-h-[90px]" value={message} onChange={(e) => setMessage(e.target.value)} dir="auto" />
          </Field>
          <p className="text-[11px] text-os-faint">{t.hint}</p>
          {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {t.cancel}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending} onClick={submit}>
              {pending ? t.sending : t.submit}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
