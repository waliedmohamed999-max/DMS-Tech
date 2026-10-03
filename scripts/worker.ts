/**
 * Unified operational worker (Phase 9) — sweeps, integrations, domain-event recovery, automation retries,
 * system alerts and daily retention, each under its own lease (safe with several instances).
 *
 *   npm run worker              # one pass (cron every 1–5 min)
 *   npm run worker -- --loop    # long-running; heartbeat "worker:loop" every pass (30 s)
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { registerSubscribers } from "../src/server/events/subscribers";
import "../src/server/handlers";
import { prisma } from "../src/server/db";
import { systemTick } from "../src/server/system/worker";
import { heartbeat } from "../src/server/system/jobs";
import { assertStartupConfig } from "../src/server/system/config";
import { configureObservability } from "../src/server/obs/reporters";

const loop = process.argv.includes("--loop");
const holder = `worker-${randomUUID().slice(0, 8)}`;
let stop = false;
let wake: (() => void) | null = null;
// graceful shutdown: finish the current pass, interrupt the pause, release the heartbeat, exit 0
const shutdown = (sig: string) => {
  if (stop) return;
  stop = true;
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "worker_shutdown_requested", signal: sig, holder }));
  wake?.();
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function main() {
  assertStartupConfig();
  configureObservability();
  registerSubscribers();
  do {
    const started = Date.now();
    // heartbeat BEFORE the pass too: the alert step of this very pass must not see the worker as "never ran / down"
    if (loop) await heartbeat("worker:loop", holder);
    const r = await systemTick();
    if (loop) await heartbeat("worker:loop", holder);
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "worker_pass", ms: Date.now() - started, result: r }));
    if (loop && !stop)
      await new Promise<void>((res) => {
        const t = setTimeout(res, Number(process.env.WORKER_INTERVAL_MS ?? 30_000));
        wake = () => {
          clearTimeout(t);
          res();
        };
      });
  } while (loop && !stop);
  if (loop) await prisma.systemJob.updateMany({ where: { key: "worker:loop", holder }, data: { status: "IDLE", holder: null } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
