// LOCAL STAGING REHEARSAL — a separate PostgreSQL 18 cluster (not the development database) with:
//   · TLS required for every TCP connection (pg_hba: hostssl only, hostnossl rejected)
//   · a non-superuser application role (dms_app) owning dms_os_staging; a separate admin role for backups / verification
//   · pg_stat_statements for the query review
// Secrets come from .local/staging/staging.env (generated once, never committed). Data in .local/staging/pg.
// This is a rehearsal of the production topology on one machine — it is NOT a managed provider (see docs/STAGING.md).
//   node scripts/staging/staging-db.mjs      → keeps running until Ctrl+C
import EmbeddedPostgres from "embedded-postgres";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const root = path.resolve(".local/staging");
const env = Object.fromEntries(readFileSync(path.join(root, "staging.env"), "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const port = 54330;
const dir = path.join(root, "pg");
const tls = path.join(root, "tls");
const pgdb = new EmbeddedPostgres({
  databaseDir: dir,
  user: "dms_admin",
  password: env.STAGING_PG_ADMIN_PASSWORD,
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C", "--auth=scram-sha-256"],
  postgresFlags: ["-c", "ssl=on", "-c", `ssl_cert_file=${path.join(tls, "db.crt").replace(/\\/g, "/")}`, "-c", `ssl_key_file=${path.join(tls, "db.key").replace(/\\/g, "/")}`, "-c", "shared_preload_libraries=pg_stat_statements", "-c", "pg_stat_statements.track=all", "-c", "max_connections=60"]
});

const fresh = !existsSync(path.join(dir, "PG_VERSION"));
if (fresh) await pgdb.initialise();
// TLS-only network access (local socket-less Windows: everything is TCP)
writeFileSync(path.join(dir, "pg_hba.conf"), ["# staging rehearsal: TLS required", "hostssl all all 127.0.0.1/32 scram-sha-256", "hostssl all all ::1/128 scram-sha-256", "hostnossl all all 0.0.0.0/0 reject", "hostnossl all all ::/0 reject", ""].join("\n"));
await pgdb.start();

const admin = new pg.Client({ host: "localhost", port, user: "dms_admin", password: env.STAGING_PG_ADMIN_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false } });
await admin.connect();
await admin.query("SELECT pg_reload_conf()");
const has = async (sql, v) => (await admin.query(sql, v)).rowCount > 0;
if (!(await has("SELECT 1 FROM pg_roles WHERE rolname = 'dms_app'"))) await admin.query(`CREATE ROLE dms_app LOGIN PASSWORD '${env.STAGING_PG_APP_PASSWORD.replace(/'/g, "''")}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
if (!(await has("SELECT 1 FROM pg_database WHERE datname = 'dms_os_staging'"))) await admin.query("CREATE DATABASE dms_os_staging OWNER dms_app");
const db = new pg.Client({ host: "localhost", port, user: "dms_admin", password: env.STAGING_PG_ADMIN_PASSWORD, database: "dms_os_staging", ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query("CREATE EXTENSION IF NOT EXISTS pg_stat_statements");
await db.query("GRANT pg_read_all_stats TO dms_app");
await db.end();
await admin.end();
console.log(`[staging-db] PostgreSQL ${fresh ? "initialised and " : ""}ready on localhost:${port} (TLS required) — database dms_os_staging, app role dms_app`);

const stop = async () => {
  await pgdb.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
