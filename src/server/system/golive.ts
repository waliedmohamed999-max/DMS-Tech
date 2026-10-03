import path from "node:path";
import { prisma } from "../db";
import { verifyPassword } from "../auth/password";
import { DEMO_EMAIL_DOMAIN, DEMO_PASSWORD } from "../bootstrap";
import { activeDriver } from "../ops/storage";
import { complianceStatus } from "../finance/zatca";
import { fieldCryptoAvailable } from "../security/fieldcrypto";
import { errorReporterStatus } from "../obs/errors";
import { validateConfig } from "./config";
import { appEnv, databaseEnvironment, type AppEnv } from "./environment";
import { checkMigrations, checkStorage, checkWorker } from "./health";

/**
 * Go-live verification (Phase 10 — docs/GO-LIVE.md). READ-ONLY: no writes except the storage probe object, which is
 * written, read back and deleted (same as readiness). Every check returns PASS / WARN / BLOCK; one BLOCK fails go-live.
 */
export type Level = "PASS" | "WARN" | "BLOCK";
export type GateResult = { key: string; level: Level; detail: string };

// --- demo / QA artefacts -------------------------------------------------------------------------------------

const FIXTURE_NAME = /^(qa|web qa|test|demo|dummy|sample)\b/i;
const FAKE_DOMAIN = /@[^@]*\.(test|example|invalid|localhost)$|@example\.(com|org|net)$/i;

export async function demoArtifacts(opts: { checkPasswords?: boolean } = {}) {
  const demoUsers = await prisma.user.findMany({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN }, deletedAt: null }, select: { id: true } });
  const demoIds = demoUsers.map((u) => u.id);
  let demoPasswordUsers = 0;
  if (opts.checkPasswords !== false) {
    // the shared demo password must not open ANY account (Argon2 verify, ~1000 users max)
    const users = await prisma.user.findMany({ where: { status: "ACTIVE", deletedAt: null }, select: { passwordHash: true }, take: 1000 });
    for (const u of users) if (await verifyPassword(u.passwordHash, DEMO_PASSWORD)) demoPasswordUsers++;
  }
  const [leads, clients, contacts] = await Promise.all([
    prisma.lead.findMany({ select: { name: true, email: true } }),
    prisma.client.findMany({ select: { displayName: true, email: true } }),
    prisma.contact.findMany({ select: { firstName: true, email: true } })
  ]);
  const fixtures = leads.filter((l) => FIXTURE_NAME.test(l.name)).length + clients.filter((c) => FIXTURE_NAME.test(c.displayName)).length;
  const fakeDomains = [...leads, ...clients, ...contacts].filter((x) => x.email && FAKE_DOMAIN.test(x.email)).length;
  const byDemo = demoIds.length
    ? await Promise.all([
        prisma.client.count({ where: { createdById: { in: demoIds } } }),
        prisma.invoice.count({ where: { createdById: { in: demoIds } } }),
        prisma.payment.count({ where: { createdById: { in: demoIds } } }),
        prisma.employee.count({ where: { createdById: { in: demoIds } } })
      ]).then((a) => a.reduce((x, y) => x + y, 0))
    : 0;
  const org = await prisma.organization.findFirst({ select: { invoicePaymentInstructions: true } });
  const placeholderBank = /SA00 ?0000|demo bank/i.test(org?.invoicePaymentInstructions ?? "") ? 1 : 0;
  const demoBankAccounts = await prisma.employeeBankAccount.count({ where: { bankName: { contains: "Demo", mode: "insensitive" } } });
  const findings = { demoUsers: demoIds.length, demoPasswordUsers, qaFixtures: fixtures, fakeEmailDomains: fakeDomains, recordsByDemoUsers: byDemo, placeholderPaymentInstructions: placeholderBank, demoBankAccounts };
  return { clean: Object.values(findings).every((n) => n === 0), findings };
}

// --- company data -------------------------------------------------------------------------------------------

export async function companyReadiness() {
  const org = await prisma.organization.findFirst({ select: { name: true, nameAr: true, legalName: true, vatNumber: true, crNumber: true, email: true, phone: true, address: true, city: true, invoicePaymentInstructions: true } });
  const missing: string[] = [];
  const warn: string[] = [];
  if (!org) return { missing: ["organization"], warn };
  for (const k of ["legalName", "nameAr", "vatNumber", "crNumber", "address", "invoicePaymentInstructions"] as const) if (!org[k]?.trim()) missing.push(k);
  for (const k of ["email", "phone", "city"] as const) if (!org[k]?.trim()) warn.push(k);
  if (org.vatNumber && !/^3\d{13}3$/.test(org.vatNumber.trim())) missing.push("vatNumber(format: 15 digits, starts and ends with 3)");
  if (org.invoicePaymentInstructions && /SA00 ?0000/i.test(org.invoicePaymentInstructions)) missing.push("invoicePaymentInstructions(placeholder IBAN)");
  const services = await prisma.service.count({ where: { active: true } });
  if (!services) missing.push("active services (catalog / pricing)");
  return { missing, warn };
}

// --- the gate -------------------------------------------------------------------------------------------------

type Opts = { target?: AppEnv; probeUrl?: boolean; env?: Record<string, string | undefined> };

export async function goLiveChecks(opts: Opts = {}): Promise<GateResult[]> {
  const env = opts.env ?? process.env;
  const target = opts.target ?? "production";
  const out: GateResult[] = [];
  const add = (key: string, level: Level, detail: string) => out.push({ key, level, detail });

  // 1. configuration
  const cfg = validateConfig({ ...env, NODE_ENV: "production" });
  const crit = cfg.issues.filter((i) => i.level === "critical");
  add("configuration", crit.length ? "BLOCK" : cfg.issues.length ? "WARN" : "PASS", cfg.issues.map((i) => `${i.level}:${i.key}:${i.code}`).join(", ") || "ok");
  if (env.OS_LOCAL_PROD_TEST === "1") add("local_test_mode", "BLOCK", "OS_LOCAL_PROD_TEST=1 is a developer-machine mode");
  add("app_env", appEnv(env) === target ? "PASS" : "BLOCK", `APP_ENV=${appEnv(env)} (expected ${target})`);

  // 2. database: reachable, TLS, migrations, environment marker
  try {
    const ssl = await prisma.$queryRaw<{ ssl: boolean }[]>`SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`;
    add("database_tls", ssl[0]?.ssl ? "PASS" : "BLOCK", ssl[0]?.ssl ? "connection encrypted (TLS)" : "the application connects WITHOUT TLS");
  } catch (e) {
    add("database", "BLOCK", `unreachable: ${String((e as Error).message).slice(0, 80)}`);
    return out;
  }
  const mig = await checkMigrations();
  add("migrations", mig.status === "ok" ? "PASS" : "BLOCK", mig.detail ?? mig.status);
  const dbEnv = await databaseEnvironment();
  add("environment_marker", dbEnv === target ? "PASS" : "BLOCK", `database marker: ${dbEnv ?? "none"} (expected ${target})`);
  const atRest = env.DB_ENCRYPTION_AT_REST?.trim();
  add("db_encryption_at_rest", atRest ? "PASS" : "BLOCK", atRest ? `attested: ${atRest}` : "no evidence recorded (DB_ENCRYPTION_AT_REST=<provider + setting / ticket reference>)");

  // 3. demo data, administrators, company data
  const demo = await demoArtifacts();
  add("demo_data", demo.clean ? "PASS" : "BLOCK", Object.entries(demo.findings).filter(([, n]) => n).map(([k, n]) => `${k}=${n}`).join(", ") || "none");
  const admins = await prisma.user.findMany({ where: { status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: "super_admin" } } } }, select: { mustChangePassword: true } });
  add("super_admins", admins.length >= 2 ? "PASS" : admins.length === 1 ? "WARN" : "BLOCK", `${admins.length} active (recommend ≥ 2 named admins)`);
  if (admins.some((a) => a.mustChangePassword)) add("admin_first_login", "WARN", "a provisioned admin has not replaced the temporary password yet");
  // offboarding is two explicit steps (HR terminates, admin disables the account) — flag any account left active
  const leavers = await prisma.employee.count({ where: { status: { in: ["TERMINATED", "ARCHIVED"] }, user: { status: "ACTIVE", deletedAt: null } } });
  add("offboarding_accounts", leavers ? "WARN" : "PASS", leavers ? `${leavers} terminated / archived employee(s) still have an ACTIVE system account — disable in Admin → Users` : "no active accounts for terminated employees");
  const company = await companyReadiness();
  add("company_data", company.missing.length ? "BLOCK" : company.warn.length ? "WARN" : "PASS", company.missing.length ? `missing: ${company.missing.join(", ")}` : company.warn.length ? `recommended: ${company.warn.join(", ")}` : "complete");

  // 4. sensitive data
  const plaintext = await prisma.employeeBankAccount.count({ where: { iban: { not: null } } });
  add("iban_encryption", plaintext ? "BLOCK" : fieldCryptoAvailable(env) ? "PASS" : "BLOCK", plaintext ? `${plaintext} plaintext IBAN(s) — run hr:encrypt-iban` : fieldCryptoAvailable(env) ? "all IBANs encrypted" : "HR_FIELD_KEY missing");
  const secrets = await prisma.integrationSecret.count();
  if (secrets && !env.INTEGRATION_MASTER_KEY) add("integration_secrets", "BLOCK", `${secrets} encrypted secret(s) but INTEGRATION_MASTER_KEY is not set`);

  // 5. storage
  const driver = activeDriver();
  const dir = env.DOCUMENT_STORAGE_DIR;
  const durable = driver === "s3" || (dir && path.isAbsolute(dir) && !path.resolve(dir).startsWith(process.cwd()));
  add("document_storage", durable ? (driver === "s3" ? "PASS" : "WARN") : "BLOCK", driver === "s3" ? "S3-compatible" : durable ? `local volume ${dir} — volume snapshots / storage:backup required` : "not durable (default path inside the application directory)");
  const st = await checkStorage();
  add("storage_health", st.status === "ok" ? "PASS" : "BLOCK", st.detail ?? st.status);
  add("storage_backup_policy", env.STORAGE_BACKUP_POLICY ? "PASS" : "BLOCK", env.STORAGE_BACKUP_POLICY ? env.STORAGE_BACKUP_POLICY : "no storage backup / versioning policy recorded (STORAGE_BACKUP_POLICY)");

  // 6. operations: worker, backups
  const w = await checkWorker();
  add("worker", w.status === "ok" ? "PASS" : "BLOCK", w.detail ?? w.status);
  if (env.REQUIRE_WORKER !== "1") add("require_worker", "WARN", "set REQUIRE_WORKER=1 so readiness fails when the worker stops");
  const maxAgeH = Number(env.BACKUP_MAX_AGE_HOURS ?? 26);
  const verified = await prisma.backupRecord.findFirst({ where: { kind: "database", status: "VERIFIED" }, orderBy: { startedAt: "desc" } });
  const engine = (verified?.metadata as { engine?: string } | null)?.engine;
  const fresh = verified && Date.now() - verified.startedAt.getTime() < maxAgeH * 3600_000;
  add("database_backup", verified && engine === "pg_dump" && fresh ? "PASS" : "BLOCK", verified ? `last VERIFIED ${verified.startedAt.toISOString()} engine=${engine}${engine !== "pg_dump" ? " (must be pg_dump)" : ""}${fresh ? "" : ` (older than ${maxAgeH} h)`}` : "no verified backup");

  // 7. compliance / policy decisions
  const z = complianceStatus(env);
  add("zatca", z.status === "NOT_REQUIRED" || z.status === "READY" ? "PASS" : "BLOCK", `${z.status} — ${z.reason}${z.decisionRef ? ` (${z.decisionRef})` : ""}`);
  const av = env.ANTIVIRUS_DECISION?.trim();
  add("antivirus", av === "SCANNER_INTEGRATED" ? "PASS" : av === "NOT_SCANNED_ACCEPTED" ? "WARN" : "BLOCK", av ? av : "no decision recorded (ANTIVIRUS_DECISION=NOT_SCANNED_ACCEPTED | SCANNER_INTEGRATED)");
  add("retention_mode", env.RETENTION_DRY_RUN === "0" || env.RETENTION_DRY_RUN === "1" ? "PASS" : "WARN", env.RETENTION_DRY_RUN === undefined ? "RETENTION_DRY_RUN not set explicitly (worker purges by default)" : `RETENTION_DRY_RUN=${env.RETENTION_DRY_RUN}`);
  const rep = errorReporterStatus();
  add("error_tracking", rep.configured ? "PASS" : "WARN", rep.configured ? rep.name : "no external error tracking (logs only)");
  add("csp_public_site", "WARN", "public website pages keep 'unsafe-inline' scripts (static pages cannot carry a per-request nonce) — /app uses a nonce");

  // 8. HTTPS (live probe of the configured origin — read-only GETs)
  const site = env.NEXT_PUBLIC_SITE_URL;
  if (opts.probeUrl !== false && site?.startsWith("https://")) {
    try {
      const r = await fetch(`${site.replace(/\/+$/, "")}/api/health`, { redirect: "manual" });
      add("https_health", r.status === 200 ? "PASS" : "BLOCK", `GET ${site}/api/health → ${r.status}`);
      const hsts = (await fetch(site, { redirect: "manual" })).headers.get("strict-transport-security");
      add("hsts", hsts ? "PASS" : "BLOCK", hsts ?? "missing");
      const http = await fetch(site.replace(/^https:/, "http:"), { redirect: "manual" }).catch(() => null);
      add("http_redirect", http && [301, 302, 307, 308].includes(http.status) && (http.headers.get("location") ?? "").startsWith("https://") ? "PASS" : "WARN", http ? `http → ${http.status} ${http.headers.get("location") ?? ""}` : "http port closed (acceptable if the edge only listens on 443)");
    } catch (e) {
      add("https_health", "BLOCK", `unreachable: ${String((e as Error).message).slice(0, 80)}`);
    }
  } else add("https_health", "BLOCK", "NEXT_PUBLIC_SITE_URL is not https");
  return out;
}

export const verdict = (r: GateResult[]): Level => (r.some((x) => x.level === "BLOCK") ? "BLOCK" : r.some((x) => x.level === "WARN") ? "WARN" : "PASS");
