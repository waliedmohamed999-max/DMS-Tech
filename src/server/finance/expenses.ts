import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, canAny, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { optDate, optEmail, optId, optText, parseListParams, reqText } from "../crm/normalize";
import { nextNumber, nextYearlyNumber } from "../crm/sequence";
import { todayIn, ymd } from "../commercial/dates";
import { cancelApprovalTx, registerApprovalHandler, requestApprovalTx } from "../approvals/service";
import { projectWhere } from "../projects/access";
import { Decimal } from "@/lib/commercial/calc";
import { and, expenseWhere, financeAll } from "./access";
import { orgFinance } from "./invoices";

/**
 * Expenses, categories, vendors — docs/FINANCE.md.
 *
 * Expense: DRAFT ──submit──► PENDING_APPROVAL ──(Approval EXPENSE, Phase 1 engine)──► APPROVED ──pay──► PAID
 *                                   │ reject (reason) → REJECTED → edit → resubmit
 *                                   └ withdraw (submitter) → DRAFT
 *          DRAFT / REJECTED / APPROVED (unpaid) ──cancel──► CANCELLED
 * Approval rule: total ≥ org.expenseApprovalThreshold → finance.expenses.approve_executive,
 * otherwise finance.expenses.approve. The engine blocks the requester; the handler also blocks
 * the person the expense is FOR (claimant) from approving it. Content is frozen outside
 * DRAFT / REJECTED (Expense_freeze trigger); paying is a conditional update (cannot happen twice).
 */

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const DEFAULT_CATEGORIES: [string, string, string][] = [
  ["hosting", "الاستضافة", "Hosting"],
  ["software", "البرمجيات", "Software"],
  ["advertising", "الإعلانات", "Advertising"],
  ["salaries", "الرواتب (تصنيف فقط)", "Salaries (category only)"],
  ["contractors", "المتعاقدون", "Contractors"],
  ["office", "المكتب", "Office"],
  ["travel", "السفر", "Travel"],
  ["transportation", "المواصلات", "Transportation"],
  ["subscriptions", "الاشتراكات", "Subscriptions"],
  ["cloud", "الخدمات السحابية", "Cloud Services"],
  ["government", "الرسوم الحكومية", "Government Fees"],
  ["professional", "الخدمات المهنية", "Professional Services"],
  ["equipment", "المعدات", "Equipment"],
  ["other", "أخرى", "Other"]
];

/** Idempotent (bootstrap): creates missing default categories, never renames or reactivates existing ones. */
export async function ensureExpenseCategories(organizationId: string) {
  await prisma.expenseCategory.createMany({
    data: DEFAULT_CATEGORIES.map(([key, nameAr, nameEn], i) => ({ organizationId, key, nameAr, nameEn, sortOrder: i * 10 })),
    skipDuplicates: true
  });
}

const canSetup = (ctx: Ctx) => canAny(ctx, "admin.settings.manage", "finance.vendors.manage");
const categorySchema = z.object({ id: optId, key: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(), nameAr: reqText(2, 80), nameEn: reqText(2, 80), active: z.boolean().default(true) });

export async function saveCategory(ctx: Ctx, raw: unknown) {
  if (!canSetup(ctx)) throw forbidden("finance.vendors.manage");
  const input = categorySchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    if (input.id) {
      const before = await tx.expenseCategory.findFirst({ where: { id: input.id, organizationId: ctx.organizationId } });
      if (!before) throw notFound("ExpenseCategory");
      const after = await tx.expenseCategory.update({ where: { id: input.id }, data: { nameAr: input.nameAr, nameEn: input.nameEn, active: input.active } });
      await uow.audit({ action: "expense_category.updated", entityType: "ExpenseCategory", entityId: after.id, before, after });
      return { id: after.id };
    }
    const key = input.key ?? input.nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    if (await tx.expenseCategory.findFirst({ where: { organizationId: ctx.organizationId, key } })) throw invalid("CATEGORY_KEY_TAKEN");
    const c = await tx.expenseCategory.create({ data: { organizationId: ctx.organizationId, key, nameAr: input.nameAr, nameEn: input.nameEn, active: input.active, sortOrder: 1000 } });
    await uow.audit({ action: "expense_category.created", entityType: "ExpenseCategory", entityId: c.id, after: c });
    return { id: c.id };
  });
}

export async function listCategories(ctx: Ctx, opts: { all?: boolean } = {}) {
  return prisma.expenseCategory.findMany({ where: { organizationId: ctx.organizationId, ...(opts.all ? {} : { active: true }) }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] });
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

const vendorSchema = z.object({
  name: reqText(2, 160),
  contactName: optText(120),
  phone: optText(30),
  email: optEmail,
  taxNumber: optText(30),
  category: optText(60),
  paymentTerms: optText(500),
  notes: optText(4000)
});

export async function createVendor(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "finance.vendors.manage");
  const input = vendorSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const number = await nextNumber(tx, ctx.organizationId, "VEN");
    const v = await tx.vendor.create({ data: { ...input, organizationId: ctx.organizationId, number, createdById: ctx.userId || null } });
    await uow.audit({ action: "vendor.created", entityType: "Vendor", entityId: v.id, after: v });
    uow.emit({ type: "vendor.created", entityType: "Vendor", entityId: v.id, payload: { number, name: v.name } });
    return { id: v.id };
  });
}

export async function updateVendor(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "finance.vendors.manage");
  const input = vendorSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await tx.vendor.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!before) throw notFound("Vendor");
    const after = await tx.vendor.update({ where: { id }, data: input });
    await uow.audit({ action: "vendor.updated", entityType: "Vendor", entityId: id, before, after });
    return { id };
  });
}

/** Archive (no hard delete — historical expenses keep their vendor). Archived vendors cannot be used on new expenses. */
export async function setVendorArchived(ctx: Ctx, id: string, archived: boolean) {
  requirePermission(ctx, "finance.vendors.manage");
  return unitOfWork(ctx, async (tx, uow) => {
    const v = await tx.vendor.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!v) throw notFound("Vendor");
    await tx.vendor.update({ where: { id }, data: archived ? { status: "ARCHIVED", archivedAt: new Date() } : { status: "ACTIVE", archivedAt: null } });
    await uow.audit({ action: archived ? "vendor.archived" : "vendor.restored", entityType: "Vendor", entityId: id, before: { status: v.status }, after: { status: archived ? "ARCHIVED" : "ACTIVE" } });
    return { id };
  });
}

export async function listVendors(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "finance.vendors.view");
  const f = parseListParams(z.object({ q: z.string().trim().max(100).optional(), status: z.enum(["ACTIVE", "ARCHIVED", "all"]).default("ACTIVE"), page: z.coerce.number().int().min(1).default(1) }), raw ?? {});
  const where: Prisma.VendorWhereInput = {
    organizationId: ctx.organizationId,
    ...(f.status === "all" ? {} : { status: f.status }),
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { number: { contains: f.q, mode: "insensitive" } }, { contactName: { contains: f.q, mode: "insensitive" } }, { email: { contains: f.q, mode: "insensitive" } }] } : {})
  };
  const [items, total] = await Promise.all([
    prisma.vendor.findMany({ where, orderBy: { name: "asc" }, skip: (f.page - 1) * 25, take: 25, include: { _count: { select: { expenses: true } } } }),
    prisma.vendor.count({ where })
  ]);
  const spend = items.length ? await prisma.expense.groupBy({ by: ["vendorId"], where: { vendorId: { in: items.map((v) => v.id) }, status: { in: ["APPROVED", "PAID"] } }, _sum: { total: true } }) : [];
  return { items: items.map((v) => ({ ...v, spend: spend.find((s) => s.vendorId === v.id)?._sum.total?.toFixed(2) ?? "0.00" })), total, page: f.page, pageSize: 25, filters: f };
}

export async function vendorOptions(ctx: Ctx) {
  return prisma.vendor.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, number: true } });
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

const decStr = z.preprocess((v) => (v === null || v === undefined || v === "" ? "0" : String(v).replace(/[,\s]/g, "")), z.string().regex(/^\d+(\.\d{1,2})?$/, "AMOUNT_INVALID"));
const expenseSchema = z.object({
  categoryId: z.string().min(1),
  vendorId: optId,
  projectId: optId,
  departmentId: optId,
  userId: optId,
  date: z.coerce.date(),
  amount: decStr,
  taxAmount: decStr,
  currency: z.string().trim().length(3).toUpperCase().default("SAR"),
  paymentMethod: z.enum(["BANK_TRANSFER", "CASH", "CARD", "PAYMENT_GATEWAY", "OTHER"]).nullable().optional(),
  description: reqText(3, 1000),
  reference: optText(120)
});

async function validateRefs(tx: Tx, ctx: Ctx, input: z.output<typeof expenseSchema>, current?: { vendorId: string | null; categoryId: string }) {
  const org = await orgFinance(tx, ctx.organizationId);
  if (input.date > todayIn(org.timezone)) throw invalid("EXPENSE_DATE_IN_FUTURE");
  const amount = new Decimal(input.amount);
  if (amount.lte(0)) throw invalid("AMOUNT_INVALID");
  const cat = await tx.expenseCategory.findFirst({ where: { id: input.categoryId, organizationId: ctx.organizationId } });
  if (!cat) throw invalid("UNKNOWN_CATEGORY");
  if (!cat.active && current?.categoryId !== cat.id) throw invalid("CATEGORY_INACTIVE");
  if (input.vendorId) {
    const v = await tx.vendor.findFirst({ where: { id: input.vendorId, organizationId: ctx.organizationId } });
    if (!v) throw invalid("UNKNOWN_VENDOR");
    if (v.status === "ARCHIVED" && current?.vendorId !== v.id) throw invalid("VENDOR_ARCHIVED");
  }
  if (input.projectId) {
    // own projects only, unless finance sees everything
    const p = await tx.project.findFirst({ where: { id: input.projectId, organizationId: ctx.organizationId, ...(financeAll(ctx) ? {} : await projectWhere(ctx)) } });
    if (!p) throw invalid("UNKNOWN_PROJECT");
  }
  if (input.userId && input.userId !== ctx.userId && !financeAll(ctx)) throw forbidden("finance.records.all (expense for another person)");
  const tax = new Decimal(input.taxAmount);
  return { amount: amount.toFixed(2), taxAmount: tax.toFixed(2), total: amount.plus(tax).toFixed(2) };
}

export async function createExpense(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "finance.expenses.create");
  const input = expenseSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const money = await validateRefs(tx, ctx, input);
    const me = await tx.user.findUnique({ where: { id: ctx.userId }, select: { departmentId: true } });
    const number = await nextYearlyNumber(tx, ctx.organizationId, "EXP", input.date.getUTCFullYear());
    const e = await tx.expense.create({
      data: {
        organizationId: ctx.organizationId, number, categoryId: input.categoryId, vendorId: input.vendorId ?? null, projectId: input.projectId ?? null,
        departmentId: input.departmentId ?? me?.departmentId ?? null, userId: input.userId ?? ctx.userId, date: input.date, ...money, currency: input.currency,
        paymentMethod: input.paymentMethod ?? null, description: input.description, reference: input.reference ?? null, submittedById: ctx.userId
      }
    });
    await uow.audit({ action: "expense.created", entityType: "Expense", entityId: e.id, after: { number, ...money, currency: input.currency, categoryId: input.categoryId, projectId: e.projectId, vendorId: e.vendorId } });
    return { id: e.id, number };
  });
}

async function loadOwn(tx: Tx, ctx: Ctx, id: string, lock = true) {
  if (lock) await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const e = await tx.expense.findFirst({ where: and<Prisma.ExpenseWhereInput>({ id, organizationId: ctx.organizationId }, expenseWhere(ctx)) });
  if (!e) throw notFound("Expense");
  return e;
}

export async function updateExpense(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "finance.expenses.create");
  const input = expenseSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const e = await loadOwn(tx, ctx, id);
    if (e.submittedById !== ctx.userId && !financeAll(ctx)) throw forbidden("finance.expenses.create (own)");
    if (e.status !== "DRAFT" && e.status !== "REJECTED") throw conflict(`EXPENSE_LOCKED:${e.status}`);
    const money = await validateRefs(tx, ctx, input, e);
    await tx.expense.update({
      where: { id },
      data: { categoryId: input.categoryId, vendorId: input.vendorId ?? null, projectId: input.projectId ?? null, departmentId: input.departmentId ?? e.departmentId, date: input.date, ...money, currency: input.currency, paymentMethod: input.paymentMethod ?? null, description: input.description, reference: input.reference ?? null, ...(e.status === "REJECTED" ? { status: "DRAFT" } : {}) }
    });
    await uow.audit({ action: "expense.updated", entityType: "Expense", entityId: id, before: { amount: e.amount.toFixed(2), taxAmount: e.taxAmount.toFixed(2), status: e.status }, after: { ...money } });
    return { id };
  });
}

export async function submitExpense(ctx: Ctx, id: string) {
  requirePermission(ctx, "finance.expenses.submit");
  return unitOfWork(ctx, async (tx, uow) => {
    const e = await loadOwn(tx, ctx, id);
    if (e.submittedById !== ctx.userId && !financeAll(ctx)) throw forbidden("finance.expenses.submit (own)");
    if (e.status !== "DRAFT" && e.status !== "REJECTED") throw conflict(`EXPENSE_INVALID_TRANSITION:${e.status}`);
    const org = await orgFinance(tx, ctx.organizationId);
    const executive = e.total.gte(org.expenseApprovalThreshold);
    const cat = await tx.expenseCategory.findUniqueOrThrow({ where: { id: e.categoryId } });
    const a = await requestApprovalTx(tx, uow, ctx, {
      type: "EXPENSE",
      entityType: "Expense",
      entityId: e.id,
      title: `${e.number} · ${cat.nameEn} · ${e.total.toFixed(2)} ${e.currency}`,
      summary: e.description,
      payload: { expenseId: e.id, number: e.number, total: e.total.toFixed(2), currency: e.currency, executive, threshold: org.expenseApprovalThreshold.toFixed(2), projectId: e.projectId, claimantId: e.userId },
      requiredPermission: executive ? "finance.expenses.approve_executive" : "finance.expenses.approve",
      priority: executive ? "HIGH" : "MEDIUM",
      amount: Number(e.total),
      currency: e.currency
    });
    await tx.expense.update({ where: { id }, data: { status: "PENDING_APPROVAL", submittedAt: new Date(), approvalId: a.id, rejectedAt: null, rejectionReason: null } });
    await uow.audit({ action: "expense.submitted", entityType: "Expense", entityId: id, before: { status: e.status }, after: { status: "PENDING_APPROVAL", approvalId: a.id, executive, total: e.total.toFixed(2) } });
    uow.emit({ type: "expense.submitted", entityType: "Expense", entityId: id, payload: { expenseId: id, number: e.number, total: e.total.toFixed(2), currency: e.currency, submittedById: e.submittedById } });
    return { id, approvalId: a.id, executive };
  });
}

export async function withdrawExpense(ctx: Ctx, id: string) {
  requirePermission(ctx, "finance.expenses.submit");
  return unitOfWork(ctx, async (tx, uow) => {
    const e = await loadOwn(tx, ctx, id);
    if (e.status !== "PENDING_APPROVAL" || !e.approvalId) throw conflict(`EXPENSE_INVALID_TRANSITION:${e.status}`);
    if (e.submittedById !== ctx.userId) throw forbidden("only the submitter can withdraw");
    await cancelApprovalTx(tx, uow, ctx, e.approvalId, { runHook: false });
    await tx.expense.update({ where: { id }, data: { status: "DRAFT", approvalId: null, submittedAt: null } });
    await uow.audit({ action: "expense.withdrawn", entityType: "Expense", entityId: id, before: { status: e.status }, after: { status: "DRAFT" } });
    return { id };
  });
}

registerApprovalHandler("EXPENSE", {
  async onApproved(tx, uow, approval, ctx) {
    const p = approval.payload as { expenseId: string };
    const e = await tx.expense.findUnique({ where: { id: p.expenseId } });
    if (!e || e.status !== "PENDING_APPROVAL" || e.approvalId !== approval.id) throw conflict("EXPENSE_STALE_APPROVAL");
    if (e.userId === ctx.userId || e.submittedById === ctx.userId) throw forbidden("self-approval");
    const res = await tx.expense.updateMany({ where: { id: e.id, status: "PENDING_APPROVAL" }, data: { status: "APPROVED", approvedById: ctx.userId, approvedAt: new Date() } });
    if (res.count !== 1) throw conflict("EXPENSE_ALREADY_DECIDED");
    await uow.audit({ action: "expense.approved", entityType: "Expense", entityId: e.id, before: { status: "PENDING_APPROVAL" }, after: { status: "APPROVED", approvalId: approval.id, total: e.total.toFixed(2) } });
    uow.emit({ type: "expense.approved", entityType: "Expense", entityId: e.id, payload: { expenseId: e.id, number: e.number, total: e.total.toFixed(2), currency: e.currency, submittedById: e.submittedById, projectId: e.projectId }, activity: { entityLabel: e.number, href: `/app/finance/expenses/${e.id}`, visibility: "finance.expenses.view" } });
  },
  async onRejected(tx, uow, approval) {
    const p = approval.payload as { expenseId: string };
    const e = await tx.expense.findUnique({ where: { id: p.expenseId } });
    if (!e || e.status !== "PENDING_APPROVAL") throw conflict("EXPENSE_STALE_APPROVAL");
    const reason = (approval.decisionComment ?? "").trim();
    if (!reason) throw invalid("REJECTION_REASON_REQUIRED");
    await tx.expense.update({ where: { id: e.id }, data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: reason, approvalId: null } });
    await uow.audit({ action: "expense.rejected", entityType: "Expense", entityId: e.id, before: { status: "PENDING_APPROVAL" }, after: { status: "REJECTED", reason } });
    uow.emit({ type: "expense.rejected", entityType: "Expense", entityId: e.id, payload: { expenseId: e.id, number: e.number, reason, submittedById: e.submittedById } });
  },
  async onCancelled(tx, _uow, approval) {
    const p = approval.payload as { expenseId: string };
    await tx.expense.updateMany({ where: { id: p.expenseId, status: "PENDING_APPROVAL" }, data: { status: "DRAFT", approvalId: null, submittedAt: null } });
  }
});

const paySchema = z.object({ paidDate: optDate, paymentMethod: z.enum(["BANK_TRANSFER", "CASH", "CARD", "PAYMENT_GATEWAY", "OTHER"]), paymentReference: optText(120) });

export async function payExpense(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "finance.expenses.pay");
  const input = paySchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    const e = await tx.expense.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!e) throw notFound("Expense");
    if (!financeAll(ctx)) throw forbidden("finance.records.all");
    if (e.status === "PAID") throw conflict("EXPENSE_ALREADY_PAID");
    if (e.status !== "APPROVED") throw conflict(`EXPENSE_NOT_APPROVED:${e.status}`);
    const org = await orgFinance(tx, ctx.organizationId);
    if (input.paidDate && input.paidDate > todayIn(org.timezone)) throw invalid("PAYMENT_DATE_IN_FUTURE");
    const paidAt = input.paidDate ?? new Date();
    const res = await tx.expense.updateMany({ where: { id, status: "APPROVED" }, data: { status: "PAID", paidAt, paidById: ctx.userId, paymentMethod: input.paymentMethod, paymentReference: input.paymentReference ?? null } });
    if (res.count !== 1) throw conflict("EXPENSE_ALREADY_PAID");
    await uow.audit({ action: "expense.paid", entityType: "Expense", entityId: id, before: { status: "APPROVED" }, after: { status: "PAID", paidAt: ymd(paidAt), method: input.paymentMethod, reference: input.paymentReference, total: e.total.toFixed(2) } });
    uow.emit({ type: "expense.paid", entityType: "Expense", entityId: id, payload: { expenseId: id, number: e.number, total: e.total.toFixed(2), currency: e.currency, submittedById: e.submittedById }, activity: { entityLabel: e.number, href: `/app/finance/expenses/${id}`, visibility: "finance.expenses.view" } });
    return { id };
  });
}

export async function cancelExpense(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "finance.expenses.create");
  const { reason } = z.object({ reason: optText(500) }).parse(raw ?? {});
  return unitOfWork(ctx, async (tx, uow) => {
    const e = await loadOwn(tx, ctx, id);
    const mine = e.submittedById === ctx.userId;
    if (!mine && !(financeAll(ctx) && can(ctx, "finance.expenses.approve"))) throw forbidden("finance.expenses.create (own)");
    if (!["DRAFT", "REJECTED", "APPROVED"].includes(e.status)) throw conflict(`EXPENSE_INVALID_TRANSITION:${e.status}`);
    if (e.status === "APPROVED" && !financeAll(ctx)) throw forbidden("finance.records.all");
    await tx.expense.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason ?? null } });
    await uow.audit({ action: "expense.cancelled", entityType: "Expense", entityId: id, before: { status: e.status }, after: { status: "CANCELLED", reason } });
    return { id };
  });
}

export const EXPENSES_PAGE_SIZE = 25;
const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "PAID", "CANCELLED", "to_pay"]).optional(),
  category: z.string().max(40).optional(),
  project: z.string().max(40).optional(),
  department: z.string().max(40).optional(),
  vendor: z.string().max(40).optional(),
  submitter: z.string().max(40).optional(),
  from: optDate,
  to: optDate,
  page: z.coerce.number().int().min(1).default(1)
});

export async function expenseListWhere(ctx: Ctx, raw: unknown) {
  const f = parseListParams(listSchema, raw ?? {});
  const filters: Prisma.ExpenseWhereInput[] = [];
  if (f.q) filters.push({ OR: [{ number: { contains: f.q, mode: "insensitive" } }, { description: { contains: f.q, mode: "insensitive" } }, { vendor: { name: { contains: f.q, mode: "insensitive" } } }] });
  if (f.status === "to_pay") filters.push({ status: "APPROVED" });
  else if (f.status) filters.push({ status: f.status });
  if (f.category) filters.push({ categoryId: f.category });
  if (f.project) filters.push({ projectId: f.project });
  if (f.department) filters.push({ departmentId: f.department });
  if (f.vendor) filters.push({ vendorId: f.vendor });
  if (f.submitter) filters.push({ submittedById: f.submitter === "me" ? ctx.userId : f.submitter });
  if (f.from || f.to) filters.push({ date: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } });
  return { f, where: and<Prisma.ExpenseWhereInput>({ organizationId: ctx.organizationId }, expenseWhere(ctx), { AND: filters }) };
}

export async function listExpenses(ctx: Ctx, raw: unknown) {
  if (!canAny(ctx, "finance.expenses.view", "finance.expenses.create")) throw forbidden("finance.expenses.view");
  const { f, where } = await expenseListWhere(ctx, raw);
  const [items, total, sum] = await Promise.all([
    prisma.expense.findMany({
      where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (f.page - 1) * EXPENSES_PAGE_SIZE, take: EXPENSES_PAGE_SIZE,
      include: { category: { select: { nameAr: true, nameEn: true } }, vendor: { select: { id: true, name: true } }, project: { select: { id: true, number: true, name: true } }, submittedBy: { select: { id: true, name: true, nameAr: true } } }
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where, _sum: { total: true } })
  ]);
  return { items, total, page: f.page, pageSize: EXPENSES_PAGE_SIZE, filters: f, sum: sum._sum.total?.toFixed(2) ?? "0.00" };
}

export async function getExpense(ctx: Ctx, id: string) {
  if (!canAny(ctx, "finance.expenses.view", "finance.expenses.create")) throw forbidden("finance.expenses.view");
  const e = await prisma.expense.findFirst({
    where: and<Prisma.ExpenseWhereInput>({ id, organizationId: ctx.organizationId }, expenseWhere(ctx)),
    include: { category: true, vendor: true, project: { select: { id: true, number: true, name: true } }, department: { select: { name: true, nameAr: true } }, user: { select: { id: true, name: true, nameAr: true } }, submittedBy: { select: { id: true, name: true, nameAr: true } } }
  });
  if (!e) throw notFound("Expense");
  const ids = [e.approvedById, e.paidById].filter(Boolean) as string[];
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, nameAr: true } }) : [];
  const history = await prisma.auditLog.findMany({ where: { organizationId: ctx.organizationId, entityType: "Expense", entityId: id }, orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true, nameAr: true } } } });
  return { expense: e, people, history };
}
