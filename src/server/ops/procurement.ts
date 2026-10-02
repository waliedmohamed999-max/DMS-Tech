import { z } from "zod";
import type { Prisma, ProcurementApprover, ProcurementStatus } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork, type Uow } from "../events/bus";
import { optDate, optId, optText, parseListParams, reqText } from "../crm/normalize";
import { nextYearlyNumber } from "../crm/sequence";
import { todayIn } from "../commercial/dates";
import { cancelApprovalTx, registerApprovalHandler, requestApprovalTx } from "../approvals/service";
import { projectWhere } from "../projects/access";
import { D, decIn, myDept, orgOf, r2 } from "./shared";

/**
 * Procurement requests (docs/OPERATIONS.md). Lifecycle:
 *   DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED → ORDERING (draft PO) → ORDERED (PO issued) → RECEIVED
 *                                       ↘ REJECTED (reason)              CANCELLED (reason) from DRAFT / REJECTED / PENDING / APPROVED
 * Approval goes through the Phase 1 engine (type PROCUREMENT). The tier comes from configurable
 * ProcurementApprovalRule rows (amount / department / project / category); nothing is hard-coded per company.
 */

export const REQUEST_TRANSITIONS: Record<ProcurementStatus, readonly ProcurementStatus[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["PENDING_APPROVAL", "APPROVED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "DRAFT", "CANCELLED"],
  APPROVED: ["ORDERING", "CANCELLED"],
  REJECTED: ["DRAFT", "SUBMITTED", "CANCELLED"],
  ORDERING: ["ORDERED", "APPROVED"],
  ORDERED: ["RECEIVED", "ORDERING", "APPROVED"],
  RECEIVED: [],
  CANCELLED: []
};

// --- approval rules ----------------------------------------------------------------------

/** Company defaults (editable in Operations settings) — demo thresholds, not policy. */
export const DEFAULT_RULES: { name: string; sortOrder: number; minAmount: string; maxAmount: string | null; forProject: boolean | null; approver: ProcurementApprover }[] = [
  { name: "Project purchase — project manager", sortOrder: 10, minAmount: "0", maxAmount: "20000", forProject: true, approver: "PROJECT_MANAGER" },
  { name: "Small purchase — line manager", sortOrder: 20, minAmount: "0", maxAmount: "5000", forProject: null, approver: "LINE_MANAGER" },
  { name: "Standard purchase — procurement approver", sortOrder: 30, minAmount: "5000", maxAmount: "50000", forProject: null, approver: "PROCUREMENT" },
  { name: "Large purchase — executive", sortOrder: 40, minAmount: "50000", maxAmount: null, forProject: null, approver: "EXECUTIVE" }
];

export async function ensureProcurementRules(organizationId: string) {
  if (await prisma.procurementApprovalRule.count({ where: { organizationId } })) return;
  await prisma.procurementApprovalRule.createMany({ data: DEFAULT_RULES.map((r) => ({ ...r, organizationId })) });
}

export const listRules = (organizationId: string) => prisma.procurementApprovalRule.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });

const ruleSchema = z.object({
  id: optId,
  name: reqText(2, 120),
  sortOrder: z.coerce.number().int().min(0).max(10000),
  minAmount: decIn(),
  maxAmount: z.preprocess((v) => (v === "" || v == null ? null : String(v).replace(/[,\s]/g, "")), z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "AMOUNT_INVALID").nullable()),
  departmentId: optId,
  forProject: z.preprocess((v) => (v === "" || v == null ? null : v === true || v === "true"), z.boolean().nullable()),
  category: optText(60),
  approver: z.enum(["LINE_MANAGER", "PROJECT_MANAGER", "PROCUREMENT", "EXECUTIVE"]),
  active: z.boolean().default(true)
});

export async function saveRule(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "operations.settings.manage");
  const input = ruleSchema.parse(raw);
  if (input.maxAmount !== null && D(input.maxAmount).lte(D(input.minAmount))) throw invalid("MAX_NOT_ABOVE_MIN");
  return unitOfWork(ctx, async (tx, uow) => {
    const data = { name: input.name, sortOrder: input.sortOrder, minAmount: input.minAmount, maxAmount: input.maxAmount, departmentId: input.departmentId ?? null, forProject: input.forProject, category: input.category ?? null, approver: input.approver, active: input.active };
    if (input.id) {
      const before = await tx.procurementApprovalRule.findFirst({ where: { id: input.id, organizationId: ctx.organizationId } });
      if (!before) throw notFound("ProcurementApprovalRule");
      await tx.procurementApprovalRule.update({ where: { id: input.id }, data });
      await uow.audit({ action: "procurement.rule_changed", entityType: "ProcurementApprovalRule", entityId: input.id, before, after: data });
      return { id: input.id };
    }
    const r = await tx.procurementApprovalRule.create({ data: { ...data, organizationId: ctx.organizationId } });
    await uow.audit({ action: "procurement.rule_changed", entityType: "ProcurementApprovalRule", entityId: r.id, after: data });
    return { id: r.id };
  });
}

/** First active rule (by sortOrder) matching amount / department / project / category. */
export async function matchRule(db: Tx | typeof prisma, organizationId: string, req: { estimatedAmount: { toString(): string }; departmentId: string | null; projectId: string | null; category: string | null }) {
  const rules = await db.procurementApprovalRule.findMany({ where: { organizationId, active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const amount = D(req.estimatedAmount);
  return (
    rules.find(
      (r) =>
        amount.gte(D(r.minAmount)) &&
        (r.maxAmount === null || amount.lt(D(r.maxAmount))) &&
        (!r.departmentId || r.departmentId === req.departmentId) &&
        (r.forProject === null || r.forProject === Boolean(req.projectId)) &&
        (!r.category || r.category === req.category)
    ) ?? null
  );
}

// --- requests ---------------------------------------------------------------------------

const itemSchema = z.object({
  description: reqText(2, 300),
  quantity: decIn(3),
  estimatedUnitPrice: decIn(),
  category: optText(60),
  preferredVendorId: optId,
  assetExpected: z.boolean().default(false)
});
const requestSchema = z.object({
  title: reqText(3, 160),
  description: optText(4000),
  businessJustification: reqText(5, 4000),
  departmentId: optId,
  projectId: optId,
  category: optText(60),
  neededByDate: optDate,
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  preferredVendorId: optId,
  currency: z.string().trim().length(3).toUpperCase().optional(),
  items: z.array(itemSchema).min(1).max(100),
  submit: z.boolean().default(false)
});

async function validate(tx: Tx, ctx: Ctx, input: z.output<typeof requestSchema>) {
  if (input.projectId && !(await tx.project.findFirst({ where: { id: input.projectId, organizationId: ctx.organizationId, ...(await projectWhere(ctx)) }, select: { id: true } }))) throw invalid("UNKNOWN_PROJECT");
  if (input.departmentId && !(await tx.department.findFirst({ where: { id: input.departmentId, organizationId: ctx.organizationId, deletedAt: null } }))) throw invalid("UNKNOWN_DEPARTMENT");
  const vendorIds = [input.preferredVendorId, ...input.items.map((i) => i.preferredVendorId)].filter(Boolean) as string[];
  if (vendorIds.length) {
    const n = await tx.vendor.count({ where: { id: { in: vendorIds }, organizationId: ctx.organizationId, status: "ACTIVE" } });
    if (n !== new Set(vendorIds).size) throw invalid("UNKNOWN_VENDOR");
  }
  const org = await orgOf(tx, ctx.organizationId);
  const today = todayIn(org.timezone);
  if (input.neededByDate && input.neededByDate < today) throw invalid("NEEDED_BY_IN_PAST");
  for (const i of input.items) if (!D(i.quantity).gt(0)) throw invalid("QTY_INVALID");
  const items = input.items.map((i, n) => ({ description: i.description, quantity: i.quantity, estimatedUnitPrice: i.estimatedUnitPrice, estimatedTotal: r2(D(i.quantity).mul(D(i.estimatedUnitPrice))).toFixed(2), category: i.category ?? null, preferredVendorId: i.preferredVendorId ?? null, assetExpected: i.assetExpected, projectId: input.projectId ?? null, departmentId: input.departmentId ?? null, sortOrder: n }));
  const total = items.reduce((s, i) => s.plus(D(i.estimatedTotal)), D(0));
  return { items, total: r2(total).toFixed(2), today, currency: input.currency ?? org.currency };
}

export async function createRequest(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "procurement.requests.create");
  const input = requestSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const v = await validate(tx, ctx, input);
    const number = await nextYearlyNumber(tx, ctx.organizationId, "PR", v.today.getUTCFullYear());
    const r = await tx.procurementRequest.create({
      data: {
        organizationId: ctx.organizationId, number, requesterId: ctx.userId, departmentId: input.departmentId ?? (await myDept(ctx)), projectId: input.projectId ?? null,
        title: input.title, description: input.description ?? null, businessJustification: input.businessJustification, category: input.category ?? null,
        requestedDate: v.today, neededByDate: input.neededByDate ?? null, estimatedAmount: v.total, currency: v.currency, priority: input.priority,
        preferredVendorId: input.preferredVendorId ?? null, items: { create: v.items }
      }
    });
    await uow.audit({ action: "procurement.created", entityType: "ProcurementRequest", entityId: r.id, after: { number, title: r.title, estimatedAmount: v.total, items: v.items.length, projectId: r.projectId } });
    if (input.submit) await submitTx(tx, uow, ctx, r.id);
    return { id: r.id, number };
  });
}

export async function updateRequest(ctx: Ctx, id: string, raw: unknown) {
  const input = requestSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const r = await lockRequest(tx, ctx, id);
    if (r.requesterId !== ctx.userId) throw forbidden("only the requester edits a request");
    if (r.status !== "DRAFT" && r.status !== "REJECTED") throw conflict(`REQUEST_NOT_EDITABLE:${r.status}`);
    const v = await validate(tx, ctx, input);
    await tx.procurementRequestItem.deleteMany({ where: { requestId: id } });
    await tx.procurementRequest.update({
      where: { id },
      data: {
        title: input.title, description: input.description ?? null, businessJustification: input.businessJustification, category: input.category ?? null, departmentId: input.departmentId ?? r.departmentId,
        projectId: input.projectId ?? null, neededByDate: input.neededByDate ?? null, priority: input.priority, preferredVendorId: input.preferredVendorId ?? null, estimatedAmount: v.total, currency: v.currency,
        status: "DRAFT", rejectedAt: null, rejectionReason: null, items: { create: v.items }
      }
    });
    await uow.audit({ action: "procurement.updated", entityType: "ProcurementRequest", entityId: id, before: { estimatedAmount: r.estimatedAmount.toFixed(2), status: r.status }, after: { estimatedAmount: v.total, items: v.items.length } });
    if (input.submit) await submitTx(tx, uow, ctx, id);
  });
}

async function lockRequest(tx: Tx, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM "ProcurementRequest" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const r = await tx.procurementRequest.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!r) throw notFound("ProcurementRequest");
  return r;
}

/** Resolve the approver for the matched tier: assignee (line / project manager) or a permission. */
async function routeFor(tx: Tx, ctx: Ctx, r: { requesterId: string; projectId: string | null }, approver: ProcurementApprover) {
  const canDecide = async (userId: string | null | undefined) => {
    if (!userId || userId === r.requesterId) return null;
    const u = await tx.user.findFirst({ where: { id: userId, organizationId: ctx.organizationId, status: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: "approvals.decide" } } } } } }, select: { id: true } });
    return u?.id ?? null;
  };
  if (approver === "LINE_MANAGER") {
    const emp = await tx.employee.findFirst({ where: { userId: r.requesterId, organizationId: ctx.organizationId }, select: { manager: { select: { userId: true, status: true } } } });
    const id = emp?.manager && !["TERMINATED", "ARCHIVED"].includes(emp.manager.status) ? await canDecide(emp.manager.userId) : null;
    if (id) return { assigneeId: id, requiredPermission: "approvals.decide" as const, approver };
  }
  if (approver === "PROJECT_MANAGER" && r.projectId) {
    const p = await tx.project.findUnique({ where: { id: r.projectId }, select: { projectManagerId: true } });
    const id = await canDecide(p?.projectManagerId);
    if (id) return { assigneeId: id, requiredPermission: "approvals.decide" as const, approver };
  }
  if (approver === "EXECUTIVE") return { assigneeId: undefined, requiredPermission: "procurement.requests.approve_executive" as const, approver };
  // fallback for unresolvable managers — never silently skip approval
  return { assigneeId: undefined, requiredPermission: "procurement.requests.approve" as const, approver: "PROCUREMENT" as const };
}

async function submitTx(tx: Tx, uow: Uow, ctx: Ctx, id: string) {
  const r = await lockRequest(tx, ctx, id);
  if (r.requesterId !== ctx.userId) throw forbidden("only the requester submits a request");
  if (r.status !== "DRAFT" && r.status !== "REJECTED") throw conflict(`REQUEST_INVALID_TRANSITION:${r.status}`);
  if (!(await tx.procurementRequestItem.count({ where: { requestId: id } }))) throw invalid("REQUEST_NEEDS_ITEMS");
  await tx.procurementRequest.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date(), rejectedAt: null, rejectionReason: null } });
  await uow.audit({ action: "procurement.submitted", entityType: "ProcurementRequest", entityId: id, before: { status: r.status }, after: { status: "SUBMITTED", estimatedAmount: r.estimatedAmount.toFixed(2) } });
  const rule = await matchRule(tx, ctx.organizationId, r);
  const route = await routeFor(tx, ctx, r, rule?.approver ?? "PROCUREMENT");
  const a = await requestApprovalTx(tx, uow, ctx, {
    type: "PROCUREMENT",
    entityType: "ProcurementRequest",
    entityId: id,
    title: `${r.number} · ${r.title}`,
    summary: rule?.name ?? "Default procurement approval",
    payload: { requestId: id, number: r.number, amount: r.estimatedAmount.toFixed(2) },
    requiredPermission: route.requiredPermission,
    assigneeId: route.assigneeId,
    priority: r.priority,
    amount: Number(r.estimatedAmount),
    currency: r.currency
  });
  await tx.procurementRequest.update({ where: { id }, data: { status: "PENDING_APPROVAL", approvalId: a.id, approvalRuleName: rule?.name ?? null, approver: route.approver } });
  await uow.audit({ action: "procurement.routed", entityType: "ProcurementRequest", entityId: id, after: { status: "PENDING_APPROVAL", rule: rule?.name ?? null, approver: route.approver, assigneeId: route.assigneeId ?? null, requiredPermission: route.requiredPermission } });
  uow.emit({ type: "procurement.requested", entityType: "ProcurementRequest", entityId: id, payload: { requestId: id, number: r.number, title: r.title, amount: r.estimatedAmount.toFixed(2), currency: r.currency }, activity: { entityLabel: `${r.number} · ${r.title}`, href: `/app/procurement/${id}`, visibility: "procurement.requests.view" } });
}

export async function submitRequest(ctx: Ctx, id: string) {
  requirePermission(ctx, "procurement.requests.create");
  return unitOfWork(ctx, (tx, uow) => submitTx(tx, uow, ctx, id));
}

/** Pull a pending request back to draft (requester). */
export async function withdrawRequest(ctx: Ctx, id: string) {
  return unitOfWork(ctx, async (tx, uow) => {
    const r = await lockRequest(tx, ctx, id);
    if (r.requesterId !== ctx.userId) throw forbidden("only the requester withdraws a request");
    if (r.status !== "PENDING_APPROVAL" || !r.approvalId) throw conflict(`REQUEST_INVALID_TRANSITION:${r.status}`);
    await cancelApprovalTx(tx, uow, ctx, r.approvalId, { runHook: false });
    await tx.procurementRequest.update({ where: { id }, data: { status: "DRAFT", approvalId: null } });
    await uow.audit({ action: "procurement.withdrawn", entityType: "ProcurementRequest", entityId: id, before: { status: r.status }, after: { status: "DRAFT" } });
  });
}

export async function cancelRequest(ctx: Ctx, id: string, raw: unknown) {
  const { reason } = z.object({ reason: reqText(3, 500) }).parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const r = await lockRequest(tx, ctx, id);
    if (r.requesterId !== ctx.userId && !can(ctx, "procurement.orders.cancel")) throw forbidden("procurement.orders.cancel");
    if (!["DRAFT", "REJECTED", "PENDING_APPROVAL", "APPROVED"].includes(r.status)) throw conflict(`REQUEST_INVALID_TRANSITION:${r.status}`);
    if (await tx.purchaseOrder.count({ where: { procurementRequestId: id, status: { not: "CANCELLED" } } })) throw conflict("REQUEST_HAS_ORDERS");
    if (r.status === "PENDING_APPROVAL" && r.approvalId) await cancelApprovalTx(tx, uow, ctx, r.approvalId, { allowNonRequester: true, runHook: false });
    await tx.procurementRequest.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
    await uow.audit({ action: "procurement.cancelled", entityType: "ProcurementRequest", entityId: id, before: { status: r.status }, after: { status: "CANCELLED", reason } });
  });
}

registerApprovalHandler("PROCUREMENT", {
  async onApproved(tx, uow, approval, ctx) {
    const { requestId } = approval.payload as { requestId: string };
    await tx.$queryRaw`SELECT id FROM "ProcurementRequest" WHERE id = ${requestId} FOR UPDATE`;
    const r = await tx.procurementRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (r.status !== "PENDING_APPROVAL" || r.approvalId !== approval.id) throw conflict("REQUEST_STALE_APPROVAL");
    if (r.requesterId === ctx.userId) throw forbidden("self-approval");
    // manager-routed tiers: the routed manager, or a procurement approver standing in
    const a = await tx.approval.findUniqueOrThrow({ where: { id: approval.id }, select: { assigneeId: true } });
    if (a.assigneeId && a.assigneeId !== ctx.userId && !can(ctx, "procurement.requests.approve")) throw forbidden("procurement.requests.approve (routed to another approver)");
    await tx.procurementRequest.update({ where: { id: requestId }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: ctx.userId } });
    await uow.audit({ action: "procurement.approved", entityType: "ProcurementRequest", entityId: requestId, before: { status: "PENDING_APPROVAL" }, after: { status: "APPROVED", amount: r.estimatedAmount.toFixed(2) } });
    uow.emit({ type: "procurement.approved", entityType: "ProcurementRequest", entityId: requestId, payload: { requestId, number: r.number, title: r.title, requesterId: r.requesterId } });
  },
  async onRejected(tx, uow, approval) {
    const { requestId } = approval.payload as { requestId: string };
    const r = await tx.procurementRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (r.status !== "PENDING_APPROVAL" || r.approvalId !== approval.id) throw conflict("REQUEST_STALE_APPROVAL");
    await tx.procurementRequest.update({ where: { id: requestId }, data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: approval.decisionComment ?? "Rejected", approvalId: null } });
    await uow.audit({ action: "procurement.rejected", entityType: "ProcurementRequest", entityId: requestId, before: { status: "PENDING_APPROVAL" }, after: { status: "REJECTED", reason: approval.decisionComment } });
    uow.emit({ type: "procurement.rejected", entityType: "ProcurementRequest", entityId: requestId, payload: { requestId, number: r.number, title: r.title, requesterId: r.requesterId, reason: approval.decisionComment ?? "" } });
  },
  async onCancelled(tx, _uow, approval) {
    const { requestId } = approval.payload as { requestId: string };
    await tx.procurementRequest.updateMany({ where: { id: requestId, approvalId: approval.id, status: "PENDING_APPROVAL" }, data: { status: "DRAFT", approvalId: null } });
  }
});

/** Called by the PO service: keep the request status in step with its purchase orders. */
export async function syncRequestFromOrders(tx: Tx, uow: Uow, requestId: string) {
  const r = await tx.procurementRequest.findUnique({ where: { id: requestId } });
  if (!r || ["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "REJECTED", "CANCELLED"].includes(r.status)) return;
  const pos = await tx.purchaseOrder.findMany({ where: { procurementRequestId: requestId, status: { not: "CANCELLED" } }, select: { status: true } });
  const next: ProcurementStatus = !pos.length
    ? "APPROVED"
    : pos.every((p) => p.status === "RECEIVED" || p.status === "CLOSED")
      ? "RECEIVED"
      : pos.some((p) => ["ISSUED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED"].includes(p.status))
        ? "ORDERED"
        : "ORDERING";
  if (next !== r.status) {
    await tx.procurementRequest.update({ where: { id: requestId }, data: { status: next } });
    await uow.audit({ action: "procurement.status_changed", entityType: "ProcurementRequest", entityId: requestId, before: { status: r.status }, after: { status: next } });
  }
}

// --- read ---------------------------------------------------------------------------------

/** Visibility: all (requests.view or an approver role) · otherwise own requests, requests of projects I manage, and requests routed to me. */
export async function requestWhere(ctx: Ctx): Promise<Prisma.ProcurementRequestWhereInput> {
  if (can(ctx, "procurement.requests.view") || can(ctx, "procurement.requests.approve") || can(ctx, "procurement.requests.approve_executive")) return {};
  const routed = await prisma.approval.findMany({ where: { organizationId: ctx.organizationId, type: "PROCUREMENT", assigneeId: ctx.userId }, select: { entityId: true } });
  return { AND: [{ OR: [{ requesterId: ctx.userId }, { project: { projectManagerId: ctx.userId } }, { id: { in: routed.map((x) => x.entityId) } }] }] };
}

const listSchema = z.object({ status: z.string().max(30).optional(), scope: z.enum(["mine", "all"]).optional(), q: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1) });

export async function listRequests(ctx: Ctx, raw: unknown) {
  const f = parseListParams(listSchema, raw ?? {});
  const where: Prisma.ProcurementRequestWhereInput = {
    AND: [
      { organizationId: ctx.organizationId },
      await requestWhere(ctx),
      ...(f.scope === "mine" ? [{ requesterId: ctx.userId }] : []),
      ...(f.status === "open" ? [{ status: { in: ["SUBMITTED", "PENDING_APPROVAL", "APPROVED", "ORDERING", "ORDERED"] as ProcurementStatus[] } }] : f.status && f.status in REQUEST_TRANSITIONS ? [{ status: f.status as ProcurementStatus }] : []),
      ...(f.q ? [{ OR: [{ title: { contains: f.q, mode: "insensitive" as const } }, { number: { contains: f.q.toUpperCase() } }] }] : [])
    ]
  };
  const [items, total] = await Promise.all([
    prisma.procurementRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * 30, take: 30, include: { department: { select: { name: true, nameAr: true } }, project: { select: { id: true, name: true, number: true } }, _count: { select: { items: true } } } }),
    prisma.procurementRequest.count({ where })
  ]);
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(items.map((i) => i.requesterId))] } }, select: { id: true, name: true, nameAr: true } });
  return { items, total, page: f.page, pageSize: 30, filters: f, people };
}

export async function getRequest(ctx: Ctx, id: string) {
  const r = await prisma.procurementRequest.findFirst({
    where: { AND: [{ id, organizationId: ctx.organizationId }, await requestWhere(ctx)] },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      department: { select: { id: true, name: true, nameAr: true } },
      project: { select: { id: true, name: true, number: true } },
      preferredVendor: { select: { id: true, name: true } },
      purchaseOrders: { orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, total: true, currency: true, vendor: { select: { name: true } } } }
    }
  });
  if (!r) throw notFound("ProcurementRequest");
  const [approval, people] = await Promise.all([
    r.approvalId ? prisma.approval.findUnique({ where: { id: r.approvalId }, select: { id: true, status: true, assigneeId: true, requiredPermission: true } }) : null,
    prisma.user.findMany({ where: { id: { in: [r.requesterId, r.approvedById].filter(Boolean) as string[] } }, select: { id: true, name: true, nameAr: true } })
  ]);
  return { request: r, approval, people, can: { edit: r.requesterId === ctx.userId && ["DRAFT", "REJECTED"].includes(r.status), order: can(ctx, "procurement.orders.create") && ["APPROVED", "ORDERING", "ORDERED"].includes(r.status) } };
}

