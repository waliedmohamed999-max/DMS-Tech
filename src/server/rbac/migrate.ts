import { prisma } from "../db";
import { PERMISSION_COMPANIONS, PERMISSION_RENAMES } from "./permissions";

/**
 * Migrates renamed permission keys on CUSTOM roles (system roles are re-synced from code by
 * ensureOrganization). Runs from bootstrap on every deploy:
 *   - each legacy key is replaced by its mapped keys (PERMISSION_RENAMES) and then removed,
 *     so a second run finds nothing to do (idempotent);
 *   - it only grants what the legacy key expressed — never record-scope or approval rights
 *     the old key did not cover;
 *   - every role change is written to the audit log (rbac.permissions_migrated).
 */
export async function migrateLegacyPermissions(organizationId: string) {
  const legacy = Object.keys(PERMISSION_RENAMES);
  const rows = await prisma.rolePermission.findMany({
    where: { permission: { in: legacy }, role: { organizationId, isSystem: false } },
    select: { roleId: true, permission: true, role: { select: { key: true } } }
  });
  const byRole = new Map<string, { key: string; old: string[] }>();
  for (const r of rows) {
    const e = byRole.get(r.roleId) ?? { key: r.role.key, old: [] };
    e.old.push(r.permission);
    byRole.set(r.roleId, e);
  }
  const changes: { role: string; from: string[]; to: string[] }[] = [];
  for (const [roleId, { key, old }] of byRole) {
    const to = [...new Set(old.flatMap((o) => PERMISSION_RENAMES[o]))];
    await prisma.$transaction(async (tx) => {
      const existing = new Set((await tx.rolePermission.findMany({ where: { roleId }, select: { permission: true } })).map((p) => p.permission));
      const added = to.filter((p) => !existing.has(p));
      await tx.rolePermission.createMany({ data: added.map((permission) => ({ roleId, permission })), skipDuplicates: true });
      await tx.rolePermission.deleteMany({ where: { roleId, permission: { in: old } } });
      await tx.auditLog.create({
        data: { organizationId, action: "rbac.permissions_migrated", entityType: "Role", entityId: roleId, before: { role: key, legacy: old }, after: { role: key, added, removed: old } }
      });
      changes.push({ role: key, from: old, to: added });
    });
  }

  // companions: keys that must accompany an existing key (e.g. submitting an expense needs creating one)
  for (const [source, extra] of Object.entries(PERMISSION_COMPANIONS)) {
    const roles = await prisma.role.findMany({ where: { organizationId, isSystem: false, permissions: { some: { permission: source } } }, select: { id: true, key: true, permissions: { select: { permission: true } } } });
    for (const r of roles) {
      const have = new Set(r.permissions.map((p) => p.permission));
      const added = extra.filter((p) => !have.has(p));
      if (!added.length) continue;
      await prisma.$transaction(async (tx) => {
        await tx.rolePermission.createMany({ data: added.map((permission) => ({ roleId: r.id, permission })), skipDuplicates: true });
        await tx.auditLog.create({ data: { organizationId, action: "rbac.permissions_migrated", entityType: "Role", entityId: r.id, before: { role: r.key, companionOf: source }, after: { role: r.key, added } } });
      });
      changes.push({ role: r.key, from: [source], to: added });
    }
  }
  return changes;
}
