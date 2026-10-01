import { z } from "zod";
import type { Prisma, ProjectRole, ProjectStatus } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { nextYearlyNumber } from "../crm/sequence";
import { ownedWhere } from "../crm/scope";
import { systemActivity } from "../crm/activities";
import { optDate, optId, optText, parseListParams, reqText } from "../crm/normalize";
import { Decimal } from "@/lib/commercial/calc";
import { addDays, todayIn, yearIn, ymd } from "../commercial/dates";
import { applyTemplateTx } from "./templates";
import { canSeeCommercial, isClosed, projectAccess, projectScopeOf, projectWhere, requireManager } from "./access";
import { recomputeProject, touchProject } from "./engine";

/**
 * Projects (Phase 4) — docs/PROJECTS.md.
 *
 * Creation paths:
 *   A. ACTIVE / EXPIRING contract → project (preferred)
 *   B. ACCEPTED quotation → project, only when Organization.projectFromQuotationAllowed and no
 *      live contract exists for that version (a contract always wins)
 *   C. INTERNAL project, only when Organization.internalProjectsAllowed
 * One live project per contract / accepted version (partial unique indexes + row lock).
 * Commercial context is copied (snapshot) — later catalog/quotation changes never alter it.
 */

export const PROJECT_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  DRAFT: ["PLANNING", "CANCELLED"],
  PLANNING: ["ACTIVE", "ON_HOLD", "CANCELLED", "DRAFT"],
  ACTIVE: ["WAITING_CLIENT", "BLOCKED", "AT_RISK", "ON_HOLD", "CANCELLED"],
  WAITING_CLIENT: ["ACTIVE", "BLOCKED", "AT_RISK", "ON_HOLD", "CANCELLED"],
  BLOCKED: ["ACTIVE", "WAITING_CLIENT", "ON_HOLD", "CANCELLED"],
  AT_RISK: ["ACTIVE", "WAITING_CLIENT", "BLOCKED", "ON_HOLD", "CANCELLED"],
  ON_HOLD: ["ACTIVE", "PLANNING", "CANCELLED"],
  COMPLETED: ["ACTIVE", "ARCHIVED"],
  CANCELLED: ["ARCHIVED"],
  ARCHIVED: []
};
/** Completion is only possible through completeProject() from these states. */
export const COMPLETABLE: ProjectStatus[] = ["ACTIVE", "AT_RISK", "WAITING_CLIENT"];
const REASON_REQUIRED: ProjectStatus[] = ["BLOCKED", "ON_HOLD", "CANCELLED"];

const label = (p: { number: string; name: string }) => `${p.number} · ${p.name}`;
const activity = (p: { id: string; number: string; name: string }) => ({ entityLabel: label(p), href: `/app/projects/${p.id}`, visibility: "projects.records.all" as const });

/** CRM timeline entry for client projects (the client/opportunity story continues). */
async function crmTrail(tx: Tx, ctx: Ctx, p: { id: string; number: string; name: string; clientId: string | null; opportunityId: string | null }, title: string, metadata: Record<string, unknown> = {}) {
  if (!p.clientId) return;
  await systemActivity(tx, ctx, { entityType: p.opportunityId ? "OPPORTUNITY" : "CLIENT", entityId: p.opportunityId ?? p.clientId, clientId: p.clientId, type: "STATUS_CHANGE", title, metadata: { projectId: p.id, projectNumber: p.number, ...metadata } });
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const createSchema = z.object({
  source: z.enum(["contract", "quotation", "internal"]),
  contractId: optId,
  quotationId: optId,
  name: optText(200),
  description: optText(4000),
  templateId: optId,
  /** template milestones, the contract's commercial milestones as operational ones, or none */
  milestoneSource: z.enum(["template", "contract", "none"]).default("template"),
  projectManagerId: optId,
  departmentId: optId,
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  startDate: optDate,
  targetEndDate: optDate,
  language: z.enum(["ar", "en"]).optional()
});
export type CreateProjectInput = z.input<typeof createSchema>;

export async function createProject(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "projects.create");
  const input = createSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
    const today = todayIn(org.timezone);
    const language = input.language ?? org.defaultLocale;
    let base: Prisma.ProjectUncheckedCreateInput;
    let contractMilestones: { id: string; title: string; dueDate: Date | null; percentage: Prisma.Decimal | null }[] = [];

    if (input.source === "contract") {
      if (!input.contractId) throw invalid("CONTRACT_REQUIRED");
      await tx.$queryRaw`SELECT id FROM "Contract" WHERE id = ${input.contractId} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
      // commercial record must be visible to the creator (commercial scope)
      const c = await tx.contract.findFirst({
        where: { id: input.contractId, organizationId: ctx.organizationId, ...(can(ctx, "sales.contracts.view") ? await ownedWhere(ctx) : { id: "__none__" }) },
        include: { milestones: { orderBy: { sortOrder: "asc" } }, quotationVersion: { include: { items: { orderBy: { sortOrder: "asc" } } } }, opportunity: { select: { serviceId: true } } }
      });
      if (!c) throw notFound("Contract");
      if (c.status !== "ACTIVE" && c.status !== "EXPIRING") throw conflict(`CONTRACT_NOT_ACTIVE:${c.status}`);
      const existing = await tx.project.findFirst({ where: { contractId: c.id, status: { not: "CANCELLED" } }, select: { number: true } });
      if (existing) throw conflict(`PROJECT_EXISTS:${existing.number}`);
      contractMilestones = c.milestones.filter((m) => m.status !== "CANCELLED");
      const serviceId = c.quotationVersion?.items.find((i) => i.serviceId)?.serviceId ?? c.opportunity?.serviceId ?? null;
      base = {
        organizationId: ctx.organizationId,
        number: "",
        type: "CLIENT",
        clientId: c.clientId,
        opportunityId: c.opportunityId,
        quotationId: c.quotationId,
        quotationVersionId: c.quotationVersionId,
        contractId: c.id,
        serviceId,
        name: input.name ?? c.title,
        scopeSummary: c.scopeOfWork,
        deliveryTerms: c.quotationVersion?.deliveryTerms ?? null,
        startDate: input.startDate ?? c.startDate ?? today,
        targetEndDate: input.targetEndDate ?? c.endDate ?? null,
        budgetAmount: new Decimal(c.subtotal.toString()).minus(c.discountTotal.toString()).toFixed(2),
        currency: c.currency
      };
    } else if (input.source === "quotation") {
      if (!org.projectFromQuotationAllowed) throw forbidden("POLICY_PROJECT_REQUIRES_CONTRACT");
      if (!input.quotationId) throw invalid("QUOTATION_REQUIRED");
      await tx.$queryRaw`SELECT id FROM "Quotation" WHERE id = ${input.quotationId} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
      const q = await tx.quotation.findFirst({
        where: { id: input.quotationId, organizationId: ctx.organizationId, ...(can(ctx, "sales.quotations.view") ? await ownedWhere(ctx) : { id: "__none__" }) },
        include: { opportunity: { select: { serviceId: true, title: true } }, client: { select: { displayName: true } } }
      });
      if (!q) throw notFound("Quotation");
      if (q.status !== "ACCEPTED" || !q.acceptedVersionId) throw conflict("QUOTE_NOT_ACCEPTED");
      const contract = await tx.contract.findFirst({ where: { quotationVersionId: q.acceptedVersionId, status: { not: "CANCELLED" } }, select: { number: true } });
      if (contract) throw conflict(`USE_CONTRACT:${contract.number}`);
      const existing = await tx.project.findFirst({ where: { quotationVersionId: q.acceptedVersionId, status: { not: "CANCELLED" } }, select: { number: true } });
      if (existing) throw conflict(`PROJECT_EXISTS:${existing.number}`);
      const v = await tx.quotationVersion.findUniqueOrThrow({ where: { id: q.acceptedVersionId }, include: { items: { orderBy: { sortOrder: "asc" } } } });
      base = {
        organizationId: ctx.organizationId,
        number: "",
        type: "CLIENT",
        clientId: q.clientId,
        opportunityId: q.opportunityId,
        quotationId: q.id,
        quotationVersionId: v.id,
        serviceId: v.items.find((i) => i.serviceId)?.serviceId ?? q.opportunity?.serviceId ?? null,
        name: input.name ?? q.opportunity?.title ?? `${q.client.displayName} — ${q.number}`,
        scopeSummary: v.items.map((i) => `• ${i.name}`).join("\n"),
        deliveryTerms: v.deliveryTerms,
        startDate: input.startDate ?? today,
        targetEndDate: input.targetEndDate ?? null,
        budgetAmount: new Decimal(v.subtotal.toString()).minus(v.discountTotal.toString()).toFixed(2),
        currency: v.currency
      };
    } else {
      if (!org.internalProjectsAllowed) throw forbidden("POLICY_NO_INTERNAL_PROJECTS");
      if (!input.name) throw invalid("NAME_REQUIRED");
      base = { organizationId: ctx.organizationId, number: "", type: "INTERNAL", name: input.name, startDate: input.startDate ?? today, targetEndDate: input.targetEndDate ?? null, currency: org.currency };
    }

    const pmId = input.projectManagerId ?? ctx.userId;
    if (pmId !== ctx.userId) {
      requirePermission(ctx, "projects.manage_team");
      if (!(await tx.user.findFirst({ where: { id: pmId, organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null } }))) throw invalid("UNKNOWN_USER");
    }
    if (input.departmentId && !(await tx.department.findFirst({ where: { id: input.departmentId, organizationId: ctx.organizationId, deletedAt: null } }))) throw invalid("UNKNOWN_DEPARTMENT");
    const start = (base.startDate as Date | null) ?? today;
    if (base.targetEndDate && (base.targetEndDate as Date) < start) throw invalid("TARGET_BEFORE_START");
    let templateId = input.milestoneSource === "template" ? (input.templateId ?? null) : null;
    if (input.milestoneSource === "template" && !templateId && base.serviceId) {
      templateId = (await tx.projectTemplate.findFirst({ where: { organizationId: ctx.organizationId, serviceId: base.serviceId as string, active: true }, select: { id: true } }))?.id ?? null;
    }

    const number = await nextYearlyNumber(tx, ctx.organizationId, "PRJ", yearIn(org.timezone));
    const p = await tx.project.create({
      data: { ...base, number, description: input.description ?? null, priority: input.priority, projectManagerId: pmId, departmentId: input.departmentId ?? null, templateId, status: "PLANNING", createdById: ctx.userId || null }
    });
    await tx.projectMember.create({ data: { projectId: p.id, userId: pmId, role: "PROJECT_MANAGER", addedById: ctx.userId || null } });

    let structure = { milestones: 0, tasks: 0 };
    if (templateId) structure = await applyTemplateTx(tx, { organizationId: ctx.organizationId, projectId: p.id, templateId, start, language, createdById: ctx.userId || null });
    else if (input.milestoneSource === "contract" && contractMilestones.length) {
      const equal = Math.max(1, Math.round(100 / contractMilestones.length));
      let n = 0;
      for (const m of contractMilestones) {
        await tx.projectMilestone.create({
          data: { projectId: p.id, title: m.title, contractMilestoneId: m.id, weight: Math.min(100, Math.max(1, m.percentage ? Math.round(Number(m.percentage)) : equal)), dueDate: m.dueDate ?? addDays(start, 30 * (n + 1)), sortOrder: n++ }
        });
      }
      structure.milestones = contractMilestones.length;
    }
    await recomputeProject(tx, p.id);
    await uow.audit({
      action: "project.created",
      entityType: "Project",
      entityId: p.id,
      after: { number, source: input.source, contractId: p.contractId, quotationVersionId: p.quotationVersionId, clientId: p.clientId, projectManagerId: pmId, templateId, startDate: ymd(p.startDate), targetEndDate: ymd(p.targetEndDate), ...structure }
    });
    uow.emit({ type: "project.created", entityType: "Project", entityId: p.id, payload: { projectId: p.id, number, name: p.name, source: input.source, contractId: p.contractId, ownerId: pmId }, activity: activity(p) });
    await crmTrail(tx, ctx, p, "project.created");
    return { id: p.id, number };
  });
}

// ---------------------------------------------------------------------------
// Update / status / completion
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  name: reqText(2, 200).optional(),
  description: optText(4000),
  scopeSummary: optText(20000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  startDate: optDate,
  targetEndDate: optDate,
  projectManagerId: optId,
  departmentId: optId
});

export async function updateProject(ctx: Ctx, id: string, raw: unknown) {
  const input = updateSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const { project: p } = await requireManager(tx, ctx, id, "projects.edit", { lock: true });
    if (isClosed(p.status)) throw conflict(`PROJECT_CLOSED:${p.status}`);
    const data: Prisma.ProjectUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.scopeSummary !== undefined) data.scopeSummary = input.scopeSummary;
    if (input.priority) data.priority = input.priority;
    if (input.startDate !== undefined) data.startDate = input.startDate;
    if (input.targetEndDate !== undefined) data.targetEndDate = input.targetEndDate;
    if (input.departmentId !== undefined) data.departmentId = input.departmentId;
    const pmChanged = input.projectManagerId && input.projectManagerId !== p.projectManagerId;
    if (pmChanged) {
      requirePermission(ctx, "projects.manage_team");
      const u = await tx.user.findFirst({ where: { id: input.projectManagerId!, organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null } });
      if (!u) throw invalid("UNKNOWN_USER");
      data.projectManagerId = u.id;
      await tx.projectMember.upsert({ where: { projectId_userId: { projectId: id, userId: u.id } }, update: { role: "PROJECT_MANAGER", leftAt: null }, create: { projectId: id, userId: u.id, role: "PROJECT_MANAGER", addedById: ctx.userId } });
    }
    const start = (data.startDate as Date | null | undefined) ?? p.startDate;
    const end = (data.targetEndDate as Date | null | undefined) ?? p.targetEndDate;
    if (start && end && end < start) throw invalid("TARGET_BEFORE_START");
    const after = await tx.project.update({ where: { id }, data });
    const datesChanged = ymd(p.startDate) !== ymd(after.startDate) || ymd(p.targetEndDate) !== ymd(after.targetEndDate);
    await uow.audit({
      action: pmChanged ? "project.manager_changed" : datesChanged ? "project.dates_changed" : "project.updated",
      entityType: "Project",
      entityId: id,
      before: { name: p.name, priority: p.priority, startDate: ymd(p.startDate), targetEndDate: ymd(p.targetEndDate), projectManagerId: p.projectManagerId },
      after: { name: after.name, priority: after.priority, startDate: ymd(after.startDate), targetEndDate: ymd(after.targetEndDate), projectManagerId: after.projectManagerId }
    });
    if (pmChanged) uow.emit({ type: "project.member_added", entityType: "Project", entityId: id, payload: { projectId: id, number: p.number, name: p.name, userId: after.projectManagerId, role: "PROJECT_MANAGER" } });
    await touchProject(tx, id, uow);
  });
}

const statusSchema = z.object({ to: z.enum(["DRAFT", "PLANNING", "ACTIVE", "WAITING_CLIENT", "BLOCKED", "AT_RISK", "ON_HOLD", "COMPLETED", "CANCELLED", "ARCHIVED"]), reason: optText(1000), from: z.string().optional() });

export async function changeProjectStatus(ctx: Ctx, id: string, raw: unknown) {
  const input = statusSchema.parse(raw);
  if (input.to === "COMPLETED") throw invalid("USE_COMPLETE_PROJECT");
  return unitOfWork(ctx, async (tx, uow) => {
    const { project: p } = await requireManager(tx, ctx, id, input.to === "ARCHIVED" ? "projects.archive" : "projects.change_status", { lock: true });
    if (input.from && input.from !== p.status) throw conflict("PROJECT_STALE");
    if (!PROJECT_TRANSITIONS[p.status].includes(input.to)) throw conflict(`PROJECT_INVALID_TRANSITION:${p.status}->${input.to}`);
    if ((REASON_REQUIRED.includes(input.to) || p.status === "COMPLETED") && (!input.reason || input.reason.trim().length < 3)) throw invalid("REASON_REQUIRED");
    if (input.to === "WAITING_CLIENT" && !(await tx.projectDependency.count({ where: { projectId: id, ownerSide: "CLIENT", status: { in: ["OPEN", "WAITING"] } } }))) throw conflict("NO_OPEN_CLIENT_DEPENDENCY");
    if (p.status === "COMPLETED") requirePermission(ctx, "projects.complete"); // reopening a completed project
    const now = new Date();
    await tx.project.update({
      where: { id },
      data: {
        status: input.to,
        statusReason: input.reason ?? null,
        ...(input.to === "ACTIVE" && !p.startedAt ? { startedAt: now } : {}),
        ...(input.to === "CANCELLED" ? { cancelledAt: now } : {}),
        ...(input.to === "ARCHIVED" ? { archivedAt: now } : {}),
        ...(p.status === "COMPLETED" ? { completedAt: null, completedById: null, completionOverride: null } : {})
      }
    });
    await uow.audit({ action: "project.status_changed", entityType: "Project", entityId: id, before: { status: p.status }, after: { status: input.to, reason: input.reason } });
    uow.emit({ type: "project.status_changed", entityType: "Project", entityId: id, payload: { projectId: id, number: p.number, from: p.status, to: input.to, reason: input.reason } });
    if (input.to === "ACTIVE" && !p.startedAt) uow.emit({ type: "project.started", entityType: "Project", entityId: id, payload: { projectId: id, number: p.number, name: p.name }, activity: activity(p) });
    if (input.to === "CANCELLED") uow.emit({ type: "project.cancelled", entityType: "Project", entityId: id, payload: { projectId: id, number: p.number, reason: input.reason }, activity: activity(p) });
    await crmTrail(tx, ctx, p, `project.status_${input.to.toLowerCase()}`, { reason: input.reason });
    await touchProject(tx, id, uow);
  });
}

/** What still prevents completion (empty = completable). */
export async function completionBlockers(db: Tx | typeof prisma, projectId: string) {
  // sequential: may run on a transaction connection
  const milestones = await db.projectMilestone.findMany({ where: { projectId, required: true, status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { title: true } });
  const deliverables = await db.projectDeliverable.findMany({ where: { projectId, required: true, OR: [{ status: { notIn: ["DELIVERED", "ACCEPTED"] } }, { status: "DELIVERED", clientApprovalRequired: true }] }, select: { name: true, status: true } });
  const blockedTasks = await db.task.count({ where: { projectId, status: "BLOCKED", archivedAt: null } });
  const deps = await db.projectDependency.findMany({ where: { projectId, critical: true, status: { in: ["OPEN", "WAITING"] } }, select: { title: true } });
  const out: { code: string; params: Record<string, string | number> }[] = [];
  for (const m of milestones) out.push({ code: "MILESTONE_OPEN", params: { title: m.title } });
  for (const d of deliverables) out.push({ code: "DELIVERABLE_UNRESOLVED", params: { title: d.name, status: d.status } });
  if (blockedTasks) out.push({ code: "TASKS_BLOCKED", params: { count: blockedTasks } });
  for (const d of deps) out.push({ code: "CRITICAL_DEPENDENCY_OPEN", params: { title: d.title } });
  return out;
}

const completeSchema = z.object({ overrideReason: optText(2000), from: z.string().optional() });

/** Explicit completion. Blockers stop it unless an override reason (≥ 10 chars) is given — audited. */
export async function completeProject(ctx: Ctx, id: string, raw: unknown = {}) {
  const input = completeSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const { project: p } = await requireManager(tx, ctx, id, "projects.complete", { lock: true });
    if (input.from && input.from !== p.status) throw conflict("PROJECT_STALE");
    if (!COMPLETABLE.includes(p.status)) throw conflict(`PROJECT_INVALID_TRANSITION:${p.status}->COMPLETED`);
    const blockers = await completionBlockers(tx, id);
    const override = input.overrideReason?.trim();
    if (blockers.length && (!override || override.length < 10)) throw conflict(`PROJECT_NOT_COMPLETABLE:${blockers.map((b) => b.code).join(",")}`);
    const now = new Date();
    await tx.project.update({ where: { id }, data: { status: "COMPLETED", completedAt: now, completedById: ctx.userId, completionOverride: blockers.length ? override : null, statusReason: null } });
    await uow.audit({ action: blockers.length ? "project.completed_override" : "project.completed", entityType: "Project", entityId: id, before: { status: p.status }, after: { status: "COMPLETED", blockers, overrideReason: blockers.length ? override : undefined } });
    uow.emit({ type: "project.completed", entityType: "Project", entityId: id, payload: { projectId: id, number: p.number, name: p.name, override: Boolean(blockers.length), contractId: p.contractId }, activity: activity(p) });
    await crmTrail(tx, ctx, p, "project.completed");
    await recomputeProject(tx, id);
  });
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

const ROLES = ["PROJECT_MANAGER", "TECH_LEAD", "DEVELOPER", "DESIGNER", "MARKETING", "QA", "ACCOUNT_MANAGER", "CONTRIBUTOR", "OBSERVER"] as const;
const memberSchema = z.object({ userId: z.string().min(1), role: z.enum(ROLES).default("CONTRIBUTOR"), allocationPercent: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).max(100).nullable()).optional() });

export async function addProjectMember(ctx: Ctx, projectId: string, raw: unknown) {
  const input = memberSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const { project: p } = await requireManager(tx, ctx, projectId, "projects.manage_team", { lock: true });
    if (isClosed(p.status)) throw conflict(`PROJECT_CLOSED:${p.status}`);
    const u = await tx.user.findFirst({ where: { id: input.userId, organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null }, select: { id: true, name: true } });
    if (!u) throw invalid("UNKNOWN_USER");
    const before = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: u.id } } });
    await tx.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: u.id } },
      update: { role: input.role as ProjectRole, allocationPercent: input.allocationPercent ?? null, leftAt: null },
      create: { projectId, userId: u.id, role: input.role as ProjectRole, allocationPercent: input.allocationPercent ?? null, addedById: ctx.userId }
    });
    await uow.audit({ action: before && !before.leftAt ? "project.member_updated" : "project.member_added", entityType: "Project", entityId: projectId, before: before ? { userId: u.id, role: before.role, allocationPercent: before.allocationPercent, leftAt: before.leftAt } : undefined, after: { userId: u.id, role: input.role, allocationPercent: input.allocationPercent } });
    if (!before || before.leftAt) uow.emit({ type: "project.member_added", entityType: "Project", entityId: projectId, payload: { projectId, number: p.number, name: p.name, userId: u.id, role: input.role } });
    await touchProject(tx, projectId, uow);
  });
}

export async function removeProjectMember(ctx: Ctx, projectId: string, userId: string) {
  return unitOfWork(ctx, async (tx, uow) => {
    const { project: p } = await requireManager(tx, ctx, projectId, "projects.manage_team", { lock: true });
    if (userId === p.projectManagerId) throw conflict("CANNOT_REMOVE_PROJECT_MANAGER");
    const m = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
    if (!m || m.leftAt) throw notFound("ProjectMember");
    await tx.projectMember.update({ where: { id: m.id }, data: { leftAt: new Date() } });
    const openTasks = await tx.task.count({ where: { projectId, assigneeId: userId, status: { notIn: ["DONE", "CANCELLED"] } } });
    await uow.audit({ action: "project.member_removed", entityType: "Project", entityId: projectId, before: { userId, role: m.role }, after: { leftAt: new Date().toISOString(), openTasksStillAssigned: openTasks } });
    uow.emit({ type: "project.member_removed", entityType: "Project", entityId: projectId, payload: { projectId, number: p.number, userId } });
    await touchProject(tx, projectId, uow);
    return { openTasks };
  });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const PROJECTS_PAGE_SIZE = 25;
const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  view: z.enum(["all", "mine", "at_risk", "completed"]).default("all"),
  status: z.enum(["DRAFT", "PLANNING", "ACTIVE", "WAITING_CLIENT", "BLOCKED", "AT_RISK", "ON_HOLD", "COMPLETED", "CANCELLED", "ARCHIVED", "open"]).optional(),
  health: z.enum(["HEALTHY", "NEEDS_ATTENTION", "AT_RISK"]).optional(),
  pm: z.string().max(40).optional(),
  client: z.string().max(40).optional(),
  sort: z.enum(["updatedAt", "targetEndDate", "progress", "number", "name"]).default("updatedAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1)
});
const OPEN_STATES: ProjectStatus[] = ["DRAFT", "PLANNING", "ACTIVE", "WAITING_CLIENT", "BLOCKED", "AT_RISK", "ON_HOLD"];

export async function listProjects(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "projects.view");
  const f = parseListParams(listSchema, raw);
  const scope = await projectWhere(ctx);
  const and: Prisma.ProjectWhereInput[] = [...(scope.AND ?? [])];
  if (f.view === "mine") and.push({ OR: [{ projectManagerId: ctx.userId }, { members: { some: { userId: ctx.userId, leftAt: null } } }] });
  if (f.view === "at_risk") and.push({ health: "AT_RISK", status: { in: OPEN_STATES } });
  if (f.view === "completed") and.push({ status: "COMPLETED" });
  if (f.view === "all" && !f.status) and.push({ status: { not: "ARCHIVED" } });
  if (f.status === "open") and.push({ status: { in: OPEN_STATES } });
  else if (f.status) and.push({ status: f.status });
  if (f.health) and.push({ health: f.health });
  if (f.pm) and.push({ projectManagerId: f.pm === "me" ? ctx.userId : f.pm });
  if (f.client) and.push({ clientId: f.client });
  if (f.q) and.push({ OR: [{ number: { contains: f.q.toUpperCase() } }, { name: { contains: f.q, mode: "insensitive" } }, { client: { displayName: { contains: f.q, mode: "insensitive" } } }] });
  const where: Prisma.ProjectWhereInput = { organizationId: ctx.organizationId, AND: and };
  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: f.sort === "targetEndDate" ? [{ targetEndDate: { sort: f.dir, nulls: "last" } }] : [{ [f.sort]: f.dir }],
      skip: (f.page - 1) * PROJECTS_PAGE_SIZE,
      take: PROJECTS_PAGE_SIZE,
      include: { client: { select: { id: true, displayName: true } }, service: { select: { nameAr: true, nameEn: true } }, projectManager: { select: { id: true, name: true, nameAr: true } } }
    }),
    prisma.project.count({ where })
  ]);
  return { items, total, page: f.page, pageSize: PROJECTS_PAGE_SIZE, view: f.view };
}

/** Workspace data. Commercial fields are returned ONLY when the caller may see them. */
export async function getProject(ctx: Ctx, id: string) {
  requirePermission(ctx, "projects.view");
  const a = await projectAccess(prisma, ctx, id);
  const p = await prisma.project.findUniqueOrThrow({
    where: { id },
    include: {
      client: { select: { id: true, number: true, displayName: true } },
      service: { select: { id: true, nameAr: true, nameEn: true } },
      template: { select: { nameAr: true, nameEn: true } },
      department: { select: { name: true, nameAr: true } },
      projectManager: { select: { id: true, name: true, nameAr: true } },
      members: { where: { leftAt: null }, include: { user: { select: { id: true, name: true, nameAr: true, jobTitle: true } } }, orderBy: { joinedAt: "asc" } },
      milestones: { orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }], include: { owner: { select: { name: true, nameAr: true } }, contractMilestone: { select: { id: true, title: true } }, _count: { select: { tasks: true } } } },
      deliverables: { orderBy: { createdAt: "asc" }, include: { owner: { select: { name: true, nameAr: true } }, milestone: { select: { title: true } } } },
      dependencies: { orderBy: [{ status: "asc" }, { dueDate: "asc" }] }
    }
  });
  const commercialAllowed = canSeeCommercial(ctx);
  const { budgetAmount, quotationId, quotationVersionId, contractId, ...operational } = p;
  return {
    project: operational,
    access: { manager: a.manager, member: a.member, scope: projectScopeOf(ctx) },
    commercial: commercialAllowed ? { budgetAmount: budgetAmount?.toFixed(2) ?? null, quotationId, quotationVersionId, contractId } : null,
    hasCommercialSource: Boolean(contractId || quotationId)
  };
}

export async function projectOptions(ctx: Ctx, perm: "projects.tasks.create" | "projects.time.create" | "projects.milestones.manage") {
  if (!can(ctx, perm)) return [];
  const scope = await projectWhere(ctx);
  const rows = await prisma.project.findMany({
    where: { organizationId: ctx.organizationId, status: { in: OPEN_STATES }, AND: [...(scope.AND ?? [])] },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, number: true, name: true, projectManagerId: true, members: { where: { userId: ctx.userId, leftAt: null }, select: { id: true } } }
  });
  const all = projectScopeOf(ctx) === "ALL";
  return rows.filter((r) => all || r.projectManagerId === ctx.userId || r.members.length || perm !== "projects.milestones.manage").map((r) => ({ id: r.id, label: `${r.number} · ${r.name}` }));
}

