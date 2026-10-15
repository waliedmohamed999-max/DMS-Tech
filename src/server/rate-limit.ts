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

const local = new Map<string, { count: number; windowStart: number }>();
/**
 * Same limiter for public forms that must keep working when the database is unreachable: if the DB call fails, the
 * window is counted in this process's memory instead (still limited, per instance). Login keeps the DB-only `hit`
 * so it fails closed.
 */
export async function hitOrLocal(key: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    return await hit(key, limit, windowMs);
  } catch {
    const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
    const cur = local.get(key);
    const count = cur && cur.windowStart === windowStart ? cur.count + 1 : 1;
    local.set(key, { count, windowStart });
    if (local.size > 5000) local.clear(); // a flood of distinct keys never grows memory without bound
    return count <= limit;
  }
}
