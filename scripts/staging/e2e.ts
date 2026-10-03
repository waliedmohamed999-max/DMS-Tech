/**
 * STAGING end-to-end company workflow (Phase 10). TEST DATA ONLY — refuses APP_ENV=production.
 * The website lead goes through the PUBLIC HTTPS endpoint; every later step calls the real service layer (the same code
 * the UI's server actions call) with distinct, least-privilege staff accounts, so approvals / scopes / guards apply.
 *   node scripts/staging/with-env.mjs . npx tsx scripts/staging/e2e.ts
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "../../src/server/db";
import "../../src/server/handlers";
import { registerSubscribers } from "../../src/server/events/subscribers";
import { appEnv } from "../../src/server/system/environment";
import { isPermission } from "../../src/server/rbac/permissions";
import type { Ctx } from "../../src/server/context";
import { createUser } from "../../src/server/admin/users";
import { updateSettings } from "../../src/server/admin/org";
import { convertLead, qualifyLead, updateLead } from "../../src/server/crm/leads";
import { createQuotation, submitQuotation, markQuotationSent, acceptQuotation } from "../../src/server/commercial/quotations";
import { createContractFromQuotation, updateContract, sendContractForSignature, activateContract } from "../../src/server/commercial/contracts";
import { decideApproval } from "../../src/server/approvals/service";
import { createProject, addProjectMember, changeProjectStatus, completeProject } from "../../src/server/projects/projects";
import { createTask, changeTaskStatus } from "../../src/server/projects/work";
import { createInvoiceFromSource } from "../../src/server/finance/eligibility";
import { issueInvoice } from "../../src/server/finance/invoices";
import { recordPayment } from "../../src/server/finance/payments";
import { createExpense, submitExpense, payExpense } from "../../src/server/finance/expenses";
import { arAging } from "../../src/server/finance/insights";
import { clientFinance, projectFinance } from "../../src/server/finance/costing";
import { createEmployee } from "../../src/server/hr/employees";
import { addCompensation, setBankAccount, bankAccounts } from "../../src/server/hr/compensation";
import { createLeaveRequest, grantOpeningBalances, saveLeaveType } from "../../src/server/hr/leave";
import { createPeriod, calculatePeriod, submitPayroll, markPayrollPaid, payslipEntry } from "../../src/server/hr/payroll";
import { createRequest } from "../../src/server/ops/procurement";
import { createOrderFromRequest, submitOrder, issueOrder, receiveOrder } from "../../src/server/ops/orders";
import { createAssetFromPoItem } from "../../src/server/ops/assets";
import { createTicket, assignTicket, changeTicketStatus } from "../../src/server/ops/support";
import { createVendor } from "../../src/server/finance/expenses";
import { addDays, todayIn, ymd } from "../../src/server/commercial/dates";

const steps: { step: string; ok: boolean; ms: number; detail?: string }[] = [];
async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now();
  try {
    const r = await fn();
    steps.push({ step: name, ok: true, ms: Date.now() - t });
    return r;
  } catch (e) {
    steps.push({ step: name, ok: false, ms: Date.now() - t, detail: String((e as Error)?.message ?? e).slice(0, 300) });
    throw e;
  }
}
const check = (name: string, cond: boolean, detail = "") => {
  steps.push({ step: `verify: ${name}`, ok: cond, ms: 0, detail });
  if (!cond) throw new Error(`verification failed: ${name} ${detail}`);
};

async function ctxFor(userId: string): Promise<Ctx> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: { include: { role: { include: { permissions: true } } } } } });
  return { organizationId: u.organizationId, userId: u.id, userName: u.name, roleKeys: u.roles.map((r) => r.role.key), permissions: new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission)).filter(isPermission)), meta: { ip: "staging-e2e", userAgent: "e2e" } };
}

async function main() {
  if (appEnv() === "production") throw new Error("refused: staging E2E never runs in production");
  registerSubscribers();
  const run = randomBytes(3).toString("hex");
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: process.env.OS_ORG_SLUG ?? "dms-tech" } });
  const tz = org.timezone;
  const d = (n: number) => ymd(addDays(todayIn(tz), n))!;
  const admin = await ctxFor((await prisma.user.findFirstOrThrow({ where: { email: "ops.lead@dmstech.sa" } })).id);

  // --- staff (least privilege, one person per role) ---
  const role = async (key: string) => (await prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: org.id, key } } })).id;
  const staff: Record<string, Ctx> = {};
  await step("create staff accounts", async () => {
    for (const [k, r] of Object.entries({ sm: "sales_manager", rep: "sales_rep", pm: "project_manager", dev: "developer", fm: "finance_manager", acc: "accountant", hr: "hr_manager", mgr: "line_manager", emp: "employee", ops: "operations_manager", sup: "support_agent", ceo: "ceo" })) {
      const email = `e2e.${k}.${run}@staging.dmstech.sa`;
      const u = await createUser(admin, { email, name: `E2E ${k.toUpperCase()} ${run}`, roleIds: [await role(r)] });
      if (u.pendingRoles.length) {
        const a = await prisma.approval.findFirstOrThrow({ where: { entityId: u.id, status: "PENDING" } });
        const other = await ctxFor((await prisma.user.findFirstOrThrow({ where: { email: "it.backup@dmstech.sa" } })).id);
        await decideApproval(other, { approvalId: a.id, decision: "APPROVED" });
      }
      staff[k] = await ctxFor(u.id);
    }
  });
  const s = staff;

  await step("company settings (staging test values)", async () => {
    // the Settings page submits the whole form: start from the current values (decimals as strings)
    const cur = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    const current = Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, v !== null && typeof v === "object" && !(v instanceof Date) ? String(v) : v]));
    await updateSettings(admin, { ...current, name: "DMS Tech", nameAr: "دي إم إس تك", legalName: "DMS Tech (STAGING TEST)", vatNumber: "300000000000003", crNumber: "1010000000", email: "staging@dmstech.sa", phone: "+966110000000", address: "Riyadh — STAGING TEST ADDRESS", city: "Riyadh", invoicePaymentInstructions: "STAGING TEST ONLY — not a real bank account" });
  });

  // --- 1. website lead (public HTTPS) → CRM ---
  const leadEmail = `visitor.${run}@customer-staging.sa`;
  await step("website lead via public HTTPS /api/leads", async () => {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/leads`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.20.${Math.floor(Math.random() * 200)}.1` }, body: JSON.stringify({ name: `E2E Visitor ${run}`, email: leadEmail, phone: `0551${String(Date.now()).slice(-6)}`, company: `E2E Customer ${run}`, service: "web-development", message: "Staging E2E — website lead", source: "quote", locale: "en", elapsed: 9000 }) });
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  });
  const lead = await prisma.lead.findFirstOrThrow({ where: { emailNormalized: leadEmail } });
  check("lead captured with source WEBSITE + first touch", lead.source === "WEBSITE" && (await prisma.attributionTouch.count({ where: { leadId: lead.id, touchType: "FIRST" } })) === 1);
  await step("assign lead to the sales rep", () => updateLead(s.sm, { id: lead.id, ownerId: s.rep.userId }));
  await step("qualify lead", () => qualifyLead(s.rep, lead.id));
  const conv = await step("convert lead → client + opportunity", () => convertLead(s.rep, { leadId: lead.id, clientMode: "new", contactMode: "new", estimatedValue: "60000" }));

  // --- 2. quotation with approval → acceptance → contract ---
  const svc = await prisma.service.findFirstOrThrow({ where: { organizationId: org.id, key: "web-development" } });
  const q = await step("quotation (above approval threshold)", () => createQuotation(s.rep, { clientId: conv.clientId, opportunityId: conv.opportunityId, items: [{ serviceId: svc.id, name: "Corporate website", quantity: "1", unitPrice: "60000" }] }));
  const sub = await step("submit quotation", () => submitQuotation(s.rep, q.id));
  check("quotation routed to approval", sub.status === "PENDING_APPROVAL");
  const qa = await prisma.approval.findFirstOrThrow({ where: { entityId: q.id, status: "PENDING" } });
  await step("sales manager approves (requester cannot)", async () => {
    await decideApproval(s.rep, { approvalId: qa.id, decision: "APPROVED" }).then(() => { throw new Error("requester approved own quotation"); }, () => undefined);
    await decideApproval(s.sm, { approvalId: qa.id, decision: "APPROVED" });
  });
  await step("send + client acceptance", async () => {
    await markQuotationSent(s.rep, q.id, { method: "OTHER", confirm: true });
    const v = await prisma.quotationVersion.findFirstOrThrow({ where: { quotationId: q.id }, orderBy: { versionNumber: "desc" } });
    await acceptQuotation(s.rep, q.id, { versionId: v.id, confirm: true, markOpportunityWon: true });
  });
  const c = await step("contract from quotation → signature → activation", async () => {
    const c = await createContractFromQuotation(s.sm, q.id);
    await updateContract(s.sm, c.id, { title: `E2E contract ${run}`, startDate: d(0), endDate: d(120), milestones: [] });
    await sendContractForSignature(s.sm, c.id);
    await activateContract(s.sm, c.id, { signedAt: d(0), confirm: true });
    return c;
  });
  check("opportunity WON + contract ACTIVE", (await prisma.opportunity.findUniqueOrThrow({ where: { id: conv.opportunityId } })).status === "WON" && (await prisma.contract.findUniqueOrThrow({ where: { id: c.id } })).status === "ACTIVE");

  // --- 3. project → tasks → completion ---
  const p = await step("project from contract", () => createProject(s.pm, { source: "contract", contractId: c.id, milestoneSource: "none", startDate: d(0), targetEndDate: d(60) }));
  await step("team + tasks + delivery", async () => {
    await addProjectMember(s.pm, p.id, { userId: s.dev.userId, role: "DEVELOPER" });
    await changeProjectStatus(s.pm, p.id, { to: "ACTIVE" });
    for (const title of ["Design", "Build", "Launch"]) {
      const t = await createTask(s.pm, { projectId: p.id, title: `${title} (E2E)`, assigneeId: s.dev.userId, dueDate: d(30) });
      await changeTaskStatus(s.dev, (t as { id: string }).id, { to: "IN_PROGRESS" });
      await changeTaskStatus(s.dev, (t as { id: string }).id, { to: "DONE" });
    }
  });
  await step("complete project", () => completeProject(s.pm, p.id, {}));
  check("project COMPLETED, linked to contract + client", (await prisma.project.findUniqueOrThrow({ where: { id: p.id } })).status === "COMPLETED");

  // --- 4. finance: invoice → partial + full payment, expense with approval ---
  const inv = await step("invoice from contract → issue", async () => {
    const { id } = await createInvoiceFromSource(s.fm, { type: "CONTRACT", id: c.id });
    await issueInvoice(s.fm, id);
    return prisma.invoice.findUniqueOrThrow({ where: { id } });
  });
  check("invoice references contract / client and carries VAT", inv.contractId === c.id && inv.clientId === conv.clientId && Number(inv.taxTotal) > 0, `${inv.number} total ${inv.total}`);
  const half = (Number(inv.total) / 2).toFixed(2);
  const rest = (Number(inv.total) - Number(half)).toFixed(2);
  await step("partial payment", () => recordPayment(s.fm, { clientId: conv.clientId, amount: half, paymentDate: d(0), method: "BANK_TRANSFER", allocations: [{ invoiceId: inv.id, amount: half }] }));
  check("invoice PARTIALLY_PAID", (await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status === "PARTIALLY_PAID");
  await step("final payment", () => recordPayment(s.fm, { clientId: conv.clientId, amount: rest, paymentDate: d(0), method: "BANK_TRANSFER", allocations: [{ invoiceId: inv.id, amount: rest }] }));
  check("invoice PAID, balance 0", (await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status === "PAID");
  const cat = await prisma.expenseCategory.findFirstOrThrow({ where: { organizationId: org.id } });
  await step("project expense → approval → paid", async () => {
    const e = await createExpense(s.dev, { categoryId: cat.id, projectId: p.id, date: d(0), amount: "800", taxAmount: "120", description: `E2E hosting ${run}` });
    await submitExpense(s.dev, e.id);
    const ap = await prisma.approval.findFirst({ where: { entityId: e.id, status: "PENDING" } });
    if (ap) {
      for (const who of [s.mgr, s.pm, s.fm, s.ceo]) {
        try {
          await decideApproval(who, { approvalId: ap.id, decision: "APPROVED" });
          break;
        } catch {
          /* try the next authorised approver */
        }
      }
    }
    await payExpense(s.acc, e.id, { paymentMethod: "BANK_TRANSFER" });
  });
  await step("AR / project / client finance views", async () => {
    const ar = await arAging(s.fm, {});
    const pf = await projectFinance(s.fm, p.id);
    const cf = await clientFinance(s.fm, conv.clientId);
    steps.push({ step: "finance snapshot", ok: true, ms: 0, detail: JSON.stringify({ ar: (ar as { totals?: unknown }).totals ?? "ok", project: { billed: (pf as { billed?: unknown }).billed, collected: (pf as { collected?: unknown }).collected }, client: { outstanding: (cf as { outstanding?: unknown }).outstanding } }).slice(0, 300) });
  });

  // --- 5. HR: employee (encrypted IBAN) → leave → approval; payroll ---
  const mgrE = await step("employees + manager line", () => createEmployee(s.hr, { firstName: "E2E", lastName: `Manager ${run}`, userId: s.mgr.userId, joinDate: "2026-01-01" }));
  const empE = await step("employee + compensation + bank (encrypted)", async () => {
    const e = await createEmployee(s.hr, { firstName: "E2E", lastName: `Employee ${run}`, userId: s.emp.userId, managerId: mgrE.id, joinDate: "2026-01-01" });
    await addCompensation(s.hr, e.id, { baseSalary: "10000", housingAllowance: "2500", transportAllowance: "500", currency: "SAR", effectiveFrom: "2026-01-01", notes: "STAGING TEST" });
    await setBankAccount(s.hr, e.id, { bankName: "STAGING TEST BANK", iban: "SA4420000001234567891234", accountName: "E2E Employee", effectiveFrom: "2026-01-01" });
    return e;
  });
  const bank = await prisma.employeeBankAccount.findFirstOrThrow({ where: { employeeId: empE.id } });
  check("IBAN stored encrypted, masked in listings", bank.iban === null && Boolean(bank.ibanCiphertext) && (await bankAccounts(s.hr, empE.id))[0].iban.endsWith("1234"));
  await step("leave request → manager approval", async () => {
    const t = await prisma.leaveType.findFirstOrThrow({ where: { organizationId: org.id, key: "annual" } });
    await saveLeaveType(s.hr, { id: t.id, nameAr: t.nameAr, nameEn: t.nameEn, paid: true, defaultBalanceDays: 21 });
    const year = new Date().getFullYear() + 1;
    await grantOpeningBalances(s.hr, year).catch(() => undefined);
    const r = await createLeaveRequest(s.emp, { leaveTypeId: t.id, startDate: `${year}-03-07`, endDate: `${year}-03-09`, reason: "STAGING E2E" });
    const lr = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: r.id } });
    await decideApproval(s.mgr, { approvalId: lr.approvalId!, decision: "APPROVED" });
    if ((await prisma.leaveRequest.findUniqueOrThrow({ where: { id: r.id } })).status !== "APPROVED") throw new Error("leave not approved");
  });
  await step("payroll: period → calculate → approve → mark paid → payslip", async () => {
    // rerunnable on the same staging database: the first month (from now) without a payroll period — overlapping
    // periods are refused by design (PERIOD_OVERLAP), so a second run must not reuse the month of the first
    const now = new Date();
    let start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    let end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    for (let i = 0; i < 24; i++) {
      const s0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
      const e0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 0));
      if (!(await prisma.payrollPeriod.count({ where: { organizationId: org.id, periodStart: { lte: e0 }, periodEnd: { gte: s0 } } }))) {
        start = s0;
        end = e0;
        break;
      }
    }
    const period = (await createPeriod(s.hr, { periodStart: ymd(start), periodEnd: ymd(end), payDate: ymd(end) })).id;
    await calculatePeriod(s.hr, period);
    const sub = await submitPayroll(s.hr, period);
    for (const who of [s.ceo, s.fm]) {
      try {
        await decideApproval(who, { approvalId: (sub as { approvalId: string }).approvalId, decision: "APPROVED" });
        break;
      } catch {
        /* next authorised approver */
      }
    }
    await markPayrollPaid(s.fm, period, { paymentReference: `STAGING-${run}` });
    const entry = await prisma.payrollEntry.findFirstOrThrow({ where: { periodId: period, employeeId: empE.id } });
    const slip = await payslipEntry(s.emp, entry.id);
    if (!slip) throw new Error("no payslip");
  });

  // --- 6. procurement → PO → asset; support ticket ---
  const vendor = await step("vendor", () => createVendor(s.acc, { name: `E2E Vendor ${run}`, category: "IT" }));
  await step("purchase request → approval → PO → receipt → asset", async () => {
    const req = await createRequest(s.emp, { title: `E2E laptop ${run}`, businessJustification: "Staging end-to-end procurement test", category: "IT", items: [{ description: "Test laptop", quantity: "1", estimatedUnitPrice: "4000", assetExpected: true }], submit: true });
    const r = await prisma.procurementRequest.findUniqueOrThrow({ where: { id: req.id } });
    if (r.approvalId) await decideApproval(s.mgr, { approvalId: r.approvalId, decision: "APPROVED" });
    const po = await createOrderFromRequest(s.ops, req.id, { vendorId: vendor.id, expectedDeliveryDate: d(7) });
    const fresh = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    if (fresh.status === "DRAFT") await submitOrder(s.ops, po.id);
    const afterSubmit = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    if (afterSubmit.status === "PENDING_APPROVAL" && afterSubmit.approvalId) await decideApproval(s.fm, { approvalId: afterSubmit.approvalId, decision: "APPROVED" });
    await issueOrder(s.ops, po.id);
    const item = await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    await receiveOrder(s.ops, po.id, { lines: [{ poItemId: item.id, quantity: "1" }], notes: "STAGING E2E" });
    const cat = await prisma.assetCategory.findFirstOrThrow({ where: { organizationId: org.id } });
    await createAssetFromPoItem(s.ops, item.id, { categoryId: cat.id, serialNumber: `E2E-${run}`, manufacturer: "Test", model: "Test" });
  });
  await step("support ticket → assign → resolve → close", async () => {
    const t = await createTicket(s.sup, { subject: `E2E ticket ${run}`, description: "Staging end-to-end support test", category: "QUESTION", priority: "MEDIUM", source: "PHONE", clientId: conv.clientId });
    await assignTicket(s.ops, t.id, { assigneeId: s.sup.userId });
    await changeTicketStatus(s.sup, t.id, { to: "IN_PROGRESS" });
    await changeTicketStatus(s.sup, t.id, { to: "RESOLVED", reason: "Answered (staging E2E)", resolution: "Answered (staging E2E)" } as never);
    await changeTicketStatus(s.ops, t.id, { to: "CLOSED" });
  });

  // --- cross-module references ---
  const client = await prisma.client.findUniqueOrThrow({ where: { id: conv.clientId }, include: { _count: { select: { quotations: true, contracts: true, projects: true, invoices: true } } } });
  check("client links quotation / contract / project / invoice", client._count.quotations === 1 && client._count.contracts === 1 && client._count.projects === 1 && client._count.invoices === 1, JSON.stringify(client._count));
  check("lead converted to this client", (await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).convertedClientId === conv.clientId);
  const failed = await prisma.domainEvent.count({ where: { status: { in: ["FAILED", "DEAD_LETTER"] } } });
  check("no failed domain events after the workflow", failed === 0, `${failed}`);
  return { run, clientId: conv.clientId, invoice: inv.number, project: p.id };
}

main()
  .then((r) => {
    for (const x of steps) console.log(`${x.ok ? "✔" : "✖"} ${x.step}${x.ms ? ` (${x.ms} ms)` : ""}${x.detail ? ` — ${x.detail}` : ""}`);
    console.log(JSON.stringify({ ok: true, ...r, steps: steps.length }));
  })
  .catch((e) => {
    for (const x of steps) console.log(`${x.ok ? "✔" : "✖"} ${x.step}${x.ms ? ` (${x.ms} ms)` : ""}${x.detail ? ` — ${x.detail}` : ""}`);
    console.error(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e).slice(0, 500) }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
