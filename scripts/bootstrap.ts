/**
 * Production-safe bootstrap: organization + system roles + first Super Admin.
 *
 *   OS_ADMIN_EMAIL=... OS_ADMIN_NAME=... OS_ADMIN_PASSWORD=... npm run os:bootstrap
 *
 * Idempotent. Never creates demo data.
 */
import "dotenv/config";
import { ensureOrganization, ensureSuperAdmin } from "../src/server/bootstrap";
import { prisma } from "../src/server/db";

async function main() {
  const email = process.env.OS_ADMIN_EMAIL;
  const name = process.env.OS_ADMIN_NAME ?? "System Administrator";
  const password = process.env.OS_ADMIN_PASSWORD;
  const org = await ensureOrganization({ slug: "dms-tech", name: "DMS Tech", nameAr: "دي إم إس تك" });
  console.log(`✔ organization ${org.slug} + system roles synced`);
  if (email && password) {
    const u = await ensureSuperAdmin(org.id, { email, name, password });
    console.log(`✔ super admin ready: ${u.email}`);
  } else {
    console.log("ℹ set OS_ADMIN_EMAIL and OS_ADMIN_PASSWORD to create the first super admin");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
