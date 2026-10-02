import "server-only";
import { prisma } from "@/server/db";
import type { Ctx } from "@/server/context";
import { ALL_PERMISSIONS } from "@/server/rbac/permissions";
import { FIELDS, TRIGGERS } from "@/server/automation/catalog";

type Tone = "neutral" | "iris" | "success" | "warning" | "danger" | "info";
export const execTone = (s: string): Tone => (s === "SUCCEEDED" ? "success" : s === "FAILED" ? "warning" : s === "DEAD_LETTER" ? "danger" : s === "RUNNING" || s === "PENDING" ? "info" : "neutral");
export const jobTone = (s: string): Tone => (s === "HEALTHY" ? "success" : s === "STALE" || s === "NEVER_RUN" ? "warning" : "danger");
export const checkTone = (s: string): Tone => (s === "ok" ? "success" : s === "warn" ? "warning" : "danger");

/** Everything the rule builder needs (catalog, recipients, CUSTOM connections) — labels only, no secrets. */
export async function builderProps(ctx: Ctx, locale: string, label: (event: string) => string) {
  const [users, conns] = await Promise.all([
    prisma.user.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true } }),
    prisma.integrationConnection.findMany({ where: { organizationId: ctx.organizationId, provider: "CUSTOM" }, select: { id: true, name: true, status: true } })
  ]);
  return {
    triggers: Object.entries(TRIGGERS).map(([event, kind]) => ({ event, kind, label: label(event) })),
    fields: FIELDS as unknown as Record<string, { name: string; type: "number" | "string" | "enum" | "boolean"; options?: readonly string[] }[]>,
    permissions: ALL_PERMISSIONS.filter((p) => !p.startsWith("system.") && !p.startsWith("admin.")).map((p) => ({ value: p, label: p })),
    users: users.map((u) => ({ value: u.id, label: (locale === "ar" && u.nameAr) || u.name })),
    connections: conns.map((c) => ({ value: c.id, label: `CUSTOM · ${c.name} · ${c.status}` }))
  };
}

/** Human summary of a stored condition tree (server-side, for lists). */
export function conditionSummary(c: unknown): string {
  const g = (c ?? {}) as { all?: unknown[]; any?: unknown[] };
  const list = (g.all ?? g.any ?? []) as { field?: string; op?: string; value?: unknown }[];
  if (!list.length) return "—";
  const join = g.any ? " OR " : " AND ";
  return list.map((l) => (l.field ? `${l.field} ${l.op} ${l.value === undefined ? "" : Array.isArray(l.value) ? `[${l.value.join(", ")}]` : String(l.value)}`.trim() : `(${conditionSummary(l)})`)).join(join);
}
