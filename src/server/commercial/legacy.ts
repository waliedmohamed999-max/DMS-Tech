import { prisma } from "../db";

/**
 * Phase 2 → Phase 3 service migration (staged, idempotent, non-destructive).
 *
 * Stage 1 (migration phase3_commercial): nullable `serviceId` added to Lead / Opportunity;
 *          the legacy string columns `Lead.interestedService` / `Opportunity.serviceCategory`
 *          are kept untouched.
 * Stage 2 (this function, run by bootstrap after the default catalog exists): rows whose
 *          legacy key EXACTLY equals a `Service.key` get `serviceId`. Nothing is guessed:
 *          any other value (e.g. "other") stays unmapped with its legacy value intact and is
 *          reported, so a human can decide.
 * Stage 3 (future, after review): drop the legacy columns once no unmapped values remain.
 */
export async function backfillLegacyServiceIds(organizationId: string) {
  const leads = await prisma.$executeRaw`
    UPDATE "Lead" l SET "serviceId" = s."id"
    FROM "Service" s
    WHERE l."organizationId" = ${organizationId} AND s."organizationId" = l."organizationId"
      AND l."serviceId" IS NULL AND l."interestedService" IS NOT NULL AND s."key" = l."interestedService"`;
  const opps = await prisma.$executeRaw`
    UPDATE "Opportunity" o SET "serviceId" = s."id"
    FROM "Service" s
    WHERE o."organizationId" = ${organizationId} AND s."organizationId" = o."organizationId"
      AND o."serviceId" IS NULL AND o."serviceCategory" IS NOT NULL AND s."key" = o."serviceCategory"`;
  return { leadsMapped: leads, opportunitiesMapped: opps, unmapped: await unmappedLegacyServices(organizationId) };
}

/** Legacy values that have no catalog match (documented, never auto-mapped). */
export async function unmappedLegacyServices(organizationId: string) {
  const [l, o] = await Promise.all([
    prisma.lead.groupBy({ by: ["interestedService"], where: { organizationId, serviceId: null, interestedService: { not: null } }, _count: { _all: true } }),
    prisma.opportunity.groupBy({ by: ["serviceCategory"], where: { organizationId, serviceId: null, serviceCategory: { not: null } }, _count: { _all: true } })
  ]);
  return [
    ...l.map((r) => ({ entity: "Lead" as const, value: r.interestedService!, count: r._count._all })),
    ...o.map((r) => ({ entity: "Opportunity" as const, value: r.serviceCategory!, count: r._count._all }))
  ];
}
