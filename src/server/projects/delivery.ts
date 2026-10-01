import { z } from "zod";
import type { DeliverableStatus } from "@/generated/prisma/client";
import type { Tx } from "../db";
import { requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { optDate, optId, optText, reqText } from "../crm/normalize";
import { ymd } from "../commercial/dates";
import { isClosed, projectAccess, requireManager } from "./access";
import { touchProject } from "./engine";

/**
 * Deliverables and dependencies — docs/PROJECTS.md.
 *
 * Deliverable: DRAFT → IN_PROGRESS → READY (PM notified for review) → DELIVERED →
 *              ACCEPTED | REJECTED (client decision recorded INTERNALLY — not a signature)
 *              REJECTED → IN_PROGRESS. Without client approval, DELIVERED is final.
 * Dependency:  OPEN ⇄ WAITING → RESOLVED | CANCELLED. Client-side ones drive WAITING_CLIENT and health.
 */

export const DELIVERABLE_TRANSITIONS: Record<DeliverableStatus, readonly DeliverableStatus[]> = {
  DRAFT: ["IN_PROGRESS"],
  IN_PROGRESS: ["READY", "DRAFT"],
  READY: ["DELIVERED", "IN_PROGRESS"],
  DELIVERED: ["IN_PROGRESS"],
  ACCEPTED: [],
  REJECTED: ["IN_PROGRESS"]
};

const deliverableSchema = z.object({
  name: reqText(2, 200),
  description: optText(4000),
  milestoneId: optId,
  dueDate: optDate,
  ownerId: optId,
  required: z.boolean().default(true),
  clientApprovalRequired: z.boolean().default(false)
});

async function refs(tx: Tx, ctx: Ctx, projectId: string, input: { milestoneId?: string | null; ownerId?: string | null }) {
  if (input.milestoneId && !(await tx.projectMilestone.findFirst({ where: { id: input.milestoneId, projectId } }))) throw invalid("MILESTONE_NOT_OF_PROJECT");
  if (input.ownerId && !(await tx.projectMember.findFirst({ where: { projectId, userId: input.ownerId, leftAt: null } }))) throw invalid("OWNER_NOT_MEMBER");
}

export async function createDeliverable(ctx: Ctx, projectId: string, raw: unknown) {
  const input = deliverableSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const { project } = await requireManager(tx, ctx, projectId, "projects.deliverables.manage", { lock: true });
    if (isClosed(project.status)) throw conflict(`PROJECT_CLOSED:${project.status}`);
    await refs(tx, ctx, projectId, input);
    const d = await tx.projectDeliverable.create({ data: { ...input, projectId, clientApprovalStatus: input.clientApprovalRequired ? "PENDING" : "NOT_REQUIRED" } });
    await uow.audit({ action: "deliverable.created", entityType: "ProjectDeliverable", entityId: d.id, after: { projectId, name: d.name, clientApprovalRequired: d.clientApprovalRequired } });
    uow.emit({ type: "deliverable.created", entityType: "ProjectDeliverable", entityId: d.id, payload: { projectId, name: d.name } });
    await touchProject(tx, projectId, uow);
    return d;
  });
}

async function loadDeliverable(tx: Tx, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM "ProjectDeliverable" WHERE id = ${id} FOR UPDATE`;
  const d = await tx.projectDeliverable.findUnique({ where: { id } });
  if (!d) throw notFound("ProjectDeliverable");
  const a = await projectAccess(tx, ctx, d.projectId);
  return { d, a };
}

const dStatusSchema = z.object({ to: z.enum(["DRAFT", "IN_PROGRESS", "READY", "DELIVERED"]), from: z.string().optional() });

/** Owner or manager moves the deliverable through its working states. */
export async function setDeliverableStatus(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "projects.deliverables.manage");
  const input = dStatusSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const { d, a } = await loadDeliverable(tx, ctx, id);
    if (!a.manager && d.ownerId !== ctx.userId) throw forbidden("projects.deliverables.manage (owner or manager)");
    if (input.from && input.from !== d.status) throw conflict("DELIVERABLE_STALE");
    if (!DELIVERABLE_TRANSITIONS[d.status].includes(input.to)) throw conflict(`DELIVERABLE_INVALID_TRANSITION:${d.status}->${input.to}`);
    const now = new Date();
    await tx.projectDeliverable.update({
      where: { id },
      data: {
        status: input.to,
        ...(input.to === "DELIVERED" ? { deliveredAt: now } : {}),
        ...(input.to === "IN_PROGRESS" && (d.status === "REJECTED" || d.status === "DELIVERED") ? { clientApprovalStatus: d.clientApprovalRequired ? "PENDING" : "NOT_REQUIRED", rejectedAt: null, readyNotifiedAt: null } : {})
      }
    });
    await uow.audit({ action: `deliverable.${input.to.toLowerCase()}`, entityType: "ProjectDeliverable", entityId: id, before: { status: d.status }, after: { status: input.to } });
    const payload = { projectId: d.projectId, deliverableId: id, name: d.name, ownerId: a.project.projectManagerId };
    if (input.to === "READY") uow.emit({ type: "deliverable.ready", entityType: "ProjectDeliverable", entityId: id, payload });
    if (input.to === "DELIVERED") uow.emit({ type: "deliverable.delivered", entityType: "ProjectDeliverable", entityId: id, payload });
    await touchProject(tx, d.projectId, uow);
  });
}

const decisionSchema = z.object({ decision: z.enum(["ACCEPTED", "REJECTED"]), note: optText(2000), confirm: z.literal(true) });

/**
 * Record the CLIENT's decision on a delivered deliverable (internal record, explicit confirmation).
 * Audited with who recorded it, when, and which deliverable — it is not a digital signature.
 */
export async function recordClientDecision(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "projects.deliverables.manage");
  const input = decisionSchema.parse(raw);
  if (input.decision === "REJECTED" && (!input.note || input.note.trim().length < 3)) throw invalid("REASON_REQUIRED");
  return unitOfWork(ctx, async (tx, uow) => {
    const { d, a } = await loadDeliverable(tx, ctx, id);
    if (!a.manager) throw forbidden("projects.deliverables.manage (project manager only)");
    if (d.status !== "DELIVERED") throw conflict(`DELIVERABLE_NOT_DELIVERED:${d.status}`);
    if (!d.clientApprovalRequired) throw conflict("CLIENT_APPROVAL_NOT_REQUIRED");
    const now = new Date();
    await tx.projectDeliverable.update({
      where: { id },
      data: { status: input.decision, clientApprovalStatus: input.decision === "ACCEPTED" ? "APPROVED" : "REJECTED", approvedAt: input.decision === "ACCEPTED" ? now : null, rejectedAt: input.decision === "REJECTED" ? now : null, clientDecisionNote: input.note ?? null, clientDecisionById: ctx.userId }
    });
    await uow.audit({ action: input.decision === "ACCEPTED" ? "deliverable.client_accepted" : "deliverable.client_rejected", entityType: "ProjectDeliverable", entityId: id, before: { status: d.status }, after: { deliverable: d.name, decision: input.decision, recordedById: ctx.userId, recordedAt: now.toISOString(), note: input.note, method: "manual_record" } });
    uow.emit({ type: input.decision === "ACCEPTED" ? "deliverable.accepted" : "deliverable.rejected", entityType: "ProjectDeliverable", entityId: id, payload: { projectId: d.projectId, name: d.name, note: input.note } });
    await touchProject(tx, d.projectId, uow);
  });
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

const depSchema = z.object({
  title: reqText(2, 200),
  description: optText(4000),
  type: z.enum(["CONTENT", "BRAND_ASSETS", "ACCESS", "CREDENTIALS", "DATA", "APPROVAL", "FEEDBACK", "OTHER"]).default("OTHER"),
  ownerSide: z.enum(["CLIENT", "INTERNAL", "THIRD_PARTY"]).default("CLIENT"),
  critical: z.boolean().default(false),
  dueDate: optDate
});

export async function createDependency(ctx: Ctx, projectId: string, raw: unknown) {
  const input = depSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const { project } = await requireManager(tx, ctx, projectId, "projects.edit", { lock: true });
    if (isClosed(project.status)) throw conflict(`PROJECT_CLOSED:${project.status}`);
    const d = await tx.projectDependency.create({ data: { ...input, projectId, createdById: ctx.userId } });
    await uow.audit({ action: "dependency.created", entityType: "ProjectDependency", entityId: d.id, after: { projectId, title: d.title, ownerSide: d.ownerSide, critical: d.critical, dueDate: ymd(d.dueDate) } });
    uow.emit({ type: "dependency.created", entityType: "ProjectDependency", entityId: d.id, payload: { projectId, title: d.title, ownerSide: d.ownerSide } });
    await touchProject(tx, projectId, uow);
    return d;
  });
}

const depStatusSchema = z.object({ to: z.enum(["OPEN", "WAITING", "RESOLVED", "CANCELLED"]), note: optText(2000) });

export async function setDependencyStatus(ctx: Ctx, id: string, raw: unknown) {
  const input = depStatusSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    await tx.$queryRaw`SELECT id FROM "ProjectDependency" WHERE id = ${id} FOR UPDATE`;
    const d = await tx.projectDependency.findUnique({ where: { id } });
    if (!d) throw notFound("ProjectDependency");
    const { project } = await requireManager(tx, ctx, d.projectId, "projects.edit");
    if (d.status === "RESOLVED" || d.status === "CANCELLED") {
      if (input.to !== "OPEN") throw conflict(`DEPENDENCY_CLOSED:${d.status}`);
    }
    const now = new Date();
    await tx.projectDependency.update({
      where: { id },
      data: { status: input.to, resolvedAt: input.to === "RESOLVED" ? now : null, resolvedById: input.to === "RESOLVED" ? ctx.userId : null, resolutionNote: input.note ?? null, ...(input.to === "OPEN" ? { overdueNotifiedAt: null } : {}) }
    });
    await uow.audit({ action: `dependency.${input.to.toLowerCase()}`, entityType: "ProjectDependency", entityId: id, before: { status: d.status }, after: { status: input.to, note: input.note } });
    if (input.to === "RESOLVED") uow.emit({ type: "dependency.resolved", entityType: "ProjectDependency", entityId: id, payload: { projectId: project.id, title: d.title, ownerSide: d.ownerSide, waitedDays: Math.floor((now.getTime() - d.requestedAt.getTime()) / 86_400_000) } });
    await touchProject(tx, d.projectId, uow);
  });
}
