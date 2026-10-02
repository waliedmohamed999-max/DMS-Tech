/**
 * Scheduled HR sweep (cron / platform scheduler, e.g. hourly): marks yesterday's missing attendance
 * on working days, leave starting tomorrow, performance reviews due and offers about to expire.
 * Lease-guarded and deduplicated: safe with several app instances.
 *
 *   npm run hr:sweep
 */
import "dotenv/config";
import { registerSubscribers } from "../src/server/events/subscribers";
import { prisma } from "../src/server/db";
import { sweepHr } from "../src/server/hr/sweep";

async function main() {
  registerSubscribers();
  for (const org of await prisma.organization.findMany({ select: { id: true, slug: true } })) {
    console.log(org.slug, await sweepHr(org.id));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
