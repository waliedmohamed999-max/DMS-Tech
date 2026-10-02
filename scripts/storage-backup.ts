/**
 * Document storage backup / verification (docs/DISASTER-RECOVERY.md#document-storage). A database backup alone
 * restores metadata, not files.
 *
 *   npm run storage:verify            # every DocumentVersion: file present + sha256 matches (read-only)
 *   npm run storage:backup            # local driver: copy DOCUMENT_STORAGE_DIR → BACKUP_DIR/storage-<ts>/ + manifest
 *
 * S3: use bucket versioning + lifecycle + (cross-region) replication — this script only verifies objects.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/server/db";
import { storageFor } from "../src/server/ops/storage";
import { backupDir } from "../src/server/system/backup";

async function verify() {
  const versions = await prisma.documentVersion.findMany({ select: { id: true, storageKey: true, storageDriver: true, sha256: true } });
  const problems: { id: string; problem: string }[] = [];
  for (const v of versions) {
    try {
      const data = await storageFor(v.storageDriver).get(v.storageKey);
      if (createHash("sha256").update(data).digest("hex") !== v.sha256) problems.push({ id: v.id, problem: "HASH_MISMATCH" });
    } catch {
      problems.push({ id: v.id, problem: "MISSING" });
    }
  }
  return { versions: versions.length, ok: versions.length - problems.length, problems };
}

async function main() {
  const mode = process.argv[2] ?? "verify";
  if (mode === "verify") {
    const r = await verify();
    console.log(JSON.stringify(r, null, 2));
    if (r.problems.length) process.exitCode = 1;
    return;
  }
  if ((process.env.DOCUMENT_STORAGE ?? "local") !== "local") throw new Error("storage:backup copies the LOCAL driver only — for S3 use bucket versioning / replication (see runbook)");
  const src = process.env.DOCUMENT_STORAGE_DIR ?? path.join(process.cwd(), ".local", "storage", "documents");
  if (!existsSync(src)) throw new Error(`storage directory not found: ${src}`);
  const dest = path.join(backupDir(), `storage-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true, errorOnExist: true });
  const versions = await prisma.documentVersion.findMany({ where: { storageDriver: "local" }, select: { storageKey: true, sha256: true } });
  writeFileSync(path.join(dest, "MANIFEST.json"), JSON.stringify({ createdAt: new Date().toISOString(), files: versions.length, entries: versions }, null, 2));
  console.log(JSON.stringify({ ok: true, dest, files: versions.length }));
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
