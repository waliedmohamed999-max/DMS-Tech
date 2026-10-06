/**
 * cPanel / CloudLinux production build helper (docs/CPANEL_DEPLOYMENT.md). Plain Node.js — needs no tsx.
 *
 *   npm run cpanel:check   validate Node version, installed packages and configuration names; changes nothing
 *   npm run cpanel:build   the above, then: build metadata → prisma generate → next build → CSP manifest → verify
 *
 * It never starts a server (Passenger owns the process via app.js), never touches the database (migrations are the
 * explicit `npm run db:migrate:deploy`) and never prints configuration VALUES — only variable names.
 * Tools are run as `node <resolved entry file>` so a missing node_modules/.bin link cannot break the build.
 */
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const require = createRequire(path.join(root, "package.json"));
const checkOnly = process.argv.includes("--check");

const errors = [];
const warnings = [];
const step = (msg) => console.log(`\n▶ ${msg}`);
const ok = (msg) => console.log(`  ✔ ${msg}`);
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

// ---- 1. Node.js ---------------------------------------------------------------------------------------------------
step("Node.js");
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 19)) errors.push(`Node.js ${process.versions.node} is too old — select Node.js 20 (>= 20.19) in the cPanel Node.js application`);
else ok(`Node.js ${process.versions.node}`);

// ---- 2. installed packages --------------------------------------------------------------------------------------
step("Installed packages");
const nm = path.join(root, "node_modules");
if (!existsSync(nm)) errors.push("node_modules is missing — click “Run NPM Install” in the cPanel Node.js application");
else ok(`node_modules present${lstatSync(nm).isSymbolicLink() ? " (CloudLinux virtual environment link)" : ""}`);
// runtime + everything `next build` / `prisma generate` load on this host
const required = ["next", "react", "react-dom", "next-intl", "@prisma/client", "@prisma/adapter-pg", "pg", "pdfkit", "@node-rs/argon2", "zod", "prisma", "dotenv", "typescript", "tailwindcss", "@tailwindcss/postcss", "@types/node", "@types/react", "@types/react-dom"];
// direct dependencies are installed at the top level (several packages' "exports" hide ./package.json from require)
const missing = required.filter((p) => !existsSync(path.join(nm, p, "package.json")));
if (missing.length) errors.push(`missing packages: ${missing.join(", ")} — the NPM install did not complete; see “Install fails” in docs/CPANEL_DEPLOYMENT.md`);
else ok(`${required.length} required packages resolve`);

// ---- 3. configuration (names only) ------------------------------------------------------------------------------
step("Configuration (names only — values are never printed)");
// Next.js also reads .env.production at build time; accept a key from there for the build-time check
const envFileKeys = new Set();
for (const f of [".env.production", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && m[2].trim()) envFileKeys.add(m[1]);
  }
}
const has = (k) => Boolean(process.env[k]?.trim()) || envFileKeys.has(k);

// build time: NEXT_PUBLIC_* values are compiled into the bundles — a missing value would bake in the fallback domain
if (!has("NEXT_PUBLIC_SITE_URL")) errors.push("NEXT_PUBLIC_SITE_URL is not set — it is compiled in at build time (set it to https://dmstech.sa in the Node.js application's environment variables, then run this again)");
else if (process.env.NEXT_PUBLIC_SITE_URL && !process.env.NEXT_PUBLIC_SITE_URL.startsWith("https://")) errors.push("NEXT_PUBLIC_SITE_URL must start with https://");
else ok("NEXT_PUBLIC_SITE_URL set (build time)");

// runtime: src/instrumentation.ts refuses to start the server without these (authoritative check: src/server/system/config.ts)
const runtime = ["DATABASE_URL", "APP_ENV", "HR_FIELD_KEY"];
const storage = (process.env.DOCUMENT_STORAGE ?? "local").trim().toLowerCase();
if (storage === "s3") runtime.push("S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY");
else runtime.push("DOCUMENT_STORAGE_DIR");
const missingRuntime = runtime.filter((k) => !has(k));
if (missingRuntime.length) warnings.push(`runtime variables not visible to this script: ${missingRuntime.join(", ")} — the app refuses to start without them (startup_refused in the Passenger log)`);
else ok(`runtime variables present: ${runtime.join(", ")}`);
for (const k of ["ALLOW_DEMO_SEED", "OS_LOCAL_PROD_TEST", "TEST_DATABASE_URL"]) if (has(k)) warnings.push(`${k} is a development-only variable — remove it from production`);

for (const w of warnings) console.warn(`  ⚠ ${w}`);
if (errors.length) fail(`Not ready:\n  - ${errors.join("\n  - ")}`);
if (checkOnly) {
  console.log("\n✔ cpanel:check passed — run `npm run cpanel:build` next.");
  process.exit(0);
}

// ---- 4. build ---------------------------------------------------------------------------------------------------
// NEXT_BUILD_CPUS (next.config.mjs): one build worker per CPU can exceed the account's LVE memory/process limits
const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_BUILD_CPUS: process.env.NEXT_BUILD_CPUS || "2" };
// `next build` imports src/server/db.ts (route config collection), which requires DATABASE_URL to be SET; the build
// never connects. Same rule as the Dockerfile: when no real value is visible, use an unreachable placeholder.
if (!has("DATABASE_URL")) {
  env.DATABASE_URL = "postgresql://build:build@127.0.0.1:1/build";
  console.log("\n  ℹ DATABASE_URL not visible — building with an unreachable placeholder (the build does not connect)");
}
function run(label, file, args = []) {
  step(label);
  const r = spawnSync(process.execPath, [file, ...args], { stdio: "inherit", env, cwd: root });
  if (r.error) fail(`${label} could not start: ${r.error.message}`);
  if (r.status !== 0) {
    const killed = r.signal === "SIGKILL" || r.status === 137;
    fail(`${label} failed (${r.signal ?? `exit ${r.status}`}).${killed ? " The process was killed — usually the account's memory (LVE) limit; ask the host to raise it for the build or build during low traffic." : ""}`);
  }
}

run("Build metadata (.build-info.json)", path.join(root, "scripts", "build-info.mjs"));
run("Prisma Client (prisma generate)", require.resolve("prisma/build/index.js"), ["generate"]);
run("Next.js production build (next build)", require.resolve("next/dist/bin/next"), ["build"]);
run("Public-site CSP manifest", path.join(root, "scripts", "csp-manifest.mjs"));

// ---- 5. verify --------------------------------------------------------------------------------------------------
step("Verify build output");
const expect = [
  [".next/BUILD_ID", "Next.js build id"],
  [".next/required-server-files.json", "Next.js server manifest"],
  [".next/static", "static assets"],
  [".next/csp-public.json", "public CSP manifest"],
  [".build-info.json", "build metadata"],
  ["src/generated/prisma", "generated Prisma Client"],
  ["app.js", "Passenger startup file"]
];
const absent = expect.filter(([p]) => !existsSync(path.join(root, p)));
if (absent.length) fail(`build output incomplete: ${absent.map(([p, d]) => `${p} (${d})`).join(", ")}`);
for (const [p, d] of expect) ok(`${d} — ${p}`);
const buildId = readFileSync(path.join(root, ".next", "BUILD_ID"), "utf8").trim();
const manifestId = JSON.parse(readFileSync(path.join(root, ".next", "csp-public.json"), "utf8")).buildId;
if (manifestId !== buildId) fail("CSP manifest does not match BUILD_ID — re-run `npm run cpanel:build`");
ok(`build ${buildId}`);

console.log(`
✔ Build ready. Next steps (docs/CPANEL_DEPLOYMENT.md):
  1. Only if this release adds migrations: run the "db:migrate:deploy" script (a backup first).
  2. Restart the application in cPanel → Setup Node.js App.
  3. Check https://dmstech.sa/api/health, then the site.`);
