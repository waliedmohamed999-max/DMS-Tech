/**
 * Scheduled commercial sweep (run from cron / a platform scheduler, e.g. every 15 minutes):
 * expires sent quotations past validity, raises "expiring soon" notices, and moves contracts to
 * EXPIRING / EXPIRED — all server-side, audited, idempotent. Pages also run it lazily (throttled).
 *
 *   npm run commercial:sweep
 */
import "dotenv/config";
import "../src/server/events/subscribers";
import { registerSubscribers } from "../src/server/events/subscribers";
import { prisma } from "../src/server/db";
import { sweepCommercial } from "../src/server/commercial/sweep";

async function main() {
  registerSubscribers();
  for (const org of await prisma.organization.findMany({ select: { id: true, slug: true } })) {
    console.log(org.slug, await sweepCommercial(org.id));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
