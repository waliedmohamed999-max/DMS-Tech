import { z } from "zod";
import type { CrmActivityType, CrmEntity, Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { requirePermission, type Ctx } from "../context";
import { forbidden, notFound } from "../errors";
import { sanitize, unitOfWork } from "../events/bus";
import { clientWhere, ownedWhere } from "./scope";
import { optDate, reqText } from "./normalize";
import { ACTIVITY_TYPES_USER } from "@/lib/crm/services";

/**
 * Resolves a CRM entity the actor is allowed to see (scope-aware) and returns the
 * owning clientId used to aggregate timelines on the Client 360 page.
 * Throws NOT_FOUND (never FORBIDDEN) so record existence is not leaked.
 */
export async function visibleEntity(ctx: Ctx, entityType: CrmEntity, entityId: string): Promise<{ clientId: string | null }> {
  const org = { organizationId: ctx.organizationId };
  if (entityType === "LEAD") {
    const l = await prisma.lead.findFirst({ where: { id: entityId, ...org, ...(await ownedWhere(ctx)) }, select: { convertedClientId: true } });
    if (!l) throw notFound("Lead");
    return { clientId: l.convertedClientId };
  }
  if (entityType === "OPPORTUNITY") {
    const o = await prisma.opportunity.findFirst({ where: { id: entityId, ...org, ...(await ownedWhere(ctx)) }, select: { clientId: true } });
    if (!o) throw notFound("Opportunity");
    return { clientId: o.clientId };
  }
  if (entityType === "CLIENT") {
    const c = await prisma.client.findFirst({ where: { id: entityId, ...org, deletedAt: null, ...(await clientWhere(ctx)) }, select: { id: true } });
    if (!c) throw notFound("Client");
    return { clientId: c.id };
  }
  const ct = await prisma.contact.findFirst({ where: { id: entityId, ...org, deletedAt: null }, select: { clientId: true, createdById: true } });
  if (!ct) throw notFound("Contact");
  if (ct.clientId) await visibleEntity(ctx, "CLIENT", ct.clientId);
  else if (ct.createdById !== ctx.userId && !ctx.permissions.has("crm.records.all")) throw notFound("Contact");
  return { clientId: ct.clientId };
}

/** System-generated timeline entry (status changes, captures, conversions). Call inside a transaction. */
export async function systemActivity(
  tx: Tx,
  ctx: Ctx,
  a: { entityType: CrmEntity; entityId: string; clientId?: string | null; type?: CrmActivityType; title: string; description?: string | null; metadata?: unknown }
) {
  await tx.crmActivity.create({
    data: {
      organizationId: ctx.organizationId,
      entityType: a.entityType,
      entityId: a.entityId,
      clientId: a.clientId ?? null,
      type: a.type ?? "SYSTEM",
      title: a.title,
      description: a.description ?? null,
      isSystem: true,
      createdById: ctx.userId || null,
      metadata: sanitize(a.metadata)
    }
  });
}

async function touch(tx: Tx, entityType: CrmEntity, entityId: string) {
  const now = new Date();
  if (entityType === "LEAD") await tx.lead.update({ where: { id: entityId }, data: { lastActivityAt: now } });
  if (entityType === "OPPORTUNITY") await tx.opportunity.update({ where: { id: entityId }, data: { lastActivityAt: now } });
}

const entitySchema = z.object({ entityType: z.enum(["LEAD", "CLIENT", "CONTACT", "OPPORTUNITY"]), entityId: z.string().min(1).max(40) });

const activitySchema = entitySchema.extend({
  type: z.enum(ACTIVITY_TYPES_USER),
  title: reqText(2, 200),
  description: z.preprocess((v) => (v === "" ? null : v), z.string().max(4000).nullable().optional()),
  occurredAt: optDate
});

/** User-logged activity (call, meeting, WhatsApp …). */
export async function logActivity(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "crm.activities.create");
  const input = activitySchema.parse(raw);
  const { clientId } = await visibleEntity(ctx, input.entityType, input.entityId);
  return unitOfWork(ctx, async (tx, uow) => {
    const a = await tx.crmActivity.create({
      data: {
        organizationId: ctx.organizationId,
        entityType: input.entityType,
        entityId: input.entityId,
        clientId,
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        createdById: ctx.userId,
        occurredAt: input.occurredAt ?? new Date()
      }
    });
    await touch(tx, input.entityType, input.entityId);
    await uow.audit({ action: "crm.activity_logged", entityType: input.entityType, entityId: input.entityId, after: { type: a.type, title: a.title } });
    return a;
  });
}

export async function listActivities(ctx: Ctx, entityType: CrmEntity, entityId: string, take = 50) {
  requirePermission(ctx, "crm.activities.view");
  await visibleEntity(ctx, entityType, entityId);
  const where: Prisma.CrmActivityWhereInput =
    entityType === "CLIENT"
      ? { organizationId: ctx.organizationId, OR: [{ entityType: "CLIENT", entityId }, { clientId: entityId }] }
      : { organizationId: ctx.organizationId, entityType, entityId };
  return prisma.crmActivity.findMany({ where, orderBy: { occurredAt: "desc" }, take, include: { createdBy: { select: { id: true, name: true, nameAr: true } } } });
}

// ---------------------------------------------------------------------------
// Notes (internal only)
// ---------------------------------------------------------------------------

const noteSchema = entitySchema.extend({ body: reqText(1, 8000) });

export async function addNote(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "crm.activities.create");
  const input = noteSchema.parse(raw);
  const { clientId } = await visibleEntity(ctx, input.entityType, input.entityId);
  return unitOfWork(ctx, async (tx, uow) => {
    const n = await tx.crmNote.create({ data: { organizationId: ctx.organizationId, entityType: input.entityType, entityId: input.entityId, clientId, body: input.body, authorId: ctx.userId } });
    await touch(tx, input.entityType, input.entityId);
    await uow.audit({ action: "crm.note_added", entityType: input.entityType, entityId: input.entityId, after: { noteId: n.id } });
    return n;
  });
}

export async function updateNote(ctx: Ctx, noteId: string, body: string) {
  requirePermission(ctx, "crm.activities.create");
  const parsed = reqText(1, 8000).parse(body);
  return unitOfWork(ctx, async (tx, uow) => {
    const n = await tx.crmNote.findFirst({ where: { id: noteId, organizationId: ctx.organizationId, deletedAt: null } });
    if (!n) throw notFound("Note");
    if (n.authorId !== ctx.userId) throw forbidden("only the author can edit a note");
    await tx.crmNote.update({ where: { id: noteId }, data: { body: parsed } });
    await uow.audit({ action: "crm.note_updated", entityType: n.entityType, entityId: n.entityId, before: { body: n.body }, after: { body: parsed } });
  });
}

export async function deleteNote(ctx: Ctx, noteId: string) {
  requirePermission(ctx, "crm.activities.create");
  return unitOfWork(ctx, async (tx, uow) => {
    const n = await tx.crmNote.findFirst({ where: { id: noteId, organizationId: ctx.organizationId, deletedAt: null } });
    if (!n) throw notFound("Note");
    if (n.authorId !== ctx.userId) throw forbidden("only the author can delete a note");
    await tx.crmNote.update({ where: { id: noteId }, data: { deletedAt: new Date() } });
    await uow.audit({ action: "crm.note_deleted", entityType: n.entityType, entityId: n.entityId, before: { body: n.body } });
  });
}

export async function listNotes(ctx: Ctx, entityType: CrmEntity, entityId: string) {
  requirePermission(ctx, "crm.activities.view");
  await visibleEntity(ctx, entityType, entityId);
  const where: Prisma.CrmNoteWhereInput =
    entityType === "CLIENT"
      ? { organizationId: ctx.organizationId, deletedAt: null, OR: [{ entityType: "CLIENT", entityId }, { clientId: entityId }] }
      : { organizationId: ctx.organizationId, deletedAt: null, entityType, entityId };
  return prisma.crmNote.findMany({ where, orderBy: { createdAt: "desc" }, include: { author: { select: { id: true, name: true, nameAr: true } } } });
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function setTags(ctx: Ctx, entityType: CrmEntity, entityId: string, names: string[]) {
  requirePermission(ctx, entityType === "LEAD" ? "crm.leads.edit" : entityType === "OPPORTUNITY" ? "crm.opportunities.edit" : "crm.clients.edit");
  await visibleEntity(ctx, entityType, entityId);
  const clean = [...new Set(names.map((n) => n.trim().slice(0, 40)).filter(Boolean))].slice(0, 12);
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await tx.crmEntityTag.findMany({ where: { entityType, entityId }, include: { tag: true } });
    const tags = await Promise.all(
      clean.map((name) => tx.crmTag.upsert({ where: { organizationId_name: { organizationId: ctx.organizationId, name } }, update: {}, create: { organizationId: ctx.organizationId, name } }))
    );
    await tx.crmEntityTag.deleteMany({ where: { entityType, entityId } });
    if (tags.length) await tx.crmEntityTag.createMany({ data: tags.map((t) => ({ tagId: t.id, entityType, entityId })) });
    await uow.audit({ action: "crm.tags_changed", entityType, entityId, before: { tags: before.map((b) => b.tag.name) }, after: { tags: clean } });
  });
}

export const tagsFor = (entityType: CrmEntity, entityId: string) =>
  prisma.crmEntityTag.findMany({ where: { entityType, entityId }, include: { tag: true } }).then((r) => r.map((x) => x.tag.name));
