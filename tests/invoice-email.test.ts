import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createClient } from "@/server/crm/clients";
import { addDays, todayIn, ymd } from "@/server/commercial/dates";
import { createInvoice, issueInvoice } from "@/server/finance/invoices";
import { emailInvoice, reminderStep, sendAutoReminders, setInvoiceAutoReminders } from "@/server/finance/invoice-email";
import { setMailTransportForTests } from "@/server/notify/mailer";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

let orgId: string;
type Sent = { from: string; recipients: string[]; message: string };
let outbox: Sent[] = [];
const capture = () => setMailTransportForTests(async (from, recipients, message) => void outbox.push({ from, recipients, message }));
const code = (re: RegExp) => ({ message: expect.stringMatching(re) });
const today = () => todayIn("Asia/Riyadh");
const d = (n: number) => ymd(addDays(today(), n))!;
/** decoded subject of a captured message */
const subject = (m: string) => Buffer.from(/^Subject: =\?UTF-8\?B\?([^?]+)\?=/m.exec(m)![1], "base64").toString("utf8");

beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
  await prisma.organization.update({ where: { id: orgId }, data: { email: "billing@dms.test", vatNumber: "310123456700003" } });
  outbox = [];
  capture();
});
afterEach(() => setMailTransportForTests(null));

async function setup(dates: { issueDate?: string; dueDate?: string } = {}) {
  const fm = await ctxFor((await makeUser(orgId, "fm@x.test", ["finance_manager", "super_admin"])).id);
  const client = await createClient(fm, { displayName: "Nakheel Trading", email: "ap@nakheel.test" });
  const { id } = await createInvoice(fm, { clientId: client.id, ...dates, items: [{ description: "Consulting", quantity: "1", unitPrice: "1000" }] });
  return { fm, clientId: client.id, id };
}

describe("e-mailing an invoice", () => {
  it("1. the first send attaches the PDF, marks the invoice SENT by e-mail and logs it", async () => {
    const { fm, id } = await setup();
    await issueInvoice(fm, id);
    await emailInvoice(fm, id, { to: "ap@nakheel.test", cc: "cfo@nakheel.test", language: "ar", message: "شكراً لكم" });
    expect(outbox).toHaveLength(1);
    const m = outbox[0].message;
    expect(outbox[0].recipients).toEqual(["ap@nakheel.test", "cfo@nakheel.test"]);
    expect(m).toMatch(/Content-Type: multipart\/mixed/);
    expect(m).toMatch(/Content-Type: application\/pdf; name="INV-\d{4}-\d{6}-ar\.pdf"/);
    expect(subject(m)).toMatch(/^فاتورة رقم INV-/);
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect([inv.status, inv.sentMethod]).toEqual(["SENT", "EMAIL"]);
    expect(await prisma.invoiceEmail.findMany({ where: { invoiceId: id }, select: { kind: true, status: true } })).toEqual([{ kind: "SEND", status: "SENT" }]);
  });

  it("2. a later send is a reminder: collection note + lastReminderAt, invoice stays sent", async () => {
    const { fm, id } = await setup();
    await issueInvoice(fm, id);
    await emailInvoice(fm, id, { to: "ap@nakheel.test", language: "en" });
    await emailInvoice(fm, id, { to: "ap@nakheel.test", language: "en" });
    expect(subject(outbox[1].message)).toMatch(/^Reminder: invoice INV-/);
    const notes = await prisma.invoiceCollectionNote.findMany({ where: { invoiceId: id } });
    expect(notes.map((n) => [n.kind, n.channel])).toEqual([["REMINDER", "EMAIL"]]);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id } })).lastReminderAt).not.toBeNull();
  });

  it("3. drafts cannot be e-mailed; addresses are validated (no header injection)", async () => {
    const { fm, id } = await setup();
    await expect(emailInvoice(fm, id, { to: "ap@nakheel.test", language: "ar" })).rejects.toMatchObject(code(/^INVOICE_NOT_SENDABLE/));
    await issueInvoice(fm, id);
    await expect(emailInvoice(fm, id, { to: "ap@nakheel.test\r\nBcc: x@evil.test", language: "ar" })).rejects.toThrow();
    await expect(emailInvoice(fm, id, { to: "", language: "ar" })).rejects.toThrow();
    expect(outbox).toHaveLength(0);
  });

  it("4. without a mail transport nothing is pretended: SKIPPED is logged and the invoice is not marked sent", async () => {
    setMailTransportForTests(null);
    const prev = process.env.SENDMAIL_PATH;
    process.env.SENDMAIL_PATH = "/no/such/sendmail";
    try {
      const { fm, id } = await setup();
      await issueInvoice(fm, id);
      await expect(emailInvoice(fm, id, { to: "ap@nakheel.test", language: "ar" })).rejects.toMatchObject(code(/^EMAIL_NOT_CONFIGURED/));
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id } })).sentAt).toBeNull();
      expect((await prisma.invoiceEmail.findFirstOrThrow({ where: { invoiceId: id } })).status).toBe("SKIPPED");
    } finally {
      process.env.SENDMAIL_PATH = prev;
    }
  });

  it("5. people without finance.invoices.send cannot e-mail invoices", async () => {
    const { fm, id } = await setup();
    await issueInvoice(fm, id);
    const emp = await ctxFor((await makeUser(orgId, "emp@x.test", ["employee"])).id);
    await expect(emailInvoice(emp, id, { to: "ap@nakheel.test", language: "ar" })).rejects.toThrow();
  });
});

describe("automatic reminders", () => {
  it("6. the ladder: due soon, then 1 / 7 / 14 days overdue", () => {
    const t = new Date("2026-10-20T00:00:00Z");
    const due = (n: number) => addDays(t, n);
    expect(reminderStep(due(10), t, 3)).toBeNull();
    expect(reminderStep(due(3), t, 3)).toBe("AUTO_DUE_SOON");
    expect(reminderStep(due(0), t, 3)).toBe("AUTO_DUE_SOON");
    expect(reminderStep(due(-1), t, 3)).toBe("AUTO_OVERDUE_1");
    expect(reminderStep(due(-8), t, 3)).toBe("AUTO_OVERDUE_7");
    expect(reminderStep(due(-30), t, 3)).toBe("AUTO_OVERDUE_14");
  });

  it("7. off by default; once enabled each step goes out once, to the last address used, only for sent invoices", async () => {
    const { fm, id } = await setup({ issueDate: d(-40), dueDate: d(-8) });
    await issueInvoice(fm, id);
    const second = await createInvoice(fm, { clientId: (await prisma.invoice.findUniqueOrThrow({ where: { id } })).clientId, issueDate: d(-40), dueDate: d(-8), items: [{ description: "Hosting", quantity: "1", unitPrice: "500" }] });
    await issueInvoice(fm, second.id); // issued but never sent to the client → no automatic reminder
    await emailInvoice(fm, id, { to: "finance@nakheel.test", language: "en" });
    outbox = [];

    expect(await sendAutoReminders(orgId)).toEqual({ sent: 0, failed: 0, skipped: 0 });
    await setInvoiceAutoReminders(fm, true);
    expect(await sendAutoReminders(orgId)).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(outbox[0].recipients).toEqual(["finance@nakheel.test"]);
    expect(subject(outbox[0].message)).toMatch(/overdue/);
    expect(await sendAutoReminders(orgId)).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(await prisma.invoiceEmail.findMany({ where: { kind: { startsWith: "AUTO_" } }, select: { invoiceId: true, kind: true, status: true } })).toEqual([{ invoiceId: id, kind: "AUTO_OVERDUE_7", status: "SENT" }]);
  });

  it("8. a failed reminder is logged and retried on the next run; the database refuses a duplicate step", async () => {
    const { fm, id } = await setup({ issueDate: d(-20), dueDate: d(-2) });
    await issueInvoice(fm, id);
    await emailInvoice(fm, id, { to: "ap@nakheel.test", language: "ar" });
    await setInvoiceAutoReminders(fm, true);
    setMailTransportForTests(async () => {
      throw new Error("mailbox unavailable");
    });
    expect(await sendAutoReminders(orgId)).toEqual({ sent: 0, failed: 1, skipped: 0 });
    capture();
    expect(await sendAutoReminders(orgId)).toEqual({ sent: 1, failed: 0, skipped: 0 });
    const rows = await prisma.invoiceEmail.findMany({ where: { kind: "AUTO_OVERDUE_1" }, orderBy: { createdAt: "asc" }, select: { status: true, error: true } });
    expect(rows.map((r) => r.status)).toEqual(["FAILED", "SENT"]);
    expect(rows[0].error).toMatch(/mailbox unavailable/);
    await expect(prisma.invoiceEmail.create({ data: { organizationId: orgId, invoiceId: id, kind: "AUTO_OVERDUE_1", to: "x@y.test", language: "ar", subject: "dup", status: "PENDING" } })).rejects.toThrow();
  });
});
