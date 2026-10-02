import { z } from "zod";
import type { Prisma, PurchaseOrderStatus } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork, type Uow } from "../events/bus";
import { optDate, optId, optText, parseListParams, reqText } from "../crm/normalize";
import { nextYearlyNumber } from "../crm/sequence";
import { todayIn, ymd } from "../commercial/dates";
import { cancelApprovalTx, registerApprovalHandler, requestApprovalTx } from "../approvals/service";
import { projectWhere } from "../projects/access";
import { D, decIn, lineMath, orgOf, r2 } from "./shared";
import { requestWhere, syncRequestFromOrders } from "./procurement";

/**
 * Purchase orders (docs/OPERATIONS.md):
 *   DRAFT → PENDING_APPROVAL (Approval PURCHASE_ORDER) → APPROVED → ISSUED → PARTIALLY_RECEIVED → RECEIVED → CLOSED
 *   approval is waived (and audited) when the PO is fully covered by its approved procurement request.
 * Totals are always recalculated on the server. After ISSUED the commercial fields are frozen (service + DB trigger):
 * corrections are cancel-and-replace (revise). A PO never creates a payment or a payable.
 */

export const PO_TRANSITIONS: Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "APPROVED", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "DRAFT", "CANCELLED"],
  APPROVED: ["ISSUED", "CANCELLED"],
  ISSUED: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["RECEIVED", "CLOSED"],
  RECEIVED: ["CLOSED"],
  CANCELLED: [],
  CLOSED: []
};
const OPEN_DELIVERY: PurchaseOrderStatus[] = ["ISSUED", "PARTIALLY_RECEIVED"];

const itemSchema = z.object({
  description: reqText(2, 300),
  quantity: decIn(3),
  unitPrice: decIn(),
  discountAmount: decIn(),
  taxRate: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().min(0).max(100).optional()),
  assetExpected: z.boolean().default(false),
  category: optText(60),
  serviceId: optId,
  projectId: optId
});
const orderSchema = z.object({
  vendorId: z.string().min(1),
  procurementRequestId: optId,
  departmentId: optId,
  projectId: optId,
  currency: z.string().trim().length(3).toUpperCase().optional(),
  expectedDeliveryDate: optDate,
  terms: optText(4000),
  notes: optText(4000),
  items: z.array(itemSchema).min(1).max(100)
});

async function build(tx: Tx, ctx: Ctx, input: z.output<typeof orderSchema>) {
  const org = await orgOf(tx, ctx.organizationId);
  const vendor = await tx.vendor.findFirst({ where: { id: input.vendorId, organizationId: ctx.organizationId } });
  if (!vendor) throw invalid("UNKNOWN_VENDOR");
  if (vendor.status !== "ACTIVE") throw invalid("VENDOR_ARCHIVED");
  if (input.projectId && !(await tx.project.findFirst({ where: { id: input.projectId, organizationId: ctx.organizationId, ...(await projectWhere(ctx)) }, select: { id: true } }))) throw invalid("UNKNOWN_PROJECT");
  let request = null;
  if (input.procurementRequestId) {
    request = await tx.procurementRequest.findFirst({ where: { AND: [{ id: input.procurementRequestId, organizationId: ctx.organizationId }, await requestWhere(ctx)] } });
    if (!request) throw invalid("UNKNOWN_REQUEST");
    if (!["APPROVED", "ORDERING", "ORDERED"].includes(request.status)) throw conflict(`REQUEST_NOT_APPROVED:${request.status}`);
  }
  const lines = input.items.map((i, n) => {
    if (!D(i.quantity).gt(0)) throw invalid("QTY_INVALID");
    const taxRate = String(i.taxRate ?? org.vatRate.toString());
    const m = lineMath({ quantity: i.quantity, unitPrice: i.unitPrice, discountAmount: i.discountAmount, taxRate });
    if (!m) throw invalid("DISCOUNT_EXCEEDS_LINE");
    return {
      description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, discountAmount: m.discount.toFixed(2), taxRate, subtotal: m.subtotal.toFixed(2), taxAmount: m.tax.toFixed(2), total: m.total.toFixed(2),
      assetExpected: i.assetExpected, category: i.category ?? null, serviceId: i.serviceId ?? null, projectId: i.projectId ?? input.projectId ?? null, sortOrder: n
    };
  });
  const sum = (k: "subtotal" | "taxAmount" | "discountAmount") => r2(lines.reduce((s, l) => s.plus(D(l[k])), D(0)));
  const subtotal = sum("subtotal");
  const tax = sum("taxAmount");
  const today = todayIn(org.timezone);
  if (input.expectedDeliveryDate && input.expectedDeliveryDate < today) throw invalid("DELIVERY_DATE_IN_PAST");
  return {
    lines, today, request,
    header: {
      vendorId: vendor.id, procurementRequestId: request?.id ?? null, departmentId: input.departmentId ?? request?.departmentId ?? null, projectId: input.projectId ?? request?.projectId ?? null,
      currency: input.currency ?? request?.currency ?? org.currency, expectedDeliveryDate: input.expectedDeliveryDate ?? null, terms: input.terms ?? null, notes: input.notes ?? null,
      subtotal: subtotal.toFixed(2), discountTotal: sum("discountAmount").toFixed(2), taxTotal: tax.toFixed(2), total: subtotal.plus(tax).toFixed(2)
    }
  };
}

export async function createOrder(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "procurement.orders.create");
  const input = orderSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const b = await build(tx, ctx, input);
    const number = await nextYearlyNumber(tx, ctx.organizationId, "PO", b.today.getUTCFullYear());
    const po = await tx.purchaseOrder.create({ data: { ...b.header, organizationId: ctx.organizationId, number, createdById: ctx.userId, items: { create: b.lines } } });
    await uow.audit({ action: "po.created", entityType: "PurchaseOrder", entityId: po.id, after: { number, vendorId: po.vendorId, total: b.header.total, currency: po.currency, requestId: po.procurementRequestId } });
    if (po.procurementRequestId) await syncRequestFromOrders(tx, uow, po.procurementRequestId);
    return { id: po.id, number };
  });
}

/** Draft PO pre-filled from an approved request (items, quantities, estimated prices, company VAT). */
export async function createOrderFromRequest(ctx: Ctx, requestId: string, raw: unknown) {
  const { vendorId, expectedDeliveryDate } = z.object({ vendorId: z.string().min(1), expectedDeliveryDate: optDate }).parse(raw);
  const r = await prisma.procurementRequest.findFirst({ where: { id: requestId, organizationId: ctx.organizationId }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!r) throw notFound("ProcurementRequest");
  return createOrder(ctx, {
    vendorId, procurementRequestId: requestId, expectedDeliveryDate,
    items: r.items.map((i) => ({ description: i.description, quantity: i.quantity.toString(), unitPrice: i.estimatedUnitPrice.toFixed(2), discountAmount: "0", assetExpected: i.assetExpected, category: i.category }))
  });
}

async function lockPo(tx: Tx, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const po = await tx.purchaseOrder.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { items: true } });
  if (!po) throw notFound("PurchaseOrder");
  return po;
}

export async function updateOrder(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "procurement.orders.create");
  const input = orderSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const po = await lockPo(tx, ctx, id);
    if (po.status !== "DRAFT") throw conflict(`PO_NOT_EDITABLE:${po.status}`);
    const b = await build(tx, ctx, { ...input, procurementRequestId: po.procurementRequestId });
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
    await tx.purchaseOrder.update({ where: { id }, data: { ...b.header, items: { create: b.lines } } });
    await uow.audit({ action: "po.updated", entityType: "PurchaseOrder", entityId: id, before: { total: po.total.toFixed(2), vendorId: po.vendorId }, after: { total: b.header.total, vendorId: b.header.vendorId, items: b.lines.length } });
  });
}

/** Covered = linked to an approved request, same currency, total within the approved estimate. */
const coveredByRequest = (po: { total: { toString(): string }; currency: string }, r: { status: string; estimatedAmount: { toString(): string }; currency: string } | null) =>
  Boolean(r && ["APPROVED", "ORDERING", "ORDERED"].includes(r.status) && r.currency === po.currency && D(po.total).lte(D(r.estimatedAmount)));

export async function submitOrder(ctx: Ctx, id: string) {
  requirePermission(ctx, "procurement.orders.create");
  return unitOfWork(ctx, async (tx, uow) => {
    const po = await lockPo(tx, ctx, id);
    if (po.status !== "DRAFT") throw conflict(`PO_INVALID_TRANSITION:${po.status}`);
    if (!po.items.length) throw invalid("PO_NEEDS_ITEMS");
    const req = po.procurementRequestId ? await tx.procurementRequest.findUnique({ where: { id: po.procurementRequestId } }) : null;
    if (coveredByRequest(po, req)) {
      const reason = `Covered by approved request ${req!.number} (${req!.estimatedAmount.toFixed(2)} ${req!.currency})`;
      await tx.purchaseOrder.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date(), approvalWaivedReason: reason } });
      await uow.audit({ action: "po.approved", entityType: "PurchaseOrder", entityId: id, before: { status: "DRAFT" }, after: { status: "APPROVED", waived: reason } });
      return { status: "APPROVED" as const };
    }
    const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: po.vendorId }, select: { name: true } });
    const a = await requestApprovalTx(tx, uow, ctx, {
      type: "PURCHASE_ORDER", entityType: "PurchaseOrder", entityId: id,
      title: `${po.number} · ${vendor.name}`,
      summary: req ? `Exceeds or differs from request ${req.number}` : "Purchase order without an approved request",
      payload: { orderId: id, number: po.number, total: po.total.toFixed(2) },
      requiredPermission: "procurement.orders.approve", priority: "HIGH", amount: Number(po.total), currency: po.currency
    });
    await tx.purchaseOrder.update({ where: { id }, data: { status: "PENDING_APPROVAL", approvalId: a.id } });
    await uow.audit({ action: "po.submitted", entityType: "PurchaseOrder", entityId: id, before: { status: "DRAFT" }, after: { status: "PENDING_APPROVAL", approvalId: a.id } });
    return { status: "PENDING_APPROVAL" as const };
  });
}

export async function withdrawOrder(ctx: Ctx, id: string) {
  requirePermission(ctx, "procurement.orders.create");
  return unitOfWork(ctx, async (tx, uow) => {
    const po = await lockPo(tx, ctx, id);
    if (po.status !== "PENDING_APPROVAL" || !po.approvalId) throw conflict(`PO_INVALID_TRANSITION:${po.status}`);
    await cancelApprovalTx(tx, uow, ctx, po.approvalId, { allowNonRequester: true, runHook: false });
    await tx.purchaseOrder.update({ where: { id }, data: { status: "DRAFT", approvalId: null } });
    await uow.audit({ action: "po.withdrawn", entityType: "PurchaseOrder", entityId: id });
  });
}

registerApprovalHandler("PURCHASE_ORDER", {
  async onApproved(tx, uow, approval, ctx) {
    const { orderId } = approval.payload as { orderId: string };
    await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${orderId} FOR UPDATE`;
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (po.status !== "PENDING_APPROVAL" || po.approvalId !== approval.id) throw conflict("PO_STALE_APPROVAL");
    if (po.createdById === ctx.userId) throw forbidden("self-approval");
    await tx.purchaseOrder.update({ where: { id: orderId }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: ctx.userId } });
    await uow.audit({ action: "po.approved", entityType: "PurchaseOrder", entityId: orderId, before: { status: "PENDING_APPROVAL" }, after: { status: "APPROVED", total: po.total.toFixed(2) } });
    uow.emit({ type: "purchase_order.approved", entityType: "PurchaseOrder", entityId: orderId, payload: { orderId, number: po.number, createdById: po.createdById } });
  },
  async onRejected(tx, uow, approval) {
    const { orderId } = approval.payload as { orderId: string };
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (po.status !== "PENDING_APPROVAL" || po.approvalId !== approval.id) throw conflict("PO_STALE_APPROVAL");
    await tx.purchaseOrder.update({ where: { id: orderId }, data: { status: "DRAFT", approvalId: null, notes: [po.notes, `Approval rejected: ${approval.decisionComment ?? ""}`].filter(Boolean).join("\n") } });
    await uow.audit({ action: "po.rejected", entityType: "PurchaseOrder", entityId: orderId, after: { comment: approval.decisionComment } });
  },
  async onCancelled(tx, _uow, approval) {
    const { orderId } = approval.payload as { orderId: string };
    await tx.purchaseOrder.updateMany({ where: { id: orderId, approvalId: approval.id, status: "PENDING_APPROVAL" }, data: { status: "DRAFT", approvalId: null } });
  }
});

export async function issueOrder(ctx: Ctx, id: string) {
  requirePermission(ctx, "procurement.orders.issue");
  return unitOfWork(ctx, async (tx, uow) => {
    const po = await lockPo(tx, ctx, id);
    if (po.status !== "APPROVED") throw conflict(`PO_INVALID_TRANSITION:${po.status}`);
    const org = await orgOf(tx, ctx.organizationId);
    const today = todayIn(org.timezone);
    if (po.expectedDeliveryDate && po.expectedDeliveryDate < today) throw invalid("DELIVERY_DATE_IN_PAST");
    const res = await tx.purchaseOrder.updateMany({ where: { id, status: "APPROVED" }, data: { status: "ISSUED", issueDate: today, issuedAt: new Date(), issuedById: ctx.userId } });
    if (res.count !== 1) throw conflict("PO_ALREADY_ISSUED");
    await uow.audit({ action: "po.issued", entityType: "PurchaseOrder", entityId: id, before: { status: "APPROVED" }, after: { status: "ISSUED", issueDate: ymd(today), total: po.total.toFixed(2), vendorId: po.vendorId } });
    uow.emit({ type: "purchase_order.issued", entityType: "PurchaseOrder", entityId: id, payload: { orderId: id, number: po.number, total: po.total.toFixed(2), currency: po.currency }, activity: { entityLabel: `${po.number}`, href: `/app/procurement/orders/${id}`, visibility: "procurement.orders.view" } });
    if (po.procurementRequestId) await syncRequestFromOrders(tx, uow, po.procurementRequestId);
  });
}

const receiptSchema = z.object({
  receivedAt: optDate,
  notes: optText(2000),
  lines: z.array(z.object({ poItemId: z.string().min(1), quantity: decIn(3), condition: z.enum(["GOOD", "DAMAGED", "INCORRECT"]).default("GOOD"), notes: optText(500) })).min(1).max(100)
});

/** Goods / service receipt — partial receipts allowed, over-receipt refused (service + DB CHECK). */
export async function receiveOrder(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "procurement.orders.receive");
  const input = receiptSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const po = await lockPo(tx, ctx, id);
    if (!OPEN_DELIVERY.includes(po.status)) throw conflict(`PO_NOT_RECEIVABLE:${po.status}`);
    const org = await orgOf(tx, ctx.organizationId);
    const today = todayIn(org.timezone);
    const at = input.receivedAt ?? today;
    if (at > today) throw invalid("RECEIPT_IN_FUTURE");
    if (po.issueDate && at < po.issueDate) throw invalid("RECEIPT_BEFORE_ISSUE");
    const lines = input.lines.filter((l) => D(l.quantity).gt(0));
    if (!lines.length) throw invalid("RECEIPT_EMPTY");
    const byId = new Map(po.items.map((i) => [i.id, i]));
    for (const l of lines) {
      const it = byId.get(l.poItemId);
      if (!it) throw invalid("UNKNOWN_PO_ITEM");
      if (D(it.receivedQuantity).plus(D(l.quantity)).gt(D(it.quantity))) throw conflict(`OVER_RECEIPT:${it.description}`);
    }
    const receipt = await tx.purchaseReceipt.create({ data: { organizationId: ctx.organizationId, purchaseOrderId: id, receivedById: ctx.userId, receivedAt: at, notes: input.notes ?? null, items: { create: lines.map((l) => ({ poItemId: l.poItemId, quantityReceived: l.quantity, condition: l.condition, notes: l.notes ?? null })) } } });
    for (const l of lines) await tx.purchaseOrderItem.update({ where: { id: l.poItemId }, data: { receivedQuantity: { increment: l.quantity } } });
    const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
    const complete = items.every((i) => D(i.receivedQuantity).gte(D(i.quantity)));
    const next: PurchaseOrderStatus = complete ? "RECEIVED" : "PARTIALLY_RECEIVED";
    await tx.purchaseOrder.update({ where: { id }, data: { status: next, ...(complete ? { receivedAt: new Date() } : {}) } });
    await uow.audit({ action: "po.received", entityType: "PurchaseOrder", entityId: id, before: { status: po.status }, after: { status: next, receiptId: receipt.id, receivedAt: ymd(at), lines: lines.map((l) => ({ item: l.poItemId, qty: l.quantity, condition: l.condition })) } });
    uow.emit({ type: "purchase_order.received", entityType: "PurchaseOrder", entityId: id, payload: { orderId: id, number: po.number, complete, createdById: po.createdById } });
    if (po.procurementRequestId) await syncRequestFromOrders(tx, uow, po.procurementRequestId);
    return { receiptId: receipt.id, status: next };
  });
}

export async function cancelOrder(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "procurement.orders.cancel");
  const { reason } = z.object({ reason: reqText(3, 500) }).parse(raw);
  return unitOfWork(ctx, (tx, uow) => cancelTx(tx, uow, ctx, id, reason));
}

async function cancelTx(tx: Tx, uow: Uow, ctx: Ctx, id: string, reason: string) {
  const po = await lockPo(tx, ctx, id);
  if (!["DRAFT", "PENDING_APPROVAL", "APPROVED", "ISSUED"].includes(po.status)) throw conflict(`PO_INVALID_TRANSITION:${po.status}`);
  if (po.items.some((i) => D(i.receivedQuantity).gt(0))) throw conflict("PO_HAS_RECEIPTS");
  if (po.status === "PENDING_APPROVAL" && po.approvalId) await cancelApprovalTx(tx, uow, ctx, po.approvalId, { allowNonRequester: true, runHook: false });
  await tx.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
  await uow.audit({ action: "po.cancelled", entityType: "PurchaseOrder", entityId: id, before: { status: po.status }, after: { status: "CANCELLED", reason } });
  if (po.procurementRequestId) await syncRequestFromOrders(tx, uow, po.procurementRequestId);
  return po;
}

/** Cancel-and-replace for an issued PO with nothing received: the copy starts as a draft linked to the original. */
export async function reviseOrder(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "procurement.orders.cancel");
  requirePermission(ctx, "procurement.orders.create");
  const { reason } = z.object({ reason: reqText(3, 500) }).parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const po = await cancelTx(tx, uow, ctx, id, `Revised: ${reason}`);
    const org = await orgOf(tx, ctx.organizationId);
    const number = await nextYearlyNumber(tx, ctx.organizationId, "PO", todayIn(org.timezone).getUTCFullYear());
    const copy = await tx.purchaseOrder.create({
      data: {
        organizationId: ctx.organizationId, number, vendorId: po.vendorId, procurementRequestId: po.procurementRequestId, departmentId: po.departmentId, projectId: po.projectId, currency: po.currency,
        expectedDeliveryDate: po.expectedDeliveryDate, terms: po.terms, notes: po.notes, subtotal: po.subtotal, discountTotal: po.discountTotal, taxTotal: po.taxTotal, total: po.total, createdById: ctx.userId, revisionOfId: po.id,
        items: { create: po.items.map(({ description, quantity, unitPrice, discountAmount, taxRate, subtotal, taxAmount, total, assetExpected, category, serviceId, projectId, sortOrder }) => ({ description, quantity, unitPrice, discountAmount, taxRate, subtotal, taxAmount, total, assetExpected, category, serviceId, projectId, sortOrder })) }
      }
    });
    await uow.audit({ action: "po.revised", entityType: "PurchaseOrder", entityId: copy.id, after: { number, revisionOf: po.number, reason } });
    if (po.procurementRequestId) await syncRequestFromOrders(tx, uow, po.procurementRequestId);
    return { id: copy.id, number };
  });
}

export async function closeOrder(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "procurement.orders.receive");
  const { reason } = z.object({ reason: optText(500) }).parse(raw ?? {});
  return unitOfWork(ctx, async (tx, uow) => {
    const po = await lockPo(tx, ctx, id);
    if (!["PARTIALLY_RECEIVED", "RECEIVED"].includes(po.status)) throw conflict(`PO_INVALID_TRANSITION:${po.status}`);
    if (po.status === "PARTIALLY_RECEIVED" && !reason) throw invalid("REASON_REQUIRED");
    await tx.purchaseOrder.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date(), closeReason: reason ?? null } });
    await uow.audit({ action: "po.closed", entityType: "PurchaseOrder", entityId: id, before: { status: po.status }, after: { status: "CLOSED", reason, shortClosed: po.status === "PARTIALLY_RECEIVED" } });
    if (po.procurementRequestId) await syncRequestFromOrders(tx, uow, po.procurementRequestId);
  });
}

// --- read ----------------------------------------------------------------------------------

/** All POs with procurement.orders.view; otherwise POs I created, of projects I manage, or of my own requests. */
export async function poWhere(ctx: Ctx): Promise<Prisma.PurchaseOrderWhereInput> {
  if (can(ctx, "procurement.orders.view")) return {};
  return { AND: [{ OR: [{ createdById: ctx.userId }, { project: { projectManagerId: ctx.userId } }, { procurementRequest: { requesterId: ctx.userId } }] }] };
}

const listSchema = z.object({ status: z.string().max(30).optional(), vendor: z.string().max(40).optional(), q: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1) });

export async function listOrders(ctx: Ctx, raw: unknown) {
  const f = parseListParams(listSchema, raw ?? {});
  const org = await orgOf(prisma, ctx.organizationId);
  const today = todayIn(org.timezone);
  const where: Prisma.PurchaseOrderWhereInput = {
    AND: [
      { organizationId: ctx.organizationId },
      await poWhere(ctx),
      ...(f.status === "late" ? [{ status: { in: OPEN_DELIVERY }, expectedDeliveryDate: { lt: today } }] : f.status === "open" ? [{ status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", ...OPEN_DELIVERY] as PurchaseOrderStatus[] } }] : f.status && f.status in PO_TRANSITIONS ? [{ status: f.status as PurchaseOrderStatus }] : []),
      ...(f.vendor ? [{ vendorId: f.vendor }] : []),
      ...(f.q ? [{ OR: [{ number: { contains: f.q.toUpperCase() } }, { vendor: { name: { contains: f.q, mode: "insensitive" as const } } }] }] : [])
    ]
  };
  const [items, total] = await Promise.all([
    prisma.purchaseOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * 30, take: 30, include: { vendor: { select: { id: true, name: true } }, procurementRequest: { select: { number: true } }, project: { select: { id: true, name: true } } } }),
    prisma.purchaseOrder.count({ where })
  ]);
  return { items, total, page: f.page, pageSize: 30, filters: f, today };
}

export async function getOrder(ctx: Ctx, id: string) {
  const po = await prisma.purchaseOrder.findFirst({
    where: { AND: [{ id, organizationId: ctx.organizationId }, await poWhere(ctx)] },
    include: {
      vendor: { select: { id: true, name: true, number: true, paymentTerms: true } },
      procurementRequest: { select: { id: true, number: true, title: true, status: true, estimatedAmount: true, currency: true } },
      project: { select: { id: true, name: true, number: true } },
      department: { select: { name: true, nameAr: true } },
      items: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { assets: true } } } },
      receipts: { orderBy: { createdAt: "asc" }, include: { items: { include: { poItem: { select: { description: true } } } } } },
      assets: { select: { id: true, number: true, name: true, status: true } },
      expenses: { select: { id: true, number: true, total: true, status: true, currency: true } },
      revisionOf: { select: { id: true, number: true } },
      revisedBy: { select: { id: true, number: true } }
    }
  });
  if (!po) throw notFound("PurchaseOrder");
  const ids = [po.createdById, po.approvedById, po.issuedById, ...po.receipts.map((r) => r.receivedById)].filter(Boolean) as string[];
  const [people, approval] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, nameAr: true } }),
    po.approvalId ? prisma.approval.findUnique({ where: { id: po.approvalId }, select: { id: true, status: true } }) : null
  ]);
  const org = await orgOf(prisma, ctx.organizationId);
  const overdue = OPEN_DELIVERY.includes(po.status) && Boolean(po.expectedDeliveryDate && po.expectedDeliveryDate < todayIn(org.timezone));
  return { po, people, approval, overdue };
}
