import { prisma } from "../db";
import { withLease } from "../jobs/lease";
import { runWithObs } from "../obs/context";
import { log } from "../obs/log";
import { reportError } from "../obs/errors";
import { sweepCommercial } from "../commercial/sweep";
import { sweepProjects } from "../projects/sweep";
import { sweepFinance } from "../finance/sweep";
import { sweepHr } from "../hr/sweep";
import { sweepOps } from "../ops/sweep";
import { integrationsTick } from "../integrations/worker";
import { automationTick } from "../automation/engine";
import { recoverEvents } from "./events";
import { alertTick } from "./alerts";
import { purgeOperationalData } from "./retention";

/**
 * Unified operational worker (`npm run worker` — one pass; `npm run worker -- --loop` — long-running, heartbeat every pass).
 * It does not merge the existing sweeps: it CALLS them, each under its own lease / registry key, so the individual
 * `*:sweep` scripts and the lazy page triggers keep working and can never double-run with the worker.
 * One failing step never stops the others; every failure is in the job registry, the log and (if configured) the reporter.
 */
const SWEEPS: [string, (org: string, now: Date) => Promise<unknown>][] = [
  ["commercial", sweepCommercial],
  ["projects", sweepProjects],
  ["finance", sweepFinance],
  ["hr", sweepHr],
  ["ops", sweepOps]
];

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    reportError(e, `worker:${name}`);
    return { error: String((e as Error)?.message ?? e).slice(0, 200) };
  }
}

export async function systemTick(now = new Date(), opts: { retention?: boolean } = {}) {
  return runWithObs({ module: "worker", job: "worker" }, async () => {
    const out: Record<string, unknown> = {};
    for (const org of await prisma.organization.findMany({ select: { id: true, slug: true } }))
      for (const [name, fn] of SWEEPS) out[`${org.slug}:${name}`] = await step(name, () => fn(org.id, now));
    out.integrations = await step("integrations", () => integrationsTick(now));
    out.events = await step("events", async () => (await withLease("system:events", 5 * 60_000, () => recoverEvents(now))) ?? { skipped: true });
    out.automation = await step("automation", async () => (await withLease("system:automation", 5 * 60_000, () => automationTick(now))) ?? { skipped: true });
    out.alerts = await step("alerts", async () => (await withLease("system:alerts", 5 * 60_000, () => alertTick(now))) ?? { skipped: true });
    // retention runs at most once a day (registry decides — survives restarts)
    const last = await prisma.systemJob.findUnique({ where: { key: "system:retention" }, select: { lastSucceededAt: true } });
    if (opts.retention !== false && (!last?.lastSucceededAt || now.getTime() - last.lastSucceededAt.getTime() > 24 * 3600_000))
      out.retention = await step("retention", async () => (await withLease("system:retention", 30 * 60_000, () => purgeOperationalData({ dryRun: process.env.RETENTION_DRY_RUN === "1", now }))) ?? { skipped: true });
    log.info("worker_tick", { steps: Object.keys(out).length, errors: Object.entries(out).filter(([, v]) => v && typeof v === "object" && "error" in (v as object)).map(([k]) => k) });
    return out;
  });
}
