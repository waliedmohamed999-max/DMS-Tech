/**
 * Operational data retention (docs/DATA-CLASSIFICATION.md#retention).
 *   npm run retention:purge            # DRY RUN — counts what would be removed
 *   npm run retention:purge -- --apply # deletes only transient / operational rows (never audit, finance, payroll, documents)
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import { purgeOperationalData, KEEP } from "../src/server/system/retention";

purgeOperationalData({ dryRun: !process.argv.includes("--apply") })
  .then((r) => console.log(JSON.stringify({ ...r, neverPurged: KEEP }, null, 2)))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
