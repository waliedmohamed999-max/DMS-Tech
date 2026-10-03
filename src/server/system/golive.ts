import { configuredScanner as scannerOf, scanPolicy } from "../ops/scanner";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { prisma } from "../db";
import { verifyPassword } from "../auth/password";
import { DEMO_EMAIL_DOMAIN, DEMO_PASSWORD } from "../bootstrap";
import { activeDriver } from "../ops/storage";
import { complianceStatus } from "../finance/zatca";
import { zatcaReadiness } from "../zatca/service";
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
  // Phase 11: offboarding is automatic (status change / HR sweep) — only the EXCEPTIONS are flagged:
  //   overdue  = effective > 36 h ago (sweep lag allowed) but access not revoked (worker down, LAST_SUPER_ADMIN guard)
  //   reEnabled = revoked by offboarding, then re-activated by an admin (explicit decision — review it)
  const lag = new Date(Date.now() - 36 * 3600_000);
  const [overdue, reEnabled, scheduled] = await Promise.all([
    prisma.employee.count({ where: { accessRevokedAt: null, userId: { not: null }, OR: [{ status: "TERMINATED", terminationDate: { lt: lag } }, { status: "ARCHIVED" }] } }),
    prisma.employee.count({ where: { accessRevokedAt: { not: null }, user: { status: "ACTIVE", deletedAt: null } } }),
    prisma.employee.count({ where: { accessRevokedAt: null, status: "TERMINATED", terminationDate: { gte: lag } } })
  ]);
  add(
    "offboarding_accounts",
    overdue || reEnabled ? "WARN" : "PASS",
    [overdue ? `${overdue} leaver(s) past the effective date still have access (check the worker / LAST_SUPER_ADMIN)` : "", reEnabled ? `${reEnabled} offboarded account(s) were re-enabled by an admin` : "", `${scheduled} termination(s) scheduled`].filter(Boolean).join("; ")
  );
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
  // Phase 11: ZATCA lifecycle readiness — code is in place; what is missing is listed with its kind (credential,
  // infrastructure, business decision, data, code)
  const z = complianceStatus(env);
  const zr = await zatcaReadiness(env);
  add("zatca", zr.status === "NOT_REQUIRED" || zr.status === "READY" ? "PASS" : "BLOCK", `${zr.status}${z.decisionRef ? ` (${z.decisionRef})` : ""}${zr.missing.length ? ` — missing: ${zr.missing.map((m) => `[${m.kind}] ${m.item}`).join("; ")}` : ""}`);
  // Phase 11: a configured REAL scanner must answer its health probe; the test adapter never counts; without a scanner a
  // documented decision (NOT_SCANNED_ACCEPTED) is a WARN, no decision a BLOCK
  const av = env.ANTIVIRUS_DECISION?.trim();
  let scanner: Awaited<ReturnType<typeof scannerOf>> = null;
  try {
    scanner = scannerOf(env);
  } catch (e) {
    add("antivirus", "BLOCK", String((e as Error).message));
  }
  if (scanner && !scanner.isAntivirus) add("antivirus", "BLOCK", `${scanner.name} is a test adapter`);
  else if (scanner) {
    const h = await scanner.health(AbortSignal.timeout(5000));
    const policy = scanPolicy(env);
    add("antivirus", !h.ok ? "BLOCK" : policy === "required" ? "PASS" : "WARN", `${scanner.name}: ${h.ok ? "reachable" : "UNREACHABLE"} (${h.detail}); DOCUMENT_SCAN_POLICY=${policy}${policy === "required" ? "" : " — downloads are not held until CLEAN"}`);
  } else if (!out.some((c) => c.key === "antivirus"))
    add("antivirus", av === "NOT_SCANNED_ACCEPTED" ? "WARN" : "BLOCK", av === "NOT_SCANNED_ACCEPTED" ? "no scanner — risk accepted (ANTIVIRUS_DECISION=NOT_SCANNED_ACCEPTED)" : "no scanner and no decision (DOCUMENT_SCANNER=clamd|http, or ANTIVIRUS_DECISION=NOT_SCANNED_ACCEPTED)");
  add("retention_mode", env.RETENTION_DRY_RUN === "0" || env.RETENTION_DRY_RUN === "1" ? "PASS" : "WARN", env.RETENTION_DRY_RUN === undefined ? "RETENTION_DRY_RUN not set explicitly (worker purges by default)" : `RETENTION_DRY_RUN=${env.RETENTION_DRY_RUN}`);
  const rep = errorReporterStatus();
  add("error_tracking", rep.configured ? "PASS" : "WARN", rep.configured ? rep.name : "no external error tracking (logs only)");
  // Phase 11: public pages get a per-page hash CSP from a build-time manifest — it must exist for THIS build
  const nextDir = path.join(process.cwd(), ".next");
  const buildId = existsSync(path.join(nextDir, "BUILD_ID")) ? readFileSync(path.join(nextDir, "BUILD_ID"), "utf8").trim() : null;
  let manifestBuild: string | null = null;
  try {
    manifestBuild = (JSON.parse(readFileSync(path.join(nextDir, "csp-public.json"), "utf8")) as { buildId: string }).buildId;
  } catch {
    manifestBuild = null;
  }
  if (!buildId) add("csp_public_site", "WARN", "no build in this directory — run go-live:check from the deployed release");
  else add("csp_public_site", manifestBuild === buildId ? "PASS" : "BLOCK", manifestBuild === buildId ? "public pages: sha256-hash CSP (static) / nonce (dynamic), no 'unsafe-inline' scripts; /app nonce + strict-dynamic" : "csp-public.json missing or from another build — public pages would lose their scripts (npm run build runs postbuild)");

  // 8. HTTPS / HSTS / HTTP→HTTPS (live, read-only GETs — probeTransport)
  if (opts.probeUrl !== false) for (const r of await probeTransport(env)) add(r.key, r.level, r.detail);
  else if (!env.NEXT_PUBLIC_SITE_URL?.startsWith("https://")) add("https_health", "BLOCK", "NEXT_PUBLIC_SITE_URL is not https");
  return out;
}

/**
 * Phase 11 (P11-E) transport checks. The plain-HTTP origin is HTTP_BASE_URL when set (staging edges on custom ports);
 * otherwise it is derived from NEXT_PUBLIC_SITE_URL only when that uses the default port (production: http://host → :80).
 * PASS needs a PERMANENT redirect (301 / 308) to https:// on the same host and port, with path and query preserved,
 * and an HTTPS target that does not bounce back to http (no downgrade). Nothing passes by being skipped:
 *   http port closed → WARN (acceptable only if the edge listens on 443 alone) · explicit HTTP_BASE_URL closed → BLOCK.
 */
export async function probeTransport(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): Promise<GateResult[]> {
  const out: GateResult[] = [];
  const add = (key: string, level: Level, detail: string) => out.push({ key, level, detail });
  const site = env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (!site?.startsWith("https://")) return [{ key: "https_health", level: "BLOCK", detail: "NEXT_PUBLIC_SITE_URL is not https" }];
  const siteUrl = new URL(site);
  const get = (url: string) => fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
  try {
    const r = await get(`${site}/api/health`);
    add("https_health", r.status === 200 ? "PASS" : "BLOCK", `GET ${site}/api/health → ${r.status}`);
    const hsts = (await get(site)).headers.get("strict-transport-security") ?? "";
    const maxAge = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0);
    add("hsts", maxAge >= 15_552_000 ? "PASS" : hsts ? "WARN" : "BLOCK", hsts ? `${hsts}${maxAge < 15_552_000 ? " (max-age below 180 days)" : ""}` : "missing");
  } catch (e) {
    add("https_health", "BLOCK", `unreachable: ${String((e as Error).message).slice(0, 80)}`);
    return out;
  }
  const explicit = env.HTTP_BASE_URL?.replace(/\/+$/, "");
  if (!explicit && siteUrl.port) {
    add("http_redirect", "WARN", `NEXT_PUBLIC_SITE_URL uses port ${siteUrl.port} — set HTTP_BASE_URL to the plain-HTTP origin to verify the redirect`);
    return out;
  }
  const httpBase = explicit ?? `http://${siteUrl.hostname}`;
  if (!httpBase.startsWith("http://")) {
    add("http_redirect", "BLOCK", "HTTP_BASE_URL must be an http:// origin");
    return out;
  }
  const probePath = "/app/login?probe=redirect-check";
  const res = await get(`${httpBase}${probePath}`).catch(() => null);
  if (!res) {
    add("http_redirect", explicit ? "BLOCK" : "WARN", explicit ? `${httpBase} unreachable (HTTP_BASE_URL is set, so the redirect is expected)` : "http port closed (acceptable only if the edge listens on 443 alone)");
    return out;
  }
  const location = res.headers.get("location") ?? "";
  let target: URL | null = null;
  try {
    target = new URL(location, httpBase);
  } catch {
    target = null;
  }
  const problems: string[] = [];
  if (![301, 308].includes(res.status)) problems.push(`status ${res.status} (expected a permanent 301 / 308)`);
  if (!target || target.protocol !== "https:") problems.push(`location "${location.slice(0, 80)}" is not https`);
  else {
    if (target.host !== siteUrl.host) problems.push(`redirects to ${target.host}, expected ${siteUrl.host}`);
    if (`${target.pathname}${target.search}` !== probePath) problems.push("path / query not preserved");
  }
  if (!problems.length && target) {
    const next = await get(target.toString()).catch(() => null);
    const back = next?.headers.get("location") ?? "";
    if (next && back && back.startsWith("http://")) problems.push(`downgrade: the https target redirects back to ${back.slice(0, 60)}`);
  }
  add("http_redirect", problems.length ? (res.status >= 300 && res.status < 400 && target?.protocol === "https:" ? "WARN" : "BLOCK") : "PASS", problems.length ? problems.join("; ") : `${httpBase}${probePath} → ${res.status} ${location}`);
  return out;
}

export const verdict = (r: GateResult[]): Level => (r.some((x) => x.level === "BLOCK") ? "BLOCK" : r.some((x) => x.level === "WARN") ? "WARN" : "PASS");
