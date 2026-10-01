import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { CLIENT_STATUSES, LEAD_SOURCES } from "@/lib/crm/services";
import { blankToNull, normEmail, normPhone, optEmail, optId, optPhone, optText, reqText, parseListParams } from "./normalize";
import { nextNumber } from "./sequence";
import { clientWhere, ownedWhere, scopeOf } from "./scope";
import { systemActivity } from "./activities";

const clientActivity = (c: { id: string; number: string; displayName: string }) => ({ entityLabel: `${c.number} · ${c.displayName}`, href: `/app/crm/clients/${c.id}`, visibility: "crm.clients.view" as const });

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const clientSchema = z.object({
  type: z.enum(["COMPANY", "INDIVIDUAL"]).default("COMPANY"),
  displayName: reqText(2, 160),
  companyName: optText(160),
  nameAr: optText(160),
  nameEn: optText(160),
  email: optEmail,
  phone: optPhone,
  whatsapp: optPhone,
  website: z.preprocess(blankToNull, z.url().max(200).nullable().optional()),
  country: optText(60),
  city: optText(80),
  address: optText(300),
  industry: optText(80),
  taxNumber: z.preprocess(blankToNull, z.string().regex(/^3\d{13}3$/, "VAT_NUMBER_FORMAT").nullable().optional()),
  commercialRegistration: optText(20),
  source: z.preprocess(blankToNull, z.enum(LEAD_SOURCES).nullable().optional()),
  ownerId: optId,
  status: z.enum(CLIENT_STATUSES).optional(),
  notes: optText(4000)
});

export async function createClient(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "crm.clients.create");
  const input = clientSchema.parse(raw);
  const ownerId = input.ownerId ?? ctx.userId;
  if (ownerId !== ctx.userId && !can(ctx, "crm.leads.assign") && !can(ctx, "crm.opportunities.assign")) throw forbidden("crm.opportunities.assign");
  if (input.status === "ARCHIVED") throw invalid("USE_ARCHIVE");
  return unitOfWork(ctx, async (tx, uow) => {
    const number = await nextNumber(tx, ctx.organizationId, "CLI");
    const c = await tx.client.create({
      data: {
        ...input,
        organizationId: ctx.organizationId,
        number,
        ownerId,
        status: input.status ?? "PROSPECT",
        emailNormalized: normEmail(input.email),
        phoneNormalized: normPhone(input.phone),
        createdById: ctx.userId
      }
    });
    await systemActivity(tx, ctx, { entityType: "CLIENT", entityId: c.id, clientId: c.id, title: "client.created" });
    await uow.audit({ action: "client.created", entityType: "Client", entityId: c.id, after: c });
    uow.emit({ type: "client.created", entityType: "Client", entityId: c.id, activity: clientActivity(c) });
    return c;
  });
}

export async function updateClient(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "crm.clients.edit");
  const input = clientSchema.partial().extend({ id: z.string().min(1) }).parse(raw);
  if (input.status === "ARCHIVED") throw invalid("USE_ARCHIVE");
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await tx.client.findFirst({ where: { id: input.id, organizationId: ctx.organizationId, deletedAt: null, ...(await clientWhere(ctx)) } });
    if (!before) throw notFound("Client");
    if (before.status === "ARCHIVED") throw conflict("CLIENT_ARCHIVED");
    if (input.ownerId !== undefined && input.ownerId !== before.ownerId && !can(ctx, "crm.opportunities.assign")) throw forbidden("crm.opportunities.assign");
    const { id, ...d } = input;
    const after = await tx.client.update({
      where: { id },
      data: {
        ...d,
        ...(d.email !== undefined && { emailNormalized: normEmail(d.email) }),
        ...(d.phone !== undefined && { phoneNormalized: normPhone(d.phone) })
      }
    });
    await uow.audit({ action: "client.updated", entityType: "Client", entityId: id, before, after });
    uow.emit({ type: "client.updated", entityType: "Client", entityId: id });
    return after;
  });
}

/** Soft archive. Blocked while the client has open opportunities. */
export async function archiveClient(ctx: Ctx, id: string) {
  requirePermission(ctx, "crm.clients.archive");
  return unitOfWork(ctx, async (tx, uow) => {
    const c = await tx.client.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null } });
    if (!c) throw notFound("Client");
    const open = await tx.opportunity.count({ where: { clientId: id, status: "OPEN" } });
    if (open) throw conflict("CLIENT_HAS_OPEN_OPPORTUNITIES");
    await tx.client.update({ where: { id }, data: { status: "ARCHIVED" } });
    await systemActivity(tx, ctx, { entityType: "CLIENT", entityId: id, clientId: id, type: "STATUS_CHANGE", title: "client.archived", metadata: { from: c.status } });
    await uow.audit({ action: "client.archived", entityType: "Client", entityId: id, before: { status: c.status }, after: { status: "ARCHIVED" } });
  });
}

export const CLIENTS_PAGE_SIZE = 25;
const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(CLIENT_STATUSES).optional(),
  owner: z.string().max(40).optional(),
  type: z.enum(["COMPANY", "INDIVIDUAL"]).optional(),
  sort: z.enum(["displayName", "createdAt", "number"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1)
});

export async function listClients(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "crm.clients.view");
  const f = parseListParams(listSchema, raw);
  const where: Prisma.ClientWhereInput = {
    organizationId: ctx.organizationId,
    deletedAt: null,
    AND: [
      await clientWhere(ctx),
      f.status ? { status: f.status } : { status: { not: "ARCHIVED" } },
      f.type ? { type: f.type } : {},
      f.owner === "me" ? { ownerId: ctx.userId } : f.owner ? { ownerId: f.owner } : {},
      f.q
        ? {
            OR: [
              { displayName: { contains: f.q, mode: "insensitive" } },
              { nameAr: { contains: f.q } },
              { nameEn: { contains: f.q, mode: "insensitive" } },
              { email: { contains: f.q, mode: "insensitive" } },
              { number: { contains: f.q.toUpperCase() } },
              ...(normPhone(f.q) ? [{ phoneNormalized: { contains: normPhone(f.q)! } }] : [])
            ]
          }
        : {}
    ]
  };
  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { [f.sort]: f.dir },
      skip: (f.page - 1) * CLIENTS_PAGE_SIZE,
      take: CLIENTS_PAGE_SIZE,
      include: {
        owner: { select: { id: true, name: true, nameAr: true } },
        contacts: { where: { isPrimary: true, deletedAt: null }, take: 1, select: { firstName: true, lastName: true } },
        _count: { select: { opportunities: { where: { status: "OPEN" } } } }
      }
    }),
    prisma.client.count({ where })
  ]);
  return { items, total, page: f.page, pageSize: CLIENTS_PAGE_SIZE, filters: f };
}

/** Client 360: profile + real aggregates (no future-module data is fabricated). */
export async function getClient360(ctx: Ctx, id: string) {
  requirePermission(ctx, "crm.clients.view");
  const client = await prisma.client.findFirst({
    where: { id, organizationId: ctx.organizationId, deletedAt: null, ...(await clientWhere(ctx)) },
    include: {
      owner: { select: { id: true, name: true, nameAr: true } },
      contacts: { where: { deletedAt: null }, orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }] },
      convertedLeads: { select: { id: true, number: true, name: true, convertedAt: true } }
    }
  });
  if (!client) throw notFound("Client");

  const canOpps = can(ctx, "crm.opportunities.view");
  const oppWhere: Prisma.OpportunityWhereInput = { organizationId: ctx.organizationId, clientId: id, ...(await ownedWhere(ctx)) };
  const [opportunities, openAgg, wonAgg, nextOppFollow, lastActivity] = await Promise.all([
    canOpps
      ? prisma.opportunity.findMany({ where: oppWhere, orderBy: { createdAt: "desc" }, include: { stage: true, owner: { select: { name: true, nameAr: true } } } })
      : Promise.resolve([]),
    canOpps ? prisma.opportunity.aggregate({ where: { ...oppWhere, status: "OPEN" }, _sum: { estimatedValue: true }, _count: { _all: true } }) : Promise.resolve(null),
    canOpps ? prisma.opportunity.aggregate({ where: { ...oppWhere, status: "WON" }, _sum: { estimatedValue: true }, _count: { _all: true } }) : Promise.resolve(null),
    canOpps ? prisma.opportunity.findFirst({ where: { ...oppWhere, status: "OPEN", nextFollowUpAt: { not: null } }, orderBy: { nextFollowUpAt: "asc" }, select: { nextFollowUpAt: true, id: true, number: true } }) : Promise.resolve(null),
    prisma.crmActivity.findFirst({ where: { organizationId: ctx.organizationId, OR: [{ clientId: id }, { entityType: "CLIENT", entityId: id }] }, orderBy: { occurredAt: "desc" } })
  ]);
  return {
    client,
    opportunities: opportunities.map((o) => ({ ...o, estimatedValue: o.estimatedValue.toString() })),
    stats: {
      openCount: openAgg?._count._all ?? 0,
      openValue: openAgg?._sum.estimatedValue?.toString() ?? "0",
      wonCount: wonAgg?._count._all ?? 0,
      wonValue: wonAgg?._sum.estimatedValue?.toString() ?? "0",
      nextFollowUp: nextOppFollow,
      lastActivity
    }
  };
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

const contactSchema = z.object({
  clientId: optId,
  firstName: reqText(1, 80),
  lastName: optText(80),
  jobTitle: optText(120),
  email: optEmail,
  phone: optPhone,
  whatsapp: optPhone,
  isPrimary: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(false),
  preferredLanguage: z.enum(["ar", "en"]).default("ar"),
  notes: optText(2000)
});

async function visibleClientId(ctx: Ctx, clientId: string | null | undefined) {
  if (!clientId) return null;
  const c = await prisma.client.findFirst({ where: { id: clientId, organizationId: ctx.organizationId, deletedAt: null, ...(await clientWhere(ctx)) }, select: { id: true } });
  if (!c) throw notFound("Client");
  return c.id;
}

export async function createContact(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "crm.contacts.create");
  const input = contactSchema.parse(raw);
  const clientId = await visibleClientId(ctx, input.clientId);
  return unitOfWork(ctx, async (tx, uow) => {
    if (input.isPrimary && clientId) await tx.contact.updateMany({ where: { clientId, isPrimary: true }, data: { isPrimary: false } });
    const c = await tx.contact.create({
      data: { ...input, clientId, isPrimary: Boolean(clientId && input.isPrimary), organizationId: ctx.organizationId, emailNormalized: normEmail(input.email), phoneNormalized: normPhone(input.phone), createdById: ctx.userId }
    });
    if (clientId) await systemActivity(tx, ctx, { entityType: "CONTACT", entityId: c.id, clientId, title: "contact.created", metadata: { name: `${c.firstName} ${c.lastName ?? ""}`.trim() } });
    await uow.audit({ action: "contact.created", entityType: "Contact", entityId: c.id, after: c });
    uow.emit({ type: "contact.created", entityType: "Contact", entityId: c.id, payload: { clientId } });
    return c;
  });
}

export async function updateContact(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "crm.contacts.edit");
  const input = contactSchema.partial().extend({ id: z.string().min(1) }).parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await tx.contact.findFirst({ where: { id: input.id, organizationId: ctx.organizationId, deletedAt: null } });
    if (!before) throw notFound("Contact");
    const clientId = input.clientId !== undefined ? await visibleClientId(ctx, input.clientId) : await visibleClientId(ctx, before.clientId);
    if (!clientId && before.createdById !== ctx.userId && scopeOf(ctx) !== "ALL") throw notFound("Contact");
    if (input.isPrimary && clientId) await tx.contact.updateMany({ where: { clientId, isPrimary: true, NOT: { id: before.id } }, data: { isPrimary: false } });
    const { id, ...d } = input;
    const after = await tx.contact.update({
      where: { id },
      data: {
        ...d,
        clientId,
        ...(d.isPrimary !== undefined && { isPrimary: Boolean(clientId && d.isPrimary) }),
        ...(d.email !== undefined && { emailNormalized: normEmail(d.email) }),
        ...(d.phone !== undefined && { phoneNormalized: normPhone(d.phone) })
      }
    });
    await uow.audit({ action: "contact.updated", entityType: "Contact", entityId: id, before, after });
    uow.emit({ type: "contact.updated", entityType: "Contact", entityId: id });
    return after;
  });
}

export const CONTACTS_PAGE_SIZE = 25;
export async function listContacts(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "crm.contacts.view");
  const f = parseListParams(z.object({ q: z.string().trim().max(100).optional(), client: z.string().max(40).optional(), page: z.coerce.number().int().min(1).default(1) }), raw);
  const cw = await clientWhere(ctx);
  const visibility: Prisma.ContactWhereInput = scopeOf(ctx) === "ALL" ? {} : { OR: [{ client: cw as Prisma.ClientWhereInput }, { clientId: null, createdById: ctx.userId }] };
  const where: Prisma.ContactWhereInput = {
    organizationId: ctx.organizationId,
    deletedAt: null,
    AND: [
      visibility,
      f.client ? { clientId: f.client } : {},
      f.q
        ? {
            OR: [
              { firstName: { contains: f.q, mode: "insensitive" } },
              { lastName: { contains: f.q, mode: "insensitive" } },
              { email: { contains: f.q, mode: "insensitive" } },
              ...(normPhone(f.q) ? [{ phoneNormalized: { contains: normPhone(f.q)! } }] : [])
            ]
          }
        : {}
    ]
  };
  const [items, total] = await Promise.all([
    prisma.contact.findMany({ where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * CONTACTS_PAGE_SIZE, take: CONTACTS_PAGE_SIZE, include: { client: { select: { id: true, displayName: true } } } }),
    prisma.contact.count({ where })
  ]);
  return { items, total, page: f.page, pageSize: CONTACTS_PAGE_SIZE };
}

/** Lightweight pickers (forms): scoped, capped. */
export async function clientOptions(ctx: Ctx, q?: string) {
  requirePermission(ctx, "crm.clients.view");
  return prisma.client.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, status: { not: "ARCHIVED" }, ...(await clientWhere(ctx)), ...(q ? { displayName: { contains: q, mode: "insensitive" } } : {}) },
    orderBy: { displayName: "asc" },
    take: 200,
    select: { id: true, number: true, displayName: true, contacts: { where: { deletedAt: null }, select: { id: true, firstName: true, lastName: true, isPrimary: true } } }
  });
}

export const isClientVisible = async (ctx: Ctx, id: string) => Boolean(await visibleClientId(ctx, id).catch(() => null));
