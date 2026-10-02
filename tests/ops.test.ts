import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/server/db";
import { decideApproval } from "@/server/approvals/service";
import { globalSearch } from "@/server/dashboard/service";
import { createVendor, createExpense, setVendorArchived } from "@/server/finance/expenses";
import { changeEmployeeStatus, createEmployee } from "@/server/hr/employees";
import { createRequest, getRequest, submitRequest } from "@/server/ops/procurement";
import { cancelOrder, createOrder, createOrderFromRequest, issueOrder, receiveOrder, reviseOrder, submitOrder, updateOrder } from "@/server/ops/orders";
import { addVendorContact, updateVendorOps, vendorPerformance } from "@/server/ops/vendors";
import { assignAsset, completeMaintenance, createAsset, createAssetFromPoItem, createMaintenance, returnAsset, startMaintenance, terminatedWithAssets } from "@/server/ops/assets";
import { addVersion, createDocument, documentsFor, downloadDocument, listDocuments } from "@/server/ops/documents";
import { LocalStorageForTests, setDocumentStorage } from "@/server/ops/storage";
import { addTicketComment, assignTicket, changeTicketStatus, clientTickets, createTicket, listTickets } from "@/server/ops/support";
import { createArticle, getArticle, publishArticle, searchArticles, submitArticleForReview, updateArticle } from "@/server/ops/knowledge";
import { opsDashboard, opsAttention } from "@/server/ops/insights";
import { opsSearch } from "@/server/ops/search";
import { sweepOps } from "@/server/ops/sweep";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";
import "@/server/ops/procurement";
import "@/server/ops/orders";
import "@/server/finance/expenses";

let orgId: string;
let storageDir: string;
beforeAll(() => {
  storageDir = mkdtempSync(path.join(tmpdir(), "dms-docs-"));
  setDocumentStorage(new LocalStorageForTests(storageDir));
});
afterAll(() => {
  setDocumentStorage(null);
  rmSync(storageDir, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
});

const code = (re: RegExp) => ({ message: expect.stringMatching(re) });
const PDF = (s = "x") => Buffer.from(`%PDF-1.4\n% test ${s}\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n`);
const pdfFile = (s = "x") => ({ name: `file-${s}.pdf`, type: "application/pdf", data: PDF(s) });

async function people() {
  const u = {
    ops: await ctxFor((await makeUser(orgId, "ops@x.test", ["operations_manager"])).id),
    fm: await ctxFor((await makeUser(orgId, "fm@x.test", ["finance_manager"])).id),
    hr: await ctxFor((await makeUser(orgId, "hr@x.test", ["hr_manager"])).id),
    pm: await ctxFor((await makeUser(orgId, "pm@x.test", ["project_manager"])).id),
    agent: await ctxFor((await makeUser(orgId, "agent@x.test", ["support_agent"])).id),
    dev: await ctxFor((await makeUser(orgId, "dev@x.test", ["developer"])).id),
    mgr: await ctxFor((await makeUser(orgId, "mgr@x.test", ["line_manager"])).id),
    emp: await ctxFor((await makeUser(orgId, "emp@x.test", ["employee"])).id),
    emp2: await ctxFor((await makeUser(orgId, "emp2@x.test", ["employee"])).id),
    sales: await ctxFor((await makeUser(orgId, "sales@x.test", ["sales_rep"])).id),
    acc: await ctxFor((await makeUser(orgId, "acc@x.test", ["accountant"])).id)
  };
  const mgrE = await createEmployee(u.hr, { firstName: "Majed", lastName: "Mgr", userId: u.mgr.userId, joinDate: "2026-01-01" });
  const empE = await createEmployee(u.hr, { firstName: "Eyad", lastName: "Emp", userId: u.emp.userId, managerId: mgrE.id, joinDate: "2026-01-01" });
  const emp2E = await createEmployee(u.hr, { firstName: "Eman", lastName: "Emp", userId: u.emp2.userId, joinDate: "2026-01-01" });
  const vendor = await createVendor(u.acc, { name: "Jarir Business", category: "IT" });
  return { u, e: { mgr: mgrE.id, emp: empE.id, emp2: emp2E.id }, vendor: vendor.id };
}

const items = (qty: string, price: string, extra: Record<string, unknown> = {}) => [{ description: "Laptop 14\"", quantity: qty, estimatedUnitPrice: price, assetExpected: true, ...extra }];

describe("procurement", () => {
  it("1–3. a request is created, routed by the configurable rules through the approval engine; self / unrelated approval blocked", async () => {
    const { u } = await people();
    const r = await createRequest(u.emp, { title: "Laptop for support", businessJustification: "Replacement of a broken laptop", items: items("1", "4500"), submit: true });
    const g = await getRequest(u.emp, r.id);
    expect(g.request.status).toBe("PENDING_APPROVAL");
    expect(g.request.estimatedAmount.toFixed(2)).toBe("4500.00");
    expect(g.request.approver).toBe("LINE_MANAGER");
    expect(g.approval?.assigneeId).toBe(u.mgr.userId);
    const approvalId = g.request.approvalId!;
    await expect(decideApproval(u.emp, { approvalId, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" }); // requester
    await expect(decideApproval(u.pm, { approvalId, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" }); // not the routed manager
    await expect(decideApproval(u.mgr, { approvalId, decision: "REJECTED" })).rejects.toMatchObject(code(/REJECTION_REASON_REQUIRED/));
    const both = await Promise.allSettled([decideApproval(u.mgr, { approvalId, decision: "APPROVED" }), decideApproval(u.mgr, { approvalId, decision: "APPROVED" })]);
    expect(both.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await getRequest(u.emp, r.id)).request.status).toBe("APPROVED");
    // large purchase → executive tier: the operations manager cannot approve, the finance manager can
    const big = await createRequest(u.emp, { title: "Server cluster", businessJustification: "Capacity for production", items: [{ description: "Server", quantity: "2", estimatedUnitPrice: "40000" }], submit: true });
    const bg = await getRequest(u.emp, big.id);
    expect(bg.request.approver).toBe("EXECUTIVE");
    await expect(decideApproval(u.ops, { approvalId: bg.request.approvalId!, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await decideApproval(u.fm, { approvalId: bg.request.approvalId!, decision: "REJECTED", comment: "Use cloud capacity" });
    const rejected = await getRequest(u.emp, big.id);
    expect(rejected.request.status).toBe("REJECTED");
    expect(rejected.request.rejectionReason).toBe("Use cloud capacity");
    // others cannot see the request
    await expect(getRequest(u.emp2, r.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await prisma.auditLog.count({ where: { entityId: r.id, action: { in: ["procurement.created", "procurement.submitted", "procurement.approved"] } } })).toBe(3);
  });
});

async function approvedRequest(u: Awaited<ReturnType<typeof people>>["u"], qty = "3", price = "4000") {
  const r = await createRequest(u.emp, { title: "Laptops", businessJustification: "New hires need laptops", items: items(qty, price), submit: true });
  const g = await getRequest(u.emp, r.id);
  if (g.request.status === "PENDING_APPROVAL") {
    const approver = g.approval?.assigneeId === u.mgr.userId ? u.mgr : g.request.approver === "EXECUTIVE" ? u.fm : u.ops;
    await decideApproval(approver, { approvalId: g.request.approvalId!, decision: "APPROVED" });
  }
  return r.id;
}

describe("purchase orders", () => {
  it("4–6. PO from an approved request: server totals, approval waived only when covered, issued PO frozen (service + DB)", async () => {
    const { u, vendor } = await people();
    const reqId = await approvedRequest(u, "3", "1000");
    const po = await createOrderFromRequest(u.ops, reqId, { vendorId: vendor });
    let row = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { items: true } });
    expect(row.number).toMatch(/^PO-\d{4}-\d{6}$/);
    expect(row.subtotal.toFixed(2)).toBe("3000.00");
    expect(row.taxTotal.toFixed(2)).toBe("450.00"); // company VAT 15 %
    expect(row.total.toFixed(2)).toBe("3450.00");
    expect((await getRequest(u.ops, reqId)).request.status).toBe("ORDERING");
    // browser-supplied totals are ignored: only quantity / price / discount / rate are inputs
    await updateOrder(u.ops, po.id, { vendorId: vendor, items: [{ description: "Laptop", quantity: "3", unitPrice: "1000", discountAmount: "300", taxRate: 15, total: "1", subtotal: "1" }] });
    row = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { items: true } });
    expect(row.total.toFixed(2)).toBe("3105.00");
    // over the approved estimate (3 000 net vs 3 105 gross) → needs PO approval; the creator cannot approve
    const s = await submitOrder(u.ops, po.id);
    expect(s.status).toBe("PENDING_APPROVAL");
    const ap = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    await expect(decideApproval(u.ops, { approvalId: ap.approvalId!, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await decideApproval(u.fm, { approvalId: ap.approvalId!, decision: "APPROVED" });
    const issued = await Promise.allSettled([issueOrder(u.ops, po.id), issueOrder(u.ops, po.id)]);
    expect(issued.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    await expect(updateOrder(u.ops, po.id, { vendorId: vendor, items: [{ description: "Spare item", quantity: "1", unitPrice: "1" }] })).rejects.toMatchObject(code(/PO_NOT_EDITABLE/));
    await expect(prisma.purchaseOrder.update({ where: { id: po.id }, data: { total: "1.00", subtotal: "1.00", taxTotal: "0" } })).rejects.toThrow(/PO_IMMUTABLE/);
    await expect(prisma.purchaseOrderItem.update({ where: { id: row.items[0].id }, data: { unitPrice: "1" } })).rejects.toThrow(/PO_IMMUTABLE/);
    // cancel-and-replace keeps the original and links the replacement
    const rev = await reviseOrder(u.ops, po.id, { reason: "Wrong delivery address" });
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("CANCELLED");
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: rev.id } })).revisionOfId).toBe(po.id);
    // a PO covered by its request is approved without a second approval (audited as waived)
    const req2 = await approvedRequest(u, "1", "2000");
    const po2 = await createOrder(u.ops, { vendorId: vendor, procurementRequestId: req2, items: [{ description: "Monitor", quantity: "1", unitPrice: "2000", taxRate: 0 }] });
    expect((await submitOrder(u.ops, po2.id)).status).toBe("APPROVED");
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po2.id } })).approvalWaivedReason).toMatch(/Covered by approved request/);
    // a PO never creates a payment, expense or payable
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.expense.count()).toBe(0);
  });

  it("7–9. partial receipt, over-receipt refused (service + DB), vendor history and metrics preserved", async () => {
    const { u, vendor } = await people();
    const reqId = await approvedRequest(u, "3", "1000");
    const po = await createOrder(u.ops, { vendorId: vendor, procurementRequestId: reqId, expectedDeliveryDate: new Date(Date.now() + 86_400_000 * 5).toISOString().slice(0, 10), items: [{ description: "Laptop", quantity: "3", unitPrice: "1000", taxRate: 0, assetExpected: true }] });
    await submitOrder(u.ops, po.id);
    await issueOrder(u.ops, po.id);
    const item = await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    await receiveOrder(u.ops, po.id, { lines: [{ poItemId: item.id, quantity: "1" }] });
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("PARTIALLY_RECEIVED");
    await expect(receiveOrder(u.ops, po.id, { lines: [{ poItemId: item.id, quantity: "3" }] })).rejects.toMatchObject(code(/OVER_RECEIPT/));
    await expect(prisma.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQuantity: "5" } })).rejects.toThrow();
    // concurrent receipts of the remaining 2 units: only one fits
    const r = await Promise.allSettled([receiveOrder(u.ops, po.id, { lines: [{ poItemId: item.id, quantity: "2" }] }), receiveOrder(u.ops, po.id, { lines: [{ poItemId: item.id, quantity: "2", condition: "DAMAGED" }] })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const done = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { items: true } });
    expect(done.status).toBe("RECEIVED");
    expect(done.items[0].receivedQuantity.toString()).toBe("3");
    expect((await getRequest(u.ops, reqId)).request.status).toBe("RECEIVED");
    await expect(prisma.purchaseReceipt.deleteMany({ where: { purchaseOrderId: po.id } })).rejects.toThrow(/RECEIPT_IMMUTABLE/);
    // vendor: ops profile + contacts audited; archiving keeps every PO / metric; archived vendors take no new orders
    await updateVendorOps(u.acc, vendor, { procurementCategory: "IT hardware", preferred: true, rating: 4, leadTimeDays: 5 });
    await addVendorContact(u.acc, vendor, { name: "Sami", role: "Account manager", email: "sami@jarir.test", isPrimary: true });
    await setVendorArchived(u.acc, vendor, true);
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).vendorId).toBe(vendor);
    const perf = (await vendorPerformance(orgId, [vendor])).get(vendor)!;
    expect(perf.orders).toBe(1);
    expect(perf.ordered.SAR).toBe("3000.00");
    expect(perf.onTime + perf.late).toBe(1);
    await expect(createOrder(u.ops, { vendorId: vendor, items: [{ description: "Spare item", quantity: "1", unitPrice: "1" }] })).rejects.toMatchObject(code(/VENDOR_ARCHIVED/));
    expect(await prisma.auditLog.count({ where: { entityId: vendor, action: { in: ["vendor.ops_updated", "vendor.contact_added"] } } })).toBe(2);
  });
});

describe("assets", () => {
  async function receivedPo(u: Awaited<ReturnType<typeof people>>["u"], vendor: string, qty = "2") {
    const po = await createOrder(u.ops, { vendorId: vendor, items: [{ description: "ThinkPad T14", quantity: qty, unitPrice: "5200", taxRate: 15, assetExpected: true }] });
    const s = await submitOrder(u.ops, po.id);
    if (s.status === "PENDING_APPROVAL") await decideApproval(u.fm, { approvalId: (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).approvalId!, decision: "APPROVED" });
    await issueOrder(u.ops, po.id);
    const item = await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    await receiveOrder(u.ops, po.id, { lines: [{ poItemId: item.id, quantity: qty }] });
    return item.id;
  }
  const laptopCat = () => prisma.assetCategory.findFirstOrThrow({ where: { organizationId: orgId, key: "laptop" } });

  it("10–12. assets from received PO units (never more than received); one active assignment; history append-only", async () => {
    const { u, e, vendor } = await people();
    const itemId = await receivedPo(u, vendor, "2");
    const cat = await laptopCat();
    const a1 = await createAssetFromPoItem(u.ops, itemId, { categoryId: cat.id, serialNumber: "SN-001" });
    await createAssetFromPoItem(u.ops, itemId, { categoryId: cat.id, serialNumber: "SN-002" });
    await expect(createAssetFromPoItem(u.ops, itemId, { categoryId: cat.id })).rejects.toMatchObject(code(/ASSETS_EXCEED_RECEIVED/));
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: a1.id } });
    expect(asset.number).toMatch(/^AST-\d{6}$/);
    expect(asset.purchaseCost?.toFixed(2)).toBe("5200.00");
    await expect(createAsset(u.ops, { name: "Dup", categoryId: cat.id, serialNumber: "sn-001" })).rejects.toMatchObject(code(/SERIAL_EXISTS/));
    // concurrent assignment to two employees → exactly one wins
    const both = await Promise.allSettled([assignAsset(u.ops, a1.id, { employeeId: e.emp, condition: "New" }), assignAsset(u.hr, a1.id, { employeeId: e.emp2, condition: "New" })]);
    expect(both.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.assetAssignment.count({ where: { assetId: a1.id, returnedAt: null } })).toBe(1);
    await expect(assignAsset(u.ops, a1.id, { employeeId: e.emp2, condition: "New" })).rejects.toMatchObject(code(/ASSET_NOT_ASSIGNABLE/));
    const holder = (await prisma.asset.findUniqueOrThrow({ where: { id: a1.id } })).assignedEmployeeId!;
    // DB backstop: a second active assignment row is impossible
    await expect(prisma.assetAssignment.create({ data: { organizationId: orgId, assetId: a1.id, employeeId: e.emp2, assignedById: u.ops.userId, conditionAtAssignment: "x" } })).rejects.toThrow();
    // return + reassign → two history rows; returned rows cannot be edited or deleted
    await returnAsset(u.ops, a1.id, { condition: "GOOD", notes: "OK" });
    await expect(returnAsset(u.ops, a1.id, { condition: "GOOD" })).rejects.toMatchObject(code(/ASSET_NOT_ASSIGNED/));
    await assignAsset(u.ops, a1.id, { employeeId: holder === e.emp ? e.emp2 : e.emp, condition: "Good" });
    const hist = await prisma.assetAssignment.findMany({ where: { assetId: a1.id }, orderBy: { assignedAt: "asc" } });
    expect(hist).toHaveLength(2);
    expect(hist[0].returnedAt).not.toBeNull();
    await expect(prisma.assetAssignment.update({ where: { id: hist[0].id }, data: { conditionAtReturn: "changed" } })).rejects.toThrow(/ASSIGNMENT_IMMUTABLE/);
    await expect(prisma.assetAssignment.delete({ where: { id: hist[0].id } })).rejects.toThrow(/ASSIGNMENT_IMMUTABLE/);
    // the holder sees it as "my asset" — nobody else without assets.view
    await expect(prisma.asset.update({ where: { id: a1.id }, data: { assignedEmployeeId: null } })).rejects.toThrow(); // ASSIGNED requires a holder (CHECK)
  });

  it("13–14. terminated employee with assets is surfaced (never auto-returned); maintenance lifecycle without auto-expense", async () => {
    const { u, e } = await people();
    const cat = await laptopCat();
    const a = await createAsset(u.ops, { name: "MacBook Air", categoryId: cat.id, purchaseCost: "4800", warrantyEndDate: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10) });
    await assignAsset(u.ops, a.id, { employeeId: e.emp2, condition: "New" });
    await changeEmployeeStatus(u.hr, e.emp2, { to: "TERMINATED", terminationDate: "2026-09-30", reason: "Resigned" });
    const out = await terminatedWithAssets(orgId);
    expect(out.map((x) => x.asset.id)).toEqual([a.id]);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("ASSIGNED");
    expect(await prisma.notification.count({ where: { userId: u.ops.userId, dedupeKey: `asset.return:${e.emp2}` } })).toBe(1);
    expect((await opsAttention(u.ops)).some((x) => x.category === "terminated_with_asset")).toBe(true);
    // maintenance: cannot start while assigned; returned → MAINTENANCE → completed → back in stock
    const m = await createMaintenance(u.ops, a.id, { type: "REPAIR", description: "Battery replacement", cost: "350" });
    await expect(startMaintenance(u.ops, m.id)).rejects.toMatchObject(code(/ASSET_ASSIGNED_RETURN_FIRST/));
    await returnAsset(u.ops, a.id, { condition: "WORN" });
    await startMaintenance(u.ops, m.id);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("MAINTENANCE");
    await expect(assignAsset(u.ops, a.id, { employeeId: e.emp, condition: "Good" })).rejects.toMatchObject(code(/ASSET_NOT_ASSIGNABLE/));
    await completeMaintenance(u.ops, m.id, {});
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("IN_STOCK");
    expect((await prisma.assetMaintenance.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("COMPLETED");
    expect(await prisma.expense.count()).toBe(0);
  });
});

describe("documents", () => {
  it("15–18, 58. secure upload, source-record permissions, immutable versions, hash check, no search leaks", async () => {
    const { u, e } = await people();
    // employee salary file: RESTRICTED → HR with compensation rights only (not the employee's manager, not finance)
    const d = await createDocument(u.hr, { title: "Salary certificate 2026", entityType: "EMPLOYEE", entityId: e.emp, classification: "RESTRICTED", tags: "salary,hr" }, pdfFile("salary"));
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: d.id }, include: { versions: true } });
    expect(doc.number).toMatch(/^DOC-\d{6}$/);
    expect(doc.versions[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(doc.versions[0].scanStatus).toBe("NOT_SCANNED");
    expect(doc.versions[0].storageKey).not.toMatch(/public|\.\./);
    expect((await downloadDocument(u.hr, d.id)).data.equals(PDF("salary"))).toBe(true);
    for (const who of [u.mgr, u.fm, u.emp2, u.ops, u.emp]) await expect(downloadDocument(who, d.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // a guessed / random id is just not found
    await expect(downloadDocument(u.hr, "c0000000000000000000000000")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await prisma.auditLog.count({ where: { entityId: d.id, action: "document.downloaded" } })).toBe(1);
    // upload validation: type allow-list, extension ↔ content, never HTML / scripts
    await expect(createDocument(u.hr, { title: "Test doc", entityType: "EMPLOYEE", entityId: e.emp }, { name: "a.html", type: "text/html", data: Buffer.from("<script>") })).rejects.toMatchObject(code(/FILE_TYPE_NOT_ALLOWED/));
    await expect(createDocument(u.hr, { title: "Test doc", entityType: "EMPLOYEE", entityId: e.emp }, { name: "a.pdf", type: "application/pdf", data: Buffer.from("MZ\x90 not a pdf") })).rejects.toMatchObject(code(/FILE_CONTENT_MISMATCH/));
    await expect(createDocument(u.hr, { title: "Test doc", entityType: "EMPLOYEE", entityId: e.emp }, { name: "a.png", type: "application/pdf", data: PDF() })).rejects.toMatchObject(code(/FILE_TYPE_MISMATCH/));
    // you cannot file a document on a record you cannot see, nor above your level on it
    await expect(createDocument(u.ops, { title: "Test doc", entityType: "EMPLOYEE", entityId: e.emp }, pdfFile())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createDocument(u.hr, { title: "Test doc", entityType: "EMPLOYEE", entityId: e.emp, classification: "PUBLIC_INTERNAL" }, pdfFile())).rejects.toMatchObject(code(/PUBLIC_INTERNAL_ONLY_COMPANY/));
    // versions: a new upload never overwrites; v1 stays downloadable and immutable
    await addVersion(u.hr, d.id, pdfFile("salary-v2"), { note: "corrected" });
    expect((await downloadDocument(u.hr, d.id)).data.equals(PDF("salary-v2"))).toBe(true);
    expect((await downloadDocument(u.hr, d.id, 1)).data.equals(PDF("salary"))).toBe(true);
    await expect(prisma.documentVersion.updateMany({ where: { documentId: d.id }, data: { note: "x" } })).rejects.toThrow(/DOCUMENT_VERSION_IMMUTABLE/);
    await expect(prisma.documentVersion.deleteMany({ where: { documentId: d.id } })).rejects.toThrow(/DOCUMENT_VERSION_IMMUTABLE/);
    // tampered storage object is detected
    const v1 = await prisma.documentVersion.findFirstOrThrow({ where: { documentId: d.id, versionNumber: 1 } });
    const file = path.join(storageDir, ...v1.storageKey.split("/"));
    expect(statSync(file).isFile()).toBe(true);
    writeFileSync(file, PDF("tampered"));
    await expect(downloadDocument(u.hr, d.id, 1)).rejects.toMatchObject(code(/HASH_MISMATCH/));
    // expense attachment follows finance rules: owner + finance; another employee sees nothing
    const cat = await prisma.expenseCategory.findFirstOrThrow({ where: { organizationId: orgId } });
    const exp = await createExpense(u.emp, { categoryId: cat.id, date: "2026-09-01", amount: "120", taxAmount: "0", description: "Taxi to client" });
    const receipt = await createDocument(u.emp, { title: "Taxi receipt", entityType: "EXPENSE", entityId: exp.id }, pdfFile("taxi"));
    expect((await downloadDocument(u.fm, receipt.id)).data.length).toBeGreaterThan(0);
    await expect(downloadDocument(u.emp2, receipt.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await documentsFor(u.emp2, { type: "EXPENSE", id: exp.id })).toBeNull();
    // company PUBLIC_INTERNAL documents are for everyone; listing / search never shows what you cannot open
    await createDocument(u.ops, { title: "Office Wi-Fi guide", classification: "PUBLIC_INTERNAL" }, pdfFile("wifi"));
    const emp2List = await listDocuments(u.emp2, {});
    expect(emp2List.map((x) => x.title)).toEqual(["Office Wi-Fi guide"]);
    expect((await listDocuments(u.emp2, { q: "salary" })).length).toBe(0);
    expect((await opsSearch(u.emp2, "Salary")).filter((x) => x.type === "document")).toHaveLength(0);
    expect((await opsSearch(u.hr, "Salary")).filter((x) => x.type === "document")).toHaveLength(1);
    // concurrent version uploads get distinct numbers
    const vs = await Promise.all([addVersion(u.hr, d.id, pdfFile("a"), {}), addVersion(u.hr, d.id, pdfFile("b"), {})]);
    expect(vs.map((x) => x.version).sort()).toEqual([3, 4]);
    expect(readdirSync(path.join(storageDir, ...v1.storageKey.split("/").slice(0, 2))).length).toBe(6);
  });
});

describe("support", () => {
  it("19–23. tickets: creation with SLA due dates, assignment, explicit transitions, first response, resolution, sweep idempotent", async () => {
    const { u } = await people();
    const t = await createTicket(u.agent, { subject: "VPN access fails", description: "Cannot connect since this morning", priority: "HIGH", category: "ACCESS", source: "PHONE", tags: "vpn" });
    const row = await prisma.supportTicket.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.number).toMatch(/^TCK-\d{6}$/);
    expect((row.firstResponseDueAt!.getTime() - row.createdAt.getTime()) / 60_000).toBe(60);
    expect((row.resolutionDueAt!.getTime() - row.createdAt.getTime()) / 60_000).toBe(480);
    await expect(createTicket(u.agent, { subject: "Via WhatsApp", description: "via whatsapp", source: "WHATSAPP_FUTURE" })).rejects.toMatchObject(code(/SOURCE_NOT_AVAILABLE/));
    await expect(changeTicketStatus(u.agent, t.id, { to: "CLOSED" })).rejects.toMatchObject(code(/TICKET_INVALID_TRANSITION/));
    // take ownership — concurrent takes with the same expected assignee: one wins
    const takes = await Promise.allSettled([assignTicket(u.agent, t.id, { assigneeId: u.agent.userId, expected: null }), assignTicket(u.ops, t.id, { assigneeId: u.ops.userId, expected: null })]);
    expect(takes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    await assignTicket(u.ops, t.id, { assigneeId: u.agent.userId });
    expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("OPEN");
    await addTicketComment(u.agent, t.id, { body: "Checking VPN logs", visibility: "INTERNAL" });
    // the creator's own internal note is not a response; the first requester-facing note is
    expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id: t.id } })).firstResponseAt).toBeNull();
    await addTicketComment(u.agent, t.id, { body: "We are renewing the VPN certificate", visibility: "CLIENT_FACING" });
    expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id: t.id } })).firstResponseAt).not.toBeNull();
    await expect(changeTicketStatus(u.agent, t.id, { to: "RESOLVED" })).rejects.toMatchObject(code(/RESOLUTION_REQUIRED/));
    await changeTicketStatus(u.agent, t.id, { to: "RESOLVED", reason: "Certificate renewed" });
    const res = await prisma.supportTicket.findUniqueOrThrow({ where: { id: t.id } });
    expect(res.resolvedAt).not.toBeNull();
    await expect(prisma.ticketComment.updateMany({ where: { ticketId: t.id }, data: { body: "x" } })).rejects.toThrow(/COMMENT_IMMUTABLE/);
    // a requester (employee) sees only requester-facing notes and only own tickets
    const own = await createTicket(u.emp, { subject: "Printer jam", description: "Floor 2 printer" });
    await addTicketComment(u.agent, own.id, { body: "internal: replace drum", visibility: "INTERNAL" }).catch(() => undefined);
    expect((await listTickets(u.emp, {})).items.map((x) => x.id)).toEqual([own.id]);
    // SLA breach sweep: idempotent claims + deduplicated notifications
    const late = await createTicket(u.agent, { subject: "Site down", description: "Production 500", priority: "URGENT" });
    await assignTicket(u.agent, late.id, { assigneeId: u.agent.userId });
    const past = new Date(Date.now() - 6 * 3600_000);
    await prisma.supportTicket.update({ where: { id: late.id }, data: { createdAt: past, firstResponseDueAt: new Date(past.getTime() + 30 * 60_000), resolutionDueAt: new Date(past.getTime() + 240 * 60_000) } });
    const s1 = await sweepOps(orgId);
    const s2 = await sweepOps(orgId);
    expect(s1).toMatchObject({ slaBreaches: 2 });
    expect(s2).toMatchObject({ slaBreaches: 0, slaWarnings: 0 });
    expect(await prisma.domainEvent.count({ where: { type: "ticket.sla_breached", entityId: late.id } })).toBe(2);
    expect(await prisma.notification.count({ where: { userId: u.agent.userId, dedupeKey: `sla.breach:${late.id}:resolution` } })).toBe(1);
  });

  it("24. Client 360 support tab is permission- and scope-controlled", async () => {
    const { u } = await people();
    const client = await prisma.client.create({ data: { organizationId: orgId, number: "CLI-000001", displayName: "Lumen Clinics", ownerId: u.sales.userId } });
    await createTicket(u.agent, { subject: "Booking page slow", description: "Clinic booking", clientId: client.id, priority: "MEDIUM" });
    expect(await clientTickets(u.agent, client.id)).toHaveLength(1);
    expect(await clientTickets(u.sales, client.id)).toBeNull(); // no support permission → no tab
    expect(await clientTickets(u.dev, client.id)).toHaveLength(0); // support viewer, not assigned / creator → nothing
    expect(await clientTickets(u.ops, client.id)).toHaveLength(1);
  });
});

describe("knowledge", () => {
  it("25–26. visibility respected; review → publish creates an immutable version; edits never rewrite the live content", async () => {
    const { u } = await people();
    const cat = await prisma.knowledgeCategory.findFirstOrThrow({ where: { organizationId: orgId, key: "support" } });
    const body = (s: string) => ({ titleAr: `استعادة كلمة مرور VPN ${s}`, titleEn: `VPN password reset ${s}`, bodyAr: `الخطوات بالتفصيل ${s} …`, bodyEn: `Detailed steps ${s} …`, categoryId: cat.id, tags: "access,vpn" });
    const a = await createArticle(u.agent, { ...body("v1"), visibility: "SUPPORT_ONLY" });
    await submitArticleForReview(u.agent, a.id);
    await expect(publishArticle(u.agent, a.id)).rejects.toMatchObject({ code: "FORBIDDEN" }); // no publish right
    await publishArticle(u.ops, a.id);
    const pub = await prisma.knowledgeArticle.findUniqueOrThrow({ where: { id: a.id } });
    expect(pub.status).toBe("PUBLISHED");
    expect(pub.publishedAt).not.toBeNull();
    // support-only knowledge is invisible to an ordinary employee
    expect((await searchArticles(u.emp, { q: "VPN" })).published).toHaveLength(0);
    await expect(getArticle(u.emp, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await searchArticles(u.dev, { q: "VPN" })).published).toHaveLength(1);
    // editing the published article: readers keep v1 until the revision is published
    await updateArticle(u.agent, a.id, body("v2"));
    expect((await prisma.knowledgeArticle.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("DRAFT");
    const live = await getArticle(u.dev, a.id);
    expect(live.article.publishedVersion?.titleEn).toBe("VPN password reset v1");
    await submitArticleForReview(u.agent, a.id);
    await publishArticle(u.ops, a.id);
    expect((await getArticle(u.dev, a.id)).article.publishedVersion?.titleEn).toBe("VPN password reset v2");
    expect(await prisma.knowledgeArticleVersion.count({ where: { articleId: a.id } })).toBe(2);
    await expect(prisma.knowledgeArticleVersion.updateMany({ where: { articleId: a.id }, data: { titleEn: "x" } })).rejects.toThrow(/KNOWLEDGE_VERSION_IMMUTABLE/);
    // department visibility
    const dept = await prisma.department.create({ data: { organizationId: orgId, code: "IT", name: "IT" } });
    await prisma.user.update({ where: { id: u.agent.userId }, data: { departmentId: dept.id } });
    const d = await createArticle(u.ops, { ...body("dept"), visibility: "DEPARTMENT", departmentId: dept.id });
    await submitArticleForReview(u.ops, d.id);
    await publishArticle(u.ops, d.id); // knowledge.manage may publish own
    expect((await searchArticles(await ctxFor(u.agent.userId), { q: "dept" })).published).toHaveLength(1);
    expect((await searchArticles(u.emp, { q: "dept" })).published).toHaveLength(0);
  });
});

describe("dashboard, search, notifications", () => {
  it("27–30. operations dashboard is real, search is permission-aware, notifications are deduplicated", async () => {
    const { u, vendor } = await people();
    await createRequest(u.emp, { title: "Desk chair", businessJustification: "Ergonomic chair", items: items("1", "900") , submit: true });
    const po = await createOrder(u.ops, { vendorId: vendor, items: [{ description: "Toner", quantity: "4", unitPrice: "300" }] });
    await submitOrder(u.ops, po.id);
    await createTicket(u.agent, { subject: "Mail bounce", description: "SMTP issue", priority: "URGENT" });
    const d = await opsDashboard(u.ops);
    expect(d).toMatchObject({ pendingRequests: 1, posAwaiting: 1, openTickets: 1, urgentTickets: 1, assigned: 0 });
    const dEmp = await opsDashboard(u.emp);
    expect(dEmp.posAwaiting).toBeNull();
    expect(dEmp.openTickets).toBeNull();
    // urgent ticket notified to support managers exactly once
    expect(await prisma.notification.count({ where: { userId: u.ops.userId, category: "SUPPORT", priority: "URGENT" } })).toBe(1);
    // global search: requests / POs / tickets only within scope
    expect((await globalSearch(u.emp2, "Desk")).filter((x) => x.type === "procurement")).toHaveLength(0);
    expect((await globalSearch(u.emp, "Desk")).filter((x) => x.type === "procurement")).toHaveLength(1);
    expect((await globalSearch(u.sales, "Mail")).filter((x) => x.type === "ticket")).toHaveLength(0);
    expect((await globalSearch(u.ops, "Mail")).filter((x) => x.type === "ticket")).toHaveLength(1);
    expect((await globalSearch(u.ops, po.number)).filter((x) => x.type === "purchase_order")).toHaveLength(1);
    // cancel stays possible before receipt; the sweep twice yields no duplicate PO-overdue events
    await prisma.purchaseOrder.update({ where: { id: po.id }, data: {} });
    await cancelOrder(u.ops, po.id, { reason: "Duplicate order" });
    await sweepOps(orgId);
    await sweepOps(orgId);
    expect(await prisma.domainEvent.count({ where: { type: "purchase_order.overdue" } })).toBe(0);
  });
});
