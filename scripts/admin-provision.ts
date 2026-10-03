/**
 * Secure Super Admin provisioning / recovery (Phase 10 — docs/GO-LIVE.md#administrators). Run on the server, by an operator.
 *
 *   npm run admin:provision -- --email it.lead@company.sa --name "IT Lead"   # new Super Admin
 *   npm run admin:provision -- --email it.lead@company.sa --reset             # recovery: new temporary password
 *
 * · Temporary password: random, printed ONCE here, never stored in clear or logged; changed at first sign-in (forced).
 * · Refuses the demo domain outside development and the demo password in production; no shared accounts.
 * · Recovery revokes every session of the account. Both actions are audited (without the password).
 * Provision at least TWO named Super Admins so one can always recover the other.
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import { ensureOrganization } from "../src/server/bootstrap";
import { provisionSmokeAccount, provisionSuperAdmin } from "../src/server/admin/provision";

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const email = arg("--email");
  if (!email) throw new Error("--email <address> is required");
  const org = await ensureOrganization({ slug: process.env.OS_ORG_SLUG ?? "dms-tech", name: "DMS Tech", nameAr: "دي إم إس تك" });
  if (process.argv.includes("--smoke")) {
    const s = await provisionSmokeAccount(org.id, email, process.argv.includes("--reset"));
    process.stdout.write(`
  Smoke account (employee role): ${email.trim().toLowerCase()}
  Password: ${s.password}
  → store as SMOKE_EMAIL / SMOKE_PASSWORD in the deployment secret store.

`);
    return;
  }
  const r = await provisionSuperAdmin(org.id, { email, name: arg("--name"), reset: process.argv.includes("--reset") });
  process.stdout.write(`\n  Account:            ${email.trim().toLowerCase()}\n  Temporary password: ${r.temporaryPassword}\n  → must be changed at first sign-in. Deliver it through a separate secure channel; it is not stored anywhere else.\n\n`);
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
