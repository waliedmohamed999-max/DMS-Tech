import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createClient } from "@/server/crm/clients";
import { addDays, todayIn, ymd } from "@/server/commercial/dates";
import { createRecurring, getRecurring, periodLabel, periodStart, runDueSchedules, setRecurringStatus } from "@/server/finance/recurring";
import { setMailTransportForTests } from "@/server/notify/mailer";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

let orgId: string;
let outbox: string[] = [];
const today = () => todayIn("Asia/Riyadh");
const day = (s: string) => new Date(`${s}T00:00:00Z`);
/** the same calendar day n months ago */
const monthsAgo = (n: number) => periodStart(today(), "MONTHLY", -n);

beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
  outbox = [];
  setMailTransportForTests(async (_f, _r, m) => void outbox.push(m));
});
afterEach(() => setMailTransportForTests(null));

async function setup(roles = ["finance_manager", "super_admin"]) {
  const user = await makeUser(orgId, "fm@x.test", roles);
  const fm = await ctxFor(user.id);
  const client = await createClient(fm, { displayName: "Nakheel Trading", email: "ap@nakheel.test" });
  return { fm, user, clientId: client.id };
}
const base = (clientId: string, over: Record<string, unknown> = {}) => ({
  clientId,
  title: "Dedicated tech team",
  interval: "MONTHLY",
  startDate: ymd(today()),
  dueDays: 15,
  items: [{ description: "Tech team subscription — {period}", quantity: "1", unitPrice: "12500" }],
  ...over
});

describe("recurring invoices", () => {
  it("1. periods are anchored on the start date (month ends clamp, then recover)", () => {
    const s = day("2026-01-31");
    expect(ymd(periodStart(s, "MONTHLY", 1))).toBe("2026-02-28");
    expect(ymd(periodStart(s, "MONTHLY", 2))).toBe("2026-03-31");
    expect(ymd(periodStart(s, "SEMIANNUAL", 1))).toBe("2026-07-31");
    expect(ymd(periodStart(day("2028-02-29"), "ANNUAL", 1))).toBe("2029-02-28");
    expect(ymd(periodStart(day("2026-10-01"), "QUARTERLY", 1))).toBe("2027-01-01");
    expect(periodLabel(day("2026-10-01"), "MONTHLY", day("2026-10-01"), "en")).toBe("1 October – 31 October 2026");
  });

  it("2. a schedule starting today bills the first period at once: draft, period in notes and lines, next date advanced", async () => {
    const { fm, clientId } = await setup();
    const { id } = await createRecurring(fm, base(clientId));
    const { schedule } = await getRecurring(fm, id);
    expect(schedule.number).toBe("REC-000001");
    expect([schedule.generatedCount, ymd(schedule.nextRunDate)]).toEqual([1, ymd(periodStart(today(), "MONTHLY", 1))]);
    const inv = await prisma.invoice.findFirstOrThrow({ where: { recurringInvoiceId: id }, include: { items: true } });
    expect(inv.status).toBe("DRAFT");
    expect(ymd(inv.dueDate)).toBe(ymd(addDays(today(), 15)));
    expect(inv.items[0].description).not.toContain("{period}");
    expect(inv.notes).toContain("REC-000001");
    expect(inv.total.toFixed(2)).toBe("14375.00");
  });

  it("3. missed periods are caught up (oldest first), each once; running again creates nothing", async () => {
    const { fm, clientId } = await setup();
    const { id } = await createRecurring(fm, base(clientId, { startDate: ymd(monthsAgo(2)) }));
    const periods = (await prisma.invoice.findMany({ where: { recurringInvoiceId: id }, orderBy: { recurringPeriodStart: "asc" } })).map((i) => ymd(i.recurringPeriodStart));
    expect(periods).toEqual([ymd(monthsAgo(2)), ymd(monthsAgo(1)), ymd(today())]);
    expect(await runDueSchedules(orgId)).toEqual({ schedules: 0, invoices: 0 });
  });

  it("4. auto-issue and auto-send: the invoice is issued, numbered and e-mailed to the client", async () => {
    const { fm, clientId } = await setup();
    const { id } = await createRecurring(fm, base(clientId, { autoIssue: true, autoSend: true, sendTo: "billing@nakheel.test" }));
    const inv = await prisma.invoice.findFirstOrThrow({ where: { recurringInvoiceId: id } });
    expect(inv.number).toMatch(/^INV-\d{4}-\d{6}$/);
    expect([inv.status, inv.sentMethod]).toEqual(["SENT", "EMAIL"]);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatch(/^To: billing@nakheel\.test$/m);
  });

  it("5. auto-send needs auto-issue; a limit of occurrences ends the schedule", async () => {
    const { fm, clientId } = await setup();
    await expect(createRecurring(fm, base(clientId, { autoSend: true }))).rejects.toThrow();
    const { id } = await createRecurring(fm, base(clientId, { startDate: ymd(monthsAgo(2)), maxOccurrences: 2 }));
    const { schedule } = await getRecurring(fm, id);
    expect([schedule.status, schedule.generatedCount]).toEqual(["ENDED", 2]);
    await expect(setRecurringStatus(fm, id, "ACTIVE")).rejects.toThrow(/RECURRING_ENDED/);
  });

  it("6. a paused schedule bills nothing; resuming bills the due period", async () => {
    const { fm, clientId } = await setup();
    const { id } = await createRecurring(fm, base(clientId, { startDate: ymd(addDays(today(), 1)) }));
    await setRecurringStatus(fm, id, "PAUSED");
    await prisma.recurringInvoice.update({ where: { id }, data: { startDate: today(), nextRunDate: today() } }); // the start date has come
    expect(await runDueSchedules(orgId)).toEqual({ schedules: 0, invoices: 0 });
    await setRecurringStatus(fm, id, "ACTIVE");
    expect(await prisma.invoice.count({ where: { recurringInvoiceId: id } })).toBe(1);
  });

  it("7. an owner who is disabled pauses the schedule instead of billing as nobody", async () => {
    const { fm, user, clientId } = await setup();
    const { id } = await createRecurring(fm, base(clientId, { startDate: ymd(addDays(today(), 1)) }));
    await prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });
    await prisma.recurringInvoice.update({ where: { id }, data: { startDate: today(), nextRunDate: today() } }); // the start date has come
    await runDueSchedules(orgId);
    const r = await prisma.recurringInvoice.findUniqueOrThrow({ where: { id } });
    expect([r.status, r.pauseReason]).toEqual(["PAUSED", "OWNER_NO_PERMISSION"]);
    expect(await prisma.invoice.count({ where: { recurringInvoiceId: id } })).toBe(0);
  });

  it("8. the database allows one live invoice per schedule and period", async () => {
    const { fm, clientId } = await setup();
    const { id } = await createRecurring(fm, base(clientId));
    const inv = await prisma.invoice.findFirstOrThrow({ where: { recurringInvoiceId: id }, include: { items: true } });
    const { id: _id, number: _n, createdAt: _c, updatedAt: _u, items: _i, ...copy } = inv;
    await expect(prisma.invoice.create({ data: { ...copy, sellerSnapshot: undefined, buyerSnapshot: undefined } })).rejects.toThrow();
    // a schedule can only be created by someone allowed to create invoices
    const emp = await ctxFor((await makeUser(orgId, "emp@x.test", ["employee"])).id);
    await expect(createRecurring(emp, base(clientId))).rejects.toThrow();
  });
});
