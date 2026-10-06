/**
 * Verifies an installed prebuilt release WITHOUT starting the server or touching the database
 * (docs/CPANEL_DEPLOYMENT.md#github-actions-prebuilt-deployment).
 *
 *   npm run cpanel:verify     (cPanel "Run JS Script", or CI on a freshly extracted release)
 *
 * Checks: Node.js, build output, every runtime package resolves, Turbopack external links resolve, native modules load
 * on THIS machine (argon2, swc, sharp), Prisma's migration engine exists for this platform, next.config.mjs loads.
 * Prints names and statuses only — never environment values. Exit 1 on any failure.
 */
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const require = createRequire(path.join(root, "package.json"));
let failed = 0;
const pass = (m) => console.log(`  ✔ ${m}`);
const warn = (m) => console.log(`  ⚠ ${m}`);
const bad = (m) => {
  failed++;
  console.log(`  ✖ ${m}`);
};
const section = (m) => console.log(`\n▶ ${m}`);

section("Runtime");
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 19)) bad(`Node.js ${process.versions.node} — needs >= 20.19 (select Node.js 20 in the cPanel application)`);
else pass(`Node.js ${process.versions.node}`);
const glibc = process.report?.getReport?.().header?.glibcVersionRuntime;
pass(`${process.platform}-${process.arch}${glibc ? ` glibc ${glibc}` : ""}`);
if (process.platform !== "linux" || process.arch !== "x64") warn("the release is built for linux-x64");

section("Release files");
let info = null;
try {
  info = JSON.parse(readFileSync(".build-info.json", "utf8"));
  pass(`release ${info.version} commit ${String(info.commit).slice(0, 12)} built ${info.builtAt}`);
} catch {
  bad(".build-info.json missing — the application archive is not extracted in this directory");
}
for (const [p, what] of [["app.js", "Passenger startup file"], [".next/BUILD_ID", "Next.js build"], [".next/required-server-files.json", "Next.js server manifest"], [".next/static", "static assets"], [".next/csp-public.json", "public CSP manifest"], ["src/generated/prisma", "generated Prisma Client (operational scripts)"], ["prisma/migrations", "migrations"], ["public", "public files"], ["assets/fonts", "PDF fonts"]]) {
  if (existsSync(p)) pass(`${what} — ${p}`);
  else bad(`${what} missing — ${p}`);
}
if (existsSync(".next/BUILD_ID") && existsSync(".next/csp-public.json")) {
  const id = readFileSync(".next/BUILD_ID", "utf8").trim();
  if (JSON.parse(readFileSync(".next/csp-public.json", "utf8")).buildId === id) pass(`CSP manifest matches build ${id}`);
  else bad("CSP manifest belongs to another build — the .next folder is mixed; re-extract the application archive into an empty .next");
}
if (info && existsSync("prisma/migrations")) {
  const onDisk = readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  if (JSON.stringify(onDisk) === JSON.stringify(info.migrations)) pass(`${onDisk.length} migrations match the build`);
  else bad("prisma/migrations differs from the build's migration list — application files from different releases are mixed");
}

section("node_modules");
if (!existsSync("node_modules")) bad("node_modules missing — extract the node_modules archive into the virtual environment (see the runbook)");
else pass(`node_modules ${lstatSync("node_modules").isSymbolicLink() ? "→ CloudLinux virtual environment (symlink)" : "is a directory"}`);
const runtime = ["next", "react", "react-dom", "next-intl", "@prisma/client", "@prisma/adapter-pg", "pg", "pdfkit", "@node-rs/argon2", "zod", "decimal.js", "bidi-js", "lucide-react", "simple-icons", "server-only", "prisma", "tsx", "dotenv"];
const missing = runtime.filter((p) => !existsSync(path.join("node_modules", p, "package.json")));
if (missing.length) bad(`missing packages: ${missing.join(", ")}`);
else pass(`${runtime.length} runtime packages present`);
const nextVersion = existsSync("node_modules/next/package.json") ? JSON.parse(readFileSync("node_modules/next/package.json", "utf8")).version : null;
const lockNext = JSON.parse(readFileSync("package-lock.json", "utf8")).packages?.["node_modules/next"]?.version;
if (nextVersion && nextVersion === lockNext) pass(`next ${nextVersion} matches package-lock.json`);
else if (nextVersion) bad(`next ${nextVersion} ≠ package-lock.json ${lockNext} — node_modules belongs to another release`);
const extDir = path.join(".next", "node_modules");
if (existsSync(extDir)) {
  const broken = [];
  let n = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (lstatSync(p).isSymbolicLink()) {
        n++;
        if (!existsSync(p)) broken.push(p);
      } else if (name.startsWith("@")) walk(p);
    }
  };
  walk(extDir);
  if (broken.length) bad(`Turbopack external links do not resolve: ${broken.join(", ")}`);
  else pass(`${n} Turbopack external links resolve`);
}

section("Native modules on this machine");
try {
  const argon2 = require("@node-rs/argon2");
  const h = await argon2.hash("cpanel-verify");
  if (await argon2.verify(h, "cpanel-verify")) pass("@node-rs/argon2 (password hashing)");
  else bad("@node-rs/argon2 hash/verify mismatch");
} catch (e) {
  bad(`@node-rs/argon2 does not load: ${e.message.split("\n")[0]}`);
}
try {
  require("@swc/core");
  pass("@swc/core (loaded by the next-intl config plugin at startup)");
} catch (e) {
  bad(`@swc/core does not load: ${e.message.split("\n")[0]}`);
}
try {
  require("sharp");
  pass("sharp (image optimisation)");
} catch (e) {
  warn(`sharp does not load (${e.message.split("\n")[0]}) — /_next/image optimisation will fail; pages still work`);
}

section("Prisma");
try {
  const { getBinaryTargetForCurrentPlatform } = require("@prisma/get-platform");
  const target = await getBinaryTargetForCurrentPlatform();
  const engines = existsSync("node_modules/@prisma/engines") ? readdirSync("node_modules/@prisma/engines").filter((f) => f.startsWith("schema-engine-")) : [];
  const ext = target.startsWith("windows") ? ".exe" : "";
  if (engines.includes(`schema-engine-${target}${ext}`)) pass(`migration engine for ${target} (db:migrate:deploy can run offline)`);
  else warn(`no migration engine for ${target} (have: ${engines.join(", ") || "none"}) — \`npm run cpanel:migrate\` would try to download it`);
} catch (e) {
  warn(`could not detect the Prisma platform: ${e.message}`);
}
if (existsSync("node_modules/@prisma/client/package.json")) pass(`@prisma/client ${JSON.parse(readFileSync("node_modules/@prisma/client/package.json", "utf8")).version} (Wasm query compiler, no native engine)`);

section("Next.js configuration");
try {
  const cfg = (await import(pathToFileURL(path.join(root, "next.config.mjs")).href)).default;
  pass(`next.config.mjs loads${cfg.turbopack?.root ? " (CloudLinux layout detected)" : ""}`);
} catch (e) {
  bad(`next.config.mjs does not load: ${e.message.split("\n")[0]}`);
}

console.log(failed ? `\n✖ ${failed} check(s) failed — do not start this release` : "\n✔ release verified — restart the application, then check /api/health and /api/ready");
process.exit(failed ? 1 : 0);
