import { prisma, type Tx } from "../db";
import { requirePermission, type Ctx } from "../context";
import { invalid, notFound } from "../errors";

/** Default DMS sales pipeline. Seeded per organization by bootstrap; stored in the DB. */
export const DEFAULT_STAGES = [
  { key: "new", nameAr: "عميل جديد", nameEn: "New Lead", colorToken: "neutral", defaultProbability: 5 },
  { key: "contacted", nameAr: "تم التواصل", nameEn: "Contacted", colorToken: "info", defaultProbability: 10 },
  { key: "qualified", nameAr: "مؤهل", nameEn: "Qualified", colorToken: "info", defaultProbability: 20 },
  { key: "discovery", nameAr: "اكتشاف الاحتياج", nameEn: "Discovery", colorToken: "iris", defaultProbability: 35 },
  { key: "proposal", nameAr: "عرض مقترح", nameEn: "Proposal", colorToken: "iris", defaultProbability: 55 },
  { key: "negotiation", nameAr: "تفاوض", nameEn: "Negotiation", colorToken: "warning", defaultProbability: 75 },
  { key: "won", nameAr: "تم الفوز", nameEn: "Won", colorToken: "success", defaultProbability: 100, isWonStage: true },
  { key: "lost", nameAr: "خسارة", nameEn: "Lost", colorToken: "danger", defaultProbability: 0, isLostStage: true }
] as const;

/** Idempotent: creates the default pipeline + stages; never overwrites admin edits to existing stages. */
export async function ensureDefaultPipeline(organizationId: string) {
  const p = await prisma.pipeline.upsert({
    where: { organizationId_key: { organizationId, key: "sales" } },
    update: {},
    create: { organizationId, key: "sales", nameAr: "خط المبيعات", nameEn: "Sales Pipeline", isDefault: true }
  });
  for (const [i, s] of DEFAULT_STAGES.entries()) {
    await prisma.pipelineStage.upsert({
      where: { pipelineId_key: { pipelineId: p.id, key: s.key } },
      update: {},
      create: {
        pipelineId: p.id,
        key: s.key,
        nameAr: s.nameAr,
        nameEn: s.nameEn,
        position: i + 1,
        colorToken: s.colorToken,
        defaultProbability: s.defaultProbability,
        isWonStage: "isWonStage" in s ? s.isWonStage : false,
        isLostStage: "isLostStage" in s ? s.isLostStage : false
      }
    });
  }
  return p;
}

export async function getDefaultPipeline(db: Tx | typeof prisma, organizationId: string) {
  const p = await db.pipeline.findFirst({
    where: { organizationId, active: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: { stages: { where: { active: true }, orderBy: { position: "asc" } } }
  });
  if (!p) throw invalid("NO_PIPELINE");
  return p;
}

/** First open (non-terminal) stage at or after `preferKey`. */
export function pickOpenStage<S extends { key: string; isWonStage: boolean; isLostStage: boolean }>(stages: S[], preferKey = "qualified"): S | undefined {
  const open = stages.filter((s) => !s.isWonStage && !s.isLostStage);
  return open.find((s) => s.key === preferKey) ?? open[0];
}

export async function listPipelines(ctx: Ctx) {
  requirePermission(ctx, "crm.pipeline.view");
  return prisma.pipeline.findMany({
    where: { organizationId: ctx.organizationId, active: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: { stages: { where: { active: true }, orderBy: { position: "asc" } } }
  });
}

export async function stageInPipeline(db: Tx | typeof prisma, organizationId: string, stageId: string) {
  const s = await db.pipelineStage.findFirst({ where: { id: stageId, active: true, pipeline: { organizationId, active: true } } });
  if (!s) throw notFound("Stage");
  return s;
}
