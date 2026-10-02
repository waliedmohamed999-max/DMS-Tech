import { z } from "zod";
import { recordFirstTouch, touchFromCapture, type TouchInput } from "../marketing/attribution";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork, type Uow } from "../events/bus";
import { resolveServiceId } from "../commercial/catalog";
import { LEAD_SOURCES, LEAD_STAGES, LEAD_STATUSES, PRIORITIES, SERVICE_KEYS, serviceLabel } from "@/lib/crm/services";
import { blankToNull, money, normEmail, normPhone, optDate, optEmail, optId, optPhone, optText, reqText, parseListParams } from "./normalize";
import { nextNumber } from "./sequence";
import { ownedWhere, scopeOf } from "./scope";
import { systemActivity } from "./activities";
import { getDefaultPipeline, pickOpenStage, stageInPipeline } from "./pipeline";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const leadBase = z.object({
  name: reqText(2, 160),
  companyName: optText(160),
  email: optEmail,
  phone: optPhone,
  whatsapp: optPhone,
  country: optText(60),
  city: optText(80),
  source: z.enum(LEAD_SOURCES).default("MANUAL"),
  /** legacy Phase 2 key — still accepted; mapped to serviceId when it matches a catalog service */
  interestedService: z.preprocess(blankToNull, z.enum(SERVICE_KEYS).nullable().optional()),
  serviceId: optId,
  budgetMin: money.optional(),
  budgetMax: money.optional(),
  currency: z.preprocess(blankToNull, z.string().length(3).toUpperCase().nullable().optional()),
  ownerId: optId,
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  stage: z.enum(LEAD_STAGES).optional(),
  nextFollowUpAt: optDate,
  notes: optText(4000),
  message: optText(4000)
});

const contactRequired = (d: { email?: string | null; phone?: string | null; whatsapp?: string | null }) => Boolean(d.email || d.phone || d.whatsapp);
const budgetOrder = (d: { budgetMin?: string | null; budgetMax?: string | null }) => !d.budgetMin || !d.budgetMax || Number(d.budgetMin) <= Number(d.budgetMax);

export const leadCreateSchema = leadBase
  .refine(contactRequired, { message: "CONTACT_REQUIRED", path: ["email"] })
  .refine(budgetOrder, { message: "BUDGET_ORDER", path: ["budgetMax"] });
export const leadUpdateSchema = leadBase.partial().extend({ id: z.string().min(1) }).refine(budgetOrder, { message: "BUDGET_ORDER", path: ["budgetMax"] });

export type LeadCreateInput = z.input<typeof leadCreateSchema>;

const activityFor = (l: { id: string; number: string; name: string }) => ({ entityLabel: `${l.number} · ${l.name}`, href: `/app/crm/leads/${l.id}`, visibility: "crm.leads.view" as const });

async function assertAssignable(tx: Tx | typeof prisma, ctx: Ctx, ownerId: string | null | undefined, assignPerm: "crm.leads.assign" | "crm.opportunities.assign") {
  if (!ownerId) return;
  if (ownerId !== ctx.userId && !can(ctx, assignPerm)) throw forbidden(assignPerm);
  const u = await tx.user.findFirst({ where: { id: ownerId, organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null } });
  if (!u) throw invalid("UNKNOWN_OWNER");
}

// ---------------------------------------------------------------------------
// Create (also used by the website capture with a system ctx)
// ---------------------------------------------------------------------------

/** Persist a lead inside an existing unit of work. Permission checks are the caller's job. */
export async function createLeadTx(tx: Tx, uow: Uow, ctx: Ctx, input: z.output<typeof leadCreateSchema>, extra: { captureMeta?: unknown; duplicateOfId?: string | null; locale?: "ar" | "en" | null; touch?: Partial<TouchInput> } = {}) {
  const number = await nextNumber(tx, ctx.organizationId, "LEAD");
  const lead = await tx.lead.create({
    data: {
      organizationId: ctx.organizationId,
      number,
      name: input.name,
      companyName: input.companyName ?? null,
      email: input.email ?? null,
      emailNormalized: normEmail(input.email),
      phone: input.phone ?? null,
      phoneNormalized: normPhone(input.phone),
      whatsapp: input.whatsapp ?? null,
      whatsappNormalized: normPhone(input.whatsapp),
      country: input.country ?? null,
      city: input.city ?? null,
      source: input.source,
      interestedService: input.interestedService ?? null,
      serviceId: input.serviceId ?? null,
      budgetMin: input.budgetMin ?? null,
      budgetMax: input.budgetMax ?? null,
      currency: input.currency ?? "SAR",
      ownerId: input.ownerId ?? null,
      priority: input.priority,
      stage: input.stage ?? "NEW",
      nextFollowUpAt: input.nextFollowUpAt ?? null,
      notes: input.notes ?? null,
      message: input.message ?? null,
      locale: extra.locale ?? null,
      captureMeta: (extra.captureMeta ?? undefined) as Prisma.InputJsonValue | undefined,
      duplicateOfId: extra.duplicateOfId ?? null,
      createdById: ctx.userId || null
    }
  });
  await systemActivity(tx, ctx, { entityType: "LEAD", entityId: lead.id, title: "lead.created", metadata: { source: lead.source } });
  // Phase 8: the original acquisition source becomes the immutable FIRST attribution touch
  await recordFirstTouch(tx, uow, ctx.organizationId, lead.id, { ...touchFromCapture(lead.source, extra.captureMeta), ...(extra.touch ?? {}) });
  await uow.audit({ action: "lead.created", entityType: "Lead", entityId: lead.id, after: lead });
  uow.emit({ type: "lead.created", entityType: "Lead", entityId: lead.id, payload: { source: lead.source, ownerId: lead.ownerId, number }, activity: activityFor(lead) });
  if (lead.ownerId && lead.ownerId !== ctx.userId) uow.emit({ type: "lead.assigned", entityType: "Lead", entityId: lead.id, payload: { ownerId: lead.ownerId, number, name: lead.name } });
  return lead;
}

/**
 * Phase 3 catalog link: a chosen service id wins (and mirrors its stable key into the legacy
 * column); a legacy key alone is mapped to the catalog service with the same key.
 */
async function linkService(ctx: Ctx, serviceId: string | null | undefined, legacyKey: string | null | undefined) {
  let id: string | null = null;
  let key: string | null = legacyKey ?? null;
  if (serviceId) {
    const svc = await resolveServiceId(ctx, serviceId);
    id = svc!.id;
    key = svc!.key && (SERVICE_KEYS as readonly string[]).includes(svc!.key) ? svc!.key : null;
  } else if (legacyKey) {
    id = (await prisma.service.findFirst({ where: { organizationId: ctx.organizationId, key: legacyKey }, select: { id: true } }))?.id ?? null;
  }
  const legacy = key as (typeof SERVICE_KEYS)[number] | null;
  return { serviceId: id, interestedService: legacy, asUpdate: { service: id ? { connect: { id } } : { disconnect: true }, interestedService: legacy } satisfies Prisma.LeadUpdateInput };
}

export async function createLead(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "crm.leads.create");
  const input = leadCreateSchema.parse(raw);
  input.ownerId = input.ownerId ?? ctx.userId;
  Object.assign(input, await linkService(ctx, input.serviceId, input.interestedService));
  await assertAssignable(prisma, ctx, input.ownerId, "crm.leads.assign");
  return unitOfWork(ctx, (tx, uow) => createLeadTx(tx, uow, ctx, input));
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const LEADS_PAGE_SIZE = 25;
const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  owner: z.string().max(40).optional(), // user id | "me" | "none"
  source: z.enum(LEAD_SOURCES).optional(),
  status: z.enum([...LEAD_STATUSES, "active"]).optional(),
  priority: z.enum(PRIORITIES).optional(),
  /** catalog service id (or a legacy key for old links) */
  service: z.string().max(40).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  followUp: z.enum(["overdue", "today", "upcoming", "none"]).optional(),
  sort: z.enum(["createdAt", "nextFollowUpAt", "name", "priority", "number"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1)
});

export function followUpWindow(kind: "overdue" | "today" | "upcoming" | "none", now = new Date()): Prisma.DateTimeNullableFilter | null {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86400000);
  if (kind === "overdue") return { lt: now };
  if (kind === "today") return { gte: now, lt: end };
  if (kind === "upcoming") return { gte: end, lt: new Date(end.getTime() + 7 * 86400000) };
  return null;
}

export async function listLeads(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "crm.leads.view");
  const f = parseListParams(listSchema, raw);
  const fw = f.followUp && f.followUp !== "none" ? followUpWindow(f.followUp) : null;
  const where: Prisma.LeadWhereInput = {
    organizationId: ctx.organizationId,
    AND: [
      await ownedWhere(ctx),
      f.status === "active" || !f.status ? { status: { in: f.status ? ["OPEN", "QUALIFIED"] : ["OPEN", "QUALIFIED", "CONVERTED", "LOST"] } } : { status: f.status },
      f.owner === "me" ? { ownerId: ctx.userId } : f.owner === "none" ? { ownerId: null } : f.owner ? { ownerId: f.owner } : {},
      f.source ? { source: f.source } : {},
      f.priority ? { priority: f.priority } : {},
      f.service ? { OR: [{ serviceId: f.service }, { interestedService: f.service }] } : {},
      f.from || f.to ? { createdAt: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00`) } : {}), ...(f.to ? { lte: new Date(`${f.to}T23:59:59`) } : {}) } } : {},
      f.followUp === "none" ? { nextFollowUpAt: null } : fw ? { nextFollowUpAt: fw, status: { in: ["OPEN", "QUALIFIED"] } } : {},
      f.q
        ? {
            OR: [
              { name: { contains: f.q, mode: "insensitive" } },
              { companyName: { contains: f.q, mode: "insensitive" } },
              { email: { contains: f.q, mode: "insensitive" } },
              { number: { contains: f.q.toUpperCase() } },
              ...(normPhone(f.q) ? [{ phoneNormalized: { contains: normPhone(f.q)! } }, { whatsappNormalized: { contains: normPhone(f.q)! } }] : [])
            ]
          }
        : {}
    ]
  };
  const orderBy: Prisma.LeadOrderByWithRelationInput[] =
    f.sort === "nextFollowUpAt" ? [{ nextFollowUpAt: { sort: f.dir, nulls: "last" } }, { createdAt: "desc" }] : [{ [f.sort]: f.dir }, { createdAt: "desc" }];
  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy,
      skip: (f.page - 1) * LEADS_PAGE_SIZE,
      take: LEADS_PAGE_SIZE,
      select: {
        id: true, number: true, name: true, companyName: true, email: true, phone: true, whatsapp: true, source: true, interestedService: true, service: { select: { nameAr: true, nameEn: true } },
        status: true, stage: true, priority: true, nextFollowUpAt: true, createdAt: true, duplicateOfId: true, budgetMin: true, budgetMax: true, currency: true,
        owner: { select: { id: true, name: true, nameAr: true } }
      }
    }),
    prisma.lead.count({ where })
  ]);
  return { items, total, page: f.page, pageSize: LEADS_PAGE_SIZE, filters: f, scope: scopeOf(ctx) };
}

export async function getLead(ctx: Ctx, id: string) {
  requirePermission(ctx, "crm.leads.view");
  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: ctx.organizationId, ...(await ownedWhere(ctx)) },
    include: {
      owner: { select: { id: true, name: true, nameAr: true } },
      service: { select: { id: true, nameAr: true, nameEn: true } },
      createdBy: { select: { id: true, name: true } },
      convertedClient: { select: { id: true, number: true, displayName: true } },
      opportunity: { select: { id: true, number: true, title: true, status: true } },
      duplicateOf: { select: { id: true, number: true, name: true, status: true } },
      duplicates: { select: { id: true, number: true, name: true, status: true, createdAt: true } }
    }
  });
  if (!lead) throw notFound("Lead");
  return lead;
}

// ---------------------------------------------------------------------------
// Update / lifecycle
// ---------------------------------------------------------------------------

const EDITABLE: string[] = ["OPEN", "QUALIFIED"];

async function lockLead(tx: Tx, ctx: Ctx, id: string) {
  // row lock: serialises concurrent mutations (e.g. two simultaneous conversions)
  await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const lead = await tx.lead.findFirst({ where: { id, organizationId: ctx.organizationId, ...(await ownedWhere(ctx)) } });
  if (!lead) throw notFound("Lead");
  return lead;
}

export async function updateLead(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "crm.leads.edit");
  const input = leadUpdateSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await lockLead(tx, ctx, input.id);
    if (!EDITABLE.includes(before.status)) throw conflict("LEAD_NOT_EDITABLE");
    const ownerChanged = input.ownerId !== undefined && (input.ownerId ?? null) !== before.ownerId;
    if (ownerChanged) {
      if (!can(ctx, "crm.leads.assign")) throw forbidden("crm.leads.assign");
      await assertAssignable(tx, ctx, input.ownerId, "crm.leads.assign");
    }
    const { id, ...d } = input;
    const data: Prisma.LeadUpdateInput = {
      ...(d.name !== undefined && { name: d.name }),
      ...(d.companyName !== undefined && { companyName: d.companyName }),
      ...(d.email !== undefined && { email: d.email, emailNormalized: normEmail(d.email) }),
      ...(d.phone !== undefined && { phone: d.phone, phoneNormalized: normPhone(d.phone) }),
      ...(d.whatsapp !== undefined && { whatsapp: d.whatsapp, whatsappNormalized: normPhone(d.whatsapp) }),
      ...(d.country !== undefined && { country: d.country }),
      ...(d.city !== undefined && { city: d.city }),
      ...(d.source !== undefined && { source: d.source }),
      ...((d.serviceId !== undefined || d.interestedService !== undefined) && (await linkService(ctx, d.serviceId, d.interestedService)).asUpdate),
      ...(d.budgetMin !== undefined && { budgetMin: d.budgetMin }),
      ...(d.budgetMax !== undefined && { budgetMax: d.budgetMax }),
      ...(d.currency !== undefined && d.currency && { currency: d.currency }),
      ...(d.priority !== undefined && { priority: d.priority }),
      ...(d.stage !== undefined && { stage: d.stage }),
      ...(d.nextFollowUpAt !== undefined && { nextFollowUpAt: d.nextFollowUpAt }),
      ...(d.notes !== undefined && { notes: d.notes }),
      ...(ownerChanged && { owner: input.ownerId ? { connect: { id: input.ownerId } } : { disconnect: true } })
    };
    if (!(contactRequired({ email: d.email === undefined ? before.email : d.email, phone: d.phone === undefined ? before.phone : d.phone, whatsapp: d.whatsapp === undefined ? before.whatsapp : d.whatsapp })))
      throw invalid("CONTACT_REQUIRED");
    const after = await tx.lead.update({ where: { id }, data });
    await uow.audit({ action: "lead.updated", entityType: "Lead", entityId: id, before, after });
    uow.emit({ type: "lead.updated", entityType: "Lead", entityId: id, payload: { fields: Object.keys(d) } });
    if (ownerChanged) {
      await uow.audit({ action: "lead.assigned", entityType: "Lead", entityId: id, before: { ownerId: before.ownerId }, after: { ownerId: after.ownerId } });
      await systemActivity(tx, ctx, { entityType: "LEAD", entityId: id, type: "STATUS_CHANGE", title: "lead.assigned", metadata: { from: before.ownerId, to: after.ownerId } });
      uow.emit({ type: "lead.assigned", entityType: "Lead", entityId: id, payload: { ownerId: after.ownerId, number: after.number, name: after.name }, activity: activityFor(after) });
    }
    if (d.stage && d.stage !== before.stage) await systemActivity(tx, ctx, { entityType: "LEAD", entityId: id, type: "STATUS_CHANGE", title: "lead.stage_changed", metadata: { from: before.stage, to: d.stage } });
    return after;
  });
}

export async function setLeadFollowUp(ctx: Ctx, id: string, at: Date | null) {
  return updateLead(ctx, { id, nextFollowUpAt: at });
}

async function transition(ctx: Ctx, id: string, perm: "crm.leads.edit" | "crm.leads.archive", fn: (lead: Awaited<ReturnType<typeof lockLead>>) => { data: Prisma.LeadUpdateInput; action: string; allowed: string[] }) {
  requirePermission(ctx, perm);
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await lockLead(tx, ctx, id);
    const { data, action, allowed } = fn(before);
    if (!allowed.includes(before.status)) throw conflict("LEAD_INVALID_TRANSITION");
    const after = await tx.lead.update({ where: { id }, data });
    await systemActivity(tx, ctx, { entityType: "LEAD", entityId: id, type: "STATUS_CHANGE", title: action, metadata: { from: before.status, to: after.status, reason: after.lostReason } });
    await uow.audit({ action, entityType: "Lead", entityId: id, before: { status: before.status }, after: { status: after.status, lostReason: after.lostReason } });
    uow.emit({ type: action, entityType: "Lead", entityId: id, payload: { status: after.status }, activity: activityFor(after) });
    return after;
  });
}

export const qualifyLead = (ctx: Ctx, id: string) =>
  transition(ctx, id, "crm.leads.edit", () => ({ data: { status: "QUALIFIED" }, action: "lead.qualified", allowed: ["OPEN"] }));

export async function markLeadLost(ctx: Ctx, id: string, reason: string) {
  const r = reqText(3, 500).safeParse(reason);
  if (!r.success) throw invalid("LOST_REASON_REQUIRED");
  return transition(ctx, id, "crm.leads.edit", () => ({ data: { status: "LOST", lostAt: new Date(), lostReason: r.data }, action: "lead.lost", allowed: ["OPEN", "QUALIFIED"] }));
}

export const reopenLead = (ctx: Ctx, id: string) =>
  transition(ctx, id, "crm.leads.edit", () => ({ data: { status: "OPEN", lostAt: null, lostReason: null }, action: "lead.reopened", allowed: ["LOST"] }));

export const archiveLead = (ctx: Ctx, id: string) =>
  transition(ctx, id, "crm.leads.archive", () => ({ data: { status: "ARCHIVED", archivedAt: new Date() }, action: "lead.archived", allowed: ["OPEN", "QUALIFIED", "LOST"] }));

// ---------------------------------------------------------------------------
// Conversion: Lead → Client (+ Contact) + Opportunity — one transaction
// ---------------------------------------------------------------------------

const convertSchema = z.object({
  leadId: z.string().min(1),
  clientMode: z.enum(["new", "existing"]),
  clientId: optId,
  clientType: z.enum(["COMPANY", "INDIVIDUAL"]).default("COMPANY"),
  clientName: optText(160),
  contactMode: z.enum(["new", "existing", "none"]).default("new"),
  contactId: optId,
  title: optText(200),
  estimatedValue: money.optional(),
  expectedCloseDate: optDate,
  stageId: optId,
  ownerId: optId
});

/**
 * Atomic conversion. Any failure (validation, permission, unique conflict, DB error)
 * rolls back every write: no orphan client, contact or opportunity, lead unchanged.
 * Double conversion is prevented three ways: row lock, status check, unique sourceLeadId.
 */
export async function convertLead(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "crm.leads.convert");
  requirePermission(ctx, "crm.opportunities.create");
  const input = convertSchema.parse(raw);
  if (input.clientMode === "new") requirePermission(ctx, "crm.clients.create");
  if (input.contactMode === "new") requirePermission(ctx, "crm.contacts.create");
  if (input.clientMode === "existing" && !input.clientId) throw invalid("CLIENT_REQUIRED");

  return unitOfWork(ctx, async (tx, uow) => {
    const lead = await lockLead(tx, ctx, input.leadId);
    if (lead.status === "CONVERTED") throw conflict("LEAD_ALREADY_CONVERTED");
    if (lead.status !== "QUALIFIED") throw conflict("LEAD_NOT_QUALIFIED");

    const ownerId = input.ownerId ?? lead.ownerId ?? ctx.userId;
    await assertAssignable(tx, ctx, ownerId, "crm.opportunities.assign");

    // 1. client
    let client;
    if (input.clientMode === "existing") {
      client = await tx.client.findFirst({ where: { id: input.clientId!, organizationId: ctx.organizationId, deletedAt: null, status: { not: "ARCHIVED" } } });
      if (!client) throw notFound("Client");
    } else {
      const number = await nextNumber(tx, ctx.organizationId, "CLI");
      const displayName = input.clientName ?? lead.companyName ?? lead.name;
      client = await tx.client.create({
        data: {
          organizationId: ctx.organizationId,
          number,
          type: input.clientType,
          displayName,
          companyName: input.clientType === "COMPANY" ? displayName : null,
          email: lead.email,
          emailNormalized: lead.emailNormalized,
          phone: lead.phone,
          phoneNormalized: lead.phoneNormalized,
          whatsapp: lead.whatsapp,
          country: lead.country ?? "SA",
          city: lead.city,
          source: lead.source,
          ownerId,
          status: "PROSPECT",
          createdById: ctx.userId || null
        }
      });
      await uow.audit({ action: "client.created", entityType: "Client", entityId: client.id, after: client });
      uow.emit({ type: "client.created", entityType: "Client", entityId: client.id, payload: { fromLeadId: lead.id }, activity: { entityLabel: `${client.number} · ${client.displayName}`, href: `/app/crm/clients/${client.id}`, visibility: "crm.clients.view" } });
      await systemActivity(tx, ctx, { entityType: "CLIENT", entityId: client.id, clientId: client.id, title: "client.created_from_lead", metadata: { leadId: lead.id, leadNumber: lead.number } });
    }

    // 2. contact
    let contactId: string | null = null;
    if (input.contactMode === "existing") {
      const c = await tx.contact.findFirst({ where: { id: input.contactId ?? "", organizationId: ctx.organizationId, clientId: client.id, deletedAt: null } });
      if (!c) throw notFound("Contact");
      contactId = c.id;
    } else if (input.contactMode === "new") {
      const hasPrimary = await tx.contact.count({ where: { clientId: client.id, isPrimary: true, deletedAt: null } });
      const [firstName, ...rest] = lead.name.split(/\s+/);
      const c = await tx.contact.create({
        data: {
          organizationId: ctx.organizationId,
          clientId: client.id,
          firstName,
          lastName: rest.join(" ") || null,
          email: lead.email,
          emailNormalized: lead.emailNormalized,
          phone: lead.phone,
          phoneNormalized: lead.phoneNormalized,
          whatsapp: lead.whatsapp,
          isPrimary: hasPrimary === 0,
          preferredLanguage: lead.locale ?? "ar",
          createdById: ctx.userId || null
        }
      });
      contactId = c.id;
      await uow.audit({ action: "contact.created", entityType: "Contact", entityId: c.id, after: c });
      uow.emit({ type: "contact.created", entityType: "Contact", entityId: c.id, payload: { clientId: client.id, fromLeadId: lead.id } });
    }

    // 3. opportunity
    const pipeline = await getDefaultPipeline(tx, ctx.organizationId);
    const stage = input.stageId ? await stageInPipeline(tx, ctx.organizationId, input.stageId) : pickOpenStage(pipeline.stages);
    if (!stage || stage.isWonStage || stage.isLostStage) throw invalid("STAGE_NOT_OPEN");
    const oppNumber = await nextNumber(tx, ctx.organizationId, "OPP");
    const opp = await tx.opportunity.create({
      data: {
        organizationId: ctx.organizationId,
        number: oppNumber,
        clientId: client.id,
        primaryContactId: contactId,
        sourceLeadId: lead.id,
        title: input.title ?? `${serviceLabel(lead.interestedService, "en") === "—" ? "Opportunity" : serviceLabel(lead.interestedService, "en")} · ${client.displayName}`,
        description: lead.message ?? lead.notes,
        serviceCategory: lead.interestedService,
        serviceId: lead.serviceId,
        estimatedValue: input.estimatedValue ?? lead.budgetMax ?? lead.budgetMin ?? "0",
        currency: lead.currency,
        probability: stage.defaultProbability,
        pipelineId: stage.pipelineId,
        stageId: stage.id,
        ownerId,
        expectedCloseDate: input.expectedCloseDate ?? null,
        nextFollowUpAt: lead.nextFollowUpAt,
        createdById: ctx.userId || null
      }
    });
    await uow.audit({ action: "opportunity.created", entityType: "Opportunity", entityId: opp.id, after: opp });
    uow.emit({ type: "opportunity.created", entityType: "Opportunity", entityId: opp.id, payload: { fromLeadId: lead.id, value: opp.estimatedValue.toString() }, activity: { entityLabel: `${opp.number} · ${opp.title}`, href: `/app/crm/opportunities/${opp.id}`, visibility: "crm.opportunities.view" } });
    await systemActivity(tx, ctx, { entityType: "OPPORTUNITY", entityId: opp.id, clientId: client.id, title: "opportunity.created_from_lead", metadata: { leadId: lead.id, leadNumber: lead.number } });

    // 4. lead → converted (move its notes/activity context onto the client timeline)
    await tx.lead.update({ where: { id: lead.id }, data: { status: "CONVERTED", convertedAt: new Date(), convertedById: ctx.userId || null, convertedClientId: client.id } });
    await tx.crmActivity.updateMany({ where: { organizationId: ctx.organizationId, entityType: "LEAD", entityId: lead.id }, data: { clientId: client.id } });
    await tx.crmNote.updateMany({ where: { organizationId: ctx.organizationId, entityType: "LEAD", entityId: lead.id }, data: { clientId: client.id } });
    await systemActivity(tx, ctx, { entityType: "LEAD", entityId: lead.id, clientId: client.id, type: "STATUS_CHANGE", title: "lead.converted", metadata: { opportunityId: opp.id, opportunityNumber: opp.number, clientId: client.id } });
    await uow.audit({ action: "lead.converted", entityType: "Lead", entityId: lead.id, before: { status: lead.status }, after: { status: "CONVERTED", clientId: client.id, opportunityId: opp.id, contactId } });
    uow.emit({ type: "lead.converted", entityType: "Lead", entityId: lead.id, payload: { clientId: client.id, opportunityId: opp.id, contactId }, activity: activityFor(lead) });

    return { clientId: client.id, contactId, opportunityId: opp.id };
  });
}
