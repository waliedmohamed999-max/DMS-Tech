import "server-only";
import { prisma } from "@/server/db";
import { can, type Ctx } from "@/server/context";
import type { Permission } from "@/server/rbac/permissions";

/** Owner picker options — only when the actor may assign records to other people. */
export async function ownerOptions(ctx: Ctx, assign: Permission, locale: string) {
  if (!can(ctx, assign)) return null;
  const users = await prisma.user.findMany({
    where: { organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, nameAr: true }
  });
  return users.map((u) => ({ id: u.id, label: (locale === "ar" && u.nameAr) || u.name }));
}

export const personName = (u: { name: string; nameAr: string | null } | null | undefined, locale: string) => (u ? (locale === "ar" && u.nameAr) || u.name : null);

/** Serialise timeline rows for client components. */
export function serialiseActivities(rows: { id: string; type: string; title: string; description: string | null; isSystem: boolean; occurredAt: Date; metadata: unknown; createdBy: { name: string; nameAr: string | null } | null }[], locale: string) {
  return rows.map((a) => ({
    id: a.id,
    type: a.type,
    title: a.title,
    description: a.description,
    isSystem: a.isSystem,
    occurredAt: a.occurredAt.toISOString(),
    metadata: (a.metadata ?? null) as Record<string, unknown> | null,
    author: personName(a.createdBy, locale)
  }));
}

export function serialiseNotes(rows: { id: string; body: string; createdAt: Date; updatedAt: Date; authorId?: string | null; author: { id: string; name: string; nameAr: string | null } | null }[], userId: string, locale: string) {
  return rows.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString(), author: personName(n.author, locale), mine: n.author?.id === userId }));
}

export const waLink = (phone?: string | null) => {
  const d = phone?.replace(/\D/g, "").replace(/^0(?=5)/, "966");
  return d && d.length >= 8 ? `https://wa.me/${d}` : null;
};
