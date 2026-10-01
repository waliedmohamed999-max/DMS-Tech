// Local development / test PostgreSQL (real Postgres binaries, no Docker needed).
// Usage: node scripts/local-db.mjs   → keeps running until Ctrl+C
// Data lives in .local/pg (git-ignored). Never used in production.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const dir = ".local/pg";
const port = Number(process.env.LOCAL_PG_PORT ?? 54329);
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "dms",
  password: "dms_local_only",
  port,
  persistent: true,
  // UTF-8 regardless of the Windows code page (Arabic data)
  initdbFlags: ["--encoding=UTF8", "--locale=C"]
});

if (!existsSync(`${dir}/PG_VERSION`)) await pg.initialise();
await pg.start();
for (const db of ["dms_os", "dms_os_test"]) {
  try { await pg.createDatabase(db); } catch { /* already exists */ }
}
console.log(`[local-db] PostgreSQL ready on postgresql://dms:dms_local_only@localhost:${port}/dms_os`);

const stop = async () => { await pg.stop(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
