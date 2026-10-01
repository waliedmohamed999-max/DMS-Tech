import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork, type Uow } from "../events/bus";
import { OPP_STATUSES, SERVICE_KEYS } from "@/lib/crm/services";
import { blankToNull, intPct, money, optDate, optId, optText, reqText, parseListParams } from "./normalize";
import { nextNumber } from "./sequence";
import { clientWhere, ownedWhere } from "./scope";
import { systemActivity } from "./activities";
import { resolveServiceId } from "../commercial/catalog";
import { getDefaultPipeline, pickOpenStage, stageInPipeline } from "./pipeline";

const activityFor = (o: { id: string; number: string; title: string }) => ({ entityLabel: `${o.number} · ${o.title}`, href: `/app/crm/opportunities/${o.id}`, visibility: "crm.opportunities.view" as const });

async function assertOwner(tx: Tx | typeof prisma, ctx: Ctx, ownerId: string | null | undefined) {
  if (!ownerId) return;
  if (ownerId !== ctx.userId && !can(ctx, "crm.opportunities.assign")) throw forbidden("crm.opportunities.assign");
  const u = await tx.user.findFirst({ where: { id: ownerId, organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null } });
  if (!u) throw invalid("UNKNOWN_OWNER");
}

/** Catalog link for opportunities (see linkService in leads.ts). */
async function oppService(ctx: Ctx, serviceId: string | null | undefined, legacyKey: string | null | undefined) {
  if (serviceId) {
    const svc = (await resolveServiceId(ctx, serviceId))!;
    return { serviceId: svc.id, serviceCategory: svc.key && (SERVICE_KEYS as readonly string[]).includes(svc.key) ? svc.key : null };
  }
  if (legacyKey) {
    const svc = await prisma.service.findFirst({ where: { organizationId: ctx.organizationId, key: legacyKey }, select: { id: true } });
    return { serviceId: svc?.id ?? null, serviceCategory: legacyKey };
  }
  return { serviceId: null, serviceCategory: null };
}

async function lockOpp(tx: Tx, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Opportunity" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const o = await tx.opportunity.findFirst({ where: { id, organizationId: ctx.organizationId, ...(await ownedWhere(ctx)) }, include: { stage: true } });
  if (!o) throw notFound("Opportunity");
  return o;
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

const createSchema = z.object({
  clientId: z.string().min(1),
  primaryContactId: optId,
  title: reqText(2, 200),
  description: optText(4000),
  serviceCategory: z.preprocess(blankToNull, z.enum(SERVICE_KEYS).nullable().optional()),
  serviceId: optId,
  estimatedValue: money.optional(),
  currency: z.preprocess(blankToNull, z.string().length(3).toUpperCase().nullable().optional()),
  stageId: optId,
  ownerId: optId,
  expectedCloseDate: optDate,
  nextFollowUpAt: optDate
});

export async function createOpportunity(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "crm.opportunities.create");
  const input = createSchema.parse(raw);
  const ownerId = input.ownerId ?? ctx.userId;
  await assertOwner(prisma, ctx, ownerId);
  const client = await prisma.client.findFirst({ where: { id: input.clientId, organizationId: ctx.organizationId, deletedAt: null, status: { not: "ARCHIVED" }, ...(await clientWhere(ctx)) } });
  if (!client) throw notFound("Client");
  if (input.primaryContactId) {
    const c = await prisma.contact.findFirst({ where: { id: input.primaryContactId, clientId: client.id, deletedAt: null } });
    if (!c) throw invalid("CONTACT_NOT_OF_CLIENT");
  }
  return unitOfWork(ctx, async (tx, uow) => {
    const pipeline = await getDefaultPipeline(tx, ctx.organizationId);
    const stage = input.stageId ? await stageInPipeline(tx, ctx.organizationId, input.stageId) : pickOpenStage(pipeline.stages, "new");
    if (!stage || stage.isWonStage || stage.isLostStage) throw invalid("STAGE_NOT_OPEN");
    const number = await nextNumber(tx, ctx.organizationId, "OPP");
    const o = await tx.opportunity.create({
      data: {
        organizationId: ctx.organizationId,
        number,
        clientId: client.id,
        primaryContactId: input.primaryContactId ?? null,
        title: input.title,
        description: input.description ?? null,
        ...(await oppService(ctx, input.serviceId, input.serviceCategory)),
        estimatedValue: input.estimatedValue ?? "0",
        currency: input.currency ?? "SAR",
        probability: stage.defaultProbability,
        pipelineId: stage.pipelineId,
        stageId: stage.id,
        ownerId,
        expectedCloseDate: input.expectedCloseDate ?? null,
        nextFollowUpAt: input.nextFollowUpAt ?? null,
        createdById: ctx.userId
      }
    });
    await systemActivity(tx, ctx, { entityType: "OPPORTUNITY", entityId: o.id, clientId: client.id, title: "opportunity.created" });
    await uow.audit({ action: "opportunity.created", entityType: "Opportunity", entityId: o.id, after: o });
    uow.emit({ type: "opportunity.created", entityType: "Opportunity", entityId: o.id, payload: { clientId: client.id, value: o.estimatedValue.toString() }, activity: activityFor(o) });
    if (ownerId !== ctx.userId) uow.emit({ type: "opportunity.assigned", entityType: "Opportunity", entityId: o.id, payload: { ownerId, number, title: o.title } });
    return o;
  });
}

const updateSchema = z.object({
  id: z.string().min(1),
  title: reqText(2, 200).optional(),
  description: optText(4000),
  serviceCategory: z.preprocess(blankToNull, z.enum(SERVICE_KEYS).nullable().optional()),
  serviceId: optId,
  estimatedValue: money.optional(),
  currency: z.preprocess(blankToNull, z.string().length(3).toUpperCase().nullable().optional()),
  probability: intPct.optional(),
  primaryContactId: optId,
  ownerId: optId,
  expectedCloseDate: optDate,
  nextFollowUpAt: optDate
});

export async function updateOpportunity(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "crm.opportunities.edit");
  const input = updateSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await lockOpp(tx, ctx, input.id);
    if (before.status === "ARCHIVED") throw conflict("OPPORTUNITY_ARCHIVED");
    const ownerChanged = input.ownerId !== undefined && (input.ownerId ?? null) !== before.ownerId;
    if (ownerChanged) {
      if (!can(ctx, "crm.opportunities.assign")) throw forbidden("crm.opportunities.assign");
      await assertOwner(tx, ctx, input.ownerId);
    }
    if (input.primaryContactId) {
      const c = await tx.contact.findFirst({ where: { id: input.primaryContactId, clientId: before.clientId, deletedAt: null } });
      if (!c) throw invalid("CONTACT_NOT_OF_CLIENT");
    }
    const { id, ...d } = input;
    const after = await tx.opportunity.update({
      where: { id },
      data: {
        ...(d.title !== undefined && { title: d.title }),
        ...(d.description !== undefined && { description: d.description }),
        ...((d.serviceId !== undefined || d.serviceCategory !== undefined) && (await oppService(ctx, d.serviceId, d.serviceCategory))),
        ...(d.estimatedValue !== undefined && d.estimatedValue !== null && { estimatedValue: d.estimatedValue }),
        ...(d.currency && { currency: d.currency }),
        ...(d.probability !== undefined && { probability: d.probability }),
        ...(d.primaryContactId !== undefined && { primaryContactId: d.primaryContactId }),
        ...(d.expectedCloseDate !== undefined && { expectedCloseDate: d.expectedCloseDate }),
        ...(d.nextFollowUpAt !== undefined && { nextFollowUpAt: d.nextFollowUpAt }),
        ...(ownerChanged && { ownerId: input.ownerId ?? null })
      }
    });
    await uow.audit({ action: "opportunity.updated", entityType: "Opportunity", entityId: id, before, after });
    uow.emit({ type: "opportunity.updated", entityType: "Opportunity", entityId: id, payload: { fields: Object.keys(d) } });
    if (ownerChanged) {
      await uow.audit({ action: "opportunity.assigned", entityType: "Opportunity", entityId: id, before: { ownerId: before.ownerId }, after: { ownerId: after.ownerId } });
      await systemActivity(tx, ctx, { entityType: "OPPORTUNITY", entityId: id, clientId: after.clientId, type: "STATUS_CHANGE", title: "opportunity.assigned", metadata: { from: before.ownerId, to: after.ownerId } });
      uow.emit({ type: "opportunity.assigned", entityType: "Opportunity", entityId: id, payload: { ownerId: after.ownerId, number: after.number, title: after.title }, activity: activityFor(after) });
    }
    return after;
  });
}

// ---------------------------------------------------------------------------
// Stage moves (pipeline drag-and-drop) with won/lost semantics
// ---------------------------------------------------------------------------

const moveSchema = z.object({ id: z.string().min(1), stageId: z.string().min(1), lostReason: optText(500) });

/**
 * Rules
 * - target stage must be active and belong to the opportunity's pipeline
 * - Won stage: needs crm.opportunities.mark_won → status WON, wonAt, probability 100, client PROSPECT→ACTIVE
 * - Lost stage: needs crm.opportunities.mark_lost + a reason → status LOST, lostAt, probability 0
 * - Open stage: status OPEN, probability = stage default; moving out of Won/Lost (reopen)
 *   needs the matching mark_won/mark_lost permission and clears the outcome fields
 */
export async function moveOpportunityStage(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "crm.opportunities.move_stage");
  const input = moveSchema.parse(raw);
  return unitOfWork(ctx, (tx, uow) => moveOpportunityStageTx(tx, uow, ctx, input));
}

/** Same rules as moveOpportunityStage, inside a caller's unit of work (e.g. quotation acceptance). */
export async function moveOpportunityStageTx(tx: Tx, uow: Uow, ctx: Ctx, input: z.output<typeof moveSchema>) {
  {
    const before = await lockOpp(tx, ctx, input.id);
    if (before.status === "ARCHIVED") throw conflict("OPPORTUNITY_ARCHIVED");
    const target = await stageInPipeline(tx, ctx.organizationId, input.stageId);
    if (target.pipelineId !== before.pipelineId) throw invalid("STAGE_OTHER_PIPELINE");
    if (target.id === before.stageId) return before;

    if (before.status === "WON") requirePermission(ctx, "crm.opportunities.mark_won");
    if (before.status === "LOST") requirePermission(ctx, "crm.opportunities.mark_lost");

    const now = new Date();
    let data: Prisma.OpportunityUncheckedUpdateInput;
    let event = "opportunity.stage_changed";
    if (target.isWonStage) {
      requirePermission(ctx, "crm.opportunities.mark_won");
      data = { stageId: target.id, status: "WON", wonAt: now, lostAt: null, lostReason: null, probability: 100 };
      event = "opportunity.won";
    } else if (target.isLostStage) {
      requirePermission(ctx, "crm.opportunities.mark_lost");
      if (!input.lostReason || input.lostReason.length < 3) throw invalid("LOST_REASON_REQUIRED");
      data = { stageId: target.id, status: "LOST", lostAt: now, lostReason: input.lostReason, wonAt: null, probability: 0 };
      event = "opportunity.lost";
    } else {
      data = { stageId: target.id, status: "OPEN", wonAt: null, lostAt: null, lostReason: null, probability: target.defaultProbability };
    }
    const after = await tx.opportunity.update({ where: { id: before.id }, data: { ...data, stageChangedAt: now } });

    if (event === "opportunity.won") {
      await tx.client.updateMany({ where: { id: before.clientId, status: "PROSPECT" }, data: { status: "ACTIVE" } });
    }
    const meta = { fromStage: before.stage.key, toStage: target.key, fromStatus: before.status, toStatus: after.status, lostReason: after.lostReason };
    await systemActivity(tx, ctx, { entityType: "OPPORTUNITY", entityId: before.id, clientId: before.clientId, type: "STATUS_CHANGE", title: event, metadata: meta });
    await uow.audit({ action: "opportunity.stage_changed", entityType: "Opportunity", entityId: before.id, before: { stageId: before.stageId, status: before.status, probability: before.probability }, after: { stageId: after.stageId, status: after.status, probability: after.probability, lostReason: after.lostReason } });
    if (event !== "opportunity.stage_changed") await uow.audit({ action: event, entityType: "Opportunity", entityId: before.id, after: meta });
    uow.emit({ type: "opportunity.stage_changed", entityType: "Opportunity", entityId: before.id, payload: meta, activity: event === "opportunity.stage_changed" ? activityFor(after) : undefined });
    if (event !== "opportunity.stage_changed") uow.emit({ type: event, entityType: "Opportunity", entityId: before.id, payload: { ...meta, value: after.estimatedValue.toString(), ownerId: after.ownerId }, activity: activityFor(after) });
    return after;
  }
}

/** Won stage id of an opportunity's pipeline (inside a transaction). */
export async function wonStageIdTx(tx: Tx, pipelineId: string) {
  const s = await tx.pipelineStage.findFirst({ where: { pipelineId, active: true, isWonStage: true } });
  if (!s) throw invalid("NO_TERMINAL_STAGE");
  return s.id;
}

async function terminalStage(ctx: Ctx, id: string, kind: "won" | "lost") {
  const o = await prisma.opportunity.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { pipelineId: true } });
  if (!o) throw notFound("Opportunity");
  const s = await prisma.pipelineStage.findFirst({ where: { pipelineId: o.pipelineId, active: true, ...(kind === "won" ? { isWonStage: true } : { isLostStage: true }) } });
  if (!s) throw invalid("NO_TERMINAL_STAGE");
  return s.id;
}

export const markOpportunityWon = async (ctx: Ctx, id: string) => moveOpportunityStage(ctx, { id, stageId: await terminalStage(ctx, id, "won") });
export const markOpportunityLost = async (ctx: Ctx, id: string, lostReason: string) => moveOpportunityStage(ctx, { id, stageId: await terminalStage(ctx, id, "lost"), lostReason });

export async function archiveOpportunity(ctx: Ctx, id: string) {
  requirePermission(ctx, "crm.opportunities.edit");
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await lockOpp(tx, ctx, id);
    if (before.status === "ARCHIVED") return before;
    const after = await tx.opportunity.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    await systemActivity(tx, ctx, { entityType: "OPPORTUNITY", entityId: id, clientId: before.clientId, type: "STATUS_CHANGE", title: "opportunity.archived" });
    await uow.audit({ action: "opportunity.archived", entityType: "Opportunity", entityId: id, before: { status: before.status }, after: { status: "ARCHIVED" } });
    return after;
  });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const OPPS_PAGE_SIZE = 25;
const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(OPP_STATUSES).optional(),
  stage: z.string().max(40).optional(),
  owner: z.string().max(40).optional(),
  service: z.string().max(40).optional(),
  client: z.string().max(40).optional(),
  sort: z.enum(["createdAt", "estimatedValue", "expectedCloseDate", "nextFollowUpAt", "number"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1)
});

export async function listOpportunities(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "crm.opportunities.view");
  const f = parseListParams(listSchema, raw);
  const where: Prisma.OpportunityWhereInput = {
    organizationId: ctx.organizationId,
    AND: [
      await ownedWhere(ctx),
      f.status ? { status: f.status } : { status: { not: "ARCHIVED" } },
      f.stage ? { stageId: f.stage } : {},
      f.owner === "me" ? { ownerId: ctx.userId } : f.owner ? { ownerId: f.owner } : {},
      f.service ? { OR: [{ serviceId: f.service }, { serviceCategory: f.service }] } : {},
      f.client ? { clientId: f.client } : {},
      f.q ? { OR: [{ title: { contains: f.q, mode: "insensitive" } }, { number: { contains: f.q.toUpperCase() } }, { client: { displayName: { contains: f.q, mode: "insensitive" } } }] } : {}
    ]
  };
  const orderBy: Prisma.OpportunityOrderByWithRelationInput[] =
    f.sort === "expectedCloseDate" || f.sort === "nextFollowUpAt" ? [{ [f.sort]: { sort: f.dir, nulls: "last" } }] : [{ [f.sort]: f.dir }];
  const [items, total, sum] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      orderBy,
      skip: (f.page - 1) * OPPS_PAGE_SIZE,
      take: OPPS_PAGE_SIZE,
      include: { client: { select: { id: true, displayName: true } }, stage: true, owner: { select: { id: true, name: true, nameAr: true } }, service: { select: { nameAr: true, nameEn: true } } }
    }),
    prisma.opportunity.count({ where }),
    prisma.opportunity.aggregate({ where, _sum: { estimatedValue: true } })
  ]);
  return { items, total, page: f.page, pageSize: OPPS_PAGE_SIZE, filters: f, totalValue: sum._sum.estimatedValue?.toString() ?? "0" };
}

export async function getOpportunity(ctx: Ctx, id: string) {
  requirePermission(ctx, "crm.opportunities.view");
  const o = await prisma.opportunity.findFirst({
    where: { id, organizationId: ctx.organizationId, ...(await ownedWhere(ctx)) },
    include: {
      client: { select: { id: true, number: true, displayName: true, status: true } },
      primaryContact: true,
      stage: true,
      pipeline: { include: { stages: { where: { active: true }, orderBy: { position: "asc" } } } },
      service: { select: { id: true, nameAr: true, nameEn: true } },
      owner: { select: { id: true, name: true, nameAr: true } },
      sourceLead: { select: { id: true, number: true, name: true, source: true } }
    }
  });
  if (!o) throw notFound("Opportunity");
  return o;
}

/** Kanban data: stages of a pipeline with scoped opportunities (won/lost limited to the last 30 days). */
export async function pipelineBoard(ctx: Ctx, pipelineId?: string, opts: { owner?: string } = {}) {
  requirePermission(ctx, "crm.pipeline.view");
  requirePermission(ctx, "crm.opportunities.view");
  const pipeline = pipelineId
    ? await prisma.pipeline.findFirst({ where: { id: pipelineId, organizationId: ctx.organizationId }, include: { stages: { where: { active: true }, orderBy: { position: "asc" } } } })
    : await getDefaultPipeline(prisma, ctx.organizationId);
  if (!pipeline) throw notFound("Pipeline");
  const since = new Date(Date.now() - 30 * 86400000);
  const where: Prisma.OpportunityWhereInput = {
    organizationId: ctx.organizationId,
    pipelineId: pipeline.id,
    AND: [
      await ownedWhere(ctx),
      opts.owner === "me" ? { ownerId: ctx.userId } : opts.owner ? { ownerId: opts.owner } : {},
      { OR: [{ status: "OPEN" }, { status: "WON", wonAt: { gte: since } }, { status: "LOST", lostAt: { gte: since } }] }
    ]
  };
  const [opps, sums] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      orderBy: [{ estimatedValue: "desc" }],
      take: 500,
      select: {
        id: true, number: true, title: true, estimatedValue: true, currency: true, stageId: true, status: true, probability: true,
        expectedCloseDate: true, nextFollowUpAt: true, stageChangedAt: true,
        client: { select: { id: true, displayName: true } },
        owner: { select: { id: true, name: true, nameAr: true } }
      }
    }),
    prisma.opportunity.groupBy({ by: ["stageId"], where, _sum: { estimatedValue: true }, _count: { _all: true } })
  ]);
  return {
    pipeline,
    stages: pipeline.stages.map((s) => {
      const agg = sums.find((x) => x.stageId === s.id);
      return { ...s, count: agg?._count._all ?? 0, total: agg?._sum.estimatedValue?.toString() ?? "0", items: opps.filter((o) => o.stageId === s.id).map((o) => ({ ...o, estimatedValue: o.estimatedValue.toString() })) };
    })
  };
}
