import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { hashPassword } from "../auth/password";
import { PRIVILEGED_ROLE_KEYS } from "../rbac/permissions";
import { registerApprovalHandler, requestApprovalTx } from "../approvals/service";

const isPrivileged = (key: string) => (PRIVILEGED_ROLE_KEYS as readonly string[]).includes(key);

export const USERS_PAGE_SIZE = 20;
const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "INVITED", "DISABLED"]).optional(),
  role: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  sort: z.enum(["name", "createdAt", "lastLoginAt"]).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc")
});

export async function listUsers(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "admin.users.view");
  const f = listSchema.parse(raw ?? {});
  const where = {
    organizationId: ctx.organizationId,
    deletedAt: null,
    ...(f.status ? { status: f.status } : {}),
    ...(f.role ? { roles: { some: { role: { key: f.role } } } } : {}),
    ...(f.q
      ? { OR: [{ name: { contains: f.q, mode: "insensitive" as const } }, { nameAr: { contains: f.q } }, { email: { contains: f.q, mode: "insensitive" as const } }, { jobTitle: { contains: f.q, mode: "insensitive" as const } }] }
      : {})
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { [f.sort]: f.dir },
      skip: (f.page - 1) * USERS_PAGE_SIZE,
      take: USERS_PAGE_SIZE,
      select: {
        id: true, name: true, nameAr: true, email: true, jobTitle: true, status: true, lastLoginAt: true, createdAt: true, lockedUntil: true,
        department: { select: { id: true, name: true, nameAr: true } },
        roles: { select: { role: { select: { key: true, name: true, nameAr: true } } } }
      }
    }),
    prisma.user.count({ where })
  ]);
  return { items, total, page: f.page, pageSize: USERS_PAGE_SIZE, filters: f };
}

export async function getUser(ctx: Ctx, id: string) {
  requirePermission(ctx, "admin.users.view");
  const u = await prisma.user.findFirst({
    where: { id, organizationId: ctx.organizationId, deletedAt: null },
    select: {
      id: true, name: true, nameAr: true, email: true, phone: true, jobTitle: true, status: true, locale: true, lastLoginAt: true, createdAt: true, lockedUntil: true, mustChangePassword: true,
      departmentId: true,
      roles: { select: { role: { select: { id: true, key: true, name: true, nameAr: true } } } },
      _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } }
    }
  });
  if (!u) throw notFound("User");
  return u;
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.email().trim().toLowerCase(),
  jobTitle: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  departmentId: z.string().optional().or(z.literal("")),
  roleIds: z.array(z.string()).min(1, "ROLE_REQUIRED")
});

/**
 * Creates a user with a one-time temporary password (must be changed at first login).
 * Privileged roles require `admin.roles.grant_privileged`; otherwise they are held back
 * and an approval is raised instead.
 */
export async function createUser(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "admin.users.manage");
  const input = createSchema.parse(raw);
  const exists = await prisma.user.findFirst({ where: { organizationId: ctx.organizationId, email: input.email } });
  if (exists) throw conflict("EMAIL_TAKEN");

  const roles = await prisma.role.findMany({ where: { id: { in: input.roleIds }, organizationId: ctx.organizationId } });
  if (roles.length !== input.roleIds.length) throw invalid("UNKNOWN_ROLE");
  if (input.departmentId) {
    const d = await prisma.department.findFirst({ where: { id: input.departmentId, organizationId: ctx.organizationId, deletedAt: null } });
    if (!d) throw invalid("UNKNOWN_DEPARTMENT");
  }

  const direct = roles.filter((r) => !isPrivileged(r.key) || can(ctx, "admin.roles.grant_privileged"));
  const needsApproval = roles.filter((r) => !direct.includes(r));

  const tempPassword = `Dms-${randomBytes(6).toString("base64url")}9`;
  const passwordHash = await hashPassword(tempPassword);

  const user = await unitOfWork(ctx, async (tx, uow) => {
    const u = await tx.user.create({
      data: {
        organizationId: ctx.organizationId,
        name: input.name,
        nameAr: input.nameAr || null,
        email: input.email,
        jobTitle: input.jobTitle || null,
        phone: input.phone || null,
        departmentId: input.departmentId || null,
        passwordHash,
        mustChangePassword: true,
        roles: { create: direct.map((r) => ({ roleId: r.id, grantedById: ctx.userId })) }
      }
    });
    await uow.audit({ action: "user.created", entityType: "User", entityId: u.id, after: { ...u, roles: direct.map((r) => r.key) } });
    uow.emit({
      type: "user.created",
      entityType: "User",
      entityId: u.id,
      payload: { roles: direct.map((r) => r.key) },
      activity: { entityLabel: u.name, href: `/app/admin/users/${u.id}`, visibility: "admin.users.view" }
    });
    for (const r of needsApproval) {
      await requestApprovalTx(tx, uow, ctx, {
        type: "ROLE_GRANT",
        entityType: "User",
        entityId: u.id,
        title: `${r.nameAr ?? r.name} ← ${u.nameAr || u.name}`,
        summary: `Grant privileged role "${r.name}" to ${u.email}`,
        payload: { roleId: r.id, roleKey: r.key },
        requiredPermission: "admin.roles.grant_privileged",
        priority: "HIGH"
      });
    }
    return u;
  });
  return { id: user.id, tempPassword, pendingRoles: needsApproval.map((r) => r.key) };
}

const updateSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().max(120).optional().or(z.literal("")),
  jobTitle: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  departmentId: z.string().optional().or(z.literal("")),
  locale: z.enum(["ar", "en"]).optional()
});

export async function updateUser(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "admin.users.manage");
  const input = updateSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await tx.user.findFirst({ where: { id: input.id, organizationId: ctx.organizationId, deletedAt: null } });
    if (!before) throw notFound("User");
    const after = await tx.user.update({
      where: { id: input.id },
      data: { name: input.name, nameAr: input.nameAr || null, jobTitle: input.jobTitle || null, phone: input.phone || null, departmentId: input.departmentId || null, ...(input.locale ? { locale: input.locale } : {}) }
    });
    await uow.audit({ action: "user.updated", entityType: "User", entityId: after.id, before, after });
    return after;
  });
}

/**
 * Replace a user's roles. Privileged additions without `admin.roles.grant_privileged`
 * become approvals. Nobody can remove their own admin access by accident.
 */
export async function setUserRoles(ctx: Ctx, userId: string, roleIds: string[]) {
  requirePermission(ctx, "admin.users.manage");
  const target = await prisma.user.findFirst({ where: { id: userId, organizationId: ctx.organizationId, deletedAt: null }, include: { roles: { include: { role: true } } } });
  if (!target) throw notFound("User");
  const roles = await prisma.role.findMany({ where: { id: { in: roleIds }, organizationId: ctx.organizationId } });
  if (roles.length !== roleIds.length) throw invalid("UNKNOWN_ROLE");
  if (!roles.length) throw invalid("ROLE_REQUIRED");

  const current = new Set(target.roles.map((r) => r.roleId));
  const wanted = new Set(roleIds);
  const added = roles.filter((r) => !current.has(r.id));
  const removed = target.roles.filter((r) => !wanted.has(r.roleId)).map((r) => r.role);

  if (userId === ctx.userId && removed.some((r) => r.key === "super_admin")) throw forbidden("cannot remove your own super admin role");
  if (removed.some((r) => isPrivileged(r.key)) && !can(ctx, "admin.roles.grant_privileged")) throw forbidden("admin.roles.grant_privileged");

  const direct = added.filter((r) => !isPrivileged(r.key) || can(ctx, "admin.roles.grant_privileged"));
  const needsApproval = added.filter((r) => !direct.includes(r));

  await unitOfWork(ctx, async (tx, uow) => {
    if (removed.length) await tx.userRole.deleteMany({ where: { userId, roleId: { in: removed.map((r) => r.id) } } });
    if (direct.length) await tx.userRole.createMany({ data: direct.map((r) => ({ userId, roleId: r.id, grantedById: ctx.userId })) });
    await uow.audit({
      action: "user.roles_changed",
      entityType: "User",
      entityId: userId,
      before: { roles: target.roles.map((r) => r.role.key) },
      after: { added: direct.map((r) => r.key), removed: removed.map((r) => r.key), pendingApproval: needsApproval.map((r) => r.key) }
    });
    uow.emit({
      type: "user.roles_changed",
      entityType: "User",
      entityId: userId,
      payload: { userId, added: direct.map((r) => r.nameAr ?? r.name), removed: removed.map((r) => r.key) },
      activity: { entityLabel: target.name, href: `/app/admin/users/${userId}`, visibility: "admin.users.view" }
    });
    for (const r of needsApproval) {
      await requestApprovalTx(tx, uow, ctx, {
        type: "ROLE_GRANT",
        entityType: "User",
        entityId: userId,
        title: `${r.nameAr ?? r.name} ← ${target.nameAr || target.name}`,
        summary: `Grant privileged role "${r.name}" to ${target.email}`,
        payload: { roleId: r.id, roleKey: r.key },
        requiredPermission: "admin.roles.grant_privileged",
        priority: "HIGH"
      });
    }
  });
  return { added: direct.map((r) => r.key), removed: removed.map((r) => r.key), pendingApproval: needsApproval.map((r) => r.key) };
}

export async function setUserStatus(ctx: Ctx, userId: string, status: "ACTIVE" | "DISABLED") {
  requirePermission(ctx, "admin.users.manage");
  if (userId === ctx.userId) throw forbidden("cannot change your own status");
  return unitOfWork(ctx, async (tx, uow) => {
    const u = await tx.user.findFirst({ where: { id: userId, organizationId: ctx.organizationId, deletedAt: null }, include: { roles: { include: { role: true } } } });
    if (!u) throw notFound("User");
    if (u.roles.some((r) => isPrivileged(r.role.key)) && !can(ctx, "admin.roles.grant_privileged")) throw forbidden("admin.roles.grant_privileged");
    await tx.user.update({ where: { id: userId }, data: { status, ...(status === "ACTIVE" ? { lockedUntil: null, failedLoginCount: 0 } : {}) } });
    if (status === "DISABLED") await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await uow.audit({ action: status === "DISABLED" ? "user.disabled" : "user.enabled", entityType: "User", entityId: userId, before: { status: u.status }, after: { status } });
    uow.emit({ type: status === "DISABLED" ? "user.disabled" : "user.enabled", entityType: "User", entityId: userId, activity: { entityLabel: u.name, href: `/app/admin/users/${userId}`, visibility: "admin.users.view" } });
  });
}

export async function resetUserPassword(ctx: Ctx, userId: string) {
  requirePermission(ctx, "admin.users.manage");
  const u = await prisma.user.findFirst({ where: { id: userId, organizationId: ctx.organizationId, deletedAt: null }, include: { roles: { include: { role: true } } } });
  if (!u) throw notFound("User");
  if (u.roles.some((r) => isPrivileged(r.role.key)) && !can(ctx, "admin.roles.grant_privileged")) throw forbidden("admin.roles.grant_privileged");
  const tempPassword = `Dms-${randomBytes(6).toString("base64url")}9`;
  const passwordHash = await hashPassword(tempPassword);
  await unitOfWork(ctx, async (tx, uow) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null } });
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await uow.audit({ action: "user.password_reset", entityType: "User", entityId: userId });
  });
  return { tempPassword };
}

// Approved privileged-role grant → apply it
registerApprovalHandler("ROLE_GRANT", {
  async onApproved(tx, uow, a, ctx) {
    const p = a.payload as { roleId: string; roleKey: string };
    const user = await tx.user.findFirst({ where: { id: a.entityId, organizationId: a.organizationId, deletedAt: null } });
    if (!user) throw notFound("User");
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: p.roleId } },
      create: { userId: user.id, roleId: p.roleId, grantedById: ctx.userId },
      update: {}
    });
    await uow.audit({ action: "user.role_granted_via_approval", entityType: "User", entityId: user.id, after: { role: p.roleKey, approvalId: a.id } });
    uow.emit({ type: "user.roles_changed", entityType: "User", entityId: user.id, payload: { userId: user.id, added: [p.roleKey], removed: [] } });
  }
});
