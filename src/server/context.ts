import type { Permission } from "./rbac/permissions";
import { forbidden } from "./errors";

/**
 * Request context passed explicitly to every service function.
 * Built from the session by the DAL (src/lib/os/dal.ts) or by tests.
 */
export type Ctx = {
  organizationId: string;
  userId: string;
  userName: string;
  roleKeys: string[];
  permissions: ReadonlySet<Permission>;
  meta?: { ip?: string | null; userAgent?: string | null };
};

/** Actor for system-originated work (public website capture). Audit/event actorId is stored as NULL. */
export const SYSTEM_USER_ID = "";
export const systemCtx = (organizationId: string, meta?: Ctx["meta"]): Ctx => ({
  organizationId,
  userId: SYSTEM_USER_ID,
  userName: "system",
  roleKeys: [],
  permissions: new Set(),
  meta
});

export const can = (ctx: Ctx, p: Permission) => ctx.permissions.has(p);
export const canAny = (ctx: Ctx, ...ps: Permission[]) => ps.some((p) => ctx.permissions.has(p));

/** Throws FORBIDDEN unless the actor holds the permission. Call at the top of every service. */
export function requirePermission(ctx: Ctx, p: Permission) {
  if (!ctx.permissions.has(p)) throw forbidden(p);
}
