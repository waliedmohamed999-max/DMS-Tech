/**
 * Integrations worker: campaign batches, outbox delivery (retry / dead-letter), connection health checks.
 * Run from a scheduler every minute, or as a long-running process:
 *
 *   npm run integrations:worker            # one pass
 *   npm run integrations:worker -- --loop  # every 30 s until stopped
 *
 * Safe with several instances (leases + row claims + idempotency keys).
 */
import "dotenv/config";
import { registerSubscribers } from "../src/server/events/subscribers";
import { prisma } from "../src/server/db";
import { integrationsTick } from "../src/server/integrations/worker";

const loop = process.argv.includes("--loop");
let stop = false;
process.on("SIGINT", () => (stop = true));
process.on("SIGTERM", () => (stop = true));

async function main() {
  registerSubscribers();
  do {
    console.log(new Date().toISOString(), JSON.stringify(await integrationsTick()));
    if (loop) await new Promise((r) => setTimeout(r, 30_000));
  } while (loop && !stop);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
