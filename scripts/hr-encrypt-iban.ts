/**
 * Encrypt legacy plaintext IBANs (Phase 10) — and rotate HR_FIELD_KEY.
 *
 *   npm run hr:encrypt-iban                     # DRY RUN: counts only
 *   npm run hr:encrypt-iban -- --apply          # encrypt every plaintext IBAN (verify before clearing the plaintext)
 *   npm run hr:encrypt-iban -- --rotate --apply # re-encrypt rows of the previous key version (HR_FIELD_KEY_PREVIOUS)
 *
 * Logic: src/server/hr/ibanMigration.ts. Back up the database first. Values are never printed; the audit log gets one
 * aggregate entry. The DB trigger only permits these exact transitions on the otherwise immutable bank history.
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import { encryptLegacyIbans } from "../src/server/hr/ibanMigration";

encryptLegacyIbans({ apply: process.argv.includes("--apply"), rotate: process.argv.includes("--rotate") })
  .then((r) => {
    const { failedIds: _ids, ...summary } = r;
    console.log(JSON.stringify(summary));
    if (r.failed) process.exitCode = 1;
  })
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
