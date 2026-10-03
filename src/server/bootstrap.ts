import { prisma } from "./db";
import { hashPassword, passwordProblems } from "./auth/password";
import { resolveRolePermissions, SYSTEM_ROLES } from "./rbac/permissions";
import { ensureDefaultPipeline } from "./crm/pipeline";
import { ensureDefaultServices } from "./commercial/catalog";
import { backfillLegacyServiceIds } from "./commercial/legacy";
import { migrateLegacyPermissions } from "./rbac/migrate";
import { ensureDefaultProjectTemplates } from "./projects/templates";
import { ensureExpenseCategories } from "./finance/expenses";
import { ensureLeaveTypes } from "./hr/leave";
import { ensurePayrollComponents } from "./hr/payroll";
import { policyOf } from "./hr/attendance";
import { ensureProcurementRules } from "./ops/procurement";
import { ensureAssetCategories } from "./ops/assets";
import { ensureSlaPolicies } from "./ops/support";
import { ensureKnowledgeCategories } from "./ops/knowledge";
import { ensureRegistry } from "./integrations/registry";
import { appEnv, ensureDeploymentMarker } from "./system/environment";

/**
 * Idempotent organization bootstrap: creates the organization and its system roles,
 * and re-syncs system-role permissions with the code catalog (custom roles untouched).
 * Safe to run in production. Creates NO demo data.
 */
export async function ensureOrganization(input: { slug: string; name: string; nameAr?: string }) {
  const org = await prisma.organization.upsert({
    where: { slug: input.slug },
    update: {},
    create: { slug: input.slug, name: input.name, nameAr: input.nameAr ?? null }
  });

  for (const def of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { organizationId_key: { organizationId: org.id, key: def.key } },
      update: { name: def.name.en, nameAr: def.name.ar, isSystem: true },
      create: { organizationId: org.id, key: def.key, name: def.name.en, nameAr: def.name.ar, isSystem: true }
    });
    const perms = resolveRolePermissions(def);
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id, permission: { notIn: perms } } }),
      prisma.rolePermission.createMany({ data: perms.map((permission) => ({ roleId: role.id, permission })), skipDuplicates: true })
    ]);
  }
  await ensureDefaultPipeline(org.id);
  // Phase 3: default DMS catalog (only missing keys), then map legacy Phase 2 service keys
  await ensureDefaultServices(org.id);
  await backfillLegacyServiceIds(org.id);
  // renamed permission keys on custom roles (idempotent, audited)
  await migrateLegacyPermissions(org.id);
  // Phase 4: default delivery templates (only missing codes)
  await ensureDefaultProjectTemplates(org.id);
  await ensureExpenseCategories(org.id);
  // Phase 6: leave types (no balances configured), payroll components, attendance policy (defaults are configuration)
  await ensureLeaveTypes(org.id);
  await ensurePayrollComponents(org.id);
  await policyOf(prisma, org.id);
  // Phase 7 company defaults (editable in Operations settings; existing rows are never overwritten)
  await ensureProcurementRules(org.id);
  await ensureAssetCategories(org.id);
  await ensureSlaPolicies(org.id);
  await ensureKnowledgeCategories(org.id);
  await ensureRegistry(org.id);
  // Phase 10: the database remembers which environment it belongs to (immutable)
  await ensureDeploymentMarker();
  return org;
}

/** Shared demo identities (development seed only). Never allowed in production. */
export const DEMO_EMAIL_DOMAIN = "@dms.test";
export const DEMO_PASSWORD = "DmsDemo2026!";

/** Phase 9: production accounts may never use the shared demo domain / password. */
export function assertProductionAccountSafe(email: string, password: string | null, env: Record<string, string | undefined> = process.env) {
  // production safety applies to the production deployment (and to any production build without an explicit APP_ENV)
  if (appEnv(env) !== "production") return;
  if (email.trim().toLowerCase().endsWith(DEMO_EMAIL_DOMAIN)) throw new Error("Refused: demo e-mail domain in production");
  if (password !== null && password === DEMO_PASSWORD) throw new Error("Refused: shared demo password in production");
}

/**
 * Create (or return) the first Super Admin. Requires a strong password.
 * In production the password given on the command line is TEMPORARY: the admin must replace it at first sign-in.
 */
export async function ensureSuperAdmin(orgId: string, input: { email: string; name: string; password: string; temporary?: boolean }) {
  assertProductionAccountSafe(input.email, input.password);
  const problem = passwordProblems(input.password);
  if (problem) throw new Error(`Weak password: ${problem}`);
  const email = input.email.trim().toLowerCase();
  const role = await prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: orgId, key: "super_admin" } } });
  const existing = await prisma.user.findFirst({ where: { organizationId: orgId, email } });
  if (existing) return existing;
  const user = await prisma.user.create({
    data: {
      organizationId: orgId,
      email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      mustChangePassword: input.temporary ?? (appEnv() === "production" || appEnv() === "staging"),
      roles: { create: { roleId: role.id } }
    }
  });
  await prisma.auditLog.create({ data: { organizationId: orgId, actorId: user.id, action: "system.bootstrap_admin_created", entityType: "User", entityId: user.id, after: { email, mustChangePassword: user.mustChangePassword, environment: process.env.NODE_ENV ?? "development" } } });
  return user;
}
