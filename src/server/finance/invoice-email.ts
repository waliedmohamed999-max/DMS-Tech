import { z } from "zod";
import { prisma } from "../db";
import { requirePermission, systemCtx, type Ctx } from "../context";
import { conflict, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { addDays, todayIn } from "../commercial/dates";
import { formatMoney } from "@/lib/commercial/calc";
import { invoicePdfFor } from "../pdf/invoice";
import { isEmail, mailConfigured, oneLine, sendMail } from "../notify/mailer";
import { and, invoiceWhere } from "./access";
import { recordInvoiceSentTx } from "./invoices";

/**
 * Invoice e-mail — the first send (PDF attached, marks the invoice SENT with method EMAIL), manual reminders and the
 * automatic reminder ladder run by the finance sweep (opt-in: Organization.invoiceAutoReminders):
 *   AUTO_DUE_SOON   — within org.invoiceDueSoonDays before the due date
 *   AUTO_OVERDUE_1 / _7 / _14 — that many days past due
 * Only the latest applicable step is sent, each at most once per invoice (partial unique index "InvoiceEmail_auto_once"
 * is the claim, so concurrent sweeps cannot double-send); a failed attempt is retried on later sweeps, three times at
 * most. Automatic reminders go only to invoices that were already sent to the client, to the last address and in the
 * language used.
 * Every attempt is logged in InvoiceEmail (SENT / FAILED / SKIPPED when no mail transport exists).
 */

export const AUTO_STEPS = ["AUTO_DUE_SOON", "AUTO_OVERDUE_1", "AUTO_OVERDUE_7", "AUTO_OVERDUE_14"] as const;
type Kind = "SEND" | "REMINDER" | (typeof AUTO_STEPS)[number];
type Lang = "ar" | "en";
const SENDABLE = ["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE"] as const;

const emails = z
  .string()
  .transform((s) => s.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))
  .pipe(z.array(z.string().refine(isEmail, "EMAIL_INVALID")).max(5));
const sendSchema = z.object({
  to: emails.pipe(z.array(z.string()).min(1, "EMAIL_REQUIRED")),
  cc: z.string().optional().default("").pipe(emails),
  language: z.enum(["ar", "en"]),
  message: z.string().trim().max(2000).optional().default("")
});

type Inv = Awaited<ReturnType<typeof loadInvoice>>;
async function loadInvoice(organizationId: string, id: string, scope: Awaited<ReturnType<typeof invoiceWhere>> = {}) {
  const inv = await prisma.invoice.findFirst({
    where: and({ id, organizationId }, scope),
    include: { client: { select: { displayName: true, email: true } }, contact: { select: { email: true } } }
  });
  if (!inv) throw notFound("Invoice");
  return inv;
}

/** Address and language of the last successful e-mail, else the invoice contact / client and the invoice language. */
async function defaultRecipient(inv: Inv): Promise<{ to: string | null; language: Lang }> {
  const last = await prisma.invoiceEmail.findFirst({ where: { invoiceId: inv.id, status: "SENT" }, orderBy: { createdAt: "desc" }, select: { to: true, language: true } });
  const buyer = (inv.buyerSnapshot ?? {}) as { email?: string | null };
  return { to: last?.to.split(",")[0] ?? inv.contact?.email ?? buyer.email ?? inv.client.email ?? null, language: (last?.language ?? inv.language) as Lang };
}

function compose(kind: Kind, lang: Lang, inv: Inv, org: { name: string; nameAr: string | null; email: string | null; phone: string | null; invoicePaymentInstructions: string | null }, message: string) {
  const company = (lang === "ar" ? org.nameAr : null) ?? org.name;
  const m = (v: { toFixed(n: number): string }) => formatMoney(v.toFixed(2), lang, inv.currency);
  const date = (d: Date) => new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  const no = inv.number ?? "";
  const overdue = kind.startsWith("AUTO_OVERDUE");
  const instructions = inv.paymentInstructions ?? org.invoicePaymentInstructions;
  if (lang === "ar") {
    const subject = kind === "SEND" ? `فاتورة رقم ${no} من ${company}` : overdue ? `تذكير: الفاتورة ${no} متأخرة السداد` : `تذكير: موعد سداد الفاتورة ${no}`;
    const intro =
      kind === "SEND"
        ? "نرفق لكم فاتورة الخدمات المقدمة، ونشكر لكم ثقتكم."
        : overdue
          ? "نود تذكيركم بأن الفاتورة التالية تجاوزت تاريخ الاستحقاق، ونرجو التكرم بالسداد في أقرب وقت. إذا كنتم قد سددتم المبلغ فنرجو تجاهل هذه الرسالة."
          : "نود تذكيركم بموعد سداد الفاتورة التالية.";
    const text = [
      `السادة ${inv.client.displayName} المحترمين،`,
      "",
      "السلام عليكم ورحمة الله وبركاته،",
      intro,
      "",
      `رقم الفاتورة: ${no}`,
      `تاريخ الإصدار: ${date(inv.issueDate)}`,
      `تاريخ الاستحقاق: ${date(inv.dueDate)}`,
      `الإجمالي شامل الضريبة: ${m(inv.total)}`,
      `المبلغ المستحق: ${m(inv.balanceDue)}`,
      ...(message ? ["", message] : []),
      ...(instructions ? ["", "تعليمات الدفع:", instructions] : []),
      "",
      "مرفق ملف الفاتورة (PDF).",
      "",
      "مع خالص التحية،",
      company,
      [org.email, org.phone].filter(Boolean).join(" · ")
    ].join("\n");
    return { subject, text };
  }
  const subject = kind === "SEND" ? `Invoice ${no} from ${company}` : overdue ? `Reminder: invoice ${no} is overdue` : `Reminder: invoice ${no} is due soon`;
  const intro =
    kind === "SEND"
      ? "Please find attached our invoice for the services provided. Thank you for your business."
      : overdue
        ? "This is a friendly reminder that the invoice below is past its due date. We would appreciate your payment at your earliest convenience. If you have already paid, please disregard this message."
        : "This is a friendly reminder that the invoice below will be due soon.";
  const text = [
    `Dear ${inv.client.displayName},`,
    "",
    intro,
    "",
    `Invoice no.: ${no}`,
    `Issue date: ${date(inv.issueDate)}`,
    `Due date: ${date(inv.dueDate)}`,
    `Total incl. VAT: ${m(inv.total)}`,
    `Balance due: ${m(inv.balanceDue)}`,
    ...(message ? ["", message] : []),
    ...(instructions ? ["", "Payment instructions:", instructions] : []),
    "",
    "The invoice is attached (PDF).",
    "",
    "Kind regards,",
    company,
    [org.email, org.phone].filter(Boolean).join(" · ")
  ].join("\n");
  return { subject, text };
}

/**
 * Logs the attempt, renders the PDF (the original issued file for the first send, a current copy with the balance
 * for reminders), sends it and records the outcome on the invoice. Returns the log status.
 */
async function deliver(ctx: Ctx, inv: Inv, kind: Kind, input: { to: string[]; cc: string[]; language: Lang; message: string }) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: inv.organizationId }, select: { name: true, nameAr: true, email: true, phone: true, invoicePaymentInstructions: true } });
  const { subject, text } = compose(kind, input.language, inv, org, input.message);
  let log;
  try {
    log = await prisma.invoiceEmail.create({ data: { organizationId: inv.organizationId, invoiceId: inv.id, kind, to: input.to.join(","), cc: input.cc.join(",") || null, language: input.language, subject: oneLine(subject), sentById: ctx.userId || null } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return "CLAIMED" as const; // another sweep took this automatic step
    throw e;
  }
  let status: "SENT" | "FAILED" | "SKIPPED";
  let error: string | null = null;
  try {
    const pdf = await invoicePdfFor(inv.organizationId, inv.id, { original: kind === "SEND", language: input.language });
    const r = await sendMail({ to: input.to, cc: input.cc, subject, text, replyTo: org.email, fromName: org.name, attachments: [{ filename: pdf.fileName, content: pdf.data, contentType: "application/pdf" }] });
    status = r === "sent" ? "SENT" : "SKIPPED";
  } catch (e) {
    status = "FAILED";
    error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
  }
  await prisma.invoiceEmail.update({ where: { id: log.id }, data: { status, error } });

  await unitOfWork(ctx, async (tx, uow) => {
    if (status === "SENT") {
      const cur = await tx.invoice.findUniqueOrThrow({ where: { id: inv.id }, select: { sentAt: true } });
      if (!cur.sentAt) await recordInvoiceSentTx(tx, uow, ctx, inv.id, "EMAIL", `e-mail to ${input.to.join(", ")}`);
      else {
        await tx.invoiceCollectionNote.create({ data: { invoiceId: inv.id, kind: "REMINDER", channel: "EMAIL", note: `${subject} → ${input.to.join(", ")}`, createdById: ctx.userId || null } });
        await tx.invoice.update({ where: { id: inv.id }, data: { lastReminderAt: new Date() } });
      }
    }
    await uow.audit({ action: "invoice.emailed", entityType: "Invoice", entityId: inv.id, after: { kind, status, to: input.to, cc: input.cc, language: input.language, ...(error ? { error } : {}) } });
  });
  return status;
}

/** Form defaults for the "send to client" dialog. */
export async function invoiceEmailDefaults(ctx: Ctx, id: string) {
  requirePermission(ctx, "finance.invoices.send");
  const inv = await loadInvoice(ctx.organizationId, id, await invoiceWhere(ctx));
  const log = await prisma.invoiceEmail.findMany({ where: { invoiceId: id }, orderBy: { createdAt: "desc" }, take: 20 });
  const last = await defaultRecipient(inv);
  return { to: last.to ?? "", language: last.language, sendable: (SENDABLE as readonly string[]).includes(inv.status), firstSend: !inv.sentAt, configured: mailConfigured(), log };
}

/** "Send to client" (first send or a manual reminder). Throws EMAIL_NOT_CONFIGURED / EMAIL_FAILED so the UI can say so. */
export async function emailInvoice(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "finance.invoices.send");
  const input = sendSchema.parse(raw);
  const inv = await loadInvoice(ctx.organizationId, id, await invoiceWhere(ctx));
  if (!(SENDABLE as readonly string[]).includes(inv.status)) throw conflict(`INVOICE_NOT_SENDABLE:${inv.status}`);
  // a standard e-invoice reaches the buyer only once cleared by ZATCA (same gate as "mark as sent")
  const zatca = await prisma.zatcaDocument.findFirst({ where: { invoiceId: id, status: { not: "REJECTED" } }, select: { kind: true, status: true } });
  if (zatca?.kind === "STANDARD" && zatca.status !== "CLEARED") throw conflict(`ZATCA_NOT_CLEARED:${zatca.status}`);
  const status = await deliver(ctx, inv, inv.sentAt ? "REMINDER" : "SEND", input);
  if (status === "SKIPPED") throw conflict("EMAIL_NOT_CONFIGURED");
  if (status === "FAILED") throw conflict("EMAIL_FAILED");
  return { status };
}

/** The automatic step an open invoice is on today (null = nothing to send). */
export function reminderStep(dueDate: Date, today: Date, dueSoonDays: number): (typeof AUTO_STEPS)[number] | null {
  const days = Math.round((today.getTime() - dueDate.getTime()) / 86_400_000);
  if (days >= 14) return "AUTO_OVERDUE_14";
  if (days >= 7) return "AUTO_OVERDUE_7";
  if (days >= 1) return "AUTO_OVERDUE_1";
  if (days <= 0 && -days <= dueSoonDays) return "AUTO_DUE_SOON";
  return null;
}

/** Called by the finance sweep (already leased). Sends at most `limit` reminders per run. */
export async function sendAutoReminders(organizationId: string, now = new Date(), limit = 50) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { invoiceAutoReminders: true, invoiceDueSoonDays: true, timezone: true } });
  const out = { sent: 0, failed: 0, skipped: 0 };
  if (!org.invoiceAutoReminders || !mailConfigured()) return out;
  const today = todayIn(org.timezone, now);
  const ctx = systemCtx(organizationId, { ip: "system", userAgent: "invoice-reminders" });
  const open = await prisma.invoice.findMany({
    where: { organizationId, status: { in: [...SENDABLE] }, balanceDue: { gt: 0 }, sentAt: { not: null }, dueDate: { lte: addDays(today, org.invoiceDueSoonDays) } },
    select: { id: true, dueDate: true },
    orderBy: { dueDate: "asc" },
    take: 500
  });
  for (const o of open) {
    if (out.sent + out.failed >= limit) break;
    const step = reminderStep(o.dueDate, today, org.invoiceDueSoonDays);
    if (!step) continue;
    const history = await prisma.invoiceEmail.findMany({ where: { invoiceId: o.id, kind: { in: [...AUTO_STEPS] } }, select: { kind: true, status: true } });
    // this step or a later one already went out → nothing to do; three failures on this step → give up
    if (history.some((h) => h.status === "SENT" && AUTO_STEPS.indexOf(h.kind as (typeof AUTO_STEPS)[number]) >= AUTO_STEPS.indexOf(step))) continue;
    if (history.filter((h) => h.kind === step && h.status === "FAILED").length >= 3) continue;
    const inv = await loadInvoice(organizationId, o.id);
    const { to, language } = await defaultRecipient(inv);
    if (!to || !isEmail(to)) continue;
    const r = await deliver(ctx, inv, step, { to: [to], cc: [], language, message: "" });
    if (r === "SENT") out.sent++;
    else if (r === "FAILED") out.failed++;
    else if (r === "SKIPPED") out.skipped++;
  }
  return out;
}

/** Company switch for the automatic reminder ladder (a settings change: audited, admins only). */
export async function setInvoiceAutoReminders(ctx: Ctx, enabled: boolean) {
  requirePermission(ctx, "admin.settings.manage");
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { invoiceAutoReminders: true } });
    await tx.organization.update({ where: { id: ctx.organizationId }, data: { invoiceAutoReminders: enabled } });
    await uow.audit({ action: "settings.updated", entityType: "Organization", entityId: ctx.organizationId, before, after: { invoiceAutoReminders: enabled } });
  });
}
