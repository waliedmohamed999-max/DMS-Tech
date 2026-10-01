import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createClient } from "@/server/crm/clients";
import { createOpportunity } from "@/server/crm/opportunities";
import { acceptQuotation, createQuotation, markQuotationSent, submitQuotation } from "@/server/commercial/quotations";
import { activateContract, createContractFromQuotation, sendContractForSignature, updateContract } from "@/server/commercial/contracts";
import { addProjectMember, completeProject, createProject } from "@/server/projects/projects";
import { createTimeEntry, reopenApprovedEntry, submitTimesheet } from "@/server/projects/time";
import { decideApproval } from "@/server/approvals/service";
import { globalSearch } from "@/server/dashboard/service";
import { migrateLegacyPermissions } from "@/server/rbac/migrate";
import { addDays, todayIn, ymd } from "@/server/commercial/dates";
import { billingCandidates, createInvoiceFromSource } from "@/server/finance/eligibility";
import { cancelInvoiceDraft, createInvoice, getInvoice, issueInvoice, listInvoices, markInvoiceSent, updateInvoiceDraft, voidInvoice } from "@/server/finance/invoices";
import { recordPayment, reversePayment } from "@/server/finance/payments";
import { createExpense, createVendor, listExpenses, payExpense, setVendorArchived, submitExpense } from "@/server/finance/expenses";
import { clientFinance, listCostRates, profitabilityReport, projectFinance, setCostRate } from "@/server/finance/costing";
import { arAging, financeKpis } from "@/server/finance/insights";
import { sweepFinance } from "@/server/finance/sweep";
import { exportCsv } from "@/server/finance/export";
import { renderInvoicePdf, invoicePdfFor } from "@/server/pdf/invoice";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";
import "@/server/projects/time";
import "@/server/finance/expenses";

let orgId: string;
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
});

const users = async () => ({
  fm: await ctxFor((await makeUser(orgId, "fm@x.test", ["finance_manager"])).id),
  acc: await ctxFor((await makeUser(orgId, "acc@x.test", ["accountant"])).id),
  ceo: await ctxFor((await makeUser(orgId, "ceo@x.test", ["ceo"])).id),
  sales: await ctxFor((await makeUser(orgId, "mgr@x.test", ["sales_manager"])).id),
  rep: await ctxFor((await makeUser(orgId, "rep@x.test", ["sales_rep"])).id),
  pm: await ctxFor((await makeUser(orgId, "pm@x.test", ["project_manager"])).id),
  dev: await ctxFor((await makeUser(orgId, "dev@x.test", ["developer"])).id),
  emp: await ctxFor((await makeUser(orgId, "emp@x.test", ["employee"])).id)
});
type U = Awaited<ReturnType<typeof users>>;
const today = () => todayIn("Asia/Riyadh");
const d = (n: number) => ymd(addDays(today(), n))!;
const svc = (key: string) => prisma.service.findFirstOrThrow({ where: { organizationId: orgId, key } });
const code = (re: RegExp) => ({ message: expect.stringMatching(re) });

/** ACTIVE contract (net 20 000, VAT 15 %) built through the Phase 3 services. */
async function activeContract(u: U, milestones: { title: string; percentage: number; dueDate?: string }[] = [{ title: "Design approval", percentage: 40, dueDate: d(0) }, { title: "Go live", percentage: 60 }]) {
  const client = await createClient(u.sales, { displayName: "Nakheel Trading" });
  const opp = await createOpportunity(u.sales, { clientId: client.id, title: "Website", serviceId: (await svc("web-development")).id });
  const q = await createQuotation(u.sales, { clientId: client.id, opportunityId: opp.id, items: [{ serviceId: (await svc("web-development")).id, name: "Website", quantity: "1", unitPrice: "20000" }] });
  await submitQuotation(u.sales, q.id);
  await markQuotationSent(u.sales, q.id, { method: "OTHER", confirm: true });
  const v = await prisma.quotationVersion.findFirstOrThrow({ where: { quotationId: q.id } });
  await acceptQuotation(u.sales, q.id, { versionId: v.id, confirm: true, markOpportunityWon: false });
  const c = await createContractFromQuotation(u.sales, q.id);
  await updateContract(u.sales, c.id, { title: "Website contract", startDate: d(0), endDate: d(120), milestones });
  await sendContractForSignature(u.sales, c.id);
  await activateContract(u.sales, c.id, { signedAt: d(0), confirm: true });
  const ms = await prisma.contractMilestone.findMany({ where: { contractId: c.id }, orderBy: { sortOrder: "asc" } });
  return { clientId: client.id, contractId: c.id, quotationId: q.id, versionId: v.id, ms };
}

/** Issued manual invoice for a client. */
async function issued(u: U, clientId: string, price = "10000", dates: { issueDate?: string; dueDate?: string } = {}) {
  const { id } = await createInvoice(u.fm, { clientId, ...dates, items: [{ description: "Consulting", quantity: "1", unitPrice: price }] });
  await issueInvoice(u.fm, id);
  return prisma.invoice.findUniqueOrThrow({ where: { id } });
}
const inv = (id: string) => prisma.invoice.findUniqueOrThrow({ where: { id } });

describe("billing sources", () => {
  it("1. an invoice is created from an ACTIVE contract (no milestones) with the accepted version's lines and references", async () => {
    const u = await users();
    const c = await activeContract(u, []);
    const cand = (await billingCandidates(prisma, u.fm, { contractId: c.contractId })).find((x) => x.type === "CONTRACT")!;
    expect([cand.eligible, cand.amount]).toEqual([true, "20000.00"]);
    const { id } = await createInvoiceFromSource(u.fm, { type: "CONTRACT", id: c.contractId });
    const i = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: { items: true } });
    expect([i.status, i.sourceType, i.contractId, i.quotationId, i.quotationVersionId, i.clientId]).toEqual(["DRAFT", "CONTRACT", c.contractId, c.quotationId, c.versionId, c.clientId]);
    expect([i.subtotal.toFixed(2), i.taxTotal.toFixed(2), i.total.toFixed(2), i.items.length]).toEqual(["20000.00", "3000.00", "23000.00", 1]);
    // the contract and the quotation version are only read
    const contract = await prisma.contract.findUniqueOrThrow({ where: { id: c.contractId } });
    expect(contract.contractValue.toFixed(2)).toBe("23000.00");
    await expect(createInvoiceFromSource(u.fm, { type: "CONTRACT", id: c.contractId })).rejects.toMatchObject(code(/^NOT_BILLABLE:ALREADY_INVOICED/));
  });

  it("2–3. an eligible contract milestone is billed once (also under concurrency); a not-yet-due milestone is blocked", async () => {
    const u = await users();
    const c = await activeContract(u);
    const cands = await billingCandidates(prisma, u.fm, { contractId: c.contractId });
    const m1 = cands.find((x) => x.id === c.ms[0].id)!;
    const m2 = cands.find((x) => x.id === c.ms[1].id)!;
    expect([m1.eligible, m1.reasons, m1.amount]).toEqual([true, ["MILESTONE_DUE"], "8000.00"]);
    expect([m2.eligible, m2.blockers[0].code]).toEqual([false, "NOT_DUE_NOT_DELIVERED"]);
    await expect(createInvoiceFromSource(u.fm, { type: "CONTRACT_MILESTONE", id: c.ms[1].id })).rejects.toMatchObject(code(/^NOT_BILLABLE:NOT_DUE/));
    const results = await Promise.allSettled([1, 2, 3].map(() => createInvoiceFromSource(u.fm, { type: "CONTRACT_MILESTONE", id: c.ms[0].id })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.invoice.count({ where: { contractMilestoneId: c.ms[0].id } })).toBe(1);
    const i = await prisma.invoice.findFirstOrThrow({ where: { contractMilestoneId: c.ms[0].id } });
    expect([i.total.toFixed(2), i.sourceType, i.contractId]).toEqual(["9200.00", "CONTRACT_MILESTONE", c.contractId]);
    // the DB index is the last line of defence
    await expect(prisma.invoice.create({ data: { organizationId: orgId, clientId: c.clientId, sourceType: "CONTRACT_MILESTONE", contractId: c.contractId, contractMilestoneId: c.ms[0].id, issueDate: today(), dueDate: today() } })).rejects.toThrow();
    // cancelling the draft frees the milestone again
    await cancelInvoiceDraft(u.fm, i.id, { reason: "Wrong client contact" });
    expect((await billingCandidates(prisma, u.fm, { contractId: c.contractId })).find((x) => x.id === c.ms[0].id)!.eligible).toBe(true);
  });

  it("4–5. approved billable time is invoiced with exact links, never twice; void releases it; billed time cannot be reopened", async () => {
    const u = await users();
    await prisma.organization.update({ where: { id: orgId }, data: { defaultHourlyBillingRate: "300" } });
    const c = await activeContract(u);
    const p = await createProject(u.pm, { source: "contract", contractId: c.contractId, milestoneSource: "none" });
    await addProjectMember(u.pm, p.id, { userId: u.dev.userId, role: "DEVELOPER" });
    const t1 = await createTimeEntry(u.dev, { projectId: p.id, date: d(-1), minutes: 90 });
    await createTimeEntry(u.dev, { projectId: p.id, date: d(-1), minutes: 30, billable: false });
    const draftOnly = await createTimeEntry(u.dev, { projectId: p.id, date: d(-2), minutes: 60 });
    void draftOnly;
    await submitTimesheet(u.dev, p.id);
    const a = await prisma.approval.findFirstOrThrow({ where: { type: "TIMESHEET" } });
    await decideApproval(u.pm, { approvalId: a.id, decision: "APPROVED" });
    // only approved + billable entries (90 + 60 min; the non-billable 30 min are excluded)
    const time = (await billingCandidates(prisma, u.fm, { projectId: p.id })).find((x) => x.type === "TIME")!;
    expect([time.meta?.minutes, time.amount]).toEqual([150, "750.00"]);
    const { id } = await createInvoiceFromSource(u.fm, { type: "TIME", id: p.id });
    const i = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: { items: true, timeLinks: true } });
    expect([i.items[0].quantity.toFixed(3), i.items[0].unitPrice.toFixed(2), i.timeLinks.length, i.subtotal.toFixed(2)]).toEqual(["2.500", "300.00", 2, "750.00"]);
    await expect(createInvoiceFromSource(u.fm, { type: "TIME", id: p.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(prisma.invoiceTimeEntry.create({ data: { invoiceId: id, timeEntryId: t1.id, minutes: 90 } })).rejects.toThrow();
    // billed time cannot be reopened for correction in the project
    await expect(reopenApprovedEntry(u.pm, t1.id, "fix minutes please")).rejects.toMatchObject(code(/^TIME_ENTRY_BILLED/));
    await issueInvoice(u.fm, id);
    await voidInvoice(u.fm, id, { reason: "Rate agreed differently", replace: true });
    const replacement = await prisma.invoice.findFirstOrThrow({ where: { replacesInvoiceId: id }, include: { timeLinks: true } });
    expect([replacement.status, replacement.timeLinks.length]).toEqual(["DRAFT", 2]);
    expect(await prisma.invoiceTimeEntry.count({ where: { invoiceId: id, releasedAt: null } })).toBe(0);
  });

  it("completed project is 'ready to invoice' (explicit action, budget minus what is billed); milestone-billed contracts are not double billed", async () => {
    const u = await users();
    const c = await activeContract(u, []);
    const p = await createProject(u.pm, { source: "contract", contractId: c.contractId, milestoneSource: "none" });
    await prisma.project.update({ where: { id: p.id }, data: { status: "ACTIVE" } });
    await completeProject(u.pm, p.id, {});
    expect(await prisma.invoice.count()).toBe(0); // completion never creates financial obligations
    const cand = (await billingCandidates(prisma, u.fm, { projectId: p.id })).find((x) => x.type === "PROJECT")!;
    expect([cand.eligible, cand.amount]).toEqual([true, "20000.00"]);
    await createInvoiceFromSource(u.fm, { type: "CONTRACT", id: c.contractId });
    const after = (await billingCandidates(prisma, u.fm, { projectId: p.id })).find((x) => x.type === "PROJECT")!;
    expect([after.eligible, after.blockers[0].code]).toEqual([false, "CONTRACT_INVOICED"]);
  });
});

describe("invoice lifecycle", () => {
  it("6. draft totals are server-calculated (browser totals ignored)", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "Lumen" });
    const { id } = await createInvoice(u.fm, { clientId: client.id, total: "1", items: [{ description: "A", quantity: "2", unitPrice: "1000", discountType: "PERCENT", discountValue: "10" }, { description: "B", quantity: "1", unitPrice: "500", taxBehavior: "EXEMPT" }] } as never);
    const i = await inv(id);
    expect([i.subtotal.toFixed(2), i.discountTotal.toFixed(2), i.taxTotal.toFixed(2), i.total.toFixed(2), i.balanceDue.toFixed(2)]).toEqual(["2500.00", "200.00", "270.00", "2570.00", "2570.00"]);
    await updateInvoiceDraft(u.fm, id, { clientId: client.id, items: [{ description: "A", quantity: "1", unitPrice: "100" }] });
    expect((await inv(id)).total.toFixed(2)).toBe("115.00");
  });

  it("7. VAT is snapshotted per line: changing company VAT never alters an issued invoice", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "Lumen" });
    const i = await issued(u, client.id, "1000");
    await prisma.organization.update({ where: { id: orgId }, data: { vatRate: "5" } });
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: i.id }, include: { items: true } });
    expect([after.items[0].taxRate.toFixed(2), after.taxTotal.toFixed(2), after.total.toFixed(2)]).toEqual(["15.00", "150.00", "1150.00"]);
    const { id: d2 } = await createInvoice(u.fm, { clientId: client.id, items: [{ description: "X", quantity: "1", unitPrice: "1000" }] });
    expect((await inv(d2)).taxTotal.toFixed(2)).toBe("50.00");
  });

  it("8. an issued invoice is immutable (service + database)", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "Lumen" });
    const i = await issued(u, client.id);
    expect(i.number).toMatch(/^INV-\d{4}-000001$/);
    await expect(updateInvoiceDraft(u.fm, i.id, { clientId: client.id, items: [{ description: "x", quantity: "1", unitPrice: "1" }] })).rejects.toMatchObject(code(/^INVOICE_FROZEN/));
    await expect(prisma.invoice.update({ where: { id: i.id }, data: { total: "1", subtotal: "1", taxTotal: "0", balanceDue: "1" } })).rejects.toThrow(/INVOICE_FROZEN/);
    await expect(prisma.invoiceItem.updateMany({ where: { invoiceId: i.id }, data: { description: "changed" } })).rejects.toThrow(/INVOICE_FROZEN/);
    await expect(prisma.invoice.update({ where: { id: i.id }, data: { status: "DRAFT" } })).rejects.toThrow(/INVOICE_FROZEN/);
    await expect(prisma.invoice.delete({ where: { id: i.id } })).rejects.toThrow(/INVOICE_FROZEN/);
  });

  it("9. invalid transitions are rejected", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "Lumen" });
    const i = await issued(u, client.id);
    await expect(issueInvoice(u.fm, i.id)).rejects.toMatchObject(code(/^INVOICE_NOT_DRAFT/));
    await expect(cancelInvoiceDraft(u.fm, i.id, { reason: "Not needed anymore" })).rejects.toMatchObject(code(/^INVOICE_INVALID_TRANSITION/));
    await recordPayment(u.fm, { clientId: client.id, amount: "100", paymentDate: d(0), method: "CASH", allocations: [{ invoiceId: i.id, amount: "100" }] });
    await expect(voidInvoice(u.fm, i.id, { reason: "Duplicate invoice" })).rejects.toMatchObject(code(/^INVOICE_HAS_PAYMENTS/));
    await markInvoiceSent(u.fm, i.id, { method: "EMAIL_MANUAL", confirm: true });
    await expect(markInvoiceSent(u.fm, i.id, { method: "EMAIL_MANUAL", confirm: true })).rejects.toMatchObject(code(/^INVOICE_ALREADY_SENT/));
    const { id: draft } = await createInvoice(u.fm, { clientId: client.id, items: [] });
    await expect(issueInvoice(u.fm, draft)).rejects.toMatchObject(code(/^INVOICE_NEEDS_ITEMS/));
    await expect(createInvoice(u.fm, { clientId: client.id, issueDate: d(0), dueDate: d(-1), items: [] })).rejects.toMatchObject(code(/^DUE_BEFORE_ISSUE/));
  });

  it("10. issuing is concurrency safe: one number, one stored PDF", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "Lumen" });
    const { id } = await createInvoice(u.fm, { clientId: client.id, items: [{ description: "A", quantity: "1", unitPrice: "10" }] });
    const r = await Promise.allSettled([issueInvoice(u.fm, id), issueInvoice(u.fm, id), issueInvoice(u.acc, id)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.commercialDocument.count({ where: { invoiceId: id } })).toBe(1);
    expect((await prisma.sequence.findMany({ where: { key: { startsWith: "INV-" } } }))[0].value).toBeGreaterThanOrEqual(1);
    expect((await inv(id)).number).toBeTruthy();
  });
});

describe("payments", () => {
  it("11–12. partial then full payment: balance and status are recomputed on the server", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "Lumen" });
    const i = await issued(u, client.id, "43478.26"); // total 50 000.00
    expect(i.total.toFixed(2)).toBe("50000.00");
    await recordPayment(u.fm, { clientId: client.id, amount: "20000", paymentDate: d(0), method: "BANK_TRANSFER", allocations: [{ invoiceId: i.id, amount: "20000" }] });
    let a = await inv(i.id);
    expect([a.status, a.paidAmount.toFixed(2), a.balanceDue.toFixed(2)]).toEqual(["PARTIALLY_PAID", "20000.00", "30000.00"]);
    await recordPayment(u.fm, { clientId: client.id, amount: "30000", paymentDate: d(0), method: "BANK_TRANSFER", allocations: [{ invoiceId: i.id, amount: "30000" }] });
    a = await inv(i.id);
    expect([a.status, a.balanceDue.toFixed(2), Boolean(a.paidAt)]).toEqual(["PAID", "0.00", true]);
  });

  it("13. overpayment and unallocated money are refused (service + DB)", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "Lumen" });
    const i = await issued(u, client.id, "1000"); // 1150
    await expect(recordPayment(u.fm, { clientId: client.id, amount: "1200", paymentDate: d(0), method: "CASH", allocations: [{ invoiceId: i.id, amount: "1200" }] })).rejects.toMatchObject(code(/^ALLOCATION_EXCEEDS_BALANCE/));
    await expect(recordPayment(u.fm, { clientId: client.id, amount: "1200", paymentDate: d(0), method: "CASH", allocations: [{ invoiceId: i.id, amount: "1000" }] })).rejects.toMatchObject(code(/^ALLOCATION_MUST_EQUAL_AMOUNT/));
    await expect(recordPayment(u.fm, { clientId: client.id, amount: "10", paymentDate: d(1), method: "CASH", allocations: [{ invoiceId: i.id, amount: "10" }] })).rejects.toMatchObject(code(/^PAYMENT_DATE_IN_FUTURE/));
    await expect(prisma.invoice.update({ where: { id: i.id }, data: { paidAmount: "2000", balanceDue: "-850" } })).rejects.toThrow();
    const other = await createClient(u.sales, { displayName: "Other" });
    await expect(recordPayment(u.fm, { clientId: other.id, amount: "10", paymentDate: d(0), method: "CASH", allocations: [{ invoiceId: i.id, amount: "10" }] })).rejects.toMatchObject(code(/^INVOICE_NOT_OF_CLIENT/));
  });

  it("14. one payment can settle several invoices of the client", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "Lumen" });
    const a = await issued(u, client.id, "1000"); // 1150
    const b = await issued(u, client.id, "2000"); // 2300
    const p = await recordPayment(u.fm, { clientId: client.id, amount: "2300", paymentDate: d(0), method: "BANK_TRANSFER", allocations: [{ invoiceId: a.id, amount: "1150" }, { invoiceId: b.id, amount: "1150" }] });
    expect(p.number).toMatch(/^PAY-\d{4}-000001$/);
    expect([(await inv(a.id)).status, (await inv(b.id)).status, (await inv(b.id)).balanceDue.toFixed(2)]).toEqual(["PAID", "PARTIALLY_PAID", "1150.00"]);
    expect(await prisma.paymentAllocation.count({ where: { paymentId: p.id } })).toBe(2);
  });

  it("15. a resubmitted payment (same idempotency key) is applied once — sequentially and concurrently", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "Lumen" });
    const i = await issued(u, client.id, "1000");
    const body = { clientId: client.id, amount: "500", paymentDate: d(0), method: "CASH" as const, idempotencyKey: "form-key-123456", allocations: [{ invoiceId: i.id, amount: "500" }] };
    const r = await Promise.all([recordPayment(u.fm, body), recordPayment(u.fm, body), recordPayment(u.acc, body)]);
    expect(new Set(r.map((x) => x.id)).size).toBe(1);
    expect((await recordPayment(u.fm, body)).duplicate).toBe(true);
    expect([await prisma.payment.count(), (await inv(i.id)).paidAmount.toFixed(2)]).toEqual([1, "500.00"]);
  });

  it("16. a reversal recalculates every allocated invoice; payments are never deleted or edited", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "Lumen" });
    const i = await issued(u, client.id, "1000");
    const p = await recordPayment(u.fm, { clientId: client.id, amount: "1150", paymentDate: d(0), method: "CARD", allocations: [{ invoiceId: i.id, amount: "1150" }] });
    expect((await inv(i.id)).status).toBe("PAID");
    await expect(reversePayment(u.fm, p.id, { reason: "x" })).rejects.toThrow();
    await expect(reversePayment(u.acc, p.id, { reason: "Bank returned the transfer" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await reversePayment(u.fm, p.id, { reason: "Bank returned the transfer" });
    const after = await inv(i.id);
    expect([after.status, after.paidAmount.toFixed(2), after.paidAt]).toEqual(["ISSUED", "0.00", null]);
    await expect(reversePayment(u.fm, p.id, { reason: "Bank returned the transfer" })).rejects.toMatchObject(code(/^PAYMENT_ALREADY_REVERSED/));
    await expect(prisma.payment.delete({ where: { id: p.id } })).rejects.toThrow(/PAYMENT_IMMUTABLE/);
    await expect(prisma.payment.update({ where: { id: p.id }, data: { amount: "1" } })).rejects.toThrow(/PAYMENT_IMMUTABLE/);
    await expect(prisma.paymentAllocation.deleteMany({ where: { paymentId: p.id } })).rejects.toThrow(/ALLOCATION_IMMUTABLE/);
    expect(await prisma.auditLog.count({ where: { action: "payment.reversed", entityId: p.id } })).toBe(1);
  });

  it("17. users without finance.payments.create cannot record payments", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "Lumen" });
    const i = await issued(u, client.id, "1000");
    for (const who of [u.rep, u.sales, u.pm, u.emp]) await expect(recordPayment(who, { clientId: client.id, amount: "10", paymentDate: d(0), method: "CASH", allocations: [{ invoiceId: i.id, amount: "10" }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("34. concurrent payments can never push an invoice past its total", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "Lumen" });
    const i = await issued(u, client.id, "1000"); // 1150
    const pay = (k: string, who = u.fm) => recordPayment(who, { clientId: client.id, amount: "800", paymentDate: d(0), method: "CASH", idempotencyKey: k, allocations: [{ invoiceId: i.id, amount: "800" }] });
    const r = await Promise.allSettled([pay("aaaaaaaa1"), pay("bbbbbbbb2", u.acc), pay("cccccccc3")]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const after = await inv(i.id);
    expect([after.paidAmount.toFixed(2), after.balanceDue.toFixed(2)]).toEqual(["800.00", "350.00"]);
  });
});

describe("expenses & vendors", () => {
  const cat = () => prisma.expenseCategory.findFirstOrThrow({ where: { organizationId: orgId, key: "software" } });

  it("18–19. an employee creates and submits an expense; approval runs through the Phase 1 engine with the configured tier", async () => {
    const u = await users();
    expect(await prisma.expenseCategory.count({ where: { organizationId: orgId } })).toBe(14);
    const e = await createExpense(u.emp, { categoryId: (await cat()).id, date: d(-1), amount: "400", taxAmount: "60", description: "Figma seat" });
    expect(e.number).toMatch(/^EXP-\d{4}-000001$/);
    const s = await submitExpense(u.emp, e.id);
    const a = await prisma.approval.findUniqueOrThrow({ where: { id: s.approvalId } });
    expect([a.type, a.status, a.requiredPermission]).toEqual(["EXPENSE", "PENDING", "finance.expenses.approve"]);
    await decideApproval(u.acc, { approvalId: a.id, decision: "APPROVED" });
    const after = await prisma.expense.findUniqueOrThrow({ where: { id: e.id } });
    expect([after.status, after.approvedById, after.total.toFixed(2)]).toEqual(["APPROVED", u.acc.userId, "460.00"]);
    // big expense → executive tier: an accountant cannot decide it
    const big = await createExpense(u.emp, { categoryId: (await cat()).id, date: d(-1), amount: "9000", description: "Laptop" });
    const bs = await submitExpense(u.emp, big.id);
    expect(bs.executive).toBe(true);
    await expect(decideApproval(u.acc, { approvalId: bs.approvalId, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await decideApproval(u.fm, { approvalId: bs.approvalId, decision: "APPROVED" });
    await expect(prisma.expense.update({ where: { id: big.id }, data: { amount: "1", total: "1" } })).rejects.toThrow(/EXPENSE_LOCKED/);
  });

  it("20–21. self-approval is blocked; a rejection needs a reason and returns the expense for correction", async () => {
    const u = await users();
    const e = await createExpense(u.fm, { categoryId: (await cat()).id, date: d(0), amount: "100", description: "Taxi" });
    const s = await submitExpense(u.fm, e.id);
    await expect(decideApproval(u.fm, { approvalId: s.approvalId, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(decideApproval(u.acc, { approvalId: s.approvalId, decision: "REJECTED" })).rejects.toMatchObject(code(/REJECTION_REASON_REQUIRED/));
    await decideApproval(u.acc, { approvalId: s.approvalId, decision: "REJECTED", comment: "Attach the receipt" });
    const r = await prisma.expense.findUniqueOrThrow({ where: { id: e.id } });
    expect([r.status, r.rejectionReason]).toEqual(["REJECTED", "Attach the receipt"]);
    // claimant ≠ submitter: the claimant cannot approve their own claim either
    const forAcc = await createExpense(u.fm, { categoryId: (await cat()).id, date: d(0), amount: "50", description: "Parking", userId: u.acc.userId });
    const s2 = await submitExpense(u.fm, forAcc.id);
    await expect(decideApproval(u.acc, { approvalId: s2.approvalId, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("22. an expense cannot be paid twice (also concurrently) and only after approval", async () => {
    const u = await users();
    const e = await createExpense(u.emp, { categoryId: (await cat()).id, date: d(0), amount: "100", description: "Domain" });
    await expect(payExpense(u.acc, e.id, { paymentMethod: "CARD" })).rejects.toMatchObject(code(/^EXPENSE_NOT_APPROVED/));
    const s = await submitExpense(u.emp, e.id);
    await decideApproval(u.acc, { approvalId: s.approvalId, decision: "APPROVED" });
    const r = await Promise.allSettled([payExpense(u.acc, e.id, { paymentMethod: "CARD" }), payExpense(u.fm, e.id, { paymentMethod: "CARD" })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    await expect(payExpense(u.fm, e.id, { paymentMethod: "CARD" })).rejects.toMatchObject(code(/^EXPENSE_ALREADY_PAID/));
    expect(await prisma.auditLog.count({ where: { action: "expense.paid", entityId: e.id } })).toBe(1);
    await expect(payExpense(u.emp, e.id, { paymentMethod: "CARD" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("23. archiving a vendor keeps historical expenses and blocks new ones", async () => {
    const u = await users();
    const v = await createVendor(u.acc, { name: "AWS" });
    const e = await createExpense(u.acc, { categoryId: (await cat()).id, vendorId: v.id, date: d(0), amount: "300", description: "Hosting" });
    await setVendorArchived(u.acc, v.id, true);
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: e.id } })).vendorId).toBe(v.id);
    await expect(createExpense(u.acc, { categoryId: (await cat()).id, vendorId: v.id, date: d(0), amount: "1", description: "More hosting" })).rejects.toMatchObject(code(/^VENDOR_ARCHIVED/));
    await expect(prisma.vendor.delete({ where: { id: v.id } })).rejects.toThrow();
    await expect(createVendor(u.emp, { name: "X" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("visibility", () => {
  it("24–25. project members and CRM users never see receivables, cost, margin or cost rates", async () => {
    const u = await users();
    const c = await activeContract(u);
    const p = await createProject(u.pm, { source: "contract", contractId: c.contractId, milestoneSource: "none" });
    await addProjectMember(u.pm, p.id, { userId: u.dev.userId, role: "DEVELOPER" });
    await createInvoiceFromSource(u.fm, { type: "CONTRACT_MILESTONE", id: c.ms[0].id });
    await setCostRate(u.fm, { userId: u.dev.userId, hourlyCost: "120", effectiveFrom: d(-30) });
    await expect(projectFinance(u.dev, p.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const pmView = await projectFinance(u.pm, p.id);
    expect([pmView.profit, pmView.expenses, pmView.invoices.length]).toEqual([null, null, 1]);
    const fmView = await projectFinance(u.fm, p.id);
    expect(fmView.profit).not.toBeNull();
    for (const who of [u.sales, u.rep, u.pm, u.acc]) {
      await expect(profitabilityReport(who, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(listCostRates(who)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    // sales rep: no invoices at all; sales manager: invoice status of clients in CRM scope only
    await expect(listInvoices(u.rep, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listInvoices(u.sales, {})).total).toBe(1);
    await expect(getInvoice(u.dev, (await prisma.invoice.findFirstOrThrow()).id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // employees only see their own expenses
    const cat = await prisma.expenseCategory.findFirstOrThrow({ where: { organizationId: orgId } });
    await createExpense(u.acc, { categoryId: cat.id, date: d(0), amount: "10", description: "Accountant own" });
    await createExpense(u.emp, { categoryId: cat.id, date: d(0), amount: "20", description: "Employee own" });
    expect((await listExpenses(u.emp, {})).items.map((e) => e.description)).toEqual(["Employee own"]);
    expect((await listExpenses(u.acc, {})).total).toBe(2);
  });

  it("client finance summary: invoiced / paid / outstanding / overdue — not for CRM-only users", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "Lumen" });
    const a = await issued(u, client.id, "1000", { issueDate: d(-40), dueDate: d(-10) });
    await issued(u, client.id, "2000");
    await recordPayment(u.fm, { clientId: client.id, amount: "150", paymentDate: d(0), method: "CASH", allocations: [{ invoiceId: a.id, amount: "150" }] });
    await sweepFinance(orgId);
    const f = await clientFinance(u.fm, client.id);
    expect(f.totals).toEqual({ invoiced: "3450.00", paid: "150.00", outstanding: "3300.00", overdue: "1000.00", overdueCount: 1 });
    await expect(clientFinance(u.rep, client.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("30. global search only returns financial records the user may see", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "Lumen" });
    const i = await issued(u, client.id, "1000");
    const hits = (ctx: typeof u.fm) => globalSearch(ctx, i.number!).then((r) => r.filter((x) => x.type === "invoice"));
    expect(await hits(u.fm)).toHaveLength(1);
    expect(await hits(u.rep)).toHaveLength(0);
    expect(await hits(u.dev)).toHaveLength(0);
    const cat = await prisma.expenseCategory.findFirstOrThrow({ where: { organizationId: orgId } });
    const e = await createExpense(u.acc, { categoryId: cat.id, date: d(0), amount: "10", description: "Secret purchase" });
    expect((await globalSearch(u.emp, e.number)).filter((x) => x.type === "expense")).toHaveLength(0);
  });

  it("31. CSV export applies the same filters and permissions as the list", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "=cmd|' /C calc'!A0" });
    const paid = await issued(u, client.id, "1000");
    await issued(u, client.id, "2000");
    await recordPayment(u.fm, { clientId: client.id, amount: "1150", paymentDate: d(0), method: "CASH", allocations: [{ invoiceId: paid.id, amount: "1150" }] });
    const csv = await exportCsv(u.fm, "invoices", { status: "PAID" });
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(paid.number!);
    expect(lines[1]).toContain("'=cmd"); // formula injection neutralised
    await expect(exportCsv(u.emp, "invoices", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(exportCsv(u.rep, "payments", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    const cat = await prisma.expenseCategory.findFirstOrThrow({ where: { organizationId: orgId } });
    await createExpense(u.acc, { categoryId: cat.id, date: d(0), amount: "10", description: "Not yours" });
    expect((await exportCsv(u.emp, "expenses", {})).trim().split("\r\n")).toHaveLength(1);
  });
});

describe("dashboard, aging, PDF, sweep", () => {
  it("26. finance KPIs come from the database", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "Lumen" });
    const a = await issued(u, client.id, "1000");
    await issued(u, client.id, "2000", { issueDate: d(-50), dueDate: d(-20) });
    await recordPayment(u.fm, { clientId: client.id, amount: "1000", paymentDate: d(0), method: "CASH", allocations: [{ invoiceId: a.id, amount: "1000" }] });
    const k = await financeKpis(u.fm, { from: addDays(today(), -100), to: today() });
    expect([k.invoicesIssued, k.invoiced, k.collected, k.outstanding, k.overdue]).toEqual([2, "3450.00", "1000.00", "2450.00", "2300.00"]);
    const sales = await financeKpis(u.sales, { from: addDays(today(), -100), to: today() });
    expect([sales.collected, sales.expenses]).toEqual([null, null]); // no payment / expense access
  });

  it("27. AR aging buckets by days past due on the remaining balance", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "Lumen" });
    await issued(u, client.id, "100", { issueDate: d(-5), dueDate: d(5) }); // current 115
    const b = await issued(u, client.id, "200", { issueDate: d(-40), dueDate: d(-10) }); // 1–30: 230
    await issued(u, client.id, "300", { issueDate: d(-80), dueDate: d(-45) }); // 31–60: 345
    await issued(u, client.id, "400", { issueDate: d(-200), dueDate: d(-120) }); // 90+: 460
    await recordPayment(u.fm, { clientId: client.id, amount: "30", paymentDate: d(0), method: "CASH", allocations: [{ invoiceId: b.id, amount: "30" }] });
    const a = await arAging(u.fm);
    expect(a.totals).toEqual({ current: "115.00", d1_30: "200.00", d31_60: "345.00", d61_90: "0.00", d90_plus: "460.00" });
    expect(a.total).toBe("1120.00");
  });

  it("28–29. the invoice PDF is rendered from the frozen snapshot; the issued bytes are stored; Arabic renders", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "عميل نخيل" });
    const i = await issued(u, client.id, "1000");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "invoice.issued", entityId: i.id } });
    const original = await invoicePdfFor(orgId, i.id, { original: true });
    expect([original.stored, original.sha256]).toEqual([true, (audit.after as { pdfSha256: string }).pdfSha256]);
    // later company / client changes never reach the issued invoice
    await prisma.organization.update({ where: { id: orgId }, data: { name: "Renamed Co" } });
    await prisma.client.update({ where: { id: client.id }, data: { displayName: "Renamed client" } });
    const after = await inv(i.id);
    expect([(after.sellerSnapshot as { name: string }).name, (after.buyerSnapshot as { name: string }).name]).toEqual(["Test Org", "عميل نخيل"]);
    const ar = await renderInvoicePdf(prisma, orgId, i.id, { language: "ar" });
    const en = await renderInvoicePdf(prisma, orgId, i.id, { language: "en" });
    for (const pdf of [ar, en]) {
      expect(pdf.data.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.data.includes(Buffer.from("IBMPlexSansArabic"))).toBe(true);
    }
  });

  it("32–33. the finance sweep is idempotent and notifications are deduplicated", async () => {
    const u = await users();
    const client = await createClient(u.sales, { displayName: "Lumen" });
    const late = await issued(u, client.id, "1000", { issueDate: d(-40), dueDate: d(-1) });
    const soon = await issued(u, client.id, "1000", { issueDate: d(-1), dueDate: d(2) });
    const c = await activeContract(u);
    const first = await sweepFinance(orgId);
    expect(first).toMatchObject({ overdue: 1, dueSoon: 1, billingReady: 1 });
    expect((await inv(late.id)).status).toBe("OVERDUE");
    const notes = await prisma.notification.count({ where: { category: "INVOICE" } });
    expect(notes).toBeGreaterThan(0);
    const second = await sweepFinance(orgId);
    expect(second).toMatchObject({ overdue: 0, dueSoon: 0, billingReady: 0 });
    await Promise.all([sweepFinance(orgId), sweepFinance(orgId)]);
    expect(await prisma.notification.count({ where: { category: "INVOICE" } })).toBe(notes);
    expect(await prisma.domainEvent.count({ where: { type: "invoice.overdue", entityId: late.id } })).toBe(1);
    expect(await prisma.domainEvent.count({ where: { type: "contract_milestone.billing_ready", entityId: c.ms[0].id } })).toBe(1);
    void soon;
    // payment notification reaches the invoice owner once, never the actor
    await recordPayment(u.acc, { clientId: client.id, amount: "100", paymentDate: d(0), method: "CASH", allocations: [{ invoiceId: late.id, amount: "100" }] });
    expect(await prisma.notification.count({ where: { userId: u.fm.userId, entityType: "Payment" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: u.acc.userId, entityType: "Payment" } })).toBe(0);
  });
});

describe("permission migration", () => {
  it("custom roles holding legacy finance keys get the granular keys once, audited, never broader", async () => {
    const role = await prisma.role.create({ data: { organizationId: orgId, key: "billing_clerk", name: "Billing clerk", isSystem: false, permissions: { create: [{ permission: "finance.invoices.manage" }, { permission: "finance.payments.manage" }, { permission: "finance.expenses.submit" }] } } });
    await migrateLegacyPermissions(orgId);
    await migrateLegacyPermissions(orgId);
    const perms = (await prisma.rolePermission.findMany({ where: { roleId: role.id } })).map((p) => p.permission).sort();
    expect(perms).toEqual(["finance.expenses.create", "finance.expenses.submit", "finance.invoices.cancel", "finance.invoices.create", "finance.invoices.edit", "finance.invoices.issue", "finance.invoices.send", "finance.invoices.view", "finance.payments.create", "finance.payments.view"]);
    expect(perms).not.toContain("finance.payments.reverse");
    expect(perms).not.toContain("finance.records.all");
    expect(await prisma.auditLog.count({ where: { action: "rbac.permissions_migrated", entityId: role.id } })).toBe(2);
  });
});
