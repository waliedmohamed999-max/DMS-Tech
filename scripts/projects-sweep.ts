/**
 * Scheduled project sweep (run from cron / a platform scheduler, e.g. every 15 minutes):
 * task overdue / due-soon, milestone overdue and dependency overdue reminders (deduplicated) and a
 * health recompute of every live project. Lease-guarded: safe with several app instances.
 *
 *   npm run projects:sweep
 */
import "dotenv/config";
import "../src/server/events/subscribers";
import { registerSubscribers } from "../src/server/events/subscribers";
import { prisma } from "../src/server/db";
import { sweepProjects } from "../src/server/projects/sweep";

async function main() {
  registerSubscribers();
  for (const org of await prisma.organization.findMany({ select: { id: true, slug: true } })) {
    console.log(org.slug, await sweepProjects(org.id));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
