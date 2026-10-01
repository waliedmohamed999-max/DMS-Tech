import { beforeEach, describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { prisma } from "@/server/db";
import { createService, listServices, updateService, archiveService, createPackage } from "@/server/commercial/catalog";
import {
  acceptQuotation,
  cancelQuotation,
  createQuotation,
  createRevision,
  duplicateQuotation,
  getQuotation,
  listQuotations,
  markQuotationSent,
  rejectQuotationByClient,
  reopenQuotation,
  submitQuotation,
  updateQuotationDraft,
  withdrawSubmission,
  type QuoteItemInput
} from "@/server/commercial/quotations";
import { createContractFromQuotation, getContract, listContracts, updateContract, activateContract, terminateContract } from "@/server/commercial/contracts";
import { sweepCommercial } from "@/server/commercial/sweep";
import { commercialKpis } from "@/server/commercial/insights";
import { backfillLegacyServiceIds } from "@/server/commercial/legacy";
import { renderQuotationPdf } from "@/server/pdf/quotation";
import { renderContractPdf } from "@/server/pdf/contract";
import { decideApproval } from "@/server/approvals/service";
import { createClient } from "@/server/crm/clients";
import { createOpportunity } from "@/server/crm/opportunities";
import { createLead, convertLead, qualifyLead } from "@/server/crm/leads";
import { captureWebsiteLead } from "@/server/crm/website";
import { globalSearch } from "@/server/dashboard/service";
import { calcTotals } from "@/lib/commercial/calc";
import { addDays } from "@/server/commercial/dates";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

let orgId: string;
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
});

const users = async () => ({
  manager: await ctxFor((await makeUser(orgId, "mgr@x.test", ["sales_manager"])).id),
  rep: await ctxFor((await makeUser(orgId, "rep@x.test", ["sales_rep"])).id),
  rep2: await ctxFor((await makeUser(orgId, "rep2@x.test", ["sales_rep"])).id),
  employee: await ctxFor((await makeUser(orgId, "emp@x.test", ["employee"])).id),
  ceo: await ctxFor((await makeUser(orgId, "ceo@x.test", ["ceo"])).id),
  finance: await ctxFor((await makeUser(orgId, "fin@x.test", ["finance_manager"])).id)
});
type U = Awaited<ReturnType<typeof users>>;

const svc = (key: string) => prisma.service.findFirstOrThrow({ where: { organizationId: orgId, key } });

/** 2 × 1,000 at 10 % + 1 × 500 with 50 fixed discount → 2,500 / 250 / 337.50 VAT / 2,587.50 */
async function normalItems(): Promise<QuoteItemInput[]> {
  const web = await svc("web-development");
  return [
    { serviceId: web.id, name: "Website", quantity: "2", unitPrice: "1000", discountType: "PERCENT", discountValue: "10", taxBehavior: "STANDARD" },
    { name: "Hosting setup", quantity: "1", unitPrice: "500", discountType: "FIXED", discountValue: "50", taxBehavior: "STANDARD" }
  ];
}

async function setup(u: U, owner = u.rep) {
  const client = await createClient(owner, { displayName: "Nakheel Trading", type: "COMPANY" });
  const opp = await createOpportunity(owner, { clientId: client.id, title: "Store build", estimatedValue: "40000" });
  return { client, opp };
}

async function draft(u: U, items?: QuoteItemInput[], owner = u.rep) {
  const { client, opp } = await setup(u, owner);
  const q = await createQuotation(owner, { clientId: client.id, opportunityId: opp.id, language: "ar", items: items ?? (await normalItems()), paymentTerms: "50% مقدم" });
  return { q, client, opp };
}

async function sentQuote(u: U) {
  const d = await draft(u);
  expect((await submitQuotation(u.rep, d.q.id)).status).toBe("APPROVED");
  await markQuotationSent(u.rep, d.q.id, { method: "EMAIL_MANUAL", confirm: true });
  return d;
}

const version = (quotationId: string) => prisma.quotationVersion.findFirstOrThrow({ where: { quotation: { id: quotationId }, currentOf: { isNot: null } }, include: { items: true } });

async function pdfText(data: Buffer) {
  const doc = await getDocument({ data: new Uint8Array(data), useSystemFonts: false }).promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) text += (await (await doc.getPage(p)).getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ") + "\n";
  return text;
}

describe("service catalog", () => {
  it("1. default DMS services are seeded idempotently and a new service persists with code, audit and event", async () => {
    expect(await prisma.service.count({ where: { organizationId: orgId } })).toBe(14);
    await setupOrg(); // re-run bootstrap: no duplicates
    expect(await prisma.service.count({ where: { organizationId: orgId } })).toBe(14);
    const nova = await svc("nova-ai");
    expect(nova.nameEn).toBe("NOVA AI");

    const { manager } = await users();
    const s = await createService(manager, { nameAr: "استضافة", nameEn: "Hosting", pricingModel: "MONTHLY", basePrice: "250.50", taxBehavior: "STANDARD", category: "Support" });
    expect(s.code).toBe("SRV-000015");
    const row = await prisma.service.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.basePrice.toFixed(2)).toBe("250.50");
    expect(await prisma.auditLog.count({ where: { action: "service.created", entityId: s.id } })).toBe(1);
    expect(await prisma.domainEvent.count({ where: { type: "service.created", entityId: s.id } })).toBe(1);
    await updateService(manager, { id: s.id, basePrice: "300" });
    expect(await prisma.auditLog.count({ where: { action: "service.updated", entityId: s.id } })).toBe(1);
    await archiveService(manager, s.id);
    expect((await prisma.service.findUniqueOrThrow({ where: { id: s.id } })).active).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "service.archived", entityId: s.id } })).toBe(1);
    const pkg = await createPackage(manager, { nameAr: "باقة متجر", nameEn: "E-Commerce Launch", defaultPrice: "25000", items: [{ serviceId: (await svc("ecommerce")).id, quantity: 1 }, { serviceId: (await svc("ux-ui-design")).id, quantity: 1, optional: true }] });
    expect(pkg.code).toBe("PKG-000001");
    expect(pkg.items).toHaveLength(2);
  });

  it("2. users without services.manage cannot change the catalog; employees cannot read it", async () => {
    const { rep, employee } = await users();
    await expect(createService(rep, { nameAr: "س", nameEn: "X service" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listServices(employee, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listServices(rep, {})).total).toBe(14);
  });
});

describe("quotation pricing", () => {
  it("3. totals are calculated on the server; browser-supplied totals are ignored", async () => {
    const u = await users();
    const items = (await normalItems()).map((i) => ({ ...i, total: "1", subtotal: "1" })) as QuoteItemInput[];
    const { client } = await setup(u);
    const q = await createQuotation(u.rep, { clientId: client.id, items, total: "1.00", taxTotal: "0" } as never);
    const v = await version(q.id);
    expect([v.subtotal.toFixed(2), v.discountTotal.toFixed(2), v.taxTotal.toFixed(2), v.total.toFixed(2)]).toEqual(["2500.00", "250.00", "337.50", "2587.50"]);
    const line = v.items.find((i) => i.name === "Website")!;
    expect([line.grossAmount.toFixed(2), line.discountAmount.toFixed(2), line.subtotal.toFixed(2), line.taxAmount.toFixed(2), line.total.toFixed(2)]).toEqual(["2000.00", "200.00", "1800.00", "270.00", "2070.00"]);
    // catalog price snapshot stored with the line
    expect(line.catalogUnitPrice?.toFixed(2)).toBe("0.00");
    // decimal-safe: 0.1 + 0.2 style inputs
    expect(calcTotals([{ quantity: "3", unitPrice: "0.10", discountType: "NONE", taxBehavior: "STANDARD" }, { quantity: "1", unitPrice: "0.20", discountType: "NONE", taxBehavior: "STANDARD" }], "15").total).toBe("0.58");
  });

  it("4. VAT comes from the organization setting; zero-rated lines carry 0 %", async () => {
    const u = await users();
    await prisma.organization.update({ where: { id: orgId }, data: { vatRate: "5" } });
    const { client } = await setup(u);
    const q = await createQuotation(u.rep, { clientId: client.id, items: [{ name: "A", quantity: "1", unitPrice: "1000", taxBehavior: "STANDARD" }, { name: "B", quantity: "1", unitPrice: "1000", taxBehavior: "ZERO_RATED" }] });
    const v = await version(q.id);
    expect(v.vatRate.toFixed(2)).toBe("5.00");
    expect(v.taxTotal.toFixed(2)).toBe("50.00");
    expect(v.items.map((i) => i.taxRate.toFixed(2)).sort()).toEqual(["0.00", "5.00"]);
  });

  it("5. invalid discounts are rejected (service and database)", async () => {
    const u = await users();
    const { client } = await setup(u);
    const bad = (d: Partial<QuoteItemInput>) => createQuotation(u.rep, { clientId: client.id, items: [{ name: "A", quantity: "1", unitPrice: "100", ...d }] });
    await expect(bad({ discountType: "PERCENT", discountValue: "120" })).rejects.toMatchObject({ code: "VALIDATION", message: "DISCOUNT_PERCENT_OVER_100" });
    await expect(bad({ discountType: "FIXED", discountValue: "150" })).rejects.toMatchObject({ message: "DISCOUNT_EXCEEDS_LINE" });
    await expect(bad({ discountType: "FIXED", discountValue: "-5" })).rejects.toMatchObject({ message: "DISCOUNT_INVALID" });
    await expect(bad({ quantity: "0" })).rejects.toMatchObject({ message: "QTY_INVALID" });
    await expect(bad({ unitPrice: "-1" })).rejects.toMatchObject({ message: "PRICE_INVALID" });
    const ok = await bad({});
    const v = await version(ok.id);
    await expect(prisma.quotationItem.update({ where: { id: v.items[0].id }, data: { discountType: "PERCENT", discountValue: "150" } })).rejects.toThrow();
  });
});

describe("quotation access", () => {
  it("6. a sales rep creates and sees their own quotation; another rep cannot", async () => {
    const u = await users();
    const { q } = await draft(u);
    expect(q.number).toMatch(/^Q-\d{4}-000001$/);
    expect((await getQuotation(u.rep, q.id)).quotation.ownerId).toBe(u.rep.userId);
    await expect(getQuotation(u.rep2, q.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listQuotations(u.rep2, {})).total).toBe(0);
    expect((await listQuotations(u.manager, {})).total).toBe(1);
  });

  it("7. an employee cannot access quotations", async () => {
    const u = await users();
    await draft(u);
    await expect(listQuotations(u.employee, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createQuotation(u.employee, { clientId: "x", items: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("approval rules", () => {
  it("8. a discount above the configured threshold requires approval", async () => {
    const u = await users();
    const { q } = await draft(u, [{ name: "A", quantity: "1", unitPrice: "1000", discountType: "PERCENT", discountValue: "25" }]);
    const r = await submitQuotation(u.rep, q.id);
    expect(r.status).toBe("PENDING_APPROVAL");
    expect(r.reasons.map((x) => x.code)).toEqual(["DISCOUNT_ABOVE_THRESHOLD"]);
    const a = await prisma.approval.findFirstOrThrow({ where: { entityId: q.id } });
    expect(a.requiredPermission).toBe("sales.quotations.approve");
    expect((a.payload as { total: string; discountPercent: string; versionNumber: number }).total).toBe("862.50");
    expect((a.payload as { discountPercent: string }).discountPercent).toBe("25.00");
    expect(await prisma.notification.count({ where: { userId: u.manager.userId, entityId: a.id } })).toBe(1);
  });

  it("9. high-value quotations require approval; above the executive threshold only executives can approve", async () => {
    const u = await users();
    const { q } = await draft(u, [{ name: "Big", quantity: "1", unitPrice: "60000" }]);
    expect((await submitQuotation(u.rep, q.id)).reasons.map((x) => x.code)).toEqual(["TOTAL_ABOVE_THRESHOLD"]);

    await prisma.organization.update({ where: { id: orgId }, data: { quoteExecutiveApprovalThreshold: "100000" } });
    const { q: q2 } = await draft(u, [{ name: "Huge", quantity: "1", unitPrice: "150000" }]);
    const r = await submitQuotation(u.rep, q2.id);
    expect(r.reasons.map((x) => x.code)).toEqual(["EXECUTIVE_THRESHOLD"]);
    const a = await prisma.approval.findFirstOrThrow({ where: { entityId: q2.id } });
    expect(a.requiredPermission).toBe("sales.quotations.approve_executive");
    await expect(decideApproval(u.manager, { approvalId: a.id, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await decideApproval(u.ceo, { approvalId: a.id, decision: "APPROVED" });
    expect((await version(q2.id)).status).toBe("APPROVED");
  });

  it("10. a normal quotation is approved by policy without an approval request", async () => {
    const u = await users();
    const { q } = await draft(u);
    const r = await submitQuotation(u.rep, q.id);
    expect(r).toMatchObject({ status: "APPROVED", reasons: [] });
    expect(await prisma.approval.count()).toBe(0);
    expect(await prisma.auditLog.findFirst({ where: { action: "quotation.approved", entityId: q.id } })).toMatchObject({ after: expect.objectContaining({ auto: true }) });
  });

  it("10b. custom pricing triggers approval only when the organization enables the rule", async () => {
    const u = await users();
    await prisma.organization.update({ where: { id: orgId }, data: { quoteCustomPricingRequiresApproval: true } });
    const { q } = await draft(u, [{ name: "Custom line", quantity: "1", unitPrice: "1000" }]);
    expect((await submitQuotation(u.rep, q.id)).reasons.map((x) => x.code)).toEqual(["CUSTOM_PRICING"]);
  });

  it("11. a user without the approval permission cannot approve", async () => {
    const u = await users();
    const { q } = await draft(u, [{ name: "A", quantity: "1", unitPrice: "1000", discountType: "PERCENT", discountValue: "30" }]);
    await submitQuotation(u.rep, q.id);
    const a = await prisma.approval.findFirstOrThrow({ where: { entityId: q.id } });
    await expect(decideApproval(u.rep2, { approvalId: a.id, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await decideApproval(u.finance, { approvalId: a.id, decision: "APPROVED" });
    const v = await version(q.id);
    expect(v.status).toBe("APPROVED");
    expect(v.approvedById).toBe(u.finance.userId);
  });

  it("12. self-approval is blocked", async () => {
    const u = await users();
    const { q } = await draft(u, [{ name: "A", quantity: "1", unitPrice: "1000", discountType: "PERCENT", discountValue: "30" }], u.manager);
    await submitQuotation(u.manager, q.id);
    const a = await prisma.approval.findFirstOrThrow({ where: { entityId: q.id } });
    await expect(decideApproval(u.manager, { approvalId: a.id, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("13. a pending quotation cannot change; withdrawing cancels the approval and a stale approval can never apply", async () => {
    const u = await users();
    const items: QuoteItemInput[] = [{ name: "A", quantity: "1", unitPrice: "1000", discountType: "PERCENT", discountValue: "30" }];
    const { q, client } = await draft(u, items);
    await submitQuotation(u.rep, q.id);
    const first = await prisma.approval.findFirstOrThrow({ where: { entityId: q.id } });
    await expect(updateQuotationDraft(u.rep, q.id, { clientId: client.id, items })).rejects.toMatchObject({ message: "QUOTE_PENDING_APPROVAL_WITHDRAW_FIRST" });
    // the database refuses a silent change of the submitted content
    const v = await version(q.id);
    await expect(prisma.quotationVersion.update({ where: { id: v.id }, data: { total: "1.00" } })).rejects.toThrow(/QUOTATION_VERSION_FROZEN/);
    await expect(prisma.quotationItem.update({ where: { id: v.items[0].id }, data: { unitPrice: "1" } })).rejects.toThrow(/QUOTATION_VERSION_FROZEN/);

    await withdrawSubmission(u.rep, q.id);
    expect((await version(q.id)).status).toBe("DRAFT");
    expect((await prisma.approval.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("CANCELLED");
    await updateQuotationDraft(u.rep, q.id, { clientId: client.id, items: [{ ...items[0], discountValue: "40" }] });
    await submitQuotation(u.rep, q.id);
    // the old request cannot be decided any more; the new one carries the new totals
    await expect(decideApproval(u.manager, { approvalId: first.id, decision: "APPROVED" })).rejects.toMatchObject({ message: "APPROVAL_ALREADY_DECIDED" });
    const second = await prisma.approval.findFirstOrThrow({ where: { entityId: q.id, status: "PENDING" } });
    expect((second.payload as { total: string }).total).toBe("690.00");
    // approval rejected → back to DRAFT with the comment
    await decideApproval(u.manager, { approvalId: second.id, decision: "REJECTED", comment: "Discount too high" });
    const after = await version(q.id);
    expect(after.status).toBe("DRAFT");
    expect(after.approvalComment).toBe("Discount too high");
    expect(await prisma.domainEvent.count({ where: { type: "quotation.rejected" } })).toBe(1);
  });

  it("13b. reopening an approved (unsent) quotation invalidates its approval", async () => {
    const u = await users();
    const { q } = await draft(u);
    await submitQuotation(u.rep, q.id);
    await reopenQuotation(u.rep, q.id);
    const v = await version(q.id);
    expect(v.status).toBe("DRAFT");
    expect(v.approvedAt).toBeNull();
    expect(v.contentHash).toBeNull();
  });
});

describe("versioning and immutability", () => {
  it("14. a sent quotation cannot be modified; the sent PDF is stored", async () => {
    const u = await users();
    const { q, client } = await sentQuote(u);
    await expect(updateQuotationDraft(u.rep, q.id, { clientId: client.id, items: await normalItems() })).rejects.toMatchObject({ message: "QUOTE_SENT_CREATE_REVISION" });
    const v = await version(q.id);
    await expect(prisma.quotationVersion.update({ where: { id: v.id }, data: { paymentTerms: "changed" } })).rejects.toThrow(/QUOTATION_VERSION_FROZEN/);
    const doc = await prisma.commercialDocument.findFirstOrThrow({ where: { quotationVersionId: v.id } });
    expect(doc.sha256).toMatch(/^[0-9a-f]{64}$/);
    await expect(prisma.commercialDocument.delete({ where: { id: doc.id } })).rejects.toThrow(/APPEND_ONLY/);
    expect(await prisma.auditLog.findFirst({ where: { action: "quotation.sent" } })).toMatchObject({ after: expect.objectContaining({ pdfSha256: doc.sha256, method: "EMAIL_MANUAL" }) });
  });

  it("15. a revision creates V2 and preserves V1 exactly", async () => {
    const u = await users();
    const { q, client } = await sentQuote(u);
    const v1 = await version(q.id);
    const r = await createRevision(u.rep, q.id);
    expect(r.versionNumber).toBe(2);
    await updateQuotationDraft(u.rep, q.id, { clientId: client.id, items: [{ name: "Website", quantity: "3", unitPrice: "1000" }] });
    const v1After = await prisma.quotationVersion.findUniqueOrThrow({ where: { id: v1.id }, include: { items: true } });
    expect(v1After.status).toBe("SUPERSEDED");
    expect(v1After.total.toFixed(2)).toBe(v1.total.toFixed(2));
    expect(v1After.items.map((i) => i.total.toFixed(2)).sort()).toEqual(v1.items.map((i) => i.total.toFixed(2)).sort());
    const q2 = await prisma.quotation.findUniqueOrThrow({ where: { id: q.id } });
    expect(q2.number).toBe(q.number);
    expect((await version(q.id)).total.toFixed(2)).toBe("3450.00");
    // a superseded version can no longer be accepted
    await expect(acceptQuotation(u.rep, q.id, { versionId: v1.id, confirm: true })).rejects.toMatchObject({ message: "QUOTE_VERSION_CHANGED" });
    // duplicate = new number, separate proposal
    const dup = await duplicateQuotation(u.rep, q.id);
    expect(dup.number).not.toBe(q.number);
    expect((await prisma.quotation.findUniqueOrThrow({ where: { id: dup.id } })).duplicatedFromId).toBe(q.id);
  });

  it("16. an accepted version is immutable and cannot be revised", async () => {
    const u = await users();
    const { q, client, opp } = await sentQuote(u);
    const v = await version(q.id);
    const r = await acceptQuotation(u.rep, q.id, { versionId: v.id, confirm: true, note: "Signed PO received" });
    expect(r.opportunityWon).toBe(true);
    const o = await prisma.opportunity.findUniqueOrThrow({ where: { id: opp.id } });
    expect(o.status).toBe("WON");
    expect(o.estimatedValue.toFixed(2)).toBe("2250.00"); // accepted net amount excl. VAT
    await expect(createRevision(u.rep, q.id)).rejects.toMatchObject({ message: "QUOTE_ACCEPTED_IMMUTABLE" });
    await expect(updateQuotationDraft(u.rep, q.id, { clientId: client.id, items: [] })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(prisma.quotationVersion.update({ where: { id: v.id }, data: { status: "DRAFT" } })).rejects.toThrow(/QUOTATION_VERSION_FINAL/);
    await expect(cancelQuotation(u.rep, q.id, { reason: "oops" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.auditLog.findFirst({ where: { action: "quotation.accepted" } })).toMatchObject({ after: expect.objectContaining({ version: 1, recordedById: u.rep.userId, method: "manual_record" }) });
  });

  it("16b. only one quotation per opportunity can be accepted, also under concurrency", async () => {
    const u = await users();
    const { q, opp, client } = await sentQuote(u);
    const q2 = await createQuotation(u.rep, { clientId: client.id, opportunityId: opp.id, items: await normalItems() });
    await submitQuotation(u.rep, q2.id);
    await markQuotationSent(u.rep, q2.id, { method: "OTHER", confirm: true });
    const [v1, v2] = await Promise.all([version(q.id), version(q2.id)]);
    const results = await Promise.allSettled([
      acceptQuotation(u.rep, q.id, { versionId: v1.id, confirm: true, markOpportunityWon: false }),
      acceptQuotation(u.rep, q2.id, { versionId: v2.id, confirm: true, markOpportunityWon: false })
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.quotation.count({ where: { opportunityId: opp.id, status: "ACCEPTED" } })).toBe(1);
  });

  it("17. a client rejection records the reason", async () => {
    const u = await users();
    const { q } = await sentQuote(u);
    await expect(rejectQuotationByClient(u.rep, q.id, { reason: "" })).rejects.toThrow(); // zod validation (mapped to VALIDATION by the action layer)
    await rejectQuotationByClient(u.rep, q.id, { reason: "Chose another vendor" });
    const v = await version(q.id);
    expect(v.status).toBe("REJECTED");
    expect(v.rejectionReason).toBe("Chose another vendor");
    expect(v.rejectionRecordedById).toBe(u.rep.userId);
    expect(await prisma.domainEvent.count({ where: { type: "quotation.rejected_by_client" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "quotation.client_rejected" } })).toBe(1);
  });

  it("18. an expired quotation (server-side sweep) cannot be accepted", async () => {
    const u = await users();
    const { q } = await sentQuote(u);
    const v = await version(q.id);
    const later = addDays(v.validUntil, 2);
    const r = await sweepCommercial(orgId, later);
    expect(r.quotesExpired).toBe(1);
    expect((await version(q.id)).status).toBe("EXPIRED");
    await expect(acceptQuotation(u.rep, q.id, { versionId: v.id, confirm: true })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.auditLog.count({ where: { action: "quotation.expired" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: u.rep.userId, title: { contains: q.number } } })).toBeGreaterThan(0);
    // revision is the supported way forward
    expect((await createRevision(u.rep, q.id)).versionNumber).toBe(2);
  });
});

describe("PDF", () => {
  it("19. the PDF prints the database totals", async () => {
    const u = await users();
    const { q } = await draft(u);
    const v = await version(q.id);
    await prisma.$executeRaw`SELECT 1`; // totals live only in DB rows
    const pdf = await renderQuotationPdf(prisma, orgId, v.id);
    const text = await pdfText(pdf.data);
    expect(text).toContain("2,587.50");
    expect(text).toContain("337.50");
    expect(text).toContain(q.number);
  });

  it("20. an Arabic quotation PDF renders with the embedded Arabic font (and English too)", async () => {
    const u = await users();
    const { q } = await draft(u);
    const v = await version(q.id);
    const ar = await renderQuotationPdf(prisma, orgId, v.id);
    expect(ar.data.subarray(0, 5).toString()).toBe("%PDF-");
    expect(ar.data.toString("latin1")).toMatch(/IBMPlexSansArabic/);
    const text = await pdfText(ar.data);
    expect(text).toMatch(/[؀-ۿ]/);
    expect(text).toContain("عرض");
    await prisma.quotationVersion.update({ where: { id: v.id }, data: { language: "en" } });
    const en = await pdfText((await renderQuotationPdf(prisma, orgId, v.id)).data);
    expect(en).toContain("QUOTATION");
    expect(en).toContain("Grand total");
  });
});

describe("contracts", () => {
  async function accepted(u: U) {
    const d = await sentQuote(u);
    const v = await version(d.q.id);
    await acceptQuotation(u.rep, d.q.id, { versionId: v.id, confirm: true });
    return { ...d, v };
  }

  it("21–22. an accepted quotation creates a contract that references the exact version and copies its values", async () => {
    const u = await users();
    const { q, v } = await accepted(u);
    const c = await createContractFromQuotation(u.rep, q.id);
    expect(c.number).toMatch(/^CTR-\d{4}-000001$/);
    const row = await getContract(u.rep, c.id);
    expect(row.quotationVersionId).toBe(v.id);
    expect(row.contractValue.toFixed(2)).toBe("2587.50");
    expect(row.taxTotal.toFixed(2)).toBe("337.50");
    expect(row.status).toBe("DRAFT");
    // catalog changes never touch the contract or the accepted quote
    await prisma.service.update({ where: { id: (await svc("web-development")).id }, data: { basePrice: "99999" } });
    expect((await getContract(u.rep, c.id)).contractValue.toFixed(2)).toBe("2587.50");
    expect((await version(q.id)).total.toFixed(2)).toBe("2587.50");
    // milestones + lifecycle
    await updateContract(u.rep, c.id, { title: "Store build contract", startDate: "2026-11-01", endDate: "2027-10-31", milestones: [{ title: "Kickoff", percentage: 30 }, { title: "Delivery", percentage: 70 }] });
    await expect(updateContract(u.rep, c.id, { title: "x contract", milestones: [{ title: "Too much", amount: "999999" }] })).rejects.toMatchObject({ message: "MILESTONES_EXCEED_VALUE" });
    const { sendContractForSignature } = await import("@/server/commercial/contracts");
    await sendContractForSignature(u.rep, c.id);
    await expect(activateContract(u.rep, c.id, { signedAt: "2026-10-01", confirm: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await activateContract(u.manager, c.id, { signedAt: "2026-10-01", confirm: true });
    await expect(prisma.contract.update({ where: { id: c.id }, data: { contractValue: "1" } })).rejects.toThrow(/CONTRACT_FROZEN/);
    await terminateContract(u.manager, c.id, { reason: "Client request" });
    expect((await getContract(u.manager, c.id)).status).toBe("TERMINATED");
    const pdf = await renderContractPdf(orgId, c.id);
    expect(pdf.data.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("23. a second contract from the same accepted version is prevented (also concurrently)", async () => {
    const u = await users();
    const { q } = await accepted(u);
    const res = await Promise.allSettled([createContractFromQuotation(u.rep, q.id), createContractFromQuotation(u.manager, q.id)]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(createContractFromQuotation(u.rep, q.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.contract.count()).toBe(1);
  });

  it("23b. a contract cannot be created from a quotation that is not accepted", async () => {
    const u = await users();
    const { q } = await sentQuote(u);
    await expect(createContractFromQuotation(u.rep, q.id)).rejects.toMatchObject({ message: "QUOTE_NOT_ACCEPTED" });
  });
});

describe("scope, search, audit, events", () => {
  it("24. record scope prevents commercial data leakage", async () => {
    const u = await users();
    const { q } = await sentQuote(u);
    const v = await version(q.id);
    await acceptQuotation(u.rep, q.id, { versionId: v.id, confirm: true });
    const c = await createContractFromQuotation(u.rep, q.id);
    expect((await listContracts(u.rep2, {})).total).toBe(0);
    await expect(getContract(u.rep2, c.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createContractFromQuotation(u.rep2, q.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(submitQuotation(u.rep2, q.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const k = await commercialKpis(u.rep2);
    expect([k.awaiting, k.acceptedNoContract]).toEqual([0, 0]);
    expect((await listContracts(u.finance, {})).total).toBe(1); // finance: records.all
    await expect(listContracts(u.employee, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("25. global search respects permissions and scope", async () => {
    const u = await users();
    const { q } = await draft(u);
    const has = async (ctx: typeof u.rep, term: string, type: string) => (await globalSearch(ctx, term)).some((r) => r.type === type);
    expect(await has(u.rep, q.number, "quotation")).toBe(true);
    expect(await has(u.manager, q.number, "quotation")).toBe(true);
    expect(await has(u.rep2, q.number, "quotation")).toBe(false);
    expect(await has(u.employee, q.number, "quotation")).toBe(false);
    expect(await has(u.rep, "Website", "service")).toBe(true);
    expect(await has(u.employee, "Website", "service")).toBe(false);
  });

  it("26–27. audit rows and domain events cover the whole commercial flow", async () => {
    const u = await users();
    const { q } = await sentQuote(u);
    const v = await version(q.id);
    await acceptQuotation(u.rep, q.id, { versionId: v.id, confirm: true });
    await createContractFromQuotation(u.rep, q.id);
    const actions = (await prisma.auditLog.findMany({ select: { action: true } })).map((a) => a.action);
    for (const a of ["quotation.created", "quotation.submitted", "quotation.approved", "quotation.sent", "quotation.accepted", "contract.created", "opportunity.stage_changed"]) expect(actions).toContain(a);
    const events = (await prisma.domainEvent.findMany({ select: { type: true, status: true } }));
    for (const e of ["quotation.created", "quotation.submitted", "quotation.approved", "quotation.sent", "quotation.accepted", "contract.created", "opportunity.won"]) expect(events.map((x) => x.type)).toContain(e);
    expect(events.filter((e) => e.status === "FAILED")).toHaveLength(0);
    // CRM timeline on the opportunity tells the same story
    const titles = (await prisma.crmActivity.findMany({ where: { entityType: "OPPORTUNITY" }, orderBy: { occurredAt: "asc" }, select: { title: true } })).map((a) => a.title);
    for (const t of ["quotation.created", "quotation.approved", "quotation.sent", "quotation.accepted", "opportunity.won", "contract.created"]) expect(titles).toContain(t);
  });
});

describe("CRM ↔ catalog link", () => {
  it("leads take a catalog serviceId (legacy key mirrored), conversion carries it, website slugs resolve to the catalog", async () => {
    process.env.OS_ORG_SLUG = "test-org";
    const u = await users();
    const web = await svc("web-development");
    const l = await createLead(u.rep, { name: "Catalog lead", email: "cat@x.test", serviceId: web.id });
    const row = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect([row.serviceId, row.interestedService]).toEqual([web.id, "web-development"]);
    await expect(createLead(u.rep, { name: "Bad service", email: "b@x.test", serviceId: "nope" })).rejects.toMatchObject({ message: "UNKNOWN_SERVICE" });
    await qualifyLead(u.rep, l.id);
    const r = await convertLead(u.rep, { leadId: l.id, clientMode: "new" });
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: r.opportunityId } })).serviceId).toBe(web.id);
    await captureWebsiteLead({ name: "Web visitor", phone: "0551234000", service: "ecommerce", elapsed: 5000 });
    const w = await prisma.lead.findFirstOrThrow({ where: { name: "Web visitor" } });
    expect(w.serviceId).toBe((await svc("ecommerce")).id);
  });
});

describe("Phase 2 → Phase 3 migration", () => {
  it("28–29. CRM rows survive; legacy service keys map to catalog services and unknown values stay untouched", async () => {
    const lead = (interestedService: string | null, n: number) =>
      prisma.lead.create({ data: { organizationId: orgId, number: `LEAD-90000${n}`, name: `Legacy ${n}`, email: `l${n}@x.test`, source: "WEBSITE", interestedService } });
    await lead("ecommerce", 1);
    await lead("other", 2);
    await lead(null, 3);
    await lead("nova-ai", 4);
    const before = await prisma.lead.count();
    const r = await backfillLegacyServiceIds(orgId);
    expect(r.leadsMapped).toBe(2);
    expect(await prisma.lead.count()).toBe(before);
    const rows = await prisma.lead.findMany({ where: { organizationId: orgId }, include: { service: true }, orderBy: { number: "asc" } });
    expect(rows.map((l) => [l.interestedService, l.service?.key ?? null])).toEqual([
      ["ecommerce", "ecommerce"],
      ["other", null],
      [null, null],
      ["nova-ai", "nova-ai"]
    ]);
    expect(r.unmapped).toEqual([{ entity: "Lead", value: "other", count: 1 }]);
    expect((await backfillLegacyServiceIds(orgId)).leadsMapped).toBe(0); // idempotent
  });
});
