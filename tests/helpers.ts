import { prisma } from "@/server/db";
import { ensureOrganization } from "@/server/bootstrap";
import { hashPassword } from "@/server/auth/password";
import { registerSubscribers } from "@/server/events/subscribers";
import "@/server/admin/users"; // approval handlers
import { isPermission } from "@/server/rbac/permissions";
import type { Ctx } from "@/server/context";

registerSubscribers();

export const PASSWORD = "TestPassw0rd!";
let pwHash: string | null = null;

/** Wipe all tables (TRUNCATE bypasses the audit row trigger by design). */
export async function resetDb() {
  if (!process.env.DATABASE_URL?.includes("_test")) throw new Error("refusing to reset a non-test database");
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

export async function setupOrg() {
  return ensureOrganization({ slug: "test-org", name: "Test Org", nameAr: "منشأة اختبار" });
}

export async function makeUser(orgId: string, email: string, roleKeys: string[], extra: Partial<{ status: "ACTIVE" | "DISABLED" }> = {}) {
  pwHash ??= await hashPassword(PASSWORD);
  const roles = await prisma.role.findMany({ where: { organizationId: orgId, key: { in: roleKeys } } });
  return prisma.user.create({
    data: { organizationId: orgId, email, name: email.split("@")[0], passwordHash: pwHash, status: extra.status ?? "ACTIVE", roles: { create: roles.map((r) => ({ roleId: r.id })) } }
  });
}

export async function ctxFor(userId: string): Promise<Ctx> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: { include: { role: { include: { permissions: true } } } } } });
  return {
    organizationId: u.organizationId,
    userId: u.id,
    userName: u.name,
    roleKeys: u.roles.map((r) => r.role.key),
    permissions: new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission)).filter(isPermission))
  };
}

export const roleId = async (orgId: string, key: string) => (await prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: orgId, key } } })).id;
