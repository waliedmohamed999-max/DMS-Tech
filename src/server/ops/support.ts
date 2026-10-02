import { z } from "zod";
import type { Prisma, Priority, TicketStatus } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, canAny, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork, type Uow } from "../events/bus";
import { optId, optText, parseListParams, reqText } from "../crm/normalize";
import { nextNumber } from "../crm/sequence";
import { clientWhere } from "../crm/scope";
import { projectWhere } from "../projects/access";

/**
 * Support tickets + SLA (docs/OPERATIONS.md#support).
 * SLA is ELAPSED TIME (no business-hours engine — documented limitation). Due times come from the active
 * SlaPolicy of the ticket's priority; WAITING_CLIENT pauses the resolution clock only when the policy says so.
 * First response = the first CLIENT_FACING note, or the first note written by someone other than the creator.
 * CLIENT_FACING notes are a marker for a future portal: nothing is sent outside the OS.
 */

export const TICKET_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: ["OPEN", "IN_PROGRESS", "WAITING_INTERNAL", "RESOLVED", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_CLIENT", "WAITING_INTERNAL", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["OPEN", "WAITING_CLIENT", "WAITING_INTERNAL", "RESOLVED"],
  WAITING_CLIENT: ["OPEN", "IN_PROGRESS", "RESOLVED", "CANCELLED"],
  WAITING_INTERNAL: ["OPEN", "IN_PROGRESS", "RESOLVED"],
  RESOLVED: ["CLOSED", "OPEN"],
  CLOSED: [],
  CANCELLED: []
};
export const OPEN_TICKET: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_INTERNAL"];

// --- SLA policies -------------------------------------------------------------------------------

/** Company defaults (elapsed minutes), editable in Operations settings — not contractual commitments. */
export const DEFAULT_SLA: { priority: Priority; name: string; firstResponseMinutes: number; resolutionMinutes: number }[] = [
  { priority: "URGENT", name: "Urgent", firstResponseMinutes: 30, resolutionMinutes: 240 },
  { priority: "HIGH", name: "High", firstResponseMinutes: 60, resolutionMinutes: 480 },
  { priority: "MEDIUM", name: "Medium", firstResponseMinutes: 240, resolutionMinutes: 1440 },
  { priority: "LOW", name: "Low", firstResponseMinutes: 480, resolutionMinutes: 4320 }
];

export async function ensureSlaPolicies(organizationId: string) {
  if (await prisma.slaPolicy.count({ where: { organizationId } })) return;
  await prisma.slaPolicy.createMany({ data: DEFAULT_SLA.map((p) => ({ ...p, organizationId })) });
}
export const listSlaPolicies = (organizationId: string) => prisma.slaPolicy.findMany({ where: { organizationId }, orderBy: [{ active: "desc" }, { priority: "asc" }] });

const slaSchema = z.object({
  id: optId,
  name: reqText(2, 80),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  firstResponseMinutes: z.coerce.number().int().min(1).max(100000),
  resolutionMinutes: z.coerce.number().int().min(1).max(500000),
  warnAtPercent: z.coerce.number().int().min(1).max(99).default(80),
  pauseOnWaitingClient: z.boolean().default(false),
  active: z.boolean().default(true)
});

export async function saveSlaPolicy(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "support.sla.manage");
  const input = slaSchema.parse(raw);
  if (input.resolutionMinutes < input.firstResponseMinutes) throw invalid("RESOLUTION_BEFORE_RESPONSE");
  return unitOfWork(ctx, async (tx, uow) => {
    const { id, ...data } = input;
    // one active policy per priority (also a partial unique index)
    if (data.active) await tx.slaPolicy.updateMany({ where: { organizationId: ctx.organizationId, priority: data.priority, active: true, ...(id ? { id: { not: id } } : {}) }, data: { active: false } });
    if (id) {
      const before = await tx.slaPolicy.findFirst({ where: { id, organizationId: ctx.organizationId } });
      if (!before) throw notFound("SlaPolicy");
      await tx.slaPolicy.update({ where: { id }, data });
      await uow.audit({ action: "sla.policy_changed", entityType: "SlaPolicy", entityId: id, before, after: data });
      return { id };
    }
    const p = await tx.slaPolicy.create({ data: { ...data, organizationId: ctx.organizationId } });
    await uow.audit({ action: "sla.policy_changed", entityType: "SlaPolicy", entityId: p.id, after: data });
    return { id: p.id };
  });
}

const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
async function dueDates(db: Tx | typeof prisma, organizationId: string, priority: Priority, from: Date, pausedMinutes = 0) {
  const p = await db.slaPolicy.findFirst({ where: { organizationId, priority, active: true } });
  if (!p) return { slaPolicyId: null, firstResponseDueAt: null, resolutionDueAt: null };
  return { slaPolicyId: p.id, firstResponseDueAt: addMin(from, p.firstResponseMinutes), resolutionDueAt: addMin(from, p.resolutionMinutes + pausedMinutes) };
}

/** SLA state for display — deterministic from the stored timestamps. */
export function slaState(t: { status: TicketStatus; firstResponseDueAt: Date | null; resolutionDueAt: Date | null; firstResponseAt: Date | null; resolvedAt: Date | null; pausedAt: Date | null; createdAt: Date }, warnAtPercent = 80, now = new Date()) {
  const one = (due: Date | null, done: Date | null) => {
    if (!due) return "none" as const;
    if (done) return done <= due ? ("met" as const) : ("breached" as const);
    if (["CLOSED", "CANCELLED"].includes(t.status)) return "none" as const;
    if (now > due) return "breached" as const;
    const window = due.getTime() - t.createdAt.getTime();
    return now.getTime() - t.createdAt.getTime() >= (window * warnAtPercent) / 100 ? ("warning" as const) : ("ok" as const);
  };
  return { response: one(t.firstResponseDueAt, t.firstResponseAt), resolution: t.pausedAt ? ("paused" as const) : one(t.resolutionDueAt, t.resolvedAt) };
}

// --- visibility -------------------------------------------------------------------------------

/** manage → every ticket · otherwise tickets I created or am assigned · + tickets of projects I manage (support.tickets.view). */
export async function ticketWhere(ctx: Ctx): Promise<Prisma.SupportTicketWhereInput> {
  if (can(ctx, "support.tickets.manage")) return {};
  const ors: Prisma.SupportTicketWhereInput[] = [{ createdById: ctx.userId }, { assignedToId: ctx.userId }];
  if (can(ctx, "support.tickets.view")) ors.push({ project: { projectManagerId: ctx.userId } });
  return { AND: [{ OR: ors }] };
}
const isStaff = (ctx: Ctx) => canAny(ctx, "support.tickets.view", "support.tickets.manage");

async function lockTicket(tx: Tx, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM "SupportTicket" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const t = await tx.supportTicket.findFirst({ where: { AND: [{ id, organizationId: ctx.organizationId }, await ticketWhere(ctx)] } });
  if (!t) throw notFound("SupportTicket");
  return t;
}
const mayWork = (ctx: Ctx, t: { assignedToId: string | null }) => can(ctx, "support.tickets.manage") || t.assignedToId === ctx.userId || can(ctx, "support.tickets.assign");

async function assertAssignee(tx: Tx, ctx: Ctx, userId: string) {
  const u = await tx.user.findFirst({ where: { id: userId, organizationId: ctx.organizationId, status: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: { in: ["support.tickets.view", "support.tickets.manage"] } } } } } } }, select: { id: true } });
  if (!u) throw invalid("ASSIGNEE_NOT_SUPPORT");
}

// --- tickets ------------------------------------------------------------------------------------

const tags = z.preprocess((v) => (typeof v === "string" ? v.split(",") : v), z.array(z.string().trim().toLowerCase().max(40)).max(10).transform((a) => [...new Set(a.filter(Boolean))]));
const createSchema = z.object({
  subject: reqText(3, 200),
  description: reqText(3, 8000),
  category: z.enum(["TECHNICAL", "BUG", "ACCESS", "CHANGE_REQUEST", "BILLING", "QUESTION", "OTHER"]).default("TECHNICAL"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  source: z.enum(["INTERNAL", "CLIENT_RECORDED", "EMAIL_FUTURE", "WHATSAPP_FUTURE", "WEBSITE_FUTURE", "PHONE", "OTHER"]).default("INTERNAL"),
  clientId: optId,
  contactId: optId,
  projectId: optId,
  serviceId: optId,
  assignedToId: optId,
  tags: tags.default([])
});

export async function createTicket(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "support.tickets.create");
  const input = createSchema.parse(raw);
  // channel integrations are not built: these sources are reserved, never selectable as if they worked
  if (input.source.endsWith("_FUTURE")) throw invalid("SOURCE_NOT_AVAILABLE");
  return unitOfWork(ctx, async (tx, uow) => {
    if (input.clientId && !(can(ctx, "crm.clients.view") && (await tx.client.findFirst({ where: { id: input.clientId, organizationId: ctx.organizationId, deletedAt: null, ...(await clientWhere(ctx)) }, select: { id: true } })))) throw invalid("UNKNOWN_CLIENT");
    if (input.contactId) {
      const c = await tx.contact.findFirst({ where: { id: input.contactId, organizationId: ctx.organizationId }, select: { clientId: true } });
      if (!c || c.clientId !== input.clientId) throw invalid("CONTACT_NOT_OF_CLIENT");
    }
    if (input.projectId && !(await tx.project.findFirst({ where: { id: input.projectId, organizationId: ctx.organizationId, ...(await projectWhere(ctx)) }, select: { id: true } }))) throw invalid("UNKNOWN_PROJECT");
    if (input.serviceId && !(await tx.service.findFirst({ where: { id: input.serviceId, organizationId: ctx.organizationId }, select: { id: true } }))) throw invalid("UNKNOWN_SERVICE");
    if (input.assignedToId) {
      if (!can(ctx, "support.tickets.assign") && !can(ctx, "support.tickets.manage")) throw forbidden("support.tickets.assign");
      await assertAssignee(tx, ctx, input.assignedToId);
    }
    const now = new Date();
    const number = await nextNumber(tx, ctx.organizationId, "TCK");
    const sla = await dueDates(tx, ctx.organizationId, input.priority, now);
    const t = await tx.supportTicket.create({
      data: {
        organizationId: ctx.organizationId, number, subject: input.subject, description: input.description, category: input.category, priority: input.priority, source: input.source,
        clientId: input.clientId ?? null, contactId: input.contactId ?? null, projectId: input.projectId ?? null, serviceId: input.serviceId ?? null, assignedToId: input.assignedToId ?? null,
        createdById: ctx.userId, createdAt: now, status: input.assignedToId ? "OPEN" : "NEW", ...sla,
        tags: { create: input.tags.map((tag) => ({ tag })) },
        history: { create: { toStatus: input.assignedToId ? "OPEN" : "NEW", changedById: ctx.userId } }
      }
    });
    await uow.audit({ action: "ticket.created", entityType: "SupportTicket", entityId: t.id, after: { number, priority: t.priority, category: t.category, source: t.source, clientId: t.clientId, projectId: t.projectId, assignedToId: t.assignedToId, sla: { response: sla.firstResponseDueAt, resolution: sla.resolutionDueAt } } });
    uow.emit({ type: "ticket.created", entityType: "SupportTicket", entityId: t.id, payload: { ticketId: t.id, number, subject: t.subject, priority: t.priority }, activity: { entityLabel: `${number} · ${t.subject}`, href: `/app/support/tickets/${t.id}`, visibility: "support.tickets.manage" } });
    if (t.assignedToId) uow.emit({ type: "ticket.assigned", entityType: "SupportTicket", entityId: t.id, payload: { ticketId: t.id, number, subject: t.subject, assigneeId: t.assignedToId, priority: t.priority } });
    return { id: t.id, number };
  });
}

/** Assign / reassign / take ownership (assigneeId = me). `expected` is the assignee the caller saw (previous-state check). */
export async function assignTicket(ctx: Ctx, id: string, raw: unknown) {
  const input = z.object({ assigneeId: optId, expected: z.string().nullable().optional() }).parse(raw);
  const self = input.assigneeId === ctx.userId;
  if (!(can(ctx, "support.tickets.assign") || can(ctx, "support.tickets.manage") || (self && isStaff(ctx)))) throw forbidden("support.tickets.assign");
  return unitOfWork(ctx, async (tx, uow) => {
    const t = await lockTicket(tx, ctx, id);
    if (!OPEN_TICKET.includes(t.status)) throw conflict(`TICKET_CLOSED:${t.status}`);
    if (input.expected !== undefined && (input.expected || null) !== t.assignedToId) throw conflict("TICKET_STALE");
    if ((input.assigneeId ?? null) === t.assignedToId) return;
    if (input.assigneeId) await assertAssignee(tx, ctx, input.assigneeId);
    const toStatus: TicketStatus = t.status === "NEW" && input.assigneeId ? "OPEN" : t.status;
    await tx.supportTicket.update({ where: { id }, data: { assignedToId: input.assigneeId ?? null, status: toStatus } });
    if (toStatus !== t.status) await tx.ticketStatusHistory.create({ data: { ticketId: id, fromStatus: t.status, toStatus, changedById: ctx.userId, reason: "assigned" } });
    await uow.audit({ action: "ticket.assigned", entityType: "SupportTicket", entityId: id, before: { assignedToId: t.assignedToId }, after: { assignedToId: input.assigneeId ?? null, takeOwnership: self } });
    if (input.assigneeId) uow.emit({ type: "ticket.assigned", entityType: "SupportTicket", entityId: id, payload: { ticketId: id, number: t.number, subject: t.subject, assigneeId: input.assigneeId, priority: t.priority } });
  });
}

const statusSchema = z.object({ to: z.enum(["NEW", "OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_INTERNAL", "RESOLVED", "CLOSED", "CANCELLED"]), from: z.string().optional(), reason: optText(2000) });

export async function changeTicketStatus(ctx: Ctx, id: string, raw: unknown) {
  const input = statusSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const t = await lockTicket(tx, ctx, id);
    const creatorCancel = input.to === "CANCELLED" && t.createdById === ctx.userId && t.status === "NEW";
    if (!creatorCancel && !mayWork(ctx, t)) throw forbidden("support.tickets.manage (or the assignee)");
    if (input.from && input.from !== t.status) throw conflict("TICKET_STALE");
    if (!TICKET_TRANSITIONS[t.status].includes(input.to)) throw conflict(`TICKET_INVALID_TRANSITION:${t.status}`);
    if ((input.to === "CANCELLED" || (t.status === "RESOLVED" && input.to === "OPEN")) && !input.reason) throw invalid("REASON_REQUIRED");
    if (input.to === "RESOLVED" && !input.reason) throw invalid("RESOLUTION_REQUIRED");
    const now = new Date();
    const data: Prisma.SupportTicketUpdateInput = { status: input.to };
    // pause / resume the resolution clock (only when the policy pauses on WAITING_CLIENT)
    if (t.pausedAt && input.to !== "WAITING_CLIENT") {
      const paused = Math.max(0, Math.round((now.getTime() - t.pausedAt.getTime()) / 60_000));
      Object.assign(data, { pausedAt: null, pausedMinutes: t.pausedMinutes + paused, ...(t.resolutionDueAt ? { resolutionDueAt: addMin(t.resolutionDueAt, paused) } : {}) });
    }
    if (input.to === "WAITING_CLIENT" && t.slaPolicyId) {
      const p = await tx.slaPolicy.findUnique({ where: { id: t.slaPolicyId }, select: { pauseOnWaitingClient: true } });
      if (p?.pauseOnWaitingClient) data.pausedAt = now;
    }
    if (input.to === "RESOLVED") Object.assign(data, { resolvedAt: now });
    if (input.to === "CLOSED") Object.assign(data, { closedAt: now });
    if (input.to === "CANCELLED") Object.assign(data, { cancelledAt: now });
    if (t.status === "RESOLVED" && input.to === "OPEN") Object.assign(data, { resolvedAt: null });
    await tx.supportTicket.update({ where: { id }, data });
    await tx.ticketStatusHistory.create({ data: { ticketId: id, fromStatus: t.status, toStatus: input.to, changedById: ctx.userId, reason: input.reason ?? null } });
    if (input.to === "RESOLVED") await tx.ticketComment.create({ data: { organizationId: ctx.organizationId, ticketId: id, authorId: ctx.userId, body: input.reason!, visibility: "CLIENT_FACING" } });
    const action = input.to === "RESOLVED" ? "ticket.resolved" : input.to === "CLOSED" ? "ticket.closed" : "ticket.status_changed";
    await uow.audit({ action, entityType: "SupportTicket", entityId: id, before: { status: t.status }, after: { status: input.to, reason: input.reason } });
    if (input.to === "RESOLVED") {
      if (!t.firstResponseAt) await firstResponse(tx, uow, t, now);
      uow.emit({ type: "ticket.resolved", entityType: "SupportTicket", entityId: id, payload: { ticketId: id, number: t.number, subject: t.subject, createdById: t.createdById } });
    }
    if (input.to === "CLOSED") uow.emit({ type: "ticket.closed", entityType: "SupportTicket", entityId: id, payload: { ticketId: id, number: t.number } });
  });
}

async function firstResponse(tx: Tx, uow: Uow, t: { id: string; number: string; firstResponseDueAt: Date | null }, at: Date) {
  const r = await tx.supportTicket.updateMany({ where: { id: t.id, firstResponseAt: null }, data: { firstResponseAt: at } });
  if (r.count !== 1) return;
  await uow.audit({ action: "ticket.first_response", entityType: "SupportTicket", entityId: t.id, after: { at, withinSla: t.firstResponseDueAt ? at <= t.firstResponseDueAt : null } });
  uow.emit({ type: "ticket.first_response", entityType: "SupportTicket", entityId: t.id, payload: { ticketId: t.id, number: t.number } });
}

export async function changeTicketPriority(ctx: Ctx, id: string, raw: unknown) {
  const input = z.object({ priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]), reason: reqText(3, 500) }).parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const t = await lockTicket(tx, ctx, id);
    if (!mayWork(ctx, t)) throw forbidden("support.tickets.manage (or the assignee)");
    if (!OPEN_TICKET.includes(t.status)) throw conflict(`TICKET_CLOSED:${t.status}`);
    if (t.priority === input.priority) return;
    // SLA recalculated from creation with the new priority's policy (paused minutes kept)
    const sla = await dueDates(tx, ctx.organizationId, input.priority, t.createdAt, t.pausedMinutes);
    await tx.supportTicket.update({ where: { id }, data: { priority: input.priority, ...sla, responseWarnedAt: null, slaWarnedAt: null } });
    await uow.audit({ action: "ticket.priority_changed", entityType: "SupportTicket", entityId: id, before: { priority: t.priority, resolutionDueAt: t.resolutionDueAt }, after: { priority: input.priority, resolutionDueAt: sla.resolutionDueAt, reason: input.reason } });
    if (input.priority === "URGENT") uow.emit({ type: "ticket.created", entityType: "SupportTicket", entityId: id, payload: { ticketId: id, number: t.number, subject: t.subject, priority: "URGENT", escalated: true } });
  });
}

export async function updateTicketMeta(ctx: Ctx, id: string, raw: unknown) {
  const input = z.object({ category: createSchema.shape.category, tags, projectId: optId, serviceId: optId }).parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const t = await lockTicket(tx, ctx, id);
    if (!mayWork(ctx, t)) throw forbidden("support.tickets.manage (or the assignee)");
    if (input.projectId && !(await tx.project.findFirst({ where: { id: input.projectId, organizationId: ctx.organizationId, ...(await projectWhere(ctx)) }, select: { id: true } }))) throw invalid("UNKNOWN_PROJECT");
    await tx.ticketTag.deleteMany({ where: { ticketId: id } });
    await tx.supportTicket.update({ where: { id }, data: { category: input.category, projectId: input.projectId ?? null, serviceId: input.serviceId ?? null, tags: { create: input.tags.map((tag) => ({ tag })) } } });
    await uow.audit({ action: "ticket.updated", entityType: "SupportTicket", entityId: id, before: { category: t.category, projectId: t.projectId }, after: { category: input.category, projectId: input.projectId ?? null, tags: input.tags } });
  });
}

export async function addTicketComment(ctx: Ctx, id: string, raw: unknown) {
  const input = z.object({ body: reqText(1, 8000), visibility: z.enum(["INTERNAL", "CLIENT_FACING"]).default("INTERNAL") }).parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const t = await lockTicket(tx, ctx, id);
    if (["CLOSED", "CANCELLED"].includes(t.status)) throw conflict(`TICKET_CLOSED:${t.status}`);
    // requesters who are not support staff only write (and read) requester-facing notes
    const visibility = isStaff(ctx) ? input.visibility : "CLIENT_FACING";
    const c = await tx.ticketComment.create({ data: { organizationId: ctx.organizationId, ticketId: id, authorId: ctx.userId, body: input.body, visibility } });
    await uow.audit({ action: "ticket.commented", entityType: "SupportTicket", entityId: id, after: { commentId: c.id, visibility } });
    if (!t.firstResponseAt && isStaff(ctx) && (visibility === "CLIENT_FACING" || ctx.userId !== t.createdById)) await firstResponse(tx, uow, t, c.createdAt);
    return { id: c.id };
  });
}

// --- read -------------------------------------------------------------------------------------

const VIEWS = ["mine", "unassigned", "open", "urgent", "waiting", "overdue", "resolved", "created", "all"] as const;
const listSchema = z.object({ view: z.enum(VIEWS).optional(), q: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1) });

export async function listTickets(ctx: Ctx, raw: unknown) {
  if (!canAny(ctx, "support.tickets.view", "support.tickets.create", "support.tickets.manage")) throw forbidden("support.tickets.view");
  const f = parseListParams(listSchema, raw ?? {});
  const view = f.view ?? (isStaff(ctx) ? "mine" : "created");
  const now = new Date();
  const views: Record<(typeof VIEWS)[number], Prisma.SupportTicketWhereInput> = {
    mine: { assignedToId: ctx.userId, status: { in: OPEN_TICKET } },
    unassigned: { assignedToId: null, status: { in: OPEN_TICKET } },
    open: { status: { in: OPEN_TICKET } },
    urgent: { priority: "URGENT", status: { in: OPEN_TICKET } },
    waiting: { status: "WAITING_CLIENT" },
    overdue: { status: { in: OPEN_TICKET }, OR: [{ resolutionDueAt: { lt: now }, pausedAt: null }, { firstResponseAt: null, firstResponseDueAt: { lt: now } }] },
    resolved: { status: { in: ["RESOLVED", "CLOSED"] } },
    created: { createdById: ctx.userId },
    all: {}
  };
  const where: Prisma.SupportTicketWhereInput = {
    AND: [{ organizationId: ctx.organizationId }, await ticketWhere(ctx), views[view], ...(f.q ? [{ OR: [{ subject: { contains: f.q, mode: "insensitive" as const } }, { number: { contains: f.q.toUpperCase() } }] }] : [])]
  };
  const [items, total, counts] = await Promise.all([
    prisma.supportTicket.findMany({ where, orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }], skip: (f.page - 1) * 30, take: 30, include: { client: { select: { id: true, displayName: true, nameAr: true } }, slaPolicy: { select: { warnAtPercent: true } } } }),
    prisma.supportTicket.count({ where }),
    Promise.all(VIEWS.map(async (v) => [v, await prisma.supportTicket.count({ where: { AND: [{ organizationId: ctx.organizationId }, await ticketWhere(ctx), views[v]] } })] as const))
  ]);
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(items.map((i) => i.assignedToId).filter(Boolean) as string[])] } }, select: { id: true, name: true, nameAr: true } });
  return { items: items.map((t) => ({ ...t, sla: slaState(t, t.slaPolicy?.warnAtPercent) })), total, page: f.page, pageSize: 30, view, counts: Object.fromEntries(counts) as Record<string, number>, people, staff: isStaff(ctx) };
}

export async function getTicket(ctx: Ctx, id: string) {
  const t = await prisma.supportTicket.findFirst({
    where: { AND: [{ id, organizationId: ctx.organizationId }, await ticketWhere(ctx)] },
    include: {
      client: { select: { id: true, displayName: true, nameAr: true } }, contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      project: { select: { id: true, name: true, number: true } }, service: { select: { id: true, nameAr: true, nameEn: true } },
      slaPolicy: true, tags: true,
      comments: { orderBy: { createdAt: "asc" } },
      history: { orderBy: { createdAt: "asc" } }
    }
  });
  if (!t) throw notFound("SupportTicket");
  const staff = isStaff(ctx);
  const comments = staff ? t.comments : t.comments.filter((c) => c.visibility === "CLIENT_FACING");
  const ids = [...new Set([t.createdById, t.assignedToId, ...comments.map((c) => c.authorId), ...t.history.map((h) => h.changedById)].filter(Boolean) as string[])];
  const people = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, nameAr: true } });
  // client link shown only to people who can see the client in CRM
  const clientVisible = Boolean(t.clientId && can(ctx, "crm.clients.view") && (await prisma.client.findFirst({ where: { id: t.clientId, ...(await clientWhere(ctx)) }, select: { id: true } })));
  return {
    ticket: { ...t, comments, client: clientVisible ? t.client : null, contact: clientVisible ? t.contact : null },
    sla: slaState(t, t.slaPolicy?.warnAtPercent),
    people, staff,
    can: { work: mayWork(ctx, t), assign: can(ctx, "support.tickets.assign") || can(ctx, "support.tickets.manage"), take: staff && t.assignedToId !== ctx.userId }
  };
}

export async function supportAgents(ctx: Ctx) {
  return prisma.user.findMany({
    where: { organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null, roles: { some: { role: { permissions: { some: { permission: { in: ["support.tickets.view", "support.tickets.manage"] } } } } } } },
    orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true }
  });
}

/** Client 360 support tab — ticket scope AND client scope; hidden without support permissions. */
export async function clientTickets(ctx: Ctx, clientId: string) {
  if (!isStaff(ctx)) return null;
  return prisma.supportTicket.findMany({ where: { AND: [{ organizationId: ctx.organizationId, clientId }, await ticketWhere(ctx)] }, orderBy: [{ createdAt: "desc" }], take: 50, include: { slaPolicy: { select: { warnAtPercent: true } } } });
}

/** Project page — tickets linked to the project, still filtered by ticket scope (members never get client tickets by membership alone). */
export async function projectTickets(ctx: Ctx, projectId: string) {
  if (!isStaff(ctx)) return null;
  return prisma.supportTicket.findMany({ where: { AND: [{ organizationId: ctx.organizationId, projectId }, await ticketWhere(ctx)] }, orderBy: [{ createdAt: "desc" }], take: 50 });
}
