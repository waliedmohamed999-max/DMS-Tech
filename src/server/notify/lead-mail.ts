import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:tls";
import type { z } from "zod";
import type { websiteLeadSchema } from "@/server/crm/website";
import { serviceLabel, SERVICE_KEYS } from "@/lib/crm/services";
import { services } from "@/content/services";
import { chatbot } from "@/content/chatbot";
import { site } from "@/content/site";

/**
 * E-mails every website request (quote / contact / CTA forms) to the company inbox — independent of the database, so
 * a request still reaches someone if saving the CRM lead fails.
 *
 * Transport, chosen at send time:
 * 1. SMTP over implicit TLS when SMTP_HOST is set (SMTP_PORT default 465, SMTP_USER / SMTP_PASS, AUTH LOGIN).
 * 2. Otherwise the server's sendmail (cPanel / Exim: /usr/sbin/sendmail, override with SENDMAIL_PATH) — no password.
 * 3. Neither available (local development): skipped, reported as "skipped".
 * Recipient: LEAD_NOTIFY_EMAIL, default site.email (info@dmstech.sa). Sender: MAIL_FROM, default the same address.
 */

type Lead = z.output<typeof websiteLeadSchema>;
export type LeadMailResult = "sent" | "skipped";

const BUDGETS: Record<string, string> = {
  undecided: "لم تُحدَّد بعد",
  "lt-10k": "أقل من 10,000 ريال",
  "10k-30k": "10,000 – 30,000 ريال",
  "30k-100k": "30,000 – 100,000 ريال",
  "gt-100k": "أكثر من 100,000 ريال"
};
const FORMS: Record<string, string> = { quote: "طلب عرض سعر", contact: "تواصل معنا", hero: "الصفحة الرئيسية", cta: "نموذج سريع", career: "التوظيف" };

/** No CR/LF (or other control characters) may reach a mail header: blocks header injection. */
const oneLine = (s: string, max = 200) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
const isEmail = (s: string) => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/.test(s);

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
    ["الميزانية", d.budget ? (BUDGETS[d.budget] ?? d.budget) : ""],
    ["النموذج", FORMS[d.source] ?? d.source],
    ["لغة الزائر", d.locale === "ar" ? "العربية" : "الإنجليزية"],
    ["الصفحة", d.page],
    ["جاء من", d.referrer],
    ["الحملة", utm],
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
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
  const body = b64(mail.text.replace(/\r?\n/g, "\r\n")).replace(/.{76}/g, "$&\r\n");
  return [
    `From: =?UTF-8?B?${b64("موقع DMS Tech")}?= <${from}>`,
    `To: ${to}`,
    ...(mail.replyTo ? [`Reply-To: ${mail.replyTo}`] : []),
    `Subject: =?UTF-8?B?${b64(mail.subject)}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${from.split("@")[1]}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
    ""
  ].join("\r\n");
}

function viaSendmail(path: string, message: string, from: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(path, ["-t", "-i", "-f", from], { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    const timer = setTimeout(() => {
      p.kill();
      reject(new Error("sendmail timeout"));
    }, 15_000);
    p.stderr.on("data", (c) => (err += String(c).slice(0, 500)));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`sendmail exit ${code}: ${err.trim()}`));
    });
    p.stdin.end(message);
  });
}

/** Minimal SMTP client: implicit TLS (465), AUTH LOGIN, one message. Each reply must carry the expected code. */
function viaSmtp(cfg: { host: string; port: number; user: string; pass: string }, from: string, to: string, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = connect({ host: cfg.host, port: cfg.port, servername: cfg.host });
    sock.setTimeout(20_000, () => sock.destroy(new Error("smtp timeout")));
    const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
    const data = message.replace(/\r\n\./g, "\r\n..");
    const steps: [string | null, number][] = [
      [null, 220],
      [`EHLO ${from.split("@")[1]}`, 250],
      ["AUTH LOGIN", 334],
      [b64(cfg.user), 334],
      [b64(cfg.pass), 235],
      [`MAIL FROM:<${from}>`, 250],
      [`RCPT TO:<${to}>`, 250],
      ["DATA", 354],
      [`${data}\r\n.`, 250],
      ["QUIT", 221]
    ];
    let i = 0;
    let buf = "";
    const next = () => {
      const cmd = steps[i][0];
      if (cmd !== null) sock.write(`${cmd}\r\n`);
    };
    sock.on("data", (chunk) => {
      buf += String(chunk);
      // a complete reply ends with a line "NNN text" (no dash after the code)
      const lines = buf.split("\r\n").filter(Boolean);
      const last = lines[lines.length - 1];
      if (!buf.endsWith("\r\n") || !last || last[3] === "-") return;
      const code = Number(last.slice(0, 3));
      buf = "";
      if (code !== steps[i][1]) {
        sock.destroy();
        reject(new Error(`smtp step ${i} expected ${steps[i][1]}, got ${last.slice(0, 120)}`));
        return;
      }
      i += 1;
      if (i === steps.length) {
        sock.end();
        resolve();
      } else next();
    });
    sock.on("error", reject);
  });
}

export async function emailWebsiteLead(d: Lead, meta: { ip?: string | null; leadNumber?: string; saved: boolean }): Promise<LeadMailResult> {
  const to = process.env.LEAD_NOTIFY_EMAIL?.trim() || site.email;
  const from = process.env.MAIL_FROM?.trim() || site.email;
  if (!isEmail(to) || !isEmail(from)) throw new Error("LEAD_NOTIFY_EMAIL / MAIL_FROM is not a valid address");
  const message = rfc822(from, to, buildLeadMail(d, meta));

  const host = process.env.SMTP_HOST?.trim();
  if (host) {
    await viaSmtp({ host, port: Number(process.env.SMTP_PORT) || 465, user: process.env.SMTP_USER ?? from, pass: process.env.SMTP_PASS ?? "" }, from, to, message);
    return "sent";
  }
  const sendmail = process.env.SENDMAIL_PATH?.trim() || "/usr/sbin/sendmail";
  if (!existsSync(sendmail)) return "skipped";
  await viaSendmail(sendmail, message, from);
  return "sent";
}
