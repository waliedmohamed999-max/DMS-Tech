/**
 * Backup verification — a file existing is not a backup.
 *
 *   npm run db:verify-backup -- <file>     # default: the newest backup in BACKUP_DIR
 *
 * Size + sha256 + structure, then a REAL restore into a temporary database `dms_verify_*` on VERIFY_DATABASE_URL's server
 * (default: DATABASE_URL's server in non-production; REQUIRED in production so production is never used), row-count and
 * migration checks, and the temporary database is dropped. Updates the BackupRecord (VERIFIED / VERIFY_FAILED).
 */
import "dotenv/config";
import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { prisma } from "../src/server/db";
import { backupDir, verifyBackup } from "../src/server/system/backup";
import { auditBackup, migrateTo } from "./_backup-shared";

async function main() {
  const app = process.env.DATABASE_URL;
  const server = process.env.VERIFY_DATABASE_URL ?? (process.env.NODE_ENV === "production" ? null : app);
  if (!server) throw new Error("VERIFY_DATABASE_URL_REQUIRED: point verification at a separate, non-production PostgreSQL server");
  const dir = backupDir();
  const file = process.argv[2] ?? readdirSync(dir).filter((f) => /\.(dump|ndjson\.gz)$/.test(f)).map((f) => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  if (!file) throw new Error("no backup found");
  const r = await verifyBackup(file, { serverUrl: server, appDatabaseUrl: app, migrate: migrateTo });
  const rec = await prisma.backupRecord.findFirst({ where: { fileName: basename(file) }, orderBy: { startedAt: "desc" } });
  if (rec) await prisma.backupRecord.update({ where: { id: rec.id }, data: { status: r.ok ? "VERIFIED" : "VERIFY_FAILED", verifiedAt: new Date(), verifyDetail: r.steps as object } });
  await auditBackup(r.ok ? "backup.verified" : "backup.verify_failed", { id: rec?.id, file: basename(file), steps: r.steps });
  console.log(JSON.stringify({ ok: r.ok, file: basename(file), steps: r.steps }, null, 2));
  if (!r.ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
