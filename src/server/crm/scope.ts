import { prisma } from "../db";
import { can, type Ctx } from "../context";

/**
 * Record-level visibility for CRM (see docs/CRM.md):
 *   ALL  (crm.records.all)  every record in the organization
 *   TEAM (crm.records.team) records owned by anyone in my department, plus my own
 *   OWN  (default)          records I own or created
 * Unassigned records (e.g. fresh website leads) are visible to ALL scope only.
 * Applied inside every list/get/search/aggregate query, never only in the UI.
 */
export type Scope = "ALL" | "TEAM" | "OWN";
export const scopeOf = (ctx: Ctx): Scope => (can(ctx, "crm.records.all") ? "ALL" : can(ctx, "crm.records.team") ? "TEAM" : "OWN");

export async function scopeUserIds(ctx: Ctx): Promise<string[]> {
  if (scopeOf(ctx) === "OWN") return [ctx.userId];
  const me = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { departmentId: true } });
  if (!me?.departmentId) return [ctx.userId];
  const rows = await prisma.user.findMany({ where: { organizationId: ctx.organizationId, departmentId: me.departmentId }, select: { id: true } });
  return rows.map((r) => r.id);
}

/*
 * The fragments are wrapped in `AND: [...]` on purpose: callers spread them into
 * `where` objects that may also use `OR` (search terms). A bare `OR` here would be
 * silently overwritten by the caller's `OR`, widening visibility. Never return a
 * top-level `OR` from these helpers.
 */

/** `where` fragment for owner/creator scoped models (Lead, Opportunity). */
export async function ownedWhere(ctx: Ctx): Promise<{ AND?: object[] }> {
  if (scopeOf(ctx) === "ALL") return {};
  const ids = await scopeUserIds(ctx);
  return { AND: [{ OR: [{ ownerId: { in: ids } }, { createdById: ctx.userId }] }] };
}

/** Clients: owned/created, or linked to an opportunity I can see. */
export async function clientWhere(ctx: Ctx): Promise<{ AND?: object[] }> {
  if (scopeOf(ctx) === "ALL") return {};
  const ids = await scopeUserIds(ctx);
  const mine = { OR: [{ ownerId: { in: ids } }, { createdById: ctx.userId }] };
  return { AND: [{ OR: [...mine.OR, { opportunities: { some: mine } }] }] };
}
