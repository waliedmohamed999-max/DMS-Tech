/**
 * Restore a backup into an EXPLICIT, EMPTY database that is NOT the configured application database.
 * Production restore is a runbook procedure (docs/DISASTER-RECOVERY.md#restore): restore elsewhere, verify, then switch.
 *
 *   npm run db:restore -- --file backups/dms-...ndjson.gz --target postgresql://…/dms_restore --confirm dms_restore
 */
import "dotenv/config";
import { restoreBackup } from "../src/server/system/backup";
import { migrateTo } from "./_backup-shared";

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const file = arg("--file");
  const target = arg("--target");
  const confirm = arg("--confirm");
  if (!file || !target || !confirm) throw new Error("usage: --file <backup> --target <postgres url> --confirm <target database name>");
  const counts = await restoreBackup(file, { targetUrl: target, appDatabaseUrl: process.env.DATABASE_URL, confirm, migrate: migrateTo });
  console.log(JSON.stringify({ ok: true, restoredTables: Object.keys(counts).length, rows: Object.values(counts).reduce((a, b) => a + b, 0) }));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }));
  process.exitCode = 1;
});
