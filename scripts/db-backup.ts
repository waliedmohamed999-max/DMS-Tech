/**
 * Database backup (Phase 9 — docs/DISASTER-RECOVERY.md#backups).
 *
 *   npm run db:backup                       # engine: pg_dump if installed, else logical (non-production only)
 *   BACKUP_ENGINE=logical npm run db:backup # force the logical engine
 *
 * Writes <BACKUP_DIR>/dms-<db>-<timestamp>.(dump|ndjson.gz) + .sha256 + .json metadata, records a BackupRecord row and
 * audit entries (backup.started / completed / failed). Exit code 1 on any failure.
 */
import "dotenv/config";
import { basename } from "node:path";
import { prisma } from "../src/server/db";
import { createBackup } from "../src/server/system/backup";
import { auditBackup } from "./_backup-shared";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const rec = await prisma.backupRecord.create({ data: { kind: "database", status: "STARTED" } });
  await auditBackup("backup.started", { id: rec.id });
  try {
    const r = await createBackup(url);
    await prisma.backupRecord.update({ where: { id: rec.id }, data: { status: "COMPLETED", fileName: basename(r.file), sizeBytes: BigInt(r.sizeBytes), sha256: r.sha256, metadata: { engine: r.engine, ...r.metadata } as object, completedAt: new Date() } });
    await auditBackup("backup.completed", { id: rec.id, file: basename(r.file), sizeBytes: r.sizeBytes, sha256: r.sha256, engine: r.engine });
    console.log(JSON.stringify({ ok: true, file: r.file, sizeBytes: r.sizeBytes, sha256: r.sha256, engine: r.engine }));
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 500);
    await prisma.backupRecord.update({ where: { id: rec.id }, data: { status: "FAILED", error: msg, completedAt: new Date() } });
    await auditBackup("backup.failed", { id: rec.id, error: msg });
    throw e;
  }
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
