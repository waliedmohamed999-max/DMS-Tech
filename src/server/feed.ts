import { z } from "zod";
import type { NotificationCategory, Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { can, requirePermission, type Ctx } from "./context";

// ---------------------------------------------------------------------------
// Notifications (always scoped to the signed-in user)
// ---------------------------------------------------------------------------

export const NOTIF_PAGE_SIZE = 25;
const notifSchema = z.object({
  filter: z.enum(["all", "unread"]).default("all"),
  category: z.enum(["APPROVAL", "TASK", "INVOICE", "PROJECT", "CONTRACT", "HR", "SALES", "SYSTEM"]).optional(),
  page: z.coerce.number().int().min(1).default(1)
});

export async function listNotifications(ctx: Ctx, raw: unknown) {
  const f = notifSchema.parse(raw ?? {});
  const where: Prisma.NotificationWhereInput = {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    ...(f.filter === "unread" ? { readAt: null } : {}),
    ...(f.category ? { category: f.category as NotificationCategory } : {})
  };
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * NOTIF_PAGE_SIZE, take: NOTIF_PAGE_SIZE }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: ctx.userId, readAt: null } })
  ]);
  return { items, total, unread, page: f.page, pageSize: NOTIF_PAGE_SIZE, filters: f };
}

export const unreadCount = (ctx: Ctx) => prisma.notification.count({ where: { userId: ctx.userId, readAt: null } });
export const latestNotifications = (ctx: Ctx, take = 8) => prisma.notification.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take });

export async function markNotificationsRead(ctx: Ctx, ids: string[] | "all") {
  await prisma.notification.updateMany({
    where: { userId: ctx.userId, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() }
  });
}

// ---------------------------------------------------------------------------
// Activity feed (permission-filtered)
// ---------------------------------------------------------------------------

export const ACTIVITY_PAGE_SIZE = 30;

export async function listActivity(ctx: Ctx, raw: unknown) {
  const f = z.object({ page: z.coerce.number().int().min(1).default(1), entity: z.string().max(40).optional() }).parse(raw ?? {});
  const where: Prisma.ActivityWhereInput = {
    organizationId: ctx.organizationId,
    ...(f.entity ? { entityType: f.entity } : {}),
    // items with a visibility permission are only shown to holders (activity.view_all sees everything)
    ...(can(ctx, "activity.view_all") ? {} : { OR: [{ visibility: null }, { visibility: { in: [...ctx.permissions] } }, { actorId: ctx.userId }] })
  };
  const [items, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (f.page - 1) * ACTIVITY_PAGE_SIZE,
      take: ACTIVITY_PAGE_SIZE,
      include: { actor: { select: { id: true, name: true, nameAr: true } } }
    }),
    prisma.activity.count({ where })
  ]);
  return { items, total, page: f.page, pageSize: ACTIVITY_PAGE_SIZE };
}

// ---------------------------------------------------------------------------
// Audit log (read-only; rows are immutable at the DB level)
// ---------------------------------------------------------------------------

export const AUDIT_PAGE_SIZE = 30;
const auditSchema = z.object({
  q: z.string().trim().max(100).optional(),
  action: z.string().trim().max(60).optional(),
  entity: z.string().trim().max(40).optional(),
  actor: z.string().trim().max(40).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1)
});

export async function listAudit(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "admin.audit.view");
  const f = auditSchema.parse(raw ?? {});
  const where: Prisma.AuditLogWhereInput = {
    organizationId: ctx.organizationId,
    ...(f.action ? { action: { startsWith: f.action } } : {}),
    ...(f.entity ? { entityType: f.entity } : {}),
    ...(f.actor ? { actorId: f.actor } : {}),
    ...(f.q ? { OR: [{ entityId: { contains: f.q } }, { action: { contains: f.q } }] } : {}),
    ...(f.from || f.to
      ? { createdAt: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lte: new Date(`${f.to}T23:59:59Z`) } : {}) } }
      : {})
  };
  const [items, total, entityTypes] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (f.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      include: { actor: { select: { id: true, name: true } } }
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where: { organizationId: ctx.organizationId }, distinct: ["entityType"], select: { entityType: true } })
  ]);
  return { items, total, page: f.page, pageSize: AUDIT_PAGE_SIZE, filters: f, entityTypes: entityTypes.map((e) => e.entityType) };
}

export async function auditCountSince(ctx: Ctx, since: Date) {
  requirePermission(ctx, "admin.audit.view");
  return prisma.auditLog.count({ where: { organizationId: ctx.organizationId, createdAt: { gte: since } } });
}
