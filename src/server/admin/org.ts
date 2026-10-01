import { z } from "zod";
import { prisma } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { ALL_PERMISSIONS, isPermission, PRIVILEGED_ROLE_KEYS } from "../rbac/permissions";

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function listRoles(ctx: Ctx) {
  requirePermission(ctx, "admin.roles.view");
  const roles = await prisma.role.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: { permissions: { select: { permission: true } }, _count: { select: { users: true } } }
  });
  return roles.map((r) => ({ ...r, permissions: r.permissions.map((p) => p.permission).filter(isPermission) }));
}

/** Minimal role list for pickers: allowed for user managers and role viewers. */
export async function listRoleOptions(ctx: Ctx) {
  if (!can(ctx, "admin.users.view") && !can(ctx, "admin.roles.view")) throw forbidden("admin.users.view");
  return prisma.role.findMany({ where: { organizationId: ctx.organizationId }, orderBy: [{ isSystem: "desc" }, { name: "asc" }], select: { id: true, key: true, name: true, nameAr: true } });
}

const roleSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{2,40}$/, "ROLE_KEY_FORMAT"),
  name: z.string().trim().min(2).max(80),
  nameAr: z.string().trim().max(80).optional().or(z.literal("")),
  description: z.string().trim().max(300).optional().or(z.literal(""))
});

export async function createRole(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "admin.roles.manage");
  const input = roleSchema.parse(raw);
  const exists = await prisma.role.findFirst({ where: { organizationId: ctx.organizationId, key: input.key } });
  if (exists) throw conflict("ROLE_KEY_TAKEN");
  return unitOfWork(ctx, async (tx, uow) => {
    const r = await tx.role.create({ data: { organizationId: ctx.organizationId, key: input.key, name: input.name, nameAr: input.nameAr || null, description: input.description || null } });
    await uow.audit({ action: "role.created", entityType: "Role", entityId: r.id, after: r });
    uow.emit({ type: "role.created", entityType: "Role", entityId: r.id, activity: { entityLabel: r.nameAr ?? r.name, href: "/app/admin/roles", visibility: "admin.roles.view" } });
    return r;
  });
}

/**
 * Replace a role's permission set. Super Admin is immutable; privileged roles can
 * only be edited by holders of admin.roles.grant_privileged. Unknown keys are rejected.
 */
export async function setRolePermissions(ctx: Ctx, roleId: string, perms: string[]) {
  requirePermission(ctx, "admin.roles.manage");
  const bad = perms.filter((p) => !isPermission(p));
  if (bad.length) throw invalid("UNKNOWN_PERMISSION", bad);
  const role = await prisma.role.findFirst({ where: { id: roleId, organizationId: ctx.organizationId }, include: { permissions: true } });
  if (!role) throw notFound("Role");
  if (role.key === "super_admin") throw forbidden("super_admin is immutable");
  if ((PRIVILEGED_ROLE_KEYS as readonly string[]).includes(role.key) && !can(ctx, "admin.roles.grant_privileged")) throw forbidden("admin.roles.grant_privileged");
  // nobody can hand out a permission they do not hold themselves
  const escalation = perms.filter((p) => isPermission(p) && !ctx.permissions.has(p));
  if (escalation.length) throw forbidden(`cannot grant permissions you do not hold: ${escalation.join(", ")}`);

  const before = role.permissions.map((p) => p.permission).sort();
  const after = [...new Set(perms)].sort();
  await unitOfWork(ctx, async (tx, uow) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (after.length) await tx.rolePermission.createMany({ data: after.map((permission) => ({ roleId, permission })) });
    await uow.audit({ action: "role.permissions_changed", entityType: "Role", entityId: roleId, before: { permissions: before }, after: { permissions: after } });
    uow.emit({ type: "role.permissions_changed", entityType: "Role", entityId: roleId, activity: { entityLabel: role.nameAr ?? role.name, href: "/app/admin/roles", visibility: "admin.roles.view" } });
  });
  return { before, after };
}

export const permissionCatalog = () => ALL_PERMISSIONS;

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export async function listDepartments(ctx: Ctx) {
  // department names are not sensitive; any signed-in user may read them (used in pickers)
  return prisma.department.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null },
    orderBy: { name: "asc" },
    include: { manager: { select: { id: true, name: true } }, _count: { select: { members: { where: { deletedAt: null } } } } }
  });
}

const deptSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,12}$/, "DEPT_CODE_FORMAT"),
  name: z.string().trim().min(2).max(80),
  nameAr: z.string().trim().max(80).optional().or(z.literal("")),
  managerId: z.string().optional().or(z.literal(""))
});

export async function saveDepartment(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "admin.departments.manage");
  const input = deptSchema.parse(raw);
  if (input.managerId) {
    const m = await prisma.user.findFirst({ where: { id: input.managerId, organizationId: ctx.organizationId, deletedAt: null } });
    if (!m) throw invalid("UNKNOWN_MANAGER");
  }
  const clash = await prisma.department.findFirst({ where: { organizationId: ctx.organizationId, code: input.code, NOT: input.id ? { id: input.id } : undefined } });
  if (clash) throw conflict("DEPT_CODE_TAKEN");
  return unitOfWork(ctx, async (tx, uow) => {
    const data = { code: input.code, name: input.name, nameAr: input.nameAr || null, managerId: input.managerId || null };
    if (input.id) {
      const before = await tx.department.findFirst({ where: { id: input.id, organizationId: ctx.organizationId, deletedAt: null } });
      if (!before) throw notFound("Department");
      const d = await tx.department.update({ where: { id: input.id }, data });
      await uow.audit({ action: "department.updated", entityType: "Department", entityId: d.id, before, after: d });
      return d;
    }
    const d = await tx.department.create({ data: { ...data, organizationId: ctx.organizationId } });
    await uow.audit({ action: "department.created", entityType: "Department", entityId: d.id, after: d });
    uow.emit({ type: "department.created", entityType: "Department", entityId: d.id, activity: { entityLabel: d.nameAr ?? d.name, href: "/app/admin/departments" } });
    return d;
  });
}

export async function archiveDepartment(ctx: Ctx, id: string) {
  requirePermission(ctx, "admin.departments.manage");
  return unitOfWork(ctx, async (tx, uow) => {
    const d = await tx.department.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, include: { _count: { select: { members: { where: { deletedAt: null } } } } } });
    if (!d) throw notFound("Department");
    if (d._count.members > 0) throw conflict("DEPT_HAS_MEMBERS");
    await tx.department.update({ where: { id }, data: { deletedAt: new Date() } });
    await uow.audit({ action: "department.archived", entityType: "Department", entityId: id, before: d });
  });
}

// ---------------------------------------------------------------------------
// Company settings
// ---------------------------------------------------------------------------

export async function getSettings(ctx: Ctx) {
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
  return {
    ...o,
    vatRate: Number(o.vatRate),
    quoteApprovalThreshold: Number(o.quoteApprovalThreshold),
    discountApprovalPercent: Number(o.discountApprovalPercent),
    quoteExecutiveApprovalThreshold: o.quoteExecutiveApprovalThreshold == null ? null : Number(o.quoteExecutiveApprovalThreshold)
  };
}

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().max(120).optional().or(z.literal("")),
  legalName: z.string().trim().max(200).optional().or(z.literal("")),
  vatNumber: z.string().trim().regex(/^$|^3\d{13}3$/, "VAT_NUMBER_FORMAT").optional(),
  crNumber: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.email().optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  currency: z.string().trim().length(3).toUpperCase(),
  vatRate: z.coerce.number().min(0).max(100),
  quoteApprovalThreshold: z.coerce.number().min(0),
  discountApprovalPercent: z.coerce.number().min(0).max(100),
  // Phase 3 commercial rules (optional in the form so older clients keep working)
  quoteExecutiveApprovalThreshold: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().min(0).nullable()).optional(),
  quoteCustomPricingRequiresApproval: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()).optional(),
  quoteValidityDays: z.coerce.number().int().min(1).max(365).optional(),
  quoteExpiryWarningDays: z.coerce.number().int().min(0).max(60).optional(),
  contractExpiryWarningDays: z.coerce.number().int().min(0).max(365).optional(),
  // Phase 4 delivery policy
  projectFromQuotationAllowed: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()).optional(),
  internalProjectsAllowed: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()).optional(),
  timesheetMaxDailyMinutes: z.coerce.number().int().min(60).max(1440).optional(),
  projectInactivityDays: z.coerce.number().int().min(1).max(180).optional(),
  defaultLocale: z.enum(["ar", "en"])
});

export async function updateSettings(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "admin.settings.manage");
  const input = settingsSchema.parse(raw);
  const blank = (v?: string) => (v ? v : null);
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
    const after = await tx.organization.update({
      where: { id: ctx.organizationId },
      data: {
        name: input.name, nameAr: blank(input.nameAr), legalName: blank(input.legalName), vatNumber: blank(input.vatNumber), crNumber: blank(input.crNumber),
        email: blank(input.email), phone: blank(input.phone), address: blank(input.address), city: blank(input.city),
        currency: input.currency, vatRate: input.vatRate, quoteApprovalThreshold: input.quoteApprovalThreshold,
        discountApprovalPercent: input.discountApprovalPercent, defaultLocale: input.defaultLocale,
        ...(input.quoteExecutiveApprovalThreshold !== undefined && { quoteExecutiveApprovalThreshold: input.quoteExecutiveApprovalThreshold }),
        ...(input.quoteCustomPricingRequiresApproval !== undefined && { quoteCustomPricingRequiresApproval: input.quoteCustomPricingRequiresApproval }),
        ...(input.quoteValidityDays !== undefined && { quoteValidityDays: input.quoteValidityDays }),
        ...(input.quoteExpiryWarningDays !== undefined && { quoteExpiryWarningDays: input.quoteExpiryWarningDays }),
        ...(input.contractExpiryWarningDays !== undefined && { contractExpiryWarningDays: input.contractExpiryWarningDays }),
        ...(input.projectFromQuotationAllowed !== undefined && { projectFromQuotationAllowed: input.projectFromQuotationAllowed }),
        ...(input.internalProjectsAllowed !== undefined && { internalProjectsAllowed: input.internalProjectsAllowed }),
        ...(input.timesheetMaxDailyMinutes !== undefined && { timesheetMaxDailyMinutes: input.timesheetMaxDailyMinutes }),
        ...(input.projectInactivityDays !== undefined && { projectInactivityDays: input.projectInactivityDays })
      }
    });
    await uow.audit({ action: "settings.updated", entityType: "Organization", entityId: after.id, before, after });
    uow.emit({ type: "settings.updated", entityType: "Organization", entityId: after.id, activity: { entityLabel: after.nameAr ?? after.name, href: "/app/admin/settings", visibility: "admin.settings.manage" } });
  });
}
