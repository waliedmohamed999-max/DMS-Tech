import type { z } from "zod";
import type { websiteLeadSchema } from "@/server/crm/website";
import { serviceLabel, SERVICE_KEYS } from "@/lib/crm/services";
import { services } from "@/content/services";
import { chatbot } from "@/content/chatbot";
import { LEAD_DETAIL_LABELS, offerLabel, type LeadDetailKey } from "@/content/offers";
import { site } from "@/content/site";
import { buildMessage, isEmail, oneLine, sendMail, type MailResult } from "./mailer";

/**
 * E-mails every website request (quote / contact / CTA forms) to the company inbox — independent of the database, so
 * a request still reaches someone if saving the CRM lead fails.
 *
 * Sent through ./mailer (SMTP when configured, else the server sendmail; skipped when neither exists).
 * Recipient: LEAD_NOTIFY_EMAIL, default site.email (info@dmstech.sa). Sender: MAIL_FROM, default the same address.
 */

type Lead = z.output<typeof websiteLeadSchema>;
export type LeadMailResult = MailResult;

const BUDGETS: Record<string, string> = {
  undecided: "لم تُحدَّد بعد",
  "lt-10k": "أقل من 10,000 ريال",
  "10k-30k": "10,000 – 30,000 ريال",
  "30k-100k": "30,000 – 100,000 ريال",
  "gt-100k": "أكثر من 100,000 ريال"
};
const FORMS: Record<string, string> = { quote: "طلب عرض سعر", contact: "تواصل معنا", hero: "الصفحة الرئيسية", cta: "نموذج سريع", career: "التوظيف", offer: "الباقات والعروض" };

function serviceName(key: string): string {
  if (!key) return "—";
  if ((SERVICE_KEYS as readonly string[]).includes(key)) return serviceLabel(key, "ar");
  const s = services.find((x) => x.slug === key);
  if (s) return s.title.ar;
  if (key === chatbot.slug) return chatbot.title.ar;
  return key;
}

export function buildLeadMail(d: Lead, meta: { ip?: string | null; leadNumber?: string; saved: boolean }) {
  const who = oneLine(d.name || d.company || d.email || d.phone || d.whatsapp || "زائر", 80);
  const service = serviceName(d.service);
  const subject = oneLine(`طلب جديد من الموقع — ${who}${d.service ? ` (${service})` : ""}`);
  const time = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date());
  const utm = d.utm ? Object.entries(d.utm).map(([k, v]) => `${k}=${v}`).join(" · ") : "";
  const rows: [string, string][] = [
    ["الاسم", d.name],
    ["الشركة", d.company],
    ["الجوال", d.phone],
    ["واتساب", d.whatsapp],
    ["البريد", d.email],
    ["الخدمة", d.service ? service : ""],
    ["الباقة / العرض", d.offer ? (offerLabel(d.offer) ?? "") : ""],
    ["الميزانية", d.budget ? (BUDGETS[d.budget] ?? d.budget) : ""],
    ["النموذج", FORMS[d.source] ?? d.source],
    ["لغة الزائر", d.locale === "ar" ? "العربية" : "الإنجليزية"],
    ["الصفحة", d.page],
    ["جاء من", d.referrer],
    ["الحملة", utm],
    // the offer page answers (whitelisted keys, labels from src/content/offers.ts)
    ...Object.entries(d.details ?? {}).filter(([, v]) => v).map(([k, v]): [string, string] => [LEAD_DETAIL_LABELS[k as LeadDetailKey] ?? k, v ?? ""]),
    ["رقم العميل في النظام", meta.leadNumber ?? ""],
    ["الوقت", time],
    ["IP", meta.ip ?? ""]
  ];
  const lines = rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${oneLine(v, 300)}`);
  const text = [
    "وصل طلب جديد من موقع dmstech.sa",
    "",
    ...lines,
    "",
    "الرسالة:",
    d.message || "—",
    "",
    meta.saved ? "— الطلب محفوظ أيضاً في لوحة التحكم (العملاء المحتملون)." : "⚠ لم يُحفظ الطلب في لوحة التحكم (قاعدة البيانات غير متاحة) — هذه الرسالة هي النسخة الوحيدة."
  ].join("\n");
  const replyTo = d.email && isEmail(d.email) ? oneLine(d.email, 160) : null;
  return { subject, text, replyTo };
}

export function rfc822(from: string, to: string, mail: { subject: string; text: string; replyTo: string | null }): string {
  return buildMessage(from, { to: [to], subject: mail.subject, text: mail.text, replyTo: mail.replyTo, fromName: "موقع DMS Tech" });
}

export async function emailWebsiteLead(d: Lead, meta: { ip?: string | null; leadNumber?: string; saved: boolean }): Promise<LeadMailResult> {
  const to = process.env.LEAD_NOTIFY_EMAIL?.trim() || site.email;
  if (!isEmail(to)) throw new Error("LEAD_NOTIFY_EMAIL is not a valid address");
  const m = buildLeadMail(d, meta);
  return sendMail({ to: [to], subject: m.subject, text: m.text, replyTo: m.replyTo, fromName: "موقع DMS Tech" });
}
