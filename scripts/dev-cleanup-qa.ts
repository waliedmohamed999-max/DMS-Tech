/**
 * DEVELOPMENT-ONLY cleanup of the browser-QA fixtures created during Phase 2 testing.
 *
 *   ALLOW_DEMO_SEED=1 npx tsx scripts/dev-cleanup-qa.ts          # dry run: lists what would go
 *   ALLOW_DEMO_SEED=1 npx tsx scripts/dev-cleanup-qa.ts --apply  # deletes exactly those rows
 *
 * Safety rules:
 *   - refuses NODE_ENV=production and runs only with ALLOW_DEMO_SEED=1 (same guard as the demo seed)
 *   - only the dms-tech organization
 *   - never truncates, never matches broadly: a lead is a fixture only if its name is EXACTLY
 *     "QA Lead NNNNNN" (manual, created by sales@dms.test) or "Web QA NNNNNN" (website, company "QA Co")
 *   - related rows are only those created FROM those leads (converted client named like the lead,
 *     its contacts, the opportunity whose sourceLeadId is the lead) and their CRM timeline/notifications
 *   - anything commercial (quotations/contracts) attached to a fixture aborts the run
 *   - the append-only audit log is left untouched (it records that these rows existed)
 */
import "dotenv/config";
import { prisma } from "../src/server/db";

const FIXTURE = [/^QA Lead \d{6}$/, /^Web QA \d{6}$/];

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEMO_SEED !== "1") {
    console.error("✖ refused: development only (set ALLOW_DEMO_SEED=1 on a non-production machine)");
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "dms-tech" } });
  const rep = await prisma.user.findFirst({ where: { organizationId: org.id, email: "sales@dms.test" }, select: { id: true } });

  const candidates = await prisma.lead.findMany({ where: { organizationId: org.id, OR: [{ name: { startsWith: "QA Lead " } }, { name: { startsWith: "Web QA " } }] } });
  const leads = candidates.filter(
    (l) => (FIXTURE[0].test(l.name) && l.source === "MANUAL" && l.createdById === rep?.id) || (FIXTURE[1].test(l.name) && l.source === "WEBSITE" && l.companyName === "QA Co")
  );
  const leadIds = leads.map((l) => l.id);
  const opps = await prisma.opportunity.findMany({ where: { organizationId: org.id, sourceLeadId: { in: leadIds } }, select: { id: true, number: true, clientId: true } });
  const clientIds = [...new Set(leads.filter((l) => l.convertedClientId).map((l) => l.convertedClientId!))];
  const clients = await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, number: true, displayName: true } });
  // a converted client is removed only if it carries the fixture's own name and has nothing else
  const safeClients = [];
  for (const c of clients) {
    const otherOpps = await prisma.opportunity.count({ where: { clientId: c.id, sourceLeadId: { notIn: leadIds } } });
    if (FIXTURE[0].test(c.displayName) && otherOpps === 0) safeClients.push(c);
  }
  const clientIdsSafe = safeClients.map((c) => c.id);
  const commercial = await prisma.quotation.count({ where: { OR: [{ clientId: { in: clientIdsSafe } }, { opportunityId: { in: opps.map((o) => o.id) } }] } });
  if (commercial) {
    console.error(`✖ ${commercial} quotation(s) reference these fixtures — aborting, nothing deleted`);
    process.exit(1);
  }
  const contacts = await prisma.contact.count({ where: { clientId: { in: clientIdsSafe } } });

  console.log(`QA fixtures in ${org.slug}:`);
  console.log(`  leads         ${leads.length}  ${leads.map((l) => `${l.number} ${l.name}`).join(", ")}`);
  console.log(`  opportunities ${opps.length}  ${opps.map((o) => o.number).join(", ")}`);
  console.log(`  clients       ${safeClients.length}  ${safeClients.map((c) => `${c.number} ${c.displayName}`).join(", ")}`);
  console.log(`  contacts      ${contacts}`);
  if (!apply) {
    console.log("dry run — re-run with --apply to delete exactly these rows");
    return;
  }
  const entityIds = [...leadIds, ...opps.map((o) => o.id), ...clientIdsSafe];
  await prisma.$transaction(async (tx) => {
    await tx.crmEntityTag.deleteMany({ where: { entityId: { in: entityIds } } });
    await tx.crmNote.deleteMany({ where: { OR: [{ entityId: { in: entityIds } }, { clientId: { in: clientIdsSafe } }] } });
    await tx.crmActivity.deleteMany({ where: { OR: [{ entityId: { in: entityIds } }, { clientId: { in: clientIdsSafe } }] } });
    await tx.notification.deleteMany({ where: { organizationId: org.id, entityId: { in: entityIds } } });
    await tx.activity.deleteMany({ where: { organizationId: org.id, entityId: { in: entityIds } } });
    await tx.lead.updateMany({ where: { duplicateOfId: { in: leadIds } }, data: { duplicateOfId: null } });
    await tx.opportunity.deleteMany({ where: { id: { in: opps.map((o) => o.id) } } });
    await tx.lead.deleteMany({ where: { id: { in: leadIds } } });
    await tx.contact.deleteMany({ where: { clientId: { in: clientIdsSafe } } });
    await tx.client.deleteMany({ where: { id: { in: clientIdsSafe } } });
  });
  console.log("✔ QA fixtures removed (audit log kept)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
