import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { createGunzip, createGzip } from "node:zlib";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import pg from "pg";

/**
 * Database backup / verification / restore library (docs/DISASTER-RECOVERY.md). Used by scripts only — never by the web app.
 *
 * Engines
 *  · pg_dump  (default, REQUIRED for production): custom format (-Fc), verified with pg_restore --list and a real
 *             pg_restore into a temporary database.
 *  · logical  (fallback where pg client tools are missing, e.g. this embedded development Postgres; production only
 *             with BACKUP_ENGINE=logical): one REPEATABLE READ READ ONLY snapshot, every public table as JSON lines,
 *             gzip. Restore = apply the code's migrations to an EMPTY database, then load rows with triggers / FKs
 *             deferred (session_replication_role = replica → needs a superuser on the TARGET).
 *
 * Every backup gets a sha256 sidecar and a metadata file (database name, server version, migrations, row counts —
 * never host, user or password). Verification and restore refuse to touch the configured DATABASE_URL database.
 */

export type DbTarget = { url: string; database: string; host: string; port: string; user: string; password: string };
export function parseDbUrl(url: string): DbTarget {
  const u = new URL(url);
  return { url, database: decodeURIComponent(u.pathname.replace(/^\//, "")), host: u.hostname, port: u.port || "5432", user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
}
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${encodeURIComponent(db)}`;
  return u.toString();
};
export const sameDatabase = (a: string, b: string) => {
  const x = parseDbUrl(a);
  const y = parseDbUrl(b);
  return x.database === y.database && x.host.replace("127.0.0.1", "localhost") === y.host.replace("127.0.0.1", "localhost") && x.port === y.port;
};

export const sha256File = (file: string) =>
  new Promise<string>((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (c) => h.update(c)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });

export function findTool(name: "pg_dump" | "pg_restore"): string | null {
  const explicit = process.env[name === "pg_dump" ? "PG_DUMP_PATH" : "PG_RESTORE_PATH"];
  if (explicit && existsSync(explicit)) return explicit;
  const r = spawnSync(name, ["--version"], { stdio: "ignore" });
  return r.status === 0 ? name : null;
}

/** Refuses dangerous / ambiguous destinations (inside the web root or the source tree). */
export function backupDir(env: Record<string, string | undefined> = process.env) {
  const dir = path.resolve(env.BACKUP_DIR ?? "backups");
  const cwd = process.cwd();
  for (const forbidden of ["public", "src", ".next", "prisma"]) if (dir === path.join(cwd, forbidden) || dir.startsWith(path.join(cwd, forbidden) + path.sep)) throw new Error(`BACKUP_DIR_UNSAFE: ${forbidden}/ is not a backup location`);
  if ((env.NODE_ENV === "production" || env.APP_ENV === "staging" || env.APP_ENV === "production") && !env.BACKUP_DIR) throw new Error("BACKUP_DIR_REQUIRED: set BACKUP_DIR to a dedicated, access-controlled location in production");
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function client(url: string) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}

const KEY_TABLES = ["Organization", "User", "Client", "Lead", "Invoice", "Payment", "Contract", "Project", "Employee", "PayrollRun", "Document", "DocumentVersion", "AuditLog"];

async function snapshotMeta(c: pg.Client) {
  const v = (await c.query("SHOW server_version")).rows[0].server_version as string;
  const migrations = (await c.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`)).rows.map((r) => r.migration_name as string);
  const tables = (await c.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)).rows.map((r) => r.tablename as string);
  const rowCounts: Record<string, number> = {};
  for (const t of tables.filter((x) => KEY_TABLES.includes(x))) rowCounts[t] = Number((await c.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n);
  return { serverVersion: v, migrations, tables, rowCounts };
}

export type BackupResult = { file: string; sha256: string; sizeBytes: number; engine: "pg_dump" | "logical"; metadata: Record<string, unknown> };

/** Create a backup of `url`. Writes <file>, <file>.sha256, <file>.json. */
export async function createBackup(url: string, opts: { dir?: string; engine?: "pg_dump" | "logical"; now?: Date } = {}): Promise<BackupResult> {
  const target = parseDbUrl(url);
  const dir = opts.dir ?? backupDir();
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[:.]/g, "-");
  const pgDump = findTool("pg_dump");
  const engine = opts.engine ?? (process.env.BACKUP_ENGINE as "pg_dump" | "logical" | undefined) ?? (pgDump ? "pg_dump" : process.env.NODE_ENV === "production" || process.env.APP_ENV === "staging" || process.env.APP_ENV === "production" ? "pg_dump" : "logical");
  const c = await client(url);
  let meta: Awaited<ReturnType<typeof snapshotMeta>>;
  let file: string;
  try {
    if (engine === "pg_dump") {
      if (!pgDump) throw new Error("PG_DUMP_NOT_FOUND: install the PostgreSQL client tools (matching the server major version) or set PG_DUMP_PATH");
      meta = await snapshotMeta(c);
      file = path.join(dir, `dms-${target.database}-${stamp}.dump`);
      await run(pgDump, ["-Fc", "--no-owner", "--no-acl", "-h", target.host, "-p", target.port, "-U", target.user, "-f", file, target.database], target.password);
    } else {
      file = path.join(dir, `dms-${target.database}-${stamp}.ndjson.gz`);
      meta = await logicalDump(c, file);
    }
  } finally {
    await c.end();
  }
  const sha256 = await sha256File(file);
  const sizeBytes = statSync(file).size;
  if (!sizeBytes) throw new Error("BACKUP_EMPTY");
  const metadata = { format: engine === "pg_dump" ? "pg_dump-custom" : "dms-logical-1", database: target.database, createdAt: new Date().toISOString(), ...meta, sha256, sizeBytes };
  writeFileSync(`${file}.sha256`, `${sha256}  ${path.basename(file)}\n`);
  writeFileSync(`${file}.json`, JSON.stringify(metadata, null, 2));
  return { file, sha256, sizeBytes, engine, metadata };
}

function run(cmd: string, args: string[], password: string, opts: { allowWarnings?: boolean } = {}) {
  return new Promise<string>((resolve, reject) => {
    // the password goes through the environment, never the command line or the log
    const p = spawn(cmd, args, { env: { ...process.env, PGPASSWORD: password }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 || (opts.allowWarnings && code === 1) ? resolve(out) : reject(new Error(`${path.basename(cmd)} exited ${code}: ${err.slice(0, 500).replace(/password[^\s]*/gi, "[redacted]")}`))));
  });
}

async function logicalDump(c: pg.Client, file: string) {
  await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const meta = await snapshotMeta(c);
    const gz = createGzip();
    const out = createWriteStream(file, { mode: 0o600 });
    const done = pipeline(gz, out);
    const write = (s: string) => new Promise<void>((res) => (gz.write(s + "\n") ? res() : gz.once("drain", () => res())));
    await write(JSON.stringify({ format: "dms-logical-1", ...meta }));
    for (const t of meta.tables) {
      if (t === "_prisma_migrations") continue; // recreated by `prisma migrate deploy` on restore
      await write(JSON.stringify({ table: t }));
      for (let offset = 0; ; offset += 2000) {
        const rows = (await c.query(`SELECT row_to_json(x)::text AS j FROM "${t}" x ORDER BY ctid LIMIT 2000 OFFSET ${offset}`)).rows as { j: string }[];
        for (const r of rows) await write(r.j);
        if (rows.length < 2000) break;
      }
    }
    gz.end();
    await done;
    await c.query("COMMIT");
    return meta;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  }
}

/** Load a logical backup into an EMPTY database whose schema was created by `prisma migrate deploy`. */
async function logicalLoad(file: string, url: string) {
  const c = await client(url);
  const counts: Record<string, number> = {};
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL session_replication_role = replica");
    const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
    let table: string | null = null;
    let batch: string[] = [];
    const flush = async () => {
      if (!table || !batch.length) return;
      await c.query(`INSERT INTO "${table}" SELECT * FROM json_populate_recordset(NULL::"${table}", $1::json)`, [`[${batch.join(",")}]`]);
      counts[table] = (counts[table] ?? 0) + batch.length;
      batch = [];
    };
    let header = true;
    for await (const line of rl) {
      if (!line) continue;
      if (header) {
        header = false;
        continue;
      }
      if (line.startsWith('{"table":')) {
        await flush();
        table = (JSON.parse(line) as { table: string }).table;
        if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error("BACKUP_CORRUPT: bad table name");
        continue;
      }
      batch.push(line);
      if (batch.length >= 500) await flush();
    }
    await flush();
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    await c.end();
  }
  return counts;
}

function readHeader(file: string) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const src = createReadStream(file);
    const gz = createGunzip();
    src.on("error", (e) => done(() => reject(e)));
    gz.on("error", (e) => done(() => reject(e)));
    const rl = createInterface({ input: src.pipe(gz) });
    rl.on("error", (e) => done(() => reject(e)));
    rl.once("line", (l) => {
      done(() => {
        try {
          resolve(JSON.parse(l));
        } catch (e) {
          reject(e);
        }
      });
      rl.close();
      src.destroy();
    });
    rl.once("close", () => done(() => resolve({})));
  });
}

export type VerifyStep = { step: string; ok: boolean; detail?: string };

/**
 * Verify a backup: size, checksum, structure, then a REAL restore into a temporary database `dms_verify_<random>`
 * on `serverUrl` (never the configured application database), integrity checks, and the temp database is dropped.
 */
export async function verifyBackup(file: string, opts: { serverUrl: string; appDatabaseUrl?: string; migrate: (url: string) => Promise<void> }): Promise<{ ok: boolean; steps: VerifyStep[] }> {
  const steps: VerifyStep[] = [];
  const fail = (step: string, detail: string) => (steps.push({ step, ok: false, detail }), { ok: false, steps });
  if (!existsSync(file)) return fail("exists", "file not found");
  const size = statSync(file).size;
  if (!size) return fail("size", "empty file");
  steps.push({ step: "size", ok: true, detail: `${size} bytes` });
  const sidecar = `${file}.sha256`;
  if (!existsSync(sidecar)) return fail("checksum", "missing .sha256 sidecar");
  const expected = readFileSync(sidecar, "utf8").split(/\s+/)[0];
  const actual = await sha256File(file);
  if (expected !== actual) return fail("checksum", "sha256 mismatch — file altered or truncated");
  steps.push({ step: "checksum", ok: true });
  const meta = existsSync(`${file}.json`) ? (JSON.parse(readFileSync(`${file}.json`, "utf8")) as { format?: string; migrations?: string[]; rowCounts?: Record<string, number> }) : {};
  const logical = file.endsWith(".ndjson.gz");
  if (logical) {
    try {
      const h = await readHeader(file);
      if (h.format !== "dms-logical-1") return fail("structure", "not a dms-logical-1 backup");
    } catch {
      return fail("structure", "unreadable gzip / header");
    }
  } else {
    const tool = findTool("pg_restore");
    if (!tool) return fail("structure", "PG_RESTORE_NOT_FOUND");
    try {
      await run(tool, ["--list", file], "");
    } catch (e) {
      return fail("structure", String((e as Error).message).slice(0, 200));
    }
  }
  steps.push({ step: "structure", ok: true });

  const tempDb = `dms_verify_${Date.now()}_${randomBytes(3).toString("hex")}`;
  const admin = withDb(opts.serverUrl, "postgres");
  const tempUrl = withDb(opts.serverUrl, tempDb);
  if (opts.appDatabaseUrl && sameDatabase(tempUrl, opts.appDatabaseUrl)) return fail("target", "refusing to verify into the application database");
  const a = await client(admin);
  try {
    await a.query(`CREATE DATABASE "${tempDb}"`);
    steps.push({ step: "temp_database", ok: true, detail: tempDb });
    let restored: Record<string, number> = {};
    if (logical) {
      await opts.migrate(tempUrl);
      restored = await logicalLoad(file, tempUrl);
    } else {
      const t = parseDbUrl(tempUrl);
      await run(findTool("pg_restore")!, ["--no-owner", "--no-acl", "--no-comments", "-h", t.host, "-p", t.port, "-U", t.user, "-d", tempDb, file], t.password);
    }
    steps.push({ step: "restore", ok: true, detail: logical ? `${Object.values(restored).reduce((x, y) => x + y, 0)} rows` : "pg_restore" });
    const c = await client(tempUrl);
    try {
      const mig = (await c.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`)).rows.map((r) => r.migration_name as string);
      const missing = (meta.migrations ?? []).filter((m) => !mig.includes(m));
      if (missing.length) return fail("migrations", `restored schema lacks ${missing.length} migrations of the backup`);
      steps.push({ step: "migrations", ok: true, detail: `${mig.length}` });
      const mismatches: string[] = [];
      for (const [t, n] of Object.entries(meta.rowCounts ?? {})) {
        const got = Number((await c.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n);
        if (got !== n) mismatches.push(`${t}: ${got}≠${n}`);
      }
      if (mismatches.length) return fail("row_counts", mismatches.join(", "));
      steps.push({ step: "row_counts", ok: true, detail: `${Object.keys(meta.rowCounts ?? {}).length} key tables match` });
      const orgs = Number((await c.query(`SELECT count(*)::int AS n FROM "Organization"`)).rows[0].n);
      if (!orgs && (meta.rowCounts?.Organization ?? 0) > 0) return fail("integrity", "no organization restored");
      // critical business invariants of the RESTORED data (a structurally valid dump of inconsistent data is not a good backup)
      const inv = async (sql: string) => {
        try {
          return Number((await c.query(sql)).rows[0].n);
        } catch {
          return 0; // table absent in an older backup
        }
      };
      const broken = {
        paidInvoicesWithBalance: await inv(`SELECT count(*)::int AS n FROM "Invoice" WHERE "status" = 'PAID' AND "balanceDue" <> 0`),
        paymentsAllocationMismatch: await inv(`SELECT count(*)::int AS n FROM "Payment" p WHERE p."reversedAt" IS NULL AND p."amount" <> COALESCE((SELECT sum(a."amount") FROM "PaymentAllocation" a WHERE a."paymentId" = p."id"), 0)`),
        invoiceTotalsMismatch: await inv(`SELECT count(*)::int AS n FROM "Invoice" WHERE "total" <> "subtotal" - "discountTotal" + "taxTotal" OR "balanceDue" <> "total" - "paidAmount"`),
        bankRowsWithoutIban: await inv(`SELECT count(*)::int AS n FROM "EmployeeBankAccount" WHERE "iban" IS NULL AND "ibanCiphertext" IS NULL`)
      };
      const bad = Object.entries(broken).filter(([, n]) => n > 0);
      if (bad.length) return fail("integrity", bad.map(([k, n]) => `${k}=${n}`).join(", "));
      steps.push({ step: "integrity", ok: true, detail: "organization present; invoices / payments / bank invariants hold" });
    } finally {
      await c.end();
    }
    return { ok: true, steps };
  } catch (e) {
    return fail("restore", String((e as Error).message).slice(0, 300));
  } finally {
    await a.query(`DROP DATABASE IF EXISTS "${tempDb}" WITH (FORCE)`).catch(() => undefined);
    steps.push({ step: "cleanup", ok: true, detail: `dropped ${tempDb}` });
    await a.end();
  }
}

/** Restore into an EXPLICIT, EMPTY, non-application database (the runbook decides when that becomes production). */
export async function restoreBackup(file: string, opts: { targetUrl: string; appDatabaseUrl?: string; confirm: string; migrate: (url: string) => Promise<void> }) {
  const t = parseDbUrl(opts.targetUrl);
  if (opts.confirm !== t.database) throw new Error("RESTORE_CONFIRMATION_MISMATCH: --confirm must equal the target database name");
  if (opts.appDatabaseUrl && sameDatabase(opts.targetUrl, opts.appDatabaseUrl)) throw new Error("RESTORE_REFUSED: the target is the configured application database (restore elsewhere, then switch DATABASE_URL — see docs/DISASTER-RECOVERY.md)");
  const c = await client(opts.targetUrl);
  try {
    const n = Number((await c.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`)).rows[0].n);
    if (n > 0) throw new Error("RESTORE_REFUSED: target database is not empty");
  } finally {
    await c.end();
  }
  if (file.endsWith(".ndjson.gz")) {
    await opts.migrate(opts.targetUrl);
    return logicalLoad(file, opts.targetUrl);
  }
  const tool = findTool("pg_restore");
  if (!tool) throw new Error("PG_RESTORE_NOT_FOUND");
  // --no-comments: COMMENT ON EXTENSION needs the extension owner; the application role restores everything else
  await run(tool, ["--no-owner", "--no-acl", "--no-comments", "-h", t.host, "-p", t.port, "-U", t.user, "-d", t.database, file], t.password);
  // report what was actually restored (exact row counts per public table)
  const r = await client(opts.targetUrl);
  try {
    const counts: Record<string, number> = {};
    for (const { tablename } of (await r.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)).rows as { tablename: string }[])
      counts[tablename] = Number((await r.query(`SELECT count(*)::bigint AS n FROM "public"."${tablename.replace(/"/g, '""')}"`)).rows[0].n);
    return counts;
  } finally {
    await r.end();
  }
}
