/**
 * Release-candidate verification (Phase 11 — docs/GO-LIVE.md#release-verify). Read-only / non-destructive.
 *
 *   npm run release:verify                      # everything (lint, typecheck, tests, build, DB + environment checks)
 *   npm run release:verify -- --no-tests --no-build   # faster; skipped steps are WARN, never PASS
 *   npm run release:verify -- --out path.json   # machine-readable result (default .local/release-verify.json)
 *   npm run release:verify -- --strict          # exit 1 on ANY blocker (default: only on BLOCKED_CODE)
 *
 * Status per check:
 *   PASS · WARN · BLOCKED_CODE (fix in this repository) · BLOCKED_EXTERNAL (account / credential / infrastructure /
 *   business decision outside the code) · NOT_APPLICABLE
 * External dependencies that are not available are reported as BLOCKED_EXTERNAL or WARN — never as PASS.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type Status = "PASS" | "WARN" | "BLOCKED_CODE" | "BLOCKED_EXTERNAL" | "NOT_APPLICABLE";
type Check = { key: string; group: string; status: Status; detail: string; ms?: number };
const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(".local", "release-verify.json");
const checks: Check[] = [];
const add = (c: Check) => {
  checks.push(c);
  console.log(`${c.status.padEnd(16)} ${c.group.padEnd(12)} ${c.key.padEnd(26)} ${c.detail.slice(0, 150)}`);
};

function run(cmd: string, timeoutMs = 30 * 60_000) {
  const t0 = Date.now();
  const r = spawnSync(cmd, { shell: true, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env: process.env });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  return { ok: r.status === 0, code: r.status, out, ms: Date.now() - t0 };
}
const tail = (s: string, n = 3) => s.trim().split("\n").filter((l) => l.trim()).slice(-n).join(" | ");

async function main() {
  const startedAt = new Date().toISOString();
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  const sha = run("git rev-parse HEAD").out.trim().split("\n")[0];
  const dirty = run("git status --porcelain").out.trim();

  // --- code -------------------------------------------------------------------------------------------------------
  add({ key: "git_state", group: "code", status: dirty ? "WARN" : "PASS", detail: dirty ? `uncommitted changes (${dirty.split("\n").length} paths) — a release is built from a commit` : `clean at ${sha.slice(0, 12)}` });
  const tsc = run("npx tsc --noEmit");
  add({ key: "typecheck", group: "code", status: tsc.ok ? "PASS" : "BLOCKED_CODE", detail: tsc.ok ? "tsc --noEmit clean" : tail(tsc.out, 5), ms: tsc.ms });
  const lint = run("npx eslint .");
  add({ key: "lint", group: "code", status: lint.ok ? "PASS" : "BLOCKED_CODE", detail: lint.ok ? "eslint clean" : tail(lint.out, 5), ms: lint.ms });
  // tests need the isolated test database; a deployment environment (staging / production) has none — there the code
  // checks are reported as "not run here" (WARN), never as PASS
  const testDb = Boolean(process.env.TEST_DATABASE_URL);
  if (!testDb) add({ key: "security_policy_tests", group: "code", status: "WARN", detail: "not run here (no TEST_DATABASE_URL) — run release:verify in the build / CI context" });
  else {
    const sec = run("npx vitest run tests/csp.test.ts tests/transport.test.ts tests/error-tracking.test.ts tests/scanner.test.ts tests/offboarding.test.ts");
    add({ key: "security_policy_tests", group: "code", status: sec.ok ? "PASS" : "BLOCKED_CODE", detail: tail(sec.out.replace(/\x1b\[[0-9;]*m/g, ""), 3), ms: sec.ms });
  }
  if (has("--no-tests") || !testDb) add({ key: "tests", group: "code", status: "WARN", detail: testDb ? "skipped (--no-tests) — not verified" : "not run here (no TEST_DATABASE_URL)" });
  else {
    const t = run("npx vitest run", 60 * 60_000);
    const clean = t.out.replace(/\x1b\[[0-9;]*m/g, "");
    const summary = /Tests\s+([^\n]+)/.exec(clean)?.[1]?.trim() ?? tail(clean);
    add({ key: "tests", group: "code", status: t.ok ? "PASS" : "BLOCKED_CODE", detail: summary, ms: t.ms });
  }
  if (has("--no-build")) add({ key: "build", group: "code", status: "WARN", detail: "skipped (--no-build) — not verified" });
  else {
    const b = run("npm run build", 30 * 60_000);
    add({ key: "build", group: "code", status: b.ok ? "PASS" : "BLOCKED_CODE", detail: b.ok ? `BUILD_ID ${readFileSync(".next/BUILD_ID", "utf8").trim()}` : tail(b.out, 5), ms: b.ms });
  }
  // the public CSP depends on the build-time hash manifest of the SAME build
  if (existsSync(".next/BUILD_ID")) {
    const id = readFileSync(".next/BUILD_ID", "utf8").trim();
    const m = existsSync(".next/csp-public.json") ? (JSON.parse(readFileSync(".next/csp-public.json", "utf8")) as { buildId: string; routes: object }) : null;
    add({ key: "csp_manifest", group: "security", status: m && m.buildId === id ? "PASS" : "BLOCKED_CODE", detail: m ? (m.buildId === id ? `${Object.keys(m.routes).length} prerendered pages hashed for ${id}` : `stale manifest (${m.buildId} ≠ ${id}) — run npm run build`) : "missing .next/csp-public.json — build with npm run build (postbuild)" });
  } else add({ key: "csp_manifest", group: "security", status: "NOT_APPLICABLE", detail: "no build present" });

  // --- database / environment ---------------------------------------------------------------------------------------
  if (!process.env.DATABASE_URL) {
    add({ key: "database", group: "environment", status: "NOT_APPLICABLE", detail: "DATABASE_URL not set — environment checks skipped" });
  } else {
    const st = run("npx prisma migrate status");
    add({ key: "migration_status", group: "database", status: st.ok ? "PASS" : /not yet been applied|following migration/i.test(st.out) ? "WARN" : "BLOCKED_EXTERNAL", detail: tail(st.out, 2) });
    const drift = run("npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code");
    add({ key: "schema_drift", group: "database", status: drift.code === 0 ? "PASS" : drift.code === 2 ? "BLOCKED_CODE" : "WARN", detail: drift.code === 0 ? "database matches prisma/schema.prisma" : drift.code === 2 ? "schema differs from the migrated database" : tail(drift.out, 2) });
    const { goLiveChecks } = await import("../src/server/system/golive");
    const { zatcaReadiness } = await import("../src/server/zatca/service");
    const { configuredScanner, scanPolicy } = await import("../src/server/ops/scanner");
    const { errorReporterStatus } = await import("../src/server/obs/errors");
    const { configureObservability } = await import("../src/server/obs/reporters");
    const { prisma } = await import("../src/server/db");
    try {
      const target = (process.env.APP_ENV ?? "production") as "production";
      const gl = await goLiveChecks({ target, probeUrl: !has("--no-probe") });
      // every go-live check is about the deployment environment → a BLOCK there is external to the code, except
      // where the code itself is the reason (ZATCA "CODE" items)
      for (const c of gl) add({ key: c.key, group: "go-live", status: c.level === "PASS" ? "PASS" : c.level === "WARN" ? "WARN" : "BLOCKED_EXTERNAL", detail: c.detail });
      const z = await zatcaReadiness();
      const codeItems = z.missing.filter((m) => m.kind === "CODE");
      add({ key: "zatca_status", group: "compliance", status: z.status === "READY" || z.status === "NOT_REQUIRED" ? "PASS" : codeItems.length ? "BLOCKED_CODE" : "BLOCKED_EXTERNAL", detail: `${z.status}${z.missing.length ? ` — ${z.missing.map((m) => `[${m.kind}] ${m.item}`).join("; ")}` : ""}` });
      let scannerDetail = "NOT_CONFIGURED";
      let scannerStatus: Status = "BLOCKED_EXTERNAL";
      try {
        const s = configuredScanner();
        if (s) {
          const h = await s.health(AbortSignal.timeout(5000));
          scannerDetail = `${s.name}: ${h.ok ? "reachable" : "UNREACHABLE"}; policy=${scanPolicy()}`;
          scannerStatus = !s.isAntivirus ? "BLOCKED_EXTERNAL" : h.ok ? (scanPolicy() === "required" ? "PASS" : "WARN") : "BLOCKED_EXTERNAL";
        } else if (process.env.ANTIVIRUS_DECISION === "NOT_SCANNED_ACCEPTED") {
          scannerStatus = "WARN";
          scannerDetail = "no scanner — risk accepted (ANTIVIRUS_DECISION=NOT_SCANNED_ACCEPTED)";
        }
      } catch (e) {
        scannerDetail = String((e as Error).message);
        scannerStatus = "BLOCKED_EXTERNAL";
      }
      add({ key: "malware_scanner", group: "compliance", status: scannerStatus, detail: scannerDetail });
      configureObservability();
      const er = errorReporterStatus();
      add({ key: "error_tracking", group: "monitoring", status: er.configured ? "WARN" : "BLOCKED_EXTERNAL", detail: er.configured ? `${er.name} configured — NOT verified against the real service by this check (send a test event and confirm it arrives)` : "no SENTRY_DSN / ERROR_REPORT_WEBHOOK_URL (adapters ready; needs an account)" });
      add({ key: "log_shipping", group: "monitoring", status: "WARN", detail: process.env.LOG_DIR ? `JSONL files in ${process.env.LOG_DIR} — shipping / retention is platform work` : "stdout only — the platform must collect it" });
    } finally {
      await prisma.$disconnect();
    }
  }

  const counts = checks.reduce<Record<string, number>>((a, c) => ((a[c.status] = (a[c.status] ?? 0) + 1), a), {});
  const result = { tool: "release:verify", version: pkg.version, commit: sha, dirty: Boolean(dirty), startedAt, finishedAt: new Date().toISOString(), counts, checks };
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`\nRELEASE VERIFY ${pkg.version} @ ${sha.slice(0, 12)}: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ")}  → ${outFile}`);
  const codeBlocked = checks.some((c) => c.status === "BLOCKED_CODE");
  const anyBlocked = codeBlocked || checks.some((c) => c.status === "BLOCKED_EXTERNAL");
  if (codeBlocked || (has("--strict") && anyBlocked)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
