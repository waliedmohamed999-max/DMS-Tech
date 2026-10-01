import { z } from "zod";
import type { ApprovalStatus, Priority } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork, type Uow } from "../events/bus";
import type { Permission } from "../rbac/permissions";

/**
 * Approval center.
 *
 * An approval is created by a module (requestApproval) with a `type`. When a user with
 * `approvals.decide` + the approval's `requiredPermission` approves it, the handler
 * registered for that type applies the change inside the same transaction.
 * Requesters can never approve their own request.
 */

export type ApprovalHandler = {
  /** Apply the approved change. Runs inside the decision transaction. */
  onApproved(tx: Tx, uow: Uow, approval: { id: string; entityId: string; payload: unknown; organizationId: string; requestedById: string }, ctx: Ctx): Promise<void>;
  onRejected?(tx: Tx, uow: Uow, approval: { id: string; entityId: string; payload: unknown; decisionComment?: string | null }, ctx: Ctx): Promise<void>;
  /** Requester withdrew the request (e.g. a quotation pulled back for editing). */
  onCancelled?(tx: Tx, uow: Uow, approval: { id: string; entityId: string; payload: unknown }, ctx: Ctx): Promise<void>;
};

const handlers = new Map<string, ApprovalHandler>();
export const registerApprovalHandler = (type: string, h: ApprovalHandler) => handlers.set(type, h);

export type RequestApprovalInput = {
  type: string;
  entityType: string;
  entityId: string;
  title: string;
  summary?: string;
  payload?: Record<string, unknown>;
  requiredPermission: Permission;
  priority?: Priority;
  amount?: number;
  currency?: string;
  assigneeId?: string;
  dueAt?: Date;
};

/** For use inside another module's unit of work. */
export async function requestApprovalTx(tx: Tx, uow: Uow, ctx: Ctx, input: RequestApprovalInput) {
  if (!handlers.has(input.type)) throw invalid(`No approval handler for ${input.type}`);
  const open = await tx.approval.findFirst({
    where: { organizationId: ctx.organizationId, type: input.type, entityId: input.entityId, status: "PENDING", payload: { equals: (input.payload ?? {}) as object } }
  });
  if (open) throw conflict("APPROVAL_ALREADY_PENDING");

  const a = await tx.approval.create({
    data: {
      organizationId: ctx.organizationId,
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      title: input.title,
      summary: input.summary,
      payload: (input.payload ?? {}) as object,
      requiredPermission: input.requiredPermission,
      priority: input.priority ?? "MEDIUM",
      amount: input.amount,
      currency: input.currency,
      requestedById: ctx.userId,
      assigneeId: input.assigneeId,
      dueAt: input.dueAt
    }
  });
  await uow.audit({ action: "approval.requested", entityType: "Approval", entityId: a.id, after: a });
  uow.emit({
    type: "approval.requested",
    entityType: "Approval",
    entityId: a.id,
    payload: { approvalId: a.id, title: a.title, requiredPermission: a.requiredPermission, priority: a.priority, assigneeId: a.assigneeId },
    activity: { entityLabel: a.title, href: `/app/approvals?focus=${a.id}`, visibility: "approvals.decide" }
  });
  return a;
}

const listSchema = z.object({
  view: z.enum(["mine", "pending", "approved", "rejected", "requested"]).default("mine"),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1)
});
export const APPROVALS_PAGE_SIZE = 20;

export async function listApprovals(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "approvals.view");
  const { view, q, page } = listSchema.parse(raw ?? {});
  const decider = can(ctx, "approvals.decide");
  const myPerms = [...ctx.permissions];

  const statusFor: Record<string, ApprovalStatus | undefined> = { mine: "PENDING", pending: "PENDING", approved: "APPROVED", rejected: "REJECTED" };
  const where = {
    organizationId: ctx.organizationId,
    ...(statusFor[view] ? { status: statusFor[view] } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    // visibility: deciders see what they could decide; everyone sees their own requests
    ...(view === "requested"
      ? { requestedById: ctx.userId }
      : view === "mine"
        ? { requiredPermission: { in: myPerms }, requestedById: { not: ctx.userId }, OR: [{ assigneeId: null }, { assigneeId: ctx.userId }], ...(decider ? {} : { id: "__none__" }) }
        : decider
          ? { OR: [{ requiredPermission: { in: myPerms } }, { requestedById: ctx.userId }] }
          : { requestedById: ctx.userId })
  };

  const [items, total] = await Promise.all([
    prisma.approval.findMany({
      where,
      orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * APPROVALS_PAGE_SIZE,
      take: APPROVALS_PAGE_SIZE,
      include: { requestedBy: { select: { id: true, name: true } }, decidedBy: { select: { id: true, name: true } } }
    }),
    prisma.approval.count({ where })
  ]);
  return { items, total, page, pageSize: APPROVALS_PAGE_SIZE };
}

export async function countPendingForMe(ctx: Ctx) {
  if (!can(ctx, "approvals.decide")) return 0;
  return prisma.approval.count({
    where: { organizationId: ctx.organizationId, status: "PENDING", requiredPermission: { in: [...ctx.permissions] }, requestedById: { not: ctx.userId }, OR: [{ assigneeId: null }, { assigneeId: ctx.userId }] }
  });
}

const decideSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().trim().max(1000).optional()
});

export async function decideApproval(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "approvals.decide");
  const input = decideSchema.parse(raw);
  if (input.decision === "REJECTED" && !input.comment) throw invalid("REJECTION_REASON_REQUIRED");

  return unitOfWork(ctx, async (tx, uow) => {
    const a = await tx.approval.findFirst({ where: { id: input.approvalId, organizationId: ctx.organizationId } });
    if (!a) throw notFound("Approval");
    if (a.status !== "PENDING") throw conflict("APPROVAL_ALREADY_DECIDED");
    if (a.requestedById === ctx.userId) throw forbidden("self-approval");
    if (!ctx.permissions.has(a.requiredPermission as Permission)) throw forbidden(a.requiredPermission);

    // optimistic guard against double-decisions
    const res = await tx.approval.updateMany({
      where: { id: a.id, status: "PENDING" },
      data: { status: input.decision, decidedById: ctx.userId, decidedAt: new Date(), decisionComment: input.comment }
    });
    if (res.count !== 1) throw conflict("APPROVAL_ALREADY_DECIDED");

    const h = handlers.get(a.type);
    if (!h) throw invalid(`No approval handler for ${a.type}`);
    if (input.decision === "APPROVED") await h.onApproved(tx, uow, a, ctx);
    else await h.onRejected?.(tx, uow, { ...a, decisionComment: input.comment ?? null }, ctx);

    await uow.audit({
      action: input.decision === "APPROVED" ? "approval.approved" : "approval.rejected",
      entityType: "Approval",
      entityId: a.id,
      before: { status: a.status },
      after: { status: input.decision, comment: input.comment }
    });
    uow.emit({
      type: "approval.decided",
      entityType: "Approval",
      entityId: a.id,
      payload: { approvalId: a.id, title: a.title, status: input.decision, requestedById: a.requestedById },
      activity: { entityLabel: a.title, href: `/app/approvals?focus=${a.id}`, visibility: "approvals.view" }
    });
    return { id: a.id, status: input.decision };
  });
}

export async function cancelApproval(ctx: Ctx, approvalId: string) {
  requirePermission(ctx, "approvals.view");
  return unitOfWork(ctx, (tx, uow) => cancelApprovalTx(tx, uow, ctx, approvalId));
}

/**
 * Cancel a pending approval inside a caller's unit of work. Only the requester may cancel,
 * unless the owning module has already authorised the caller (`allowNonRequester`, e.g. a
 * quotation editor withdrawing a submission). The type's onCancelled hook runs in the same transaction.
 */
export async function cancelApprovalTx(tx: Tx, uow: Uow, ctx: Ctx, approvalId: string, opts: { allowNonRequester?: boolean; runHook?: boolean } = {}) {
  const a = await tx.approval.findFirst({ where: { id: approvalId, organizationId: ctx.organizationId } });
  if (!a) throw notFound("Approval");
  if (a.requestedById !== ctx.userId && !opts.allowNonRequester) throw forbidden("only the requester can cancel");
  const res = await tx.approval.updateMany({ where: { id: a.id, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } });
  if (res.count !== 1) throw conflict("APPROVAL_ALREADY_DECIDED");
  if (opts.runHook !== false) await handlers.get(a.type)?.onCancelled?.(tx, uow, a, ctx);
  await uow.audit({ action: "approval.cancelled", entityType: "Approval", entityId: a.id });
}
