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

const loop = process.argv.includes("--loop");
const holder = `worker-${randomUUID().slice(0, 8)}`;
let stop = false;
process.on("SIGINT", () => (stop = true));
process.on("SIGTERM", () => (stop = true));

async function main() {
  assertStartupConfig();
  registerSubscribers();
  do {
    const started = Date.now();
    const r = await systemTick();
    if (loop) await heartbeat("worker:loop", holder);
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "worker_pass", ms: Date.now() - started, result: r }));
    if (loop) await new Promise((res) => setTimeout(res, 30_000));
  } while (loop && !stop);
  if (loop) await prisma.systemJob.updateMany({ where: { key: "worker:loop", holder }, data: { status: "IDLE", holder: null } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
