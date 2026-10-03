import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { activeDriver, storageFor } from "../ops/storage";
import { buildInfo } from "./buildinfo";
import { validateConfig } from "./config";
import { jobHealth } from "./jobs";
import path from "node:path";
import { appEnv, checkLocalStorageMarker, databaseEnvironment } from "./environment";

/**
 * Liveness vs readiness (docs/OBSERVABILITY.md#health):
 *   /api/health  process is up — no I/O at all
 *   /api/ready   the REQUIRED dependencies work: database, migrations applied, critical configuration, document storage,
 *                no shared demo accounts in production, (optionally) the worker heartbeat.
 * Optional integrations (WhatsApp, Google, S3-for-integrations, NOVA) never make the app unready.
 */
export type CheckStatus = "ok" | "warn" | "fail";
export type Check = { name: string; status: CheckStatus; detail?: string; ms?: number };

export function liveness() {
  const b = buildInfo();
  return { status: "ok", time: new Date().toISOString(), version: b.version, commit: b.commit ? b.commit.slice(0, 12) : null, environment: b.environment, uptimeSeconds: Math.round(process.uptime()) };
}

const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms).unref?.())]);

async function timed(name: string, fn: () => Promise<Omit<Check, "name" | "ms">>): Promise<Check> {
  const t = Date.now();
  try {
    return { name, ...(await fn()), ms: Date.now() - t };
  } catch (e) {
    // dependency errors are summarized — no connection strings or stack traces
    const msg = String((e as Error)?.message ?? e);
    return { name, status: "fail", detail: /timeout/.test(msg) ? "timeout" : /ECONNREFUSED|reach database|connect/i.test(msg) ? "unreachable" : "error", ms: Date.now() - t };
  }
}

type Db = { $queryRaw: typeof prisma.$queryRaw };
export async function checkDatabase(db: Db = prisma): Promise<Check> {
  return timed("database", async () => {
    await withTimeout(db.$queryRaw`SELECT 1`, 3000);
    return { status: "ok" };
  });
}

export async function checkMigrations(): Promise<Check> {
  return timed("migrations", async () => {
    const rows = await withTimeout(prisma.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`, 3000);
    const applied = new Set(rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name));
    const failed = rows.filter((r) => !r.finished_at && !r.rolled_back_at).map((r) => r.migration_name);
    const expected = buildInfo().migrations;
    const pending = expected.filter((m) => !applied.has(m));
    if (failed.length) return { status: "fail", detail: `failed: ${failed.join(", ")}` };
    if (pending.length) return { status: "fail", detail: `pending: ${pending.length}` };
    return { status: "ok", detail: `${applied.size} applied` };
  });
}

export function checkConfig(): Check {
  const r = validateConfig();
  const crit = r.issues.filter((i) => i.level === "critical");
  const warns = r.issues.filter((i) => i.level === "warning");
  return { name: "configuration", status: crit.length ? "fail" : warns.length ? "warn" : "ok", detail: [...crit, ...warns].map((i) => `${i.key}:${i.code}`).join(", ") || undefined };
}

/** Write / read / delete a throw-away object (local) or HEAD the bucket (S3, unless STORAGE_HEALTH_WRITE=1). */
export async function checkStorage(): Promise<Check> {
  return timed("document_storage", async () => {
    const driver = activeDriver();
    const a = storageFor(driver);
    if (driver === "s3" && process.env.STORAGE_HEALTH_WRITE !== "1") {
      const status = await withTimeout((a as unknown as { ping(): Promise<number> }).ping(), 4000);
      return status >= 200 && status < 300 ? { status: "ok", detail: "s3 bucket reachable (metadata check)" } : { status: "fail", detail: `s3 HTTP ${status}` };
    }
    const key = `healthcheck/${new Date().getUTCFullYear()}/${randomUUID()}`;
    const probe = Buffer.from(`health ${Date.now()}`);
    await withTimeout(a.put(key, probe), 4000);
    try {
      const back = await withTimeout(a.get(key), 4000);
      if (!back.equals(probe)) return { status: "fail", detail: "read-back mismatch" };
    } finally {
      await a.remove(key);
    }
    return { status: "ok", detail: `${driver} write/read/delete` };
  });
}

/** Production must not contain the shared demo accounts (@dms.test, demo password). */
export async function checkDemoAccounts(): Promise<Check> {
  return timed("demo_accounts", async () => {
    const n = await prisma.user.count({ where: { email: { endsWith: "@dms.test" }, status: "ACTIVE", deletedAt: null } });
    if (!n) return { status: "ok" };
    const prod = appEnv() === "production" && process.env.OS_LOCAL_PROD_TEST !== "1";
    return { status: prod ? "fail" : "warn", detail: `${n} active demo accounts` };
  });
}

/** Phase 10: the database and the document storage must belong to THIS deployment environment. */
export async function checkEnvironment(): Promise<Check> {
  return timed("environment", async () => {
    const env = appEnv();
    const dbEnv = await databaseEnvironment();
    const strict = env === "production" || env === "staging";
    if (!dbEnv) return { status: strict ? "fail" : "warn", detail: `database has no environment marker (app: ${env}) — run os:bootstrap` };
    if (dbEnv !== env) return { status: "fail", detail: `ENVIRONMENT_MISMATCH: app=${env} database=${dbEnv}` };
    if (activeDriver() === "local") {
      const root = process.env.DOCUMENT_STORAGE_DIR ?? path.join(process.cwd(), ".local", "storage", "documents");
      const m = checkLocalStorageMarker(root, env);
      if (!m.ok) return { status: "fail", detail: `ENVIRONMENT_MISMATCH: app=${env} storage=${m.marker}` };
    }
    return { status: "ok", detail: env };
  });
}

export async function checkWorker(): Promise<Check> {
  return timed("worker", async () => {
    const required = process.env.REQUIRE_WORKER === "1";
    const loop = (await jobHealth()).find((j) => j.name === "worker:loop");
    const fresh = loop?.heartbeatAt && Date.now() - loop.heartbeatAt.getTime() < 5 * 60_000;
    if (fresh) return { status: "ok", detail: "heartbeat fresh" };
    return { status: required ? "fail" : "warn", detail: loop?.heartbeatAt ? "heartbeat stale" : "no worker heartbeat" };
  });
}

let cache: { at: number; value: Awaited<ReturnType<typeof computeReadiness>> } | null = null;

async function computeReadiness(dbClient?: Db) {
  const db = await checkDatabase(dbClient);
  // without a database nothing else can be verified
  const rest = db.status === "ok" ? await Promise.all([checkMigrations(), checkEnvironment(), checkStorage(), checkDemoAccounts(), checkWorker()]) : [];
  const checks = [db, checkConfig(), ...rest];
  const ready = checks.every((c) => c.status !== "fail");
  return { ready, status: ready ? "ready" : "not_ready", time: new Date().toISOString(), version: buildInfo().version, checks };
}

/** Cached for 10 s so a probe storm never becomes database load. */
export async function readiness(opts: { fresh?: boolean; db?: Db } = {}) {
  if (!opts.fresh && !opts.db && cache && Date.now() - cache.at < 10_000) return cache.value;
  const value = await computeReadiness(opts.db);
  if (opts.db) return value;
  cache = { at: Date.now(), value };
  return value;
}
export const resetReadinessCache = () => (cache = null);
