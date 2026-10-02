import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db";
import type { Ctx } from "../context";
import { AppError, invalid, notFound } from "../errors";
import { hit } from "../rate-limit";
import { enforceLimit } from "../security/limits";
import { isPermission, type Permission } from "../rbac/permissions";
import { hashPassword, passwordProblems, verifyPassword } from "./password";
import { unitOfWork } from "../events/bus";

export const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h absolute
export const SESSION_IDLE_MS = 1000 * 60 * 60 * 2; // 2h idle
const LOCK_AFTER = 5;
const LOCK_MS = 1000 * 60 * 15;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Dummy hash so unknown-email logins take the same time as wrong-password logins
let dummyHash: Promise<string> | null = null;
const getDummy = () => (dummyHash ??= hashPassword("dummy-password-for-timing-0"));

export type LoginResult = { ok: true; token: string; expiresAt: Date } | { ok: false; reason: "INVALID" | "LOCKED" | "RATE_LIMITED" | "DISABLED" };

/**
 * Credential login. Rate limited per IP and per email; locks the account after
 * repeated failures; records every outcome in the audit log.
 */
export async function login(input: { email: string; password: string; ip?: string | null; userAgent?: string | null }): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const ipOk = await hit(`login:ip:${input.ip ?? "unknown"}`, 30, 15 * 60 * 1000);
  const emailOk = await hit(`login:email:${email}`, 10, 15 * 60 * 1000);
  if (!ipOk || !emailOk) return { ok: false, reason: "RATE_LIMITED" };

  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user) {
    await verifyPassword(await getDummy(), input.password);
    return { ok: false, reason: "INVALID" };
  }

  const auditBase = { organizationId: user.organizationId, actorId: user.id, entityType: "User", entityId: user.id, ip: input.ip ?? null, userAgent: input.userAgent?.slice(0, 300) ?? null };

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await prisma.auditLog.create({ data: { ...auditBase, action: "auth.login_blocked_locked" } });
    return { ok: false, reason: "LOCKED" };
  }
  if (user.status !== "ACTIVE") {
    await prisma.auditLog.create({ data: { ...auditBase, action: "auth.login_blocked_disabled" } });
    return { ok: false, reason: "DISABLED" };
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MS) : null }
    });
    await prisma.auditLog.create({ data: { ...auditBase, action: failed >= LOCK_AFTER ? "auth.account_locked" : "auth.login_failed" } });
    return { ok: false, reason: failed >= LOCK_AFTER ? "LOCKED" : "INVALID" };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.$transaction([
    prisma.session.create({ data: { id: sha256(token), userId: user.id, expiresAt, ip: input.ip ?? null, userAgent: input.userAgent?.slice(0, 300) ?? null } }),
    prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } }),
    prisma.auditLog.create({ data: { ...auditBase, action: "auth.login" } })
  ]);
  return { ok: true, token, expiresAt };
}

export type SessionUser = {
  sessionId: string;
  user: { id: string; organizationId: string; name: string; nameAr: string | null; email: string; jobTitle: string | null; locale: "ar" | "en"; mustChangePassword: boolean };
  organization: { id: string; name: string; nameAr: string | null };
  roleKeys: string[];
  permissions: Permission[];
};

/** Resolve a cookie token to a live session (absolute + idle expiry, revocation, user status). */
export async function resolveSession(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const id = sha256(token);
  const s = await prisma.session.findUnique({
    where: { id },
    include: {
      user: {
        include: {
          organization: { select: { id: true, name: true, nameAr: true } },
          roles: { include: { role: { select: { key: true, permissions: { select: { permission: true } } } } } }
        }
      }
    }
  });
  const now = Date.now();
  if (!s || s.revokedAt || s.expiresAt.getTime() < now || now - s.lastSeenAt.getTime() > SESSION_IDLE_MS) return null;
  if (s.user.status !== "ACTIVE" || s.user.deletedAt) return null;

  // sliding idle window; throttled to one write per minute
  if (now - s.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id }, data: { lastSeenAt: new Date() } });
  }

  const perms = new Set<Permission>();
  for (const r of s.user.roles) for (const p of r.role.permissions) if (isPermission(p.permission)) perms.add(p.permission);

  return {
    sessionId: id,
    user: {
      id: s.user.id,
      organizationId: s.user.organizationId,
      name: s.user.name,
      nameAr: s.user.nameAr,
      email: s.user.email,
      jobTitle: s.user.jobTitle,
      locale: s.user.locale,
      mustChangePassword: s.user.mustChangePassword
    },
    organization: s.user.organization,
    roleKeys: s.user.roles.map((r) => r.role.key),
    permissions: [...perms]
  };
}

export async function logout(token: string | undefined | null) {
  if (!token) return;
  const s = await prisma.session.findUnique({ where: { id: sha256(token) }, include: { user: { select: { organizationId: true } } } });
  if (!s) return;
  await prisma.$transaction([
    prisma.session.update({ where: { id: s.id }, data: { revokedAt: new Date() } }),
    prisma.auditLog.create({ data: { organizationId: s.user.organizationId, actorId: s.userId, action: "auth.logout", entityType: "User", entityId: s.userId } })
  ]);
}

export async function listMySessions(ctx: Ctx, currentSessionId: string) {
  const rows = await prisma.session.findMany({
    where: { userId: ctx.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, createdAt: true, lastSeenAt: true, ip: true, userAgent: true }
  });
  return rows.map((r) => ({ ...r, current: r.id === currentSessionId }));
}

export async function revokeMySession(ctx: Ctx, sessionId: string) {
  const s = await prisma.session.findFirst({ where: { id: sessionId, userId: ctx.userId } });
  if (!s) throw notFound("Session");
  await unitOfWork(ctx, async (tx, uow) => {
    await tx.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    await uow.audit({ action: "auth.session_revoked", entityType: "Session", entityId: sessionId.slice(0, 12) });
  });
}

/** Changes the password and revokes every other session of the user. */
export async function changeMyPassword(ctx: Ctx, current: string, next: string, keepSessionId?: string) {
  // Phase 9: guessing the current password from a hijacked session is rate limited
  await enforceLimit("passwordChange", ctx.userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  if (!(await verifyPassword(user.passwordHash, current))) throw invalid("WRONG_PASSWORD");
  const problem = passwordProblems(next);
  if (problem) throw invalid(problem);
  if (!(await hit(`pwchange:${ctx.userId}`, 5, 15 * 60 * 1000))) throw new AppError("RATE_LIMITED", "Too many attempts");
  const passwordHash = await hashPassword(next);
  await unitOfWork(ctx, async (tx, uow) => {
    await tx.user.update({ where: { id: ctx.userId }, data: { passwordHash, mustChangePassword: false } });
    await tx.session.updateMany({ where: { userId: ctx.userId, revokedAt: null, ...(keepSessionId ? { NOT: { id: keepSessionId } } : {}) }, data: { revokedAt: new Date() } });
    await uow.audit({ action: "auth.password_changed", entityType: "User", entityId: ctx.userId });
  });
}

export { sha256 as hashToken };
