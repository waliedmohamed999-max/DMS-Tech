import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { addDays, ymd } from "@/server/commercial/dates";
import { acceptQuotation, createQuotation, markQuotationSent, submitQuotation } from "@/server/commercial/quotations";
import { activateContract, createContract, sendContractForSignature } from "@/server/commercial/contracts";
import { createClient } from "@/server/crm/clients";
import { createOpportunity } from "@/server/crm/opportunities";
import { crmKpis } from "@/server/crm/insights";
import { getKpis, type Kpi } from "@/server/dashboard/service";
import { createInvoice, issueInvoice } from "@/server/finance/invoices";
import { recordPayment } from "@/server/finance/payments";
import { orgMonth } from "@/server/kpi/period";
import { createSubscription, subscriptionMetrics } from "@/server/subscriptions/subscriptions";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

let orgId: string;
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
});

const user = async (role: string) => ctxFor((await makeUser(orgId, `${role}@x.test`, [role])).id);
const live = (kpis: Kpi[], key: string) => {
  const k = kpis.find((x) => x.key === key);
  return k && k.state === "live" ? k : undefined;
};
const won = (id: string, wonAt: Date, estimatedValue?: string) => prisma.opportunity.update({ where: { id }, data: { status: "WON", wonAt, ...(estimatedValue ? { estimatedValue } : {}) } });

describe("won this month — organization-timezone month boundary (Asia/Riyadh)", () => {
  it("counts a deal won at 00:10 on the 1st in Riyadh (21:10Z the evening before) in the new month, and one at 23:50 in the old", async () => {
    const mgr = await user("sales_manager");
    const client = await createClient(mgr, { displayName: "Nakheel Trading" });
    const opp = async (title: string, value: string) => (await createOpportunity(mgr, { clientId: client.id, title, estimatedValue: value })).id;
    await won(await opp("first minutes of March", "1000"), new Date("2026-02-28T21:10:00.000Z")); // 1 Mar 00:10 Riyadh
    await won(await opp("last minutes of February", "200"), new Date("2026-02-28T20:50:00.000Z")); // 28 Feb 23:50 Riyadh
    await won(await opp("first minutes of February", "30"), new Date("2026-01-31T21:15:00.000Z")); // 1 Feb 00:15 Riyadh
    await won(await opp("January", "4"), new Date("2026-01-31T20:59:00.000Z")); // 31 Jan 23:59 Riyadh

    // 1 March 00:30 in Riyadh — UTC (and a UTC server clock) still says 28 February
    const march = await crmKpis(mgr, new Date("2026-02-28T21:30:00.000Z"));
    expect([march.wonThisMonth, march.wonThisMonthCount]).toEqual(["1000.00", 1]);
    expect(march.wonPrevPeriod).toBe("30.00"); // February up to the same point: 1 Feb 00:00–00:30

    // one minute before midnight on 28 February in Riyadh: the whole of February so far
    const feb = await crmKpis(mgr, new Date("2026-02-28T20:59:00.000Z"));
    expect([feb.wonThisMonth, feb.wonThisMonthCount]).toEqual(["230.00", 2]);
    expect(feb.wonPrevPeriod).toBe("0.00"); // January up to the 28th 23:59 — the 31 Jan deal is later than that

    // the Command Center card reads the same figure
    const dash = await getKpis(mgr, new Date("2026-02-28T21:30:00.000Z"));
    expect(live(dash, "wonThisMonth")).toMatchObject({ value: 1000, previous: 30 });
  });
});

describe("won value — accepted quotation, then signed contract, then the estimate", () => {
  it("uses the accepted net amount over a stale estimate and says how each deal was valued", async () => {
    const mgr = await user("sales_manager");
    const client = await createClient(mgr, { displayName: "Nakheel Trading" });
    const now = new Date();
    const wonAt = orgMonth("Asia/Riyadh", now).from;

    // 1) accepted quotation: 2 × 1,000 − 10 % = 1,800 net (VAT excluded); the estimate says 40,000
    const quoted = await createOpportunity(mgr, { clientId: client.id, title: "Store build", estimatedValue: "40000" });
    const q = await createQuotation(mgr, { clientId: client.id, opportunityId: quoted.id, items: [{ name: "Website", quantity: "2", unitPrice: "1000", discountType: "PERCENT", discountValue: "10" }] });
    await submitQuotation(mgr, q.id);
    await markQuotationSent(mgr, q.id, { method: "OTHER", confirm: true });
    const v = await prisma.quotationVersion.findFirstOrThrow({ where: { quotationId: q.id } });
    await acceptQuotation(mgr, q.id, { versionId: v.id, confirm: true, markOpportunityWon: false });
    await won(quoted.id, wonAt, "40000");

    // 2) signed direct contract (no quotation): 24,000 − 2,000 = 22,000 net; the estimate says 5,000
    const contracted = await createOpportunity(mgr, { clientId: client.id, title: "Retainer", estimatedValue: "5000" });
    const c = await createContract(mgr, { clientId: client.id, title: "Annual retainer", startDate: ymd(addDays(now, -5))!, endDate: ymd(addDays(now, 360))!, subtotal: "24000", discountTotal: "2000", vatRate: "15", milestones: [] });
    await prisma.contract.update({ where: { id: c.id }, data: { opportunityId: contracted.id } });
    await won(contracted.id, wonAt);
    // a draft contract is not a commitment yet → still the estimate
    let k = await crmKpis(mgr, new Date(now.getTime() + 1));
    expect(k.wonThisMonthSources).toEqual({ quotation: 1, contract: 0, estimate: 1 });
    expect(k.wonThisMonth).toBe("6800.00"); // 1,800 + 5,000
    await sendContractForSignature(mgr, c.id);
    await activateContract(mgr, c.id, { signedAt: ymd(addDays(now, -2))!, confirm: true });

    // 3) nothing signed: the salesperson's estimate
    const estimated = await createOpportunity(mgr, { clientId: client.id, title: "Verbal yes", estimatedValue: "7000" });
    await won(estimated.id, wonAt);

    k = await crmKpis(mgr, new Date(now.getTime() + 2));
    expect(k.wonThisMonth).toBe("30800.00"); // 1,800 + 22,000 + 7,000 — not 52,000 of estimates
    expect(k.wonThisMonthCount).toBe(3);
    expect(k.wonThisMonthSources).toEqual({ quotation: 1, contract: 1, estimate: 1 });
  });
});

describe("MRR — never added across currencies", () => {
  it("reports the base currency in mrr/arr and every currency on its own", async () => {
    const fm = await user("finance_manager");
    const sales = await user("sales_manager");
    const client = await createClient(sales, { displayName: "Nakheel Trading" });
    const today = orgMonth("Asia/Riyadh").today;
    const sub = (over: Record<string, unknown>) => createSubscription(fm, { clientId: client.id, name: "Ads management", interval: "MONTHLY", price: "3999", startDate: ymd(today), commitmentMonths: 3, autoRenew: true, billing: null, ...over });
    await sub({});
    await sub({ interval: "ANNUAL", price: "12000", commitmentMonths: 12 });
    const usd = await sub({ price: "500" });
    const usd2 = await sub({ price: "250" });
    await prisma.subscription.updateMany({ where: { id: { in: [usd.id, usd2.id] } }, data: { currency: "USD" } });

    const k = await subscriptionMetrics(fm);
    expect(k.currency).toBe("SAR");
    expect([k.mrr, k.arr]).toEqual(["4999.00", "59988.00"]); // 3,999 + 12,000 ÷ 12 — the 750 USD is not in here
    expect(k.byCurrency).toEqual([
      { currency: "SAR", mrr: "4999.00", arr: "59988.00", churnedMrr: "0.00", subscriptions: 2 },
      { currency: "USD", mrr: "750.00", arr: "9000.00", churnedMrr: "0.00", subscriptions: 2 }
    ]);
    expect(k.otherCurrencies.map((c) => [c.currency, c.mrr])).toEqual([["USD", "750.00"]]);
    expect(k.counts.ACTIVE).toBe(4); // counts still cover every subscription

    // the headline currency is the organization's, not whichever row happens to come first
    await prisma.subscription.updateMany({ where: { organizationId: orgId, currency: "SAR" }, data: { status: "ENDED" } });
    const onlyUsd = await subscriptionMetrics(fm);
    expect([onlyUsd.currency, onlyUsd.mrr]).toEqual(["SAR", "0.00"]);
    expect(onlyUsd.otherCurrencies.map((c) => c.mrr)).toEqual(["750.00"]);

    expect(live(await getKpis(fm), "mrr")).toMatchObject({ value: 0, format: "currency", hint: "750.00 USD" });
  });
});

describe("Command Center finance KPIs", () => {
  it("receivables, overdue (count + amount), collected this month and MRR — month taken in the org timezone", async () => {
    const fm = await user("finance_manager");
    const sales = await user("sales_manager");
    const client = await createClient(sales, { displayName: "Nakheel Trading" });
    const m = orgMonth("Asia/Riyadh");
    const day = (n: number) => ymd(addDays(m.dateFrom, n))!;
    const invoice = async (price: string, issueDate: string, dueDate: string) => {
      const { id } = await createInvoice(fm, { clientId: client.id, issueDate, dueDate, items: [{ description: "Consulting", quantity: "1", unitPrice: price }] });
      await issueInvoice(fm, id);
      return id;
    };
    const late = await invoice("10000", day(-40), day(-10)); // 11,500 with VAT, overdue
    await invoice("2000", day(-3), day(45)); // 2,300, not due yet
    const pay = (amount: string, paymentDate: string) => recordPayment(fm, { clientId: client.id, amount, paymentDate, method: "BANK_TRANSFER", allocations: [{ invoiceId: late, amount }] });
    await pay("1500", day(0)); // the 1st of this month (org-local date)
    await pay("400", day(-1)); // the last day of the previous month
    await createSubscription(fm, { clientId: client.id, name: "Ads management", interval: "QUARTERLY", price: "9000", startDate: ymd(m.today), commitmentMonths: 3, autoRenew: true, billing: null });

    // the first instant of the month in Riyadh — 21:00Z on the previous UTC day
    const first = await getKpis(fm, m.from);
    expect(live(first, "collected")).toMatchObject({ value: 1500, format: "currency" });
    expect(live(first, "receivables")).toMatchObject({ value: 11900 }); // 11,500 − 1,900 + 2,300
    expect(live(first, "overdueInvoices")).toMatchObject({ value: 1, format: "number", hint: "9600.00" });
    expect(live(first, "overdueAmount")).toMatchObject({ value: 9600, format: "currency", hint: "1" });
    expect(live(first, "mrr")).toMatchObject({ value: 3000, format: "currency" });

    // one millisecond earlier it is still the previous month there: only that month's payment counts
    const before = await getKpis(fm, new Date(m.from.getTime() - 1));
    expect(live(before, "collected")).toMatchObject({ value: 400 });
  });

  it("follows the finance module's permissions: no card instead of a misleading zero", async () => {
    const fm = await user("finance_manager");
    const emp = await user("employee");
    const rep = await user("sales_rep");
    const keys = (k: Kpi[]) => k.map((x) => x.key);
    expect(keys(await getKpis(fm))).toEqual(expect.arrayContaining(["invoiced", "collected", "receivables", "overdueInvoices", "overdueAmount", "mrr"]));
    for (const ctx of [emp, rep]) {
      const got = keys(await getKpis(ctx));
      for (const key of ["collected", "receivables", "overdueInvoices", "overdueAmount", "mrr"]) expect(got).not.toContain(key);
    }
    // dashboard.finance_kpis alone is not enough: payments need finance.payments.view + all-records scope, MRR needs subscriptions.view
    const partial = { ...fm, permissions: new Set([...fm.permissions].filter((p) => p !== "finance.payments.view" && p !== "subscriptions.view")) };
    const got = await getKpis(partial);
    expect(keys(got)).toEqual(expect.arrayContaining(["invoiced", "receivables", "overdueInvoices"]));
    expect(keys(got)).not.toContain("collected");
    expect(keys(got)).not.toContain("mrr");
    expect(got.every((k) => k.state === "live")).toBe(true);
  });
});
