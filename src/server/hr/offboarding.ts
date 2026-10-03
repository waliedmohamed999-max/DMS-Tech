import type { Tx } from "../db";
import type { Uow } from "../events/bus";
import { conflict } from "../errors";
import { log } from "../obs/log";

/**
 * Phase 11 — secure offboarding (docs/HR.md#offboarding). Termination takes effect on `terminationDate`
 * (organization calendar day): from then on the linked system account is DISABLED and every session revoked.
 *   · effective today or earlier → done in the same transaction as the status change
 *   · future-dated               → done by the HR sweep (worker) on the effective day, never by opening a page
 * Claimed once per employee by `Employee.accessRevokedAt` (idempotent across retries and worker instances).
 * The user row and all history stay (no deletion). Accounts not linked to an employee (service / smoke / break-glass
 * accounts) are never touched. Lockout guard: the last active Super Admin cannot be disabled this way.
 * Terminations cannot be cancelled in this domain (TERMINATED → ARCHIVED only), so a scheduled revocation is final.
 */
export type OffboardingOutcome = "revoked" | "already_disabled" | "no_account" | "already_done";

export const isTerminationEffective = (terminationDate: Date | null, today: Date) => !!terminationDate && terminationDate.getTime() <= today.getTime();

/** Throws LAST_SUPER_ADMIN when disabling `userId` would leave the organization without an active Super Admin. */
export async function assertNotLastSuperAdmin(tx: Tx, organizationId: string, userId: string) {
  const isSuper = await tx.userRole.count({ where: { userId, role: { key: "super_admin", organizationId } } });
  if (!isSuper) return;
  const others = await tx.user.count({ where: { organizationId, id: { not: userId }, status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: "super_admin" } } } } });
  if (!others) throw conflict("LAST_SUPER_ADMIN");
}

export async function revokeEmployeeAccessTx(tx: Tx, uow: Uow, employeeId: string, now: Date, trigger: "termination" | "scheduled_termination" | "archive"): Promise<{ outcome: OffboardingOutcome; userId: string | null; sessionsRevoked: number }> {
  const e = await tx.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { id: true, organizationId: true, number: true, displayName: true, userId: true, accessRevokedAt: true } });
  if (e.accessRevokedAt) return { outcome: "already_done", userId: e.userId, sessionsRevoked: 0 };
  if (e.userId) await assertNotLastSuperAdmin(tx, e.organizationId, e.userId);
  // claim (conditional update): a concurrent worker / retry that lost the race does nothing
  const claimed = await tx.employee.updateMany({ where: { id: e.id, accessRevokedAt: null }, data: { accessRevokedAt: now } });
  if (claimed.count !== 1) return { outcome: "already_done", userId: e.userId, sessionsRevoked: 0 };
  if (!e.userId) {
    await uow.audit({ action: "employee.access_revoked", entityType: "Employee", entityId: e.id, after: { outcome: "no_account", trigger } });
    return { outcome: "no_account", userId: null, sessionsRevoked: 0 };
  }
  const u = await tx.user.findUniqueOrThrow({ where: { id: e.userId }, select: { id: true, name: true, status: true } });
  const sessions = await tx.session.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: now } });
  const outcome: OffboardingOutcome = u.status === "DISABLED" ? "already_disabled" : "revoked";
  if (outcome === "revoked") {
    await tx.user.update({ where: { id: u.id }, data: { status: "DISABLED" } });
    await uow.audit({ action: "user.disabled", entityType: "User", entityId: u.id, before: { status: u.status }, after: { status: "DISABLED", reason: "offboarding", employeeId: e.id, trigger } });
    uow.emit({ type: "user.disabled", entityType: "User", entityId: u.id, payload: { userId: u.id, reason: "offboarding", employeeId: e.id }, activity: { entityLabel: u.name, href: `/app/admin/users/${u.id}`, visibility: "admin.users.view" } });
  }
  await uow.audit({ action: "employee.access_revoked", entityType: "Employee", entityId: e.id, after: { outcome, trigger, userId: u.id, sessionsRevoked: sessions.count } });
  uow.emit({ type: "employee.access_revoked", entityType: "Employee", entityId: e.id, payload: { employeeId: e.id, userId: u.id, outcome, trigger }, activity: { entityLabel: `${e.number} · ${e.displayName}`, href: `/app/hr/employees/${e.id}`, visibility: "hr.employees.view" } });
  log.info("employee_access_revoked", { employeeId: e.id, userId: u.id, outcome, trigger, sessionsRevoked: sessions.count });
  return { outcome, userId: u.id, sessionsRevoked: sessions.count };
}
