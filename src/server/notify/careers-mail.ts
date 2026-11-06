import { site } from "@/content/site";
import type { ApplicationInput } from "../hr/careers-intake";
import { websiteJob } from "../hr/careers-intake";
import type { UploadedFile } from "../ops/documents";
import { isEmail, oneLine, sendMail, type MailResult } from "./mailer";

/**
 * E-mails every website job application to the company inbox, with the CV attached — independent of the database, so
 * an application still reaches someone when saving it in the dashboard fails.
 * Recipient: CAREERS_NOTIFY_EMAIL, else LEAD_NOTIFY_EMAIL, else site.email (info@dmstech.sa) — the same inbox as quote
 * requests unless set. Reply-To: the applicant.
 */

const MIME: Record<string, string> = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

export function buildCareersMail(d: ApplicationInput, file: UploadedFile | null, meta: { ip?: string | null; candidateNumber?: string; saved: boolean; repeat?: boolean }) {
  const job = websiteJob(d.job);
  const role = job ? job.title.ar : "تقديم عام (بدون وظيفة محددة)";
  const subject = oneLine(`طلب توظيف جديد — ${oneLine(d.name, 80)} — ${role}`);
  const time = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date());
  const rows: [string, string][] = [
    ["الوظيفة", role],
    ["الاسم", d.name],
    ["البريد", d.email],
    ["الجوال", d.phone],
    ["المدينة", d.city],
    ["سنوات الخبرة", d.experienceYears !== undefined ? String(d.experienceYears) : ""],
    ["LinkedIn", d.linkedinUrl],
    ["معرض الأعمال", d.portfolioUrl],
    ["فترة الإشعار (أيام)", d.noticePeriodDays !== undefined ? String(d.noticePeriodDays) : ""],
    ["الراتب المتوقع (ر.س شهرياً)", d.salaryExpectation ?? ""],
    ["لغة المتقدم", d.locale === "ar" ? "العربية" : "الإنجليزية"],
    ["الصفحة", d.page],
    ["الوقت", time]
  ];
  const lines = [
    `وصل طلب توظيف جديد من صفحة الوظائف في الموقع.`,
    "",
    ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${oneLine(v, 300)}`),
    "",
    d.message ? `رسالة المتقدم:\n${d.message.slice(0, 3000)}` : "رسالة المتقدم: —",
    "",
    file ? `السيرة الذاتية: مرفقة (${oneLine(file.name, 120)})` : "السيرة الذاتية: لم تُرفق",
    meta.saved
      ? `لوحة التحكم: سُجّل المرشح ${meta.candidateNumber ?? ""} في التوظيف${meta.repeat ? " (سبق أن تقدم لنفس الوظيفة — أضيف الطلب لملفه)" : ""}.`
      : "تنبيه: تعذّر حفظ الطلب في لوحة التحكم — هذا البريد هو النسخة الوحيدة، أضِف المرشح يدوياً.",
    "",
    "للرد على المتقدم: استخدم «رد» في بريدك."
  ];
  const ext = file?.name.split(".").pop()?.toLowerCase() ?? "";
  return {
    to: [process.env.CAREERS_NOTIFY_EMAIL?.trim() || process.env.LEAD_NOTIFY_EMAIL?.trim() || site.email],
    subject,
    text: lines.join("\n"),
    replyTo: isEmail(d.email) ? d.email : null,
    fromName: "DMS Tech — التوظيف",
    // plain ASCII file names travel safely in every mail client; an Arabic name becomes CV.<ext>
    attachments: file && MIME[ext] ? [{ filename: /^[ -~]+$/.test(file.name) ? oneLine(file.name, 120) : `CV.${ext}`, content: file.data, contentType: MIME[ext] }] : undefined
  };
}

export async function emailJobApplication(d: ApplicationInput, file: UploadedFile | null, meta: { ip?: string | null; candidateNumber?: string; saved: boolean; repeat?: boolean }): Promise<MailResult> {
  return sendMail(buildCareersMail(d, file, meta));
}
