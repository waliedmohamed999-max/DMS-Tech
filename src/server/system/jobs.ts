import { prisma } from "../db";

/**
 * Job registry view (docs/OBSERVABILITY.md#jobs). Expected cadence per job; a job is
 *   UNHEALTHY  last run FAILED, or 3+ consecutive failures
 *   STUCK      RUNNING but the heartbeat stopped (process died) — the lease lapses and another instance takes over
 *   STALE      no successful run within 2 × its expected interval (scheduler not running?)
 *   NEVER_RUN  never started on this database
 *   HEALTHY    otherwise
 * A record existing never implies the process is alive: only fresh heartbeats / successes count.
 */
export const JOBS: { name: string; everyMs: number; required: boolean; command: string }[] = [
  { name: "worker:loop", everyMs: 2 * 60_000, required: true, command: "npm run worker -- --loop" },
  { name: "integrations:outbox", everyMs: 2 * 60_000, required: true, command: "npm run worker" },
  { name: "integrations:campaigns", everyMs: 2 * 60_000, required: false, command: "npm run worker" },
  { name: "integrations:health", everyMs: 60 * 60_000, required: false, command: "npm run worker" },
  { name: "system:events", everyMs: 5 * 60_000, required: true, command: "npm run worker" },
  { name: "system:automation", everyMs: 5 * 60_000, required: true, command: "npm run worker" },
  { name: "system:alerts", everyMs: 15 * 60_000, required: false, command: "npm run worker" },
  { name: "system:retention", everyMs: 26 * 60 * 60_000, required: false, command: "npm run worker" },
  { name: "sweep:commercial", everyMs: 30 * 60_000, required: true, command: "npm run commercial:sweep" },
  { name: "sweep:projects", everyMs: 30 * 60_000, required: true, command: "npm run projects:sweep" },
  { name: "sweep:finance", everyMs: 30 * 60_000, required: true, command: "npm run finance:sweep" },
  { name: "sweep:hr", everyMs: 2 * 60 * 60_000, required: true, command: "npm run hr:sweep" },
  { name: "sweep:ops", everyMs: 30 * 60_000, required: true, command: "npm run operations:sweep" }
];

export type JobState = "HEALTHY" | "STALE" | "STUCK" | "UNHEALTHY" | "NEVER_RUN";

export async function jobHealth(now = new Date()) {
  const rows = await prisma.systemJob.findMany();
  return JOBS.map((def) => {
    const mine = rows.filter((r) => r.name === def.name);
    // per-organization keys roll up to the job: the newest run decides, any failure / stuck instance is reported
    const last = mine.sort((a, b) => (b.lastStartedAt?.getTime() ?? 0) - (a.lastStartedAt?.getTime() ?? 0))[0];
    let state: JobState = "HEALTHY";
    let reason = "";
    if (!last || !last.lastStartedAt) state = "NEVER_RUN";
    else if (mine.some((r) => r.status === "RUNNING" && r.heartbeatAt && now.getTime() - r.heartbeatAt.getTime() > Math.max(3 * 60_000, def.everyMs))) {
      state = "STUCK";
      reason = "heartbeat stopped";
    } else if (mine.some((r) => r.status === "FAILED" || r.failStreak >= 3)) {
      state = "UNHEALTHY";
      reason = mine.find((r) => r.lastError)?.lastError ?? "failed";
    } else if (!last.lastSucceededAt || now.getTime() - last.lastSucceededAt.getTime() > 2 * def.everyMs) {
      state = "STALE";
      reason = "no recent successful run";
    }
    return {
      ...def,
      state,
      reason,
      instances: mine.length,
      lastStartedAt: last?.lastStartedAt ?? null,
      lastSucceededAt: mine.reduce<Date | null>((a, r) => (r.lastSucceededAt && (!a || r.lastSucceededAt > a) ? r.lastSucceededAt : a), null),
      lastFailedAt: mine.reduce<Date | null>((a, r) => (r.lastFailedAt && (!a || r.lastFailedAt > a) ? r.lastFailedAt : a), null),
      lastDurationMs: last?.lastDurationMs ?? null,
      heartbeatAt: last?.heartbeatAt ?? null,
      runCount: mine.reduce((a, r) => a + r.runCount, 0),
      failCount: mine.reduce((a, r) => a + r.failCount, 0),
      lastError: mine.find((r) => r.status === "FAILED")?.lastError ?? null
    };
  });
}

/** Records a heartbeat for a long-running process (the loop worker) — no lease needed, visibility only. */
export async function heartbeat(name: string, holder: string, status: "RUNNING" | "SUCCEEDED" = "RUNNING") {
  const now = new Date();
  await prisma.systemJob.upsert({
    where: { key: name },
    create: { key: name, name, status, holder, heartbeatAt: now, lastStartedAt: now, lastSucceededAt: now, runCount: 1 },
    update: { status, holder, heartbeatAt: now, lastSucceededAt: now, runCount: { increment: 1 }, failStreak: 0 }
  });
}
