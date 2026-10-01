import { randomUUID } from "node:crypto";
import { prisma } from "../db";

/**
 * Multi-instance-safe job lease. Several app instances (or cron hosts) may trigger the same
 * sweep; only the one that atomically acquires the lease row runs it. The lease expires on its
 * own (ttl) so a crashed holder never blocks the job forever. Work done under the lease must
 * still be idempotent (conditional updates, notification dedupe keys) — the lease only avoids
 * wasted parallel runs, it is not the correctness guarantee.
 */
export async function withLease<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
  const holder = randomUUID();
  const until = new Date(Date.now() + ttlMs);
  const rows = await prisma.$queryRaw<{ holder: string }[]>`
    INSERT INTO "JobLease" ("key", "holder", "lockedUntil", "updatedAt") VALUES (${key}, ${holder}, ${until}, now())
    ON CONFLICT ("key") DO UPDATE SET "holder" = ${holder}, "lockedUntil" = ${until}, "updatedAt" = now()
      WHERE "JobLease"."lockedUntil" < now()
    RETURNING "holder"`;
  if (rows[0]?.holder !== holder) return null; // someone else holds a live lease
  try {
    return await fn();
  } finally {
    await prisma.jobLease.updateMany({ where: { key, holder }, data: { lockedUntil: new Date(0) } });
  }
}
