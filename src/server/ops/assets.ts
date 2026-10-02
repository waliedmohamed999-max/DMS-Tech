import { z } from "zod";
import type { AssetStatus, Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { optDate, optId, optText, parseListParams, reqText } from "../crm/normalize";
import { nextNumber } from "../crm/sequence";
import { todayIn, ymd } from "../commercial/dates";
import { myEmployee } from "../hr/access";
import { D, orgOf } from "./shared";

/**
 * Assets (docs/OPERATIONS.md): register (AST-000001), optional creation from a received PO line,
 * append-only assignment history (one active assignment per asset — partial unique index),
 * status lifecycle and maintenance. Maintenance cost never creates an expense automatically.
 */

export const DEFAULT_ASSET_CATEGORIES: [string, string, string][] = [
  ["laptop", "حاسب محمول", "Laptop"],
  ["desktop", "حاسب مكتبي", "Desktop"],
  ["monitor", "شاشة", "Monitor"],
  ["phone", "هاتف / جهاز لوحي", "Phone / tablet"],
  ["network", "معدات شبكات", "Network equipment"],
  ["furniture", "أثاث", "Furniture"],
  ["software", "ترخيص برمجي", "Software license"],
  ["other", "أخرى", "Other"]
];

export async function ensureAssetCategories(organizationId: string) {
  await prisma.assetCategory.createMany({ data: DEFAULT_ASSET_CATEGORIES.map(([key, nameAr, nameEn]) => ({ organizationId, key, nameAr, nameEn })), skipDuplicates: true });
}
export const listAssetCategories = (organizationId: string, all = false) => prisma.assetCategory.findMany({ where: { organizationId, ...(all ? {} : { active: true }) }, orderBy: { nameEn: "asc" } });

const categorySchema = z.object({ id: optId, nameAr: reqText(2, 80), nameEn: reqText(2, 80), warrantyAlertDays: z.coerce.number().int().min(0).max(365).default(30), active: z.boolean().default(true) });
export async function saveAssetCategory(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "operations.settings.manage");
  const input = categorySchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const data = { nameAr: input.nameAr, nameEn: input.nameEn, warrantyAlertDays: input.warrantyAlertDays, active: input.active };
    if (input.id) {
      const c = await tx.assetCategory.findFirst({ where: { id: input.id, organizationId: ctx.organizationId } });
      if (!c) throw notFound("AssetCategory");
      await tx.assetCategory.update({ where: { id: input.id }, data });
      await uow.audit({ action: "asset.category_changed", entityType: "AssetCategory", entityId: input.id, before: c, after: data });
      return { id: input.id };
    }
    const key = input.nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "category";
    if (await tx.assetCategory.findFirst({ where: { organizationId: ctx.organizationId, key } })) throw invalid("CATEGORY_KEY_TAKEN");
    const c = await tx.assetCategory.create({ data: { ...data, organizationId: ctx.organizationId, key } });
    await uow.audit({ action: "asset.category_changed", entityType: "AssetCategory", entityId: c.id, after: data });
    return { id: c.id };
  });
}

const assetSchema = z.object({
  name: reqText(2, 160),
  categoryId: z.string().min(1),
  serialNumber: optText(120),
  manufacturer: optText(120),
  model: optText(120),
  vendorId: optId,
  purchaseDate: optDate,
  purchaseCost: z.preprocess((v) => (v === "" || v == null ? null : String(v).replace(/[,\s]/g, "")), z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "AMOUNT_INVALID").nullable()),
  currency: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().trim().length(3).toUpperCase().nullable()),
  warrantyEndDate: optDate,
  location: optText(160),
  notes: optText(2000)
});

async function checkRefs(tx: Tx, ctx: Ctx, input: z.output<typeof assetSchema>) {
  if (!(await tx.assetCategory.findFirst({ where: { id: input.categoryId, organizationId: ctx.organizationId } }))) throw invalid("UNKNOWN_CATEGORY");
  if (input.vendorId && !(await tx.vendor.findFirst({ where: { id: input.vendorId, organizationId: ctx.organizationId } }))) throw invalid("UNKNOWN_VENDOR");
  if (input.serialNumber) {
    const dup = await tx.asset.findFirst({ where: { organizationId: ctx.organizationId, serialNumber: { equals: input.serialNumber, mode: "insensitive" } }, select: { number: true } });
    if (dup) throw conflict(`SERIAL_EXISTS:${dup.number}`);
  }
}

const dataOf = (input: z.output<typeof assetSchema>) => ({
  name: input.name, categoryId: input.categoryId, serialNumber: input.serialNumber ?? null, manufacturer: input.manufacturer ?? null, model: input.model ?? null, vendorId: input.vendorId ?? null,
  purchaseDate: input.purchaseDate ?? null, purchaseCost: input.purchaseCost, currency: input.purchaseCost ? (input.currency ?? "SAR") : input.currency, warrantyEndDate: input.warrantyEndDate ?? null, location: input.location ?? null, notes: input.notes ?? null
});

export async function createAsset(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "assets.manage");
  const input = assetSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    await checkRefs(tx, ctx, input);
    const number = await nextNumber(tx, ctx.organizationId, "AST");
    const a = await tx.asset.create({ data: { ...dataOf(input), organizationId: ctx.organizationId, number, createdById: ctx.userId || null } });
    await uow.audit({ action: "asset.created", entityType: "Asset", entityId: a.id, after: { number, name: a.name, serialNumber: a.serialNumber, categoryId: a.categoryId } });
    return { id: a.id, number };
  });
}

/** Register an asset from a received PO line — never more assets than received units. */
export async function createAssetFromPoItem(ctx: Ctx, poItemId: string, raw: unknown) {
  requirePermission(ctx, "assets.manage");
  const input = assetSchema.partial({ name: true }).parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    await tx.$queryRaw`SELECT id FROM "PurchaseOrderItem" WHERE id = ${poItemId} FOR UPDATE`;
    const item = await tx.purchaseOrderItem.findUnique({ where: { id: poItemId }, include: { purchaseOrder: { include: { receipts: { select: { receivedAt: true } } } } } });
    if (!item || item.purchaseOrder.organizationId !== ctx.organizationId) throw notFound("PurchaseOrderItem");
    const po = item.purchaseOrder;
    if (!["PARTIALLY_RECEIVED", "RECEIVED", "CLOSED"].includes(po.status)) throw conflict(`PO_NOT_RECEIVED:${po.status}`);
    const existing = await tx.asset.count({ where: { purchaseOrderItemId: poItemId } });
    if (existing + 1 > Math.floor(Number(item.receivedQuantity))) throw conflict("ASSETS_EXCEED_RECEIVED");
    const full = { ...input, name: input.name ?? item.description, vendorId: po.vendorId, purchaseCost: input.purchaseCost ?? D(item.unitPrice).toFixed(2), currency: po.currency, purchaseDate: input.purchaseDate ?? po.receipts.map((r) => r.receivedAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null } as z.output<typeof assetSchema>;
    await checkRefs(tx, ctx, full);
    const number = await nextNumber(tx, ctx.organizationId, "AST");
    const a = await tx.asset.create({ data: { ...dataOf(full), organizationId: ctx.organizationId, number, purchaseOrderId: po.id, purchaseOrderItemId: poItemId, createdById: ctx.userId || null } });
    await uow.audit({ action: "asset.created", entityType: "Asset", entityId: a.id, after: { number, name: a.name, source: { purchaseOrder: po.number, item: poItemId }, cost: a.purchaseCost?.toFixed(2) } });
    return { id: a.id, number };
  });
}

export async function updateAsset(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "assets.manage");
  const input = assetSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const a = await lockAsset(tx, ctx, id);
    if (input.serialNumber && input.serialNumber.toLowerCase() !== (a.serialNumber ?? "").toLowerCase()) await checkRefs(tx, ctx, input);
    else await checkRefs(tx, ctx, { ...input, serialNumber: null });
    // purchase linkage stays as recorded (from the PO); cost / dates are editable for manual assets only
    const data = dataOf(input);
    if (a.purchaseOrderId) Object.assign(data, { vendorId: a.vendorId, purchaseCost: a.purchaseCost?.toFixed(2) ?? null, currency: a.currency, purchaseDate: a.purchaseDate });
    await tx.asset.update({ where: { id }, data });
    await uow.audit({ action: "asset.updated", entityType: "Asset", entityId: id, before: { name: a.name, serialNumber: a.serialNumber, location: a.location, warrantyEndDate: ymd(a.warrantyEndDate) }, after: { name: data.name, serialNumber: data.serialNumber, location: data.location, warrantyEndDate: ymd(data.warrantyEndDate) } });
  });
}

async function lockAsset(tx: Tx, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const a = await tx.asset.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!a) throw notFound("Asset");
  return a;
}

const ASSIGNABLE: AssetStatus[] = ["IN_STOCK", "IN_USE"];

export async function assignAsset(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "assets.assign");
  const input = z.object({ employeeId: z.string().min(1), condition: reqText(2, 200), notes: optText(1000) }).parse(raw);
  try {
    return await unitOfWork(ctx, async (tx, uow) => {
      const a = await lockAsset(tx, ctx, id);
      if (!ASSIGNABLE.includes(a.status)) throw conflict(`ASSET_NOT_ASSIGNABLE:${a.status}`);
      const emp = await tx.employee.findFirst({ where: { id: input.employeeId, organizationId: ctx.organizationId }, select: { id: true, status: true, userId: true, displayName: true } });
      if (!emp) throw invalid("UNKNOWN_EMPLOYEE");
      if (["TERMINATED", "ARCHIVED"].includes(emp.status)) throw conflict("EMPLOYEE_INACTIVE");
      const asg = await tx.assetAssignment.create({ data: { organizationId: ctx.organizationId, assetId: id, employeeId: emp.id, assignedById: ctx.userId, conditionAtAssignment: input.condition, notes: input.notes ?? null } });
      await tx.asset.update({ where: { id }, data: { status: "ASSIGNED", assignedEmployeeId: emp.id } });
      await uow.audit({ action: "asset.assigned", entityType: "Asset", entityId: id, before: { status: a.status }, after: { status: "ASSIGNED", employeeId: emp.id, assignmentId: asg.id, condition: input.condition } });
      uow.emit({ type: "asset.assigned", entityType: "Asset", entityId: id, payload: { assetId: id, number: a.number, name: a.name, employeeId: emp.id, userId: emp.userId } });
      return { assignmentId: asg.id };
    });
  } catch (e) {
    // the partial unique index is the last line of defence against a concurrent second assignment
    if ((e as { code?: string }).code === "P2002") throw conflict("ASSET_ALREADY_ASSIGNED");
    throw e;
  }
}

export async function returnAsset(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "assets.assign");
  const input = z.object({ condition: z.enum(["GOOD", "WORN", "DAMAGED"]), notes: optText(1000), assignmentId: optId }).parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const a = await lockAsset(tx, ctx, id);
    const asg = await tx.assetAssignment.findFirst({ where: { assetId: id, returnedAt: null } });
    if (!asg) throw conflict("ASSET_NOT_ASSIGNED");
    // previous-state check: the caller returns the assignment it saw
    if (input.assignmentId && input.assignmentId !== asg.id) throw conflict("ASSIGNMENT_STALE");
    const res = await tx.assetAssignment.updateMany({ where: { id: asg.id, returnedAt: null }, data: { returnedAt: new Date(), returnedById: ctx.userId, conditionAtReturn: input.condition, returnNotes: input.notes ?? null } });
    if (res.count !== 1) throw conflict("ASSET_NOT_ASSIGNED");
    const next: AssetStatus = input.condition === "DAMAGED" ? "DAMAGED" : "IN_STOCK";
    await tx.asset.update({ where: { id }, data: { status: next, assignedEmployeeId: null } });
    const emp = await tx.employee.findUnique({ where: { id: asg.employeeId }, select: { userId: true } });
    await uow.audit({ action: "asset.returned", entityType: "Asset", entityId: id, before: { status: a.status, employeeId: asg.employeeId }, after: { status: next, condition: input.condition, assignmentId: asg.id } });
    uow.emit({ type: "asset.returned", entityType: "Asset", entityId: id, payload: { assetId: id, number: a.number, name: a.name, employeeId: asg.employeeId, userId: emp?.userId ?? null } });
  });
}

export const ASSET_TRANSITIONS: Record<AssetStatus, readonly AssetStatus[]> = {
  IN_STOCK: ["IN_USE", "LOST", "DAMAGED", "RETIRED"],
  IN_USE: ["IN_STOCK", "LOST", "DAMAGED", "RETIRED"],
  ASSIGNED: [],
  MAINTENANCE: [],
  LOST: ["IN_STOCK", "RETIRED"],
  DAMAGED: ["IN_STOCK", "RETIRED", "DISPOSED"],
  RETIRED: ["DISPOSED"],
  DISPOSED: []
};

/** Manual status change (not for assignment / maintenance, which have their own flows). */
export async function changeAssetStatus(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "assets.manage");
  const input = z.object({ to: z.enum(["IN_STOCK", "IN_USE", "LOST", "DAMAGED", "RETIRED", "DISPOSED"]), reason: reqText(3, 500) }).parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const a = await lockAsset(tx, ctx, id);
    if (a.status === "ASSIGNED") throw conflict("ASSET_ASSIGNED_RETURN_FIRST");
    if (a.status === "MAINTENANCE") throw conflict("ASSET_IN_MAINTENANCE");
    if (!ASSET_TRANSITIONS[a.status].includes(input.to)) throw conflict(`ASSET_INVALID_TRANSITION:${a.status}`);
    await tx.asset.update({ where: { id }, data: { status: input.to, ...(input.to === "DISPOSED" ? { archivedAt: new Date() } : {}) } });
    await uow.audit({ action: input.to === "RETIRED" || input.to === "DISPOSED" ? "asset.retired" : "asset.status_changed", entityType: "Asset", entityId: id, before: { status: a.status }, after: { status: input.to, reason: input.reason } });
  });
}

// --- maintenance -------------------------------------------------------------------------------

const maintSchema = z.object({
  type: z.enum(["PREVENTIVE", "REPAIR", "INSPECTION", "UPGRADE", "OTHER"]).default("REPAIR"),
  description: reqText(3, 2000),
  vendorId: optId,
  scheduledDate: optDate,
  cost: z.preprocess((v) => (v === "" || v == null ? null : String(v).replace(/[,\s]/g, "")), z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "AMOUNT_INVALID").nullable()),
  currency: z.string().trim().length(3).toUpperCase().default("SAR")
});

export async function createMaintenance(ctx: Ctx, assetId: string, raw: unknown) {
  requirePermission(ctx, "assets.maintenance");
  const input = maintSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const a = await lockAsset(tx, ctx, assetId);
    if (["LOST", "RETIRED", "DISPOSED"].includes(a.status)) throw conflict(`ASSET_NOT_MAINTAINABLE:${a.status}`);
    if (input.vendorId && !(await tx.vendor.findFirst({ where: { id: input.vendorId, organizationId: ctx.organizationId } }))) throw invalid("UNKNOWN_VENDOR");
    const m = await tx.assetMaintenance.create({ data: { organizationId: ctx.organizationId, assetId, type: input.type, description: input.description, vendorId: input.vendorId ?? null, scheduledDate: input.scheduledDate ?? null, cost: input.cost, currency: input.currency, createdById: ctx.userId || null } });
    await uow.audit({ action: "asset.maintenance_created", entityType: "Asset", entityId: assetId, after: { maintenanceId: m.id, type: m.type, scheduled: ymd(m.scheduledDate), cost: input.cost } });
    return { id: m.id };
  });
}

async function lockMaint(tx: Tx, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM "AssetMaintenance" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const m = await tx.assetMaintenance.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!m) throw notFound("AssetMaintenance");
  return m;
}

export async function startMaintenance(ctx: Ctx, id: string) {
  requirePermission(ctx, "assets.maintenance");
  return unitOfWork(ctx, async (tx, uow) => {
    const m = await lockMaint(tx, ctx, id);
    if (m.status !== "SCHEDULED") throw conflict(`MAINTENANCE_INVALID_TRANSITION:${m.status}`);
    const a = await lockAsset(tx, ctx, m.assetId);
    if (a.status === "ASSIGNED") throw conflict("ASSET_ASSIGNED_RETURN_FIRST");
    if (a.status === "MAINTENANCE") throw conflict("ASSET_IN_MAINTENANCE");
    await tx.assetMaintenance.update({ where: { id }, data: { status: "IN_PROGRESS", startedAt: new Date(), assetStatusBefore: a.status } });
    await tx.asset.update({ where: { id: a.id }, data: { status: "MAINTENANCE" } });
    await uow.audit({ action: "asset.maintenance_started", entityType: "Asset", entityId: a.id, before: { status: a.status }, after: { status: "MAINTENANCE", maintenanceId: id } });
  });
}

export async function completeMaintenance(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "assets.maintenance");
  const input = z.object({ completedDate: optDate, cost: maintSchema.shape.cost.optional(), result: z.enum(["IN_STOCK", "DAMAGED"]).default("IN_STOCK") }).parse(raw ?? {});
  return unitOfWork(ctx, async (tx, uow) => {
    const m = await lockMaint(tx, ctx, id);
    if (m.status !== "IN_PROGRESS" && m.status !== "SCHEDULED") throw conflict(`MAINTENANCE_INVALID_TRANSITION:${m.status}`);
    const org = await orgOf(tx, ctx.organizationId);
    const today = todayIn(org.timezone);
    const done = input.completedDate ?? today;
    if (done > today) throw invalid("DATE_IN_FUTURE");
    await tx.assetMaintenance.update({ where: { id }, data: { status: "COMPLETED", completedDate: done, ...(input.cost !== undefined && input.cost !== null ? { cost: input.cost } : {}) } });
    const a = await lockAsset(tx, ctx, m.assetId);
    if (m.status === "IN_PROGRESS" && a.status === "MAINTENANCE") {
      const back: AssetStatus = input.result === "DAMAGED" ? "DAMAGED" : m.assetStatusBefore === "IN_USE" ? "IN_USE" : "IN_STOCK";
      await tx.asset.update({ where: { id: a.id }, data: { status: back } });
    }
    await uow.audit({ action: "asset.maintenance_completed", entityType: "Asset", entityId: a.id, after: { maintenanceId: id, completedDate: ymd(done), cost: input.cost ?? m.cost?.toFixed(2) ?? null, result: input.result } });
  });
}

export async function cancelMaintenance(ctx: Ctx, id: string) {
  requirePermission(ctx, "assets.maintenance");
  return unitOfWork(ctx, async (tx, uow) => {
    const m = await lockMaint(tx, ctx, id);
    if (m.status !== "SCHEDULED" && m.status !== "IN_PROGRESS") throw conflict(`MAINTENANCE_INVALID_TRANSITION:${m.status}`);
    await tx.assetMaintenance.update({ where: { id }, data: { status: "CANCELLED" } });
    if (m.status === "IN_PROGRESS") {
      const a = await lockAsset(tx, ctx, m.assetId);
      if (a.status === "MAINTENANCE") await tx.asset.update({ where: { id: a.id }, data: { status: m.assetStatusBefore === "IN_USE" ? "IN_USE" : "IN_STOCK" } });
    }
    await uow.audit({ action: "asset.maintenance_cancelled", entityType: "Asset", entityId: m.assetId, after: { maintenanceId: id } });
  });
}

/** Explicit, optional link of a completed maintenance to the expense that paid it (no expense is ever auto-created). */
export async function linkMaintenanceExpense(ctx: Ctx, id: string, expenseId: string) {
  requirePermission(ctx, "assets.maintenance");
  return unitOfWork(ctx, async (tx, uow) => {
    const m = await lockMaint(tx, ctx, id);
    const e = await tx.expense.findFirst({ where: { id: expenseId, organizationId: ctx.organizationId, ...(can(ctx, "finance.expenses.view") ? {} : { submittedById: ctx.userId }) }, select: { id: true, number: true } });
    if (!e) throw invalid("UNKNOWN_EXPENSE");
    await tx.assetMaintenance.update({ where: { id }, data: { expenseId: e.id } });
    await uow.audit({ action: "asset.maintenance_expense_linked", entityType: "Asset", entityId: m.assetId, after: { maintenanceId: id, expense: e.number } });
  });
}

// --- read ------------------------------------------------------------------------------------

const listSchema = z.object({ status: z.string().max(30).optional(), category: z.string().max(40).optional(), q: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1) });

export async function listAssets(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "assets.view");
  const f = parseListParams(listSchema, raw ?? {});
  const where: Prisma.AssetWhereInput = {
    organizationId: ctx.organizationId,
    ...(f.status === "active" || !f.status ? { status: { notIn: ["DISPOSED"] } } : f.status in ASSET_TRANSITIONS ? { status: f.status as AssetStatus } : {}),
    ...(f.category ? { categoryId: f.category } : {}),
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { number: { contains: f.q.toUpperCase() } }, { serialNumber: { contains: f.q, mode: "insensitive" } }] } : {})
  };
  const [items, total] = await Promise.all([
    prisma.asset.findMany({ where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * 30, take: 30, include: { category: { select: { nameAr: true, nameEn: true } }, assignedEmployee: { select: { id: true, displayName: true, nameAr: true, number: true } } } }),
    prisma.asset.count({ where })
  ]);
  return { items, total, page: f.page, pageSize: 30, filters: f };
}

export async function getAsset(ctx: Ctx, id: string) {
  const a = await prisma.asset.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      category: true,
      vendor: { select: { id: true, name: true } },
      purchaseOrder: { select: { id: true, number: true } },
      assignedEmployee: { select: { id: true, displayName: true, nameAr: true, number: true, userId: true } },
      assignments: { orderBy: { assignedAt: "desc" }, include: { employee: { select: { id: true, displayName: true, nameAr: true, number: true } } } },
      maintenance: { orderBy: { createdAt: "desc" }, include: { vendor: { select: { name: true } } } }
    }
  });
  if (!a) throw notFound("Asset");
  // the employee holding it may see their own asset; everyone else needs assets.view
  if (!can(ctx, "assets.view") && a.assignedEmployee?.userId !== ctx.userId) throw forbidden("assets.view");
  const ids = [...new Set(a.assignments.flatMap((x) => [x.assignedById, x.returnedById]).filter(Boolean) as string[])];
  const people = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, nameAr: true } });
  return { asset: a, people, full: can(ctx, "assets.view") };
}

/** My assigned assets (self-service). */
export async function myAssets(ctx: Ctx) {
  const me = await myEmployee(ctx);
  if (!me) return [];
  return prisma.assetAssignment.findMany({ where: { employeeId: me.id }, orderBy: { assignedAt: "desc" }, include: { asset: { select: { id: true, number: true, name: true, serialNumber: true, category: { select: { nameAr: true, nameEn: true } } } } } });
}

/** Assets history of one employee (HR profile tab): assets.view, or the employee themself. */
export async function employeeAssets(ctx: Ctx, employeeId: string) {
  const me = await myEmployee(ctx);
  if (!can(ctx, "assets.view") && me?.id !== employeeId) throw forbidden("assets.view");
  return prisma.assetAssignment.findMany({ where: { employeeId, organizationId: ctx.organizationId }, orderBy: { assignedAt: "desc" }, include: { asset: { select: { id: true, number: true, name: true, serialNumber: true } } } });
}

/** Offboarding signal: terminated / archived employees who still hold assets (never auto-returned). */
export async function terminatedWithAssets(organizationId: string) {
  return prisma.assetAssignment.findMany({
    where: { organizationId, returnedAt: null, employee: { status: { in: ["TERMINATED", "ARCHIVED"] } } },
    include: { asset: { select: { id: true, number: true, name: true } }, employee: { select: { id: true, displayName: true, nameAr: true, number: true, terminationDate: true } } }
  });
}

export async function assetOptions(ctx: Ctx) {
  if (!can(ctx, "assets.view")) return [];
  return prisma.asset.findMany({ where: { organizationId: ctx.organizationId, archivedAt: null }, orderBy: { number: "desc" }, take: 300, select: { id: true, number: true, name: true } });
}
