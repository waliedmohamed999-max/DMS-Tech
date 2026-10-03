import { randomBytes } from "node:crypto";
import { prisma } from "../db";
import { hashPassword, passwordProblems } from "../auth/password";
import { assertProductionAccountSafe, DEMO_EMAIL_DOMAIN } from "../bootstrap";
import { appEnv } from "../system/environment";

/**
 * Super Admin provisioning / recovery (Phase 10 — used by `npm run admin:provision`).
 * Returns the ONE-TIME temporary password to show once; it is never stored in clear, logged or audited.
 */
export function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let p = "";
  for (const b of randomBytes(40)) if (p.length < 20) p += alphabet[b % alphabet.length];
  const out = `${p}-${randomBytes(2).toString("hex")}#A9`;
  if (passwordProblems(out)) throw new Error("generated password violates policy");
  return out;
}

/**
 * Dedicated LOW-privilege account for the production smoke suite (role "employee", no data rights beyond self-service).
 * Random password returned once, no forced change (automation must sign in), audited. Rotate it with --reset.
 */
export async function provisionSmokeAccount(organizationId: string, email: string, reset = false) {
  const e = email.trim().toLowerCase();
  if (e.endsWith(DEMO_EMAIL_DOMAIN) && appEnv() !== "development" && appEnv() !== "test") throw new Error("Refused: demo e-mail domain");
  const role = await prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId, key: "employee" } } });
  const temp = temporaryPassword();
  const passwordHash = await hashPassword(temp);
  const existing = await prisma.user.findFirst({ where: { organizationId, email: e } });
  if (existing && !reset) throw new Error("user already exists — use --reset to rotate");
  const u = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, mustChangePassword: false, status: "ACTIVE", failedLoginCount: 0, lockedUntil: null } })
    : await prisma.user.create({ data: { organizationId, email: e, name: "Smoke Test (automation)", passwordHash, mustChangePassword: false, roles: { create: { roleId: role.id } } } });
  await prisma.auditLog.create({ data: { organizationId, actorId: null, action: existing ? "system.smoke_account_rotated" : "system.smoke_account_provisioned", entityType: "User", entityId: u.id, after: { email: e, role: "employee" }, ip: "cli", userAgent: "admin-provision" } });
  return { userId: u.id, password: temp };
}

export async function provisionSuperAdmin(organizationId: string, input: { email: string; name?: string; reset?: boolean }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("invalid e-mail");
  const env = appEnv();
  if (env !== "development" && env !== "test" && email.endsWith(DEMO_EMAIL_DOMAIN)) throw new Error("Refused: demo e-mail domain outside development");
  assertProductionAccountSafe(email, null);
  const role = await prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId, key: "super_admin" } } });
  const temp = temporaryPassword();
  const passwordHash = await hashPassword(temp);
  const existing = await prisma.user.findFirst({ where: { organizationId, email } });
  if (input.reset) {
    if (!existing) throw new Error("no such user");
    if (!(await prisma.userRole.findFirst({ where: { userId: existing.id, roleId: role.id } }))) throw new Error("--reset is only for Super Admin recovery");
    await prisma.$transaction([
      prisma.user.update({ where: { id: existing.id }, data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null, status: "ACTIVE" } }),
      prisma.session.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.auditLog.create({ data: { organizationId, actorId: null, action: "system.admin_recovery_reset", entityType: "User", entityId: existing.id, after: { email, environment: env, sessionsRevoked: true }, ip: "cli", userAgent: "admin-provision" } })
    ]);
    return { userId: existing.id, temporaryPassword: temp };
  }
  if (existing) throw new Error("user already exists — use --reset for recovery");
  if (!input.name?.trim()) throw new Error("name is required");
  const u = await prisma.user.create({ data: { organizationId, email, name: input.name.trim(), passwordHash, mustChangePassword: true, roles: { create: { roleId: role.id } } } });
  await prisma.auditLog.create({ data: { organizationId, actorId: null, action: "system.admin_provisioned", entityType: "User", entityId: u.id, after: { email, environment: env, mustChangePassword: true }, ip: "cli", userAgent: "admin-provision" } });
  return { userId: u.id, temporaryPassword: temp };
}
