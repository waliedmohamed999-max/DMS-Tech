import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:tls";
import { site } from "@/content/site";

/**
 * Outgoing e-mail for the website and the Business OS, without a mail library:
 * 1. SMTP over implicit TLS when SMTP_HOST is set (SMTP_PORT default 465, SMTP_USER / SMTP_PASS, AUTH LOGIN);
 * 2. otherwise the server's sendmail (cPanel / Exim: /usr/sbin/sendmail, override with SENDMAIL_PATH) — no password;
 * 3. neither available (local development) → "skipped", nothing is sent.
 * Sender: MAIL_FROM (default site.email). Headers are CR/LF-safe; bodies and attachments are base64.
 */

export type MailResult = "sent" | "skipped";
export type Attachment = { filename: string; content: Buffer; contentType: string };
export type Mail = { to: string[]; cc?: string[]; subject: string; text: string; replyTo?: string | null; fromName?: string; attachments?: Attachment[] };

/** No CR/LF (or other control characters) may reach a mail header: blocks header injection. */
export const oneLine = (s: string, max = 200) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
export const isEmail = (s: string) => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/.test(s);
export const mailFrom = () => process.env.MAIL_FROM?.trim() || site.email;

const b64 = (s: string | Buffer) => (typeof s === "string" ? Buffer.from(s, "utf8") : s).toString("base64");
const wrap = (s: string) => s.replace(/.{76}/g, "$&\r\n");
const encWord = (s: string) => `=?UTF-8?B?${b64(s)}?=`;

export function buildMessage(from: string, mail: Mail): string {
  const recipients = [...mail.to, ...(mail.cc ?? [])];
  if (!recipients.length || !recipients.every(isEmail)) throw new Error("MAIL_RECIPIENT_INVALID");
  const body = wrap(b64(mail.text.replace(/\r?\n/g, "\r\n")));
  const headers = [
    `From: ${encWord(oneLine(mail.fromName ?? "DMS Tech", 80))} <${from}>`,
    `To: ${mail.to.join(", ")}`,
    ...(mail.cc?.length ? [`Cc: ${mail.cc.join(", ")}`] : []),
    ...(mail.replyTo && isEmail(mail.replyTo) ? [`Reply-To: ${mail.replyTo}`] : []),
    `Subject: ${encWord(oneLine(mail.subject))}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${from.split("@")[1]}>`,
    "MIME-Version: 1.0"
  ];
  if (!mail.attachments?.length) return [...headers, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", body, ""].join("\r\n");

  const boundary = `dms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const parts = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
    ...mail.attachments.flatMap((a) => {
      const name = oneLine(a.filename, 120).replace(/"/g, "");
      return [`--${boundary}`, `Content-Type: ${a.contentType}; name="${name}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${name}"`, "", wrap(b64(a.content))];
    }),
    `--${boundary}--`,
    ""
  ];
  return [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts].join("\r\n");
}

function viaSendmail(path: string, message: string, from: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(path, ["-t", "-i", "-f", from], { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    const timer = setTimeout(() => {
      p.kill();
      reject(new Error("sendmail timeout"));
    }, 20_000);
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

/** Minimal SMTP client: implicit TLS (465), AUTH LOGIN, one message to several recipients. */
function viaSmtp(cfg: { host: string; port: number; user: string; pass: string }, from: string, recipients: string[], message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = connect({ host: cfg.host, port: cfg.port, servername: cfg.host });
    sock.setTimeout(30_000, () => sock.destroy(new Error("smtp timeout")));
    const data = message.replace(/\r\n\./g, "\r\n..");
    const steps: [string | null, number][] = [
      [null, 220],
      [`EHLO ${from.split("@")[1]}`, 250],
      ["AUTH LOGIN", 334],
      [b64(cfg.user), 334],
      [b64(cfg.pass), 235],
      [`MAIL FROM:<${from}>`, 250],
      ...recipients.map((r): [string, number] => [`RCPT TO:<${r}>`, 250]),
      ["DATA", 354],
      [`${data}\r\n.`, 250],
      ["QUIT", 221]
    ];
    let i = 0;
    let buf = "";
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
      } else if (steps[i][0] !== null) sock.write(`${steps[i][0]}\r\n`);
    });
    sock.on("error", reject);
  });
}

type Transport = (from: string, recipients: string[], message: string) => Promise<void>;
let testTransport: Transport | null = null;

/** Tests only: capture outgoing messages instead of sending them (refused in production builds). */
export function setMailTransportForTests(t: Transport | null) {
  if (process.env.NODE_ENV === "production") throw new Error("test transport refused in production");
  testTransport = t;
}

/** Is any transport available? (the UI explains a "skipped" send before anyone tries) */
export function mailConfigured(): boolean {
  return Boolean(testTransport) || Boolean(process.env.SMTP_HOST?.trim()) || existsSync(process.env.SENDMAIL_PATH?.trim() || "/usr/sbin/sendmail");
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  const from = mailFrom();
  if (!isEmail(from)) throw new Error("MAIL_FROM is not a valid address");
  const message = buildMessage(from, mail);
  if (testTransport) {
    await testTransport(from, [...mail.to, ...(mail.cc ?? [])], message);
    return "sent";
  }
  const host = process.env.SMTP_HOST?.trim();
  if (host) {
    await viaSmtp({ host, port: Number(process.env.SMTP_PORT) || 465, user: process.env.SMTP_USER ?? from, pass: process.env.SMTP_PASS ?? "" }, from, [...mail.to, ...(mail.cc ?? [])], message);
    return "sent";
  }
  const sendmail = process.env.SENDMAIL_PATH?.trim() || "/usr/sbin/sendmail";
  if (!existsSync(sendmail)) return "skipped";
  await viaSendmail(sendmail, message, from);
  return "sent";
}
