/**
 * Backup retention (Phase 10). Keeps, per kind of file in BACKUP_DIR (dms-<db>-<timestamp>.dump / .ndjson.gz):
 *   the newest BACKUP_KEEP_DAILY daily, BACKUP_KEEP_WEEKLY weekly (one per ISO week) and BACKUP_KEEP_MONTHLY monthly
 *   (one per month) backups. The three numbers MUST be configured (no silent defaults); offsite copies follow the
 *   storage provider's own lifecycle rules.
 *   npm run backup:prune            # DRY RUN — lists what would be deleted
 *   npm run backup:prune -- --apply
 * Never deletes the newest VERIFIED backup or anything that is not a dms backup file (+ its .sha256 / .json sidecars).
 */
import "dotenv/config";
import { readdirSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/server/db";
import { backupDir } from "../src/server/system/backup";

const num = (k: string) => {
  const v = Number(process.env[k]);
  if (!Number.isInteger(v) || v < 1) throw new Error(`${k} must be configured (positive integer)`);
  return v;
};

async function main() {
  const daily = num("BACKUP_KEEP_DAILY");
  const weekly = num("BACKUP_KEEP_WEEKLY");
  const monthly = num("BACKUP_KEEP_MONTHLY");
  const dir = backupDir();
  const files = readdirSync(dir)
    .map((f) => ({ f, m: /^dms-.+-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-\d{3}Z\.(dump|ndjson\.gz)$/.exec(f) }))
    .filter((x): x is { f: string; m: RegExpExecArray } => Boolean(x.m))
    .map(({ f, m }) => ({ f, at: new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const keep = new Set<string>();
  const pick = (key: (d: Date) => string, n: number) => {
    const seen = new Set<string>();
    for (const x of files) {
      const k = key(x.at);
      if (seen.has(k)) continue;
      seen.add(k);
      if (seen.size > n) break;
      keep.add(x.f);
    }
  };
  pick((d) => d.toISOString().slice(0, 10), daily);
  pick((d) => {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    return `${t.getUTCFullYear()}-W${Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7)}`;
  }, weekly);
  pick((d) => d.toISOString().slice(0, 7), monthly);
  const verified = await prisma.backupRecord.findFirst({ where: { status: "VERIFIED", fileName: { not: null } }, orderBy: { startedAt: "desc" } });
  if (verified?.fileName) keep.add(verified.fileName);
  const remove = files.filter((x) => !keep.has(x.f)).map((x) => x.f);
  if (process.argv.includes("--apply"))
    for (const f of remove) for (const p of [f, `${f}.sha256`, `${f}.json`]) if (existsSync(path.join(dir, p))) unlinkSync(path.join(dir, p));
  console.log(JSON.stringify({ dryRun: !process.argv.includes("--apply"), total: files.length, kept: keep.size, removed: remove }));
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
