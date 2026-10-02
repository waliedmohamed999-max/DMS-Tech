/**
 * Typed configuration validation (docs/GO-LIVE.md#configuration). Checks presence / shape only and NEVER returns values.
 *
 *  REQUIRED (production)   DATABASE_URL, NEXT_PUBLIC_SITE_URL (https), DOCUMENT_STORAGE (+ its settings)
 *  OPTIONAL                INTEGRATION_MASTER_KEY, NOVA_URL, LOG_LEVEL, ERROR_REPORTER, REQUIRE_SCAN_BEFORE_DOWNLOAD,
 *                          REQUIRE_WORKER, BACKUP_DIR, BACKUP_MAX_AGE_HOURS, RETENTION_* overrides
 *  DEVELOPMENT ONLY        ALLOW_DEMO_SEED, TEST_DATABASE_URL, OS_LOCAL_PROD_TEST — forbidden in production
 *
 * Sessions are random 256-bit tokens stored hashed in the database, so there is no SESSION_SECRET to configure.
 * OS_LOCAL_PROD_TEST=1 lets `next start` run on a developer machine (http://localhost, demo users) — it downgrades the
 * production-only criticals to warnings and is itself reported, so it can never pass silently.
 */
export type ConfigIssue = { key: string; level: "critical" | "warning"; code: string };
export type ConfigReport = { ok: boolean; production: boolean; localProdTest: boolean; issues: ConfigIssue[] };

type Env = Record<string, string | undefined>;

export function validateConfig(env: Env = process.env): ConfigReport {
  const production = env.NODE_ENV === "production";
  const localProdTest = production && env.OS_LOCAL_PROD_TEST === "1";
  const issues: ConfigIssue[] = [];
  const prodOnly = (key: string, code: string) => issues.push({ key, code, level: production && !localProdTest ? "critical" : "warning" });
  const critical = (key: string, code: string) => issues.push({ key, code, level: "critical" });
  const warn = (key: string, code: string) => issues.push({ key, code, level: "warning" });

  if (!env.DATABASE_URL) critical("DATABASE_URL", "MISSING");
  else if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) critical("DATABASE_URL", "NOT_POSTGRES");

  const site = env.NEXT_PUBLIC_SITE_URL;
  if (!site) prodOnly("NEXT_PUBLIC_SITE_URL", "MISSING");
  else if (!/^https:\/\//.test(site)) prodOnly("NEXT_PUBLIC_SITE_URL", "NOT_HTTPS");

  const storage = (env.DOCUMENT_STORAGE ?? "local").trim().toLowerCase();
  if (!["local", "s3"].includes(storage)) critical("DOCUMENT_STORAGE", "UNSUPPORTED_DRIVER");
  if (storage === "s3") for (const k of ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) if (!env[k]) critical(k, "MISSING");
  if (storage === "local" && production && !env.DOCUMENT_STORAGE_DIR) prodOnly("DOCUMENT_STORAGE_DIR", "DEFAULT_PATH_IN_PRODUCTION");

  const key = env.INTEGRATION_MASTER_KEY;
  if (key) {
    let ok = false;
    try {
      ok = Buffer.from(key, "base64").length === 32;
    } catch {
      ok = false;
    }
    if (!ok) critical("INTEGRATION_MASTER_KEY", "INVALID_LENGTH");
  } else warn("INTEGRATION_MASTER_KEY", "NOT_SET_SECRETS_ENV_ONLY");

  if (env.NOVA_URL && !/^https?:\/\//.test(env.NOVA_URL)) warn("NOVA_URL", "INVALID_URL");
  if (env.LOG_LEVEL && !["debug", "info", "warn", "error", "silent"].includes(env.LOG_LEVEL)) warn("LOG_LEVEL", "INVALID");
  if (env.REQUIRE_SCAN_BEFORE_DOWNLOAD === "true" && !env.DOCUMENT_SCANNER) warn("REQUIRE_SCAN_BEFORE_DOWNLOAD", "NO_SCANNER_ALL_DOWNLOADS_BLOCKED");
  if (env.SENTRY_DSN && !env.ERROR_REPORTER) warn("SENTRY_DSN", "NO_ADAPTER_INSTALLED");

  if (production) {
    if (env.ALLOW_DEMO_SEED) prodOnly("ALLOW_DEMO_SEED", "FORBIDDEN_IN_PRODUCTION");
    if (env.TEST_DATABASE_URL && env.TEST_DATABASE_URL === env.DATABASE_URL) critical("TEST_DATABASE_URL", "EQUALS_DATABASE_URL");
    if (localProdTest) warn("OS_LOCAL_PROD_TEST", "LOCAL_PRODUCTION_TEST_MODE");
  }
  return { ok: !issues.some((i) => i.level === "critical"), production, localProdTest, issues };
}

/** Fail fast at server start (instrumentation.ts). Logs keys + codes only. */
export function assertStartupConfig(env: Env = process.env) {
  const r = validateConfig(env);
  for (const i of r.issues) console[i.level === "critical" ? "error" : "warn"](JSON.stringify({ ts: new Date().toISOString(), level: i.level === "critical" ? "error" : "warn", msg: "config_issue", key: i.key, code: i.code }));
  if (!r.ok && r.production) throw new Error(`Startup refused: invalid production configuration (${r.issues.filter((i) => i.level === "critical").map((i) => `${i.key}:${i.code}`).join(", ")})`);
  return r;
}

/** Node runtime only (instrumentation): log and exit(1) on a critical production configuration error. */
export function refuseInvalidStartup() {
  try {
    assertStartupConfig();
  } catch (e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "startup_refused", error: (e as Error).message }));
    process.exit(1);
  }
}
