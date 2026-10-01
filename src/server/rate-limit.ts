import { prisma } from "./db";

/**
 * DB-backed fixed-window limiter (atomic upsert). Returns true when the call is allowed.
 * Used for login and other sensitive endpoints; works across serverless instances.
 */
export async function hit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart") VALUES (${key}, 1, ${windowStart})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" = ${windowStart} THEN "RateLimit"."count" + 1 ELSE 1 END,
      "windowStart" = ${windowStart}
    RETURNING "count"`;
  return (rows[0]?.count ?? 1) <= limit;
}
