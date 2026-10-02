/**
 * Scheduled operations sweep (cron / platform scheduler, e.g. every 15 minutes): PO overdue, asset warranty
 * expiring, maintenance due, ticket SLA warnings / breaches, knowledge review reminders.
 * Lease-guarded and claim-based: safe with several app instances and repeated runs.
 *
 *   npm run operations:sweep
 */
import "dotenv/config";
import { registerSubscribers } from "../src/server/events/subscribers";
import { prisma } from "../src/server/db";
import { sweepOps } from "../src/server/ops/sweep";

async function main() {
  registerSubscribers();
  for (const org of await prisma.organization.findMany({ select: { id: true, slug: true } })) {
    console.log(org.slug, await sweepOps(org.id));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
