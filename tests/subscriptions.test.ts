import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createClient } from "@/server/crm/clients";
import { addDays, todayIn, ymd } from "@/server/commercial/dates";
import { periodStart, runDueSchedules, setRecurringStatus } from "@/server/finance/recurring";
import { cancelInvoiceDraft } from "@/server/finance/invoices";
import {
  cancelSubscription, changePlan, createSubscription, getSubscription, listSubscriptions, pauseSubscription, resumeSubscription, revokeCancellation, startBilling, subscriptionMetrics, sweepSubscriptions, updateTerms
} from "@/server/subscriptions/subscriptions";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

let orgId: string;
const today = () => todayIn("Asia/Riyadh");
const monthsAgo = (n: number) => periodStart(today(), "MONTHLY", -n);
const monthsAhead = (n: number) => periodStart(today(), "MONTHLY", n);

beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
});

async function setup() {
  const fm = await ctxFor((await makeUser(orgId, "fm@x.test", ["finance_manager"])).id);
  const sales = await ctxFor((await makeUser(orgId, "sm@x.test", ["sales_manager"])).id);
  const rep = await ctxFor((await makeUser(orgId, "rep@x.test", ["sales_rep"])).id);
  const client = await createClient(sales, { displayName: "Nakheel Trading", email: "ap@nakheel.test" });
  return { fm, sales, rep, clientId: client.id };
}
const base = (clientId: string, over: Record<string, unknown> = {}) => ({
  clientId,
  name: "Ads management — Professional",
  interval: "MONTHLY",
  price: "3999",
  startDate: ymd(today()),
  commitmentMonths: 3,
  autoRenew: true,
  billing: { dueDays: 7 },
  ...over
});
const invoices = (recId: string | null) => prisma.invoice.findMany({ where: { recurringInvoiceId: recId ?? "__none__" }, orderBy: { recurringPeriodStart: "asc" } });

describe("subscriptions", () => {
  it("1. create with billing: number, term from the commitment, the first period billed at once, history", async () => {
    const { fm, clientId } = await setup();
    const { id } = await createSubscription(fm, base(clientId));
    const { s, commitmentEnd, priceWithVat, monthly } = await getSubscription(fm, id);
    expect(s.number).toBe("SUB-000001");
    expect(s.status).toBe("ACTIVE");
    expect(ymd(s.termEndDate)).toBe(ymd(addDays(monthsAhead(3), -1)));
    expect(ymd(commitmentEnd)).toBe(ymd(s.termEndDate));
    expect([priceWithVat, monthly]).toEqual(["4598.85", "3999.00"]);
    const inv = await invoices(s.recurringInvoiceId);
    expect(inv).toHaveLength(1);
    expect(inv[0].total.toFixed(2)).toBe("4598.85");
    expect(s.changes.map((c) => c.kind).sort()).toEqual(["BILLING_STARTED", "CREATED"]);
  });

  it("2. permissions: the rep views only; sales records without billing and finance switches billing on later", async () => {
    const { fm, sales, rep, clientId } = await setup();
    await expect(createSubscription(rep, base(clientId))).rejects.toThrow();
    await expect(createSubscription(sales, base(clientId))).rejects.toThrow(/finance\.invoices\.create/);
    const { id } = await createSubscription(sales, base(clientId, { billing: null }));
    expect((await listSubscriptions(rep, {})).rows).toHaveLength(1);
    expect((await subscriptionMetrics(fm)).unbilled).toBe(1);
    await expect(startBilling(sales, id, {})).rejects.toThrow();
    await startBilling(fm, id, { dueDays: 10 });
    const { s } = await getSubscription(fm, id);
    expect(s.recurringInvoiceId).not.toBeNull();
    expect(await invoices(s.recurringInvoiceId)).toHaveLength(1);
    await expect(startBilling(fm, id, {})).rejects.toThrow(/BILLING_ALREADY_STARTED/);
  });

  it("3. validation: commitment / renewal must fit the billing cycle; price above zero", async () => {
    const { fm, clientId } = await setup();
    await expect(createSubscription(fm, base(clientId, { interval: "QUARTERLY", commitmentMonths: 4 }))).rejects.toThrow(/COMMITMENT_NOT_MULTIPLE/);
    await expect(createSubscription(fm, base(clientId, { interval: "ANNUAL", commitmentMonths: 12, renewalMonths: 6 }))).rejects.toThrow(/RENEWAL_NOT_MULTIPLE/);
    await expect(createSubscription(fm, base(clientId, { price: "0" }))).rejects.toThrow(/PRICE_INVALID/);
  });

  it("4. a plan change applies from the next invoice; issued invoices keep their price", async () => {
    const { fm, clientId } = await setup();
    const { id } = await createSubscription(fm, base(clientId, { startDate: ymd(monthsAgo(1)), commitmentMonths: 0 }));
    await changePlan(fm, id, { name: "Ads management — Advanced", price: "7499", note: "upgrade" });
    const { s } = await getSubscription(fm, id);
    const rec = await prisma.recurringInvoice.findUniqueOrThrow({ where: { id: s.recurringInvoiceId! } });
    expect(JSON.stringify(rec.items)).toContain("7499.00");
    const before = await invoices(s.recurringInvoiceId);
    expect(before.map((i) => i.subtotal.toFixed(2))).toEqual(["3999.00", "3999.00"]);
    const change = s.changes.find((c) => c.kind === "PLAN_CHANGED")!;
    expect(change.before).toMatchObject({ price: "3999.00" });
    expect(ymd(change.effectiveDate)).toBe(ymd(rec.nextRunDate));
  });

  it("5. pause stops billing and a resume never bills the paused periods", async () => {
    const { fm, clientId } = await setup();
    const { id } = await createSubscription(fm, base(clientId, { startDate: ymd(monthsAgo(2)), commitmentMonths: 0 }));
    await pauseSubscription(fm, id, { reason: "client travelling" });
    let { s } = await getSubscription(fm, id);
    const recId = s.recurringInvoiceId!;
    expect((await prisma.recurringInvoice.findUniqueOrThrow({ where: { id: recId } })).status).toBe("PAUSED");
    // the schedule cannot be resumed behind the subscription's back
    await expect(setRecurringStatus(fm, recId, "ACTIVE")).rejects.toThrow(/MANAGED_BY_SUBSCRIPTION/);
    // simulate a pause that began last month: last month's invoice never existed, the schedule waits on that period
    const lastMonth = (await invoices(recId)).find((i) => ymd(i.recurringPeriodStart) === ymd(monthsAgo(1)))!;
    await cancelInvoiceDraft(fm, lastMonth.id, { reason: "paused" });
    await prisma.recurringInvoice.update({ where: { id: recId }, data: { nextRunDate: monthsAgo(1) } });
    await resumeSubscription(fm, id);
    ({ s } = await getSubscription(fm, id));
    const rec = await prisma.recurringInvoice.findUniqueOrThrow({ where: { id: recId } });
    expect([s.status, rec.status, ymd(rec.nextRunDate)]).toEqual(["ACTIVE", "ACTIVE", ymd(monthsAhead(1))]);
    // last month (paused) was not billed again
    const live = (await invoices(recId)).filter((i) => i.status !== "CANCELLED").map((i) => ymd(i.recurringPeriodStart));
    expect(live).toEqual([ymd(monthsAgo(2)), ymd(today())]);
    await expect(resumeSubscription(fm, id)).rejects.toThrow(/SUBSCRIPTION_INVALID_TRANSITION/);
  });

  it("6. cancel at a date: billing stops after the last day of service; inside the commitment it is an early termination; the sweep ends it", async () => {
    const { fm, clientId } = await setup();
    const { id } = await createSubscription(fm, base(clientId, { startDate: ymd(monthsAgo(1)), commitmentMonths: 6 }));
    const last = addDays(monthsAhead(1), -1);
    const r = await cancelSubscription(fm, id, { when: "date", date: ymd(last), reason: "budget cut" });
    expect(r.early).toBe(true);
    let { s } = await getSubscription(fm, id);
    expect([s.status, ymd(s.cancelAt)]).toEqual(["ENDING", ymd(last)]);
    const rec = await prisma.recurringInvoice.findUniqueOrThrow({ where: { id: s.recurringInvoiceId! } });
    expect(ymd(rec.endDate)).toBe(ymd(last));
    // the day after the last day of service
    await sweepSubscriptions(orgId, addDays(last, 1.5));
    ({ s } = await getSubscription(fm, id));
    expect(s.status).toBe("ENDED");
    expect((await prisma.recurringInvoice.findUniqueOrThrow({ where: { id: rec.id } })).status).toBe("ENDED");
    // billed the two periods up to the last day only
    expect(await invoices(rec.id)).toHaveLength(2);
    expect(await runDueSchedules(orgId, addDays(last, 40))).toEqual({ schedules: 0, invoices: 0 });
  });

  it("7. undo a scheduled cancellation: active again, the schedule end is lifted", async () => {
    const { fm, clientId } = await setup();
    const { id } = await createSubscription(fm, base(clientId));
    await cancelSubscription(fm, id, { when: "term_end", reason: "not renewing" });
    await revokeCancellation(fm, id);
    const { s } = await getSubscription(fm, id);
    const rec = await prisma.recurringInvoice.findUniqueOrThrow({ where: { id: s.recurringInvoiceId! } });
    expect([s.status, s.cancelAt, rec.endDate, rec.status]).toEqual(["ACTIVE", null, null, "ACTIVE"]);
  });

  it("8. cancel now ends the subscription and its billing immediately", async () => {
    const { fm, clientId } = await setup();
    const { id } = await createSubscription(fm, base(clientId));
    await cancelSubscription(fm, id, { when: "now", reason: "closed the shop" });
    const { s } = await getSubscription(fm, id);
    expect(s.status).toBe("ENDED");
    expect((await prisma.recurringInvoice.findUniqueOrThrow({ where: { id: s.recurringInvoiceId! } })).status).toBe("ENDED");
    await expect(pauseSubscription(fm, id, { reason: "x x x" })).rejects.toThrow();
  });

  it("9. the sweep renews an automatic term, ends one without renewal and sends one renewal notice per term", async () => {
    const { fm, clientId } = await setup();
    const auto = await createSubscription(fm, base(clientId, { startDate: ymd(monthsAgo(3)), commitmentMonths: 3, billing: null }));
    const fixed = await createSubscription(fm, base(clientId, { startDate: ymd(monthsAgo(3)), commitmentMonths: 3, autoRenew: false, billing: null }));
    const soon = await createSubscription(fm, base(clientId, { startDate: ymd(addDays(monthsAgo(3), 10)), commitmentMonths: 3, billing: null }));
    const out = await sweepSubscriptions(orgId);
    // notices: the one ending soon, and the renewed one whose new term ends within the notice window
    expect(out).toMatchObject({ renewed: 1, expired: 1, notices: 2 });
    const a = (await getSubscription(fm, auto.id)).s;
    expect([a.status, ymd(a.termEndDate)]).toEqual(["ACTIVE", ymd(addDays(monthsAhead(1), -1))]);
    expect((await getSubscription(fm, fixed.id)).s.status).toBe("ENDED");
    const n = await prisma.notification.count({ where: { entityId: soon.id } });
    expect(n).toBe(1);
    expect((await sweepSubscriptions(orgId)).notices).toBe(0);
  });

  it("10. turning automatic renewal off ends billing with the term; metrics count MRR in monthly terms", async () => {
    const { fm, clientId } = await setup();
    const { id } = await createSubscription(fm, base(clientId));
    await updateTerms(fm, id, { autoRenew: false, renewalMonths: 1 });
    const { s } = await getSubscription(fm, id);
    const rec = await prisma.recurringInvoice.findUniqueOrThrow({ where: { id: s.recurringInvoiceId! } });
    expect(ymd(rec.endDate)).toBe(ymd(s.termEndDate));
    await createSubscription(fm, base(clientId, { interval: "ANNUAL", price: "39990", commitmentMonths: 12, billing: null }));
    const k = await subscriptionMetrics(fm);
    expect([k.mrr, k.arr, k.counts.ACTIVE]).toEqual(["7331.50", "87978.00", 2]);
  });
});
