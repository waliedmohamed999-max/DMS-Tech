import { z } from "zod";
import { prisma } from "../db";
import type { Ctx } from "../context";
import { notFound } from "../errors";

/** Per-user saved list views (the stored value is the list's URL query string). */
const MODULES = ["leads", "opportunities", "clients"] as const;

export const listViews = (ctx: Ctx, module: (typeof MODULES)[number]) =>
  prisma.savedView.findMany({ where: { userId: ctx.userId, organizationId: ctx.organizationId, module }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, query: true } });

export async function saveView(ctx: Ctx, raw: unknown) {
  const v = z
    .object({
      module: z.enum(MODULES),
      name: z.string().trim().min(1).max(40),
      // only keep known list params; never store arbitrary input
      query: z.string().max(500).transform((q) => {
        const src = new URLSearchParams(q);
        const out = new URLSearchParams();
        for (const k of ["q", "owner", "source", "status", "priority", "service", "from", "to", "followUp", "sort", "dir", "stage", "type"]) {
          const val = src.get(k);
          if (val) out.set(k, val.slice(0, 100));
        }
        return out.toString();
      })
    })
    .parse(raw);
  const count = await prisma.savedView.count({ where: { userId: ctx.userId, module: v.module } });
  if (count >= 12) await prisma.savedView.deleteMany({ where: { id: (await prisma.savedView.findFirstOrThrow({ where: { userId: ctx.userId, module: v.module }, orderBy: { createdAt: "asc" } })).id } });
  return prisma.savedView.create({ data: { organizationId: ctx.organizationId, userId: ctx.userId, module: v.module, name: v.name, query: v.query } });
}

export async function deleteView(ctx: Ctx, id: string) {
  const v = await prisma.savedView.findFirst({ where: { id, userId: ctx.userId } });
  if (!v) throw notFound("View");
  await prisma.savedView.delete({ where: { id } });
}
