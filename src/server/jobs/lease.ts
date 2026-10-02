import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { runWithObs } from "../obs/context";
import { log } from "../obs/log";
import { metrics, METRIC } from "../obs/metrics";
import { redactString } from "../obs/redact";

/**
 * Multi-instance-safe job lease. Several app instances (or cron hosts) may trigger the same
 * sweep; only the one that atomically acquires the lease row runs it. The lease expires on its
 * own (ttl) so a crashed holder never blocks the job forever. Work done under the lease must
 * still be idempotent (conditional updates, notification dedupe keys) — the lease only avoids
 * wasted parallel runs, it is not the correctness guarantee.
 *
 * Phase 9 (docs/OBSERVABILITY.md#jobs): every leased run is recorded in the job registry (`SystemJob`):
 *  · start / finish / success / failure, duration, sanitized last error, consecutive failure streak;
 *  · HEARTBEAT: while the job runs, the lease is renewed and `heartbeatAt` written every ttl/3 — if the process dies,
 *    the heartbeat stops, the lease expires and another instance takes over (stuck-job recovery);
 *  · TIMEOUT (default = ttl): a run that exceeds it is recorded FAILED ("TIMEOUT") and stops heart-beating, so its lease
 *    lapses; the abandoned promise may still finish in the background, which is safe because the work is idempotent.
 */
export const jobName = (key: string) => key.replace(/:c[a-z0-9]{20,32}$/, "").replace(/:all$/, "");

export async function withLease<T>(key: string, ttlMs: number, fn: () => Promise<T>, opts: { timeoutMs?: number } = {}): Promise<T | null> {
  const holder = randomUUID();
  const until = new Date(Date.now() + ttlMs);
  const rows = await prisma.$queryRaw<{ holder: string }[]>`
    INSERT INTO "JobLease" ("key", "holder", "lockedUntil", "updatedAt") VALUES (${key}, ${holder}, ${until}, now())
    ON CONFLICT ("key") DO UPDATE SET "holder" = ${holder}, "lockedUntil" = ${until}, "updatedAt" = now()
      WHERE "JobLease"."lockedUntil" < now()
    RETURNING "holder"`;
  if (rows[0]?.holder !== holder) return null; // someone else holds a live lease

  const name = jobName(key);
  const started = Date.now();
  await track(key, { name, status: "RUNNING", holder, lastStartedAt: new Date(started), heartbeatAt: new Date(started), runCount: { increment: 1 } });
  let alive = true;
  const beat = setInterval(() => {
    if (!alive) return;
    const now = new Date();
    void prisma.jobLease.updateMany({ where: { key, holder }, data: { lockedUntil: new Date(now.getTime() + ttlMs) } }).catch(() => undefined);
    void prisma.systemJob.updateMany({ where: { key, holder }, data: { heartbeatAt: now } }).catch(() => undefined);
  }, Math.max(1000, Math.floor(ttlMs / 3)));
  beat.unref?.();

  const timeoutMs = opts.timeoutMs ?? ttlMs;
  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await runWithObs({ job: name, module: "job" }, () =>
      Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`TIMEOUT after ${timeoutMs} ms`)), timeoutMs);
          timer.unref?.();
        })
      ])
    );
    const ms = Date.now() - started;
    await track(key, { status: "SUCCEEDED", lastCompletedAt: new Date(), lastSucceededAt: new Date(), lastDurationMs: ms, lastError: null, failStreak: 0, holder: null });
    metrics.count(METRIC.jobRun, { job: name, result: "ok" });
    metrics.timing(METRIC.jobDuration, ms, { job: name });
    return result;
  } catch (e) {
    const ms = Date.now() - started;
    const message = redactString(String((e as Error)?.message ?? e)).slice(0, 1000);
    await track(key, { status: "FAILED", lastCompletedAt: new Date(), lastFailedAt: new Date(), lastDurationMs: ms, lastError: message, failCount: { increment: 1 }, failStreak: { increment: 1 }, holder: null });
    metrics.count(METRIC.jobFailure, { job: name });
    log.error("job_failed", { job: name, key, durationMs: ms, error: message });
    throw e;
  } finally {
    alive = false;
    clearInterval(beat);
    if (timer) clearTimeout(timer);
    await prisma.jobLease.updateMany({ where: { key, holder }, data: { lockedUntil: new Date(0) } }).catch(() => undefined);
  }
}

type Patch = Record<string, unknown>;
async function track(key: string, data: Patch) {
  try {
    await prisma.systemJob.upsert({ where: { key }, create: { key, name: jobName(key), ...(strip(data) as object) }, update: data as object });
  } catch (e) {
    // visibility must never break the job itself
    log.warn("job_registry_write_failed", { key, error: String((e as Error)?.message ?? e) });
  }
}
/** `{ increment: n }` is not valid on create */
const strip = (d: Patch) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v && typeof v === "object" && "increment" in (v as object) ? (v as { increment: number }).increment : v]));
