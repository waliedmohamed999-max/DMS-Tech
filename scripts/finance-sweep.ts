/**
 * Scheduled finance sweep (run from cron / a platform scheduler, e.g. every 15 minutes):
 * invoices due soon / overdue, eligible milestones / completed projects not yet invoiced, and approved
 * expenses awaiting payment. Lease-guarded and deduplicated: safe with several app instances.
 *
 *   npm run finance:sweep
 */
import "dotenv/config";
import "../src/server/events/subscribers";
import "../src/server/finance/expenses";
import { registerSubscribers } from "../src/server/events/subscribers";
import { prisma } from "../src/server/db";
import { sweepFinance } from "../src/server/finance/sweep";

async function main() {
  registerSubscribers();
  for (const org of await prisma.organization.findMany({ select: { id: true, slug: true } })) {
    console.log(org.slug, await sweepFinance(org.id));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
