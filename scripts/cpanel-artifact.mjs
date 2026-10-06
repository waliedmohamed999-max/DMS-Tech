/**
 * Packages a COMPLETED build (npm run cpanel:build, then npm prune --omit=dev) into a prebuilt cPanel release
 * (docs/CPANEL_DEPLOYMENT.md#github-actions-prebuilt-deployment). Plain Node.js; run by .github/workflows/cpanel-build.yml.
 *
 *   dist/cpanel/dms-tech-app-<version>-<sha7>.tar.gz           → extract INTO the application root
 *   dist/cpanel/dms-tech-node_modules-<version>-<sha7>.tar.gz  → extract into ~/nodevenv/<app root>/20/lib/
 *   dist/cpanel/DEPLOY_MANIFEST.json + SHA256SUMS
 *
 * Two archives because the CloudLinux Node.js Selector refuses a real node_modules folder in the application root:
 * node_modules there must stay the Selector's symlink into the virtual environment, so the modules go THERE.
 *
 * Fails (exit 1) when an archive would contain a sensitive file (.env*, keys, logs, dumps, backups, local data).
 * Linux only (the server is Linux x64 and native modules are platform-specific); --dry-run skips archiving elsewhere.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const dryRun = process.argv.includes("--dry-run");
const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};
if (process.platform !== "linux" && !dryRun) fail(`packaging must run on Linux x64 (native modules); this is ${process.platform}. Use --dry-run to test the checks.`);

// ---- 1. the build must be complete and pruned --------------------------------------------------------------------
for (const p of [".next/BUILD_ID", ".next/csp-public.json", ".build-info.json", "app.js", "src/generated/prisma", "node_modules/next/package.json"]) {
  if (!existsSync(p)) fail(`${p} missing — run \`npm run cpanel:build\` first`);
}
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const info = JSON.parse(readFileSync(".build-info.json", "utf8"));
const buildId = readFileSync(".next/BUILD_ID", "utf8").trim();
if (!info.commit) fail(".build-info.json has no commit — set GIT_COMMIT for the build");
for (const dev of Object.keys(pkg.devDependencies ?? {})) {
  if (existsSync(path.join("node_modules", dev, "package.json")) && !dryRun) fail(`devDependency ${dev} is still installed — run \`npm prune --omit=dev\` before packaging`);
}

// ---- 2. Turbopack externals: .next/node_modules/<pkg>-<hash> are symlinks into node_modules. Make them RELATIVE so they
//         resolve wherever the release is extracted (app root/node_modules → the CloudLinux virtual environment). --------
const extDir = path.join(".next", "node_modules");
const nmReal = realpathSync("node_modules");
let links = 0;
const walkLinks = (dir) => {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) {
      let target;
      try {
        target = realpathSync(p);
      } catch {
        fail(`${p} → ${readlinkSync(p)} does not resolve`);
      }
      const inside = path.relative(nmReal, target);
      if (inside.startsWith("..") || path.isAbsolute(inside)) fail(`${p} points outside node_modules (${target})`);
      const rel = path.relative(path.dirname(path.resolve(p)), path.join(root, "node_modules", inside));
      if (process.platform === "linux" && readlinkSync(p) !== rel) {
        unlinkSync(p);
        symlinkSync(rel, p);
      }
      links++;
    } else if (st.isDirectory() && name.startsWith("@")) walkLinks(p);
  }
};
walkLinks(extDir);
console.log(`✔ ${links} Turbopack external link(s) in .next/node_modules are relative`);

// ---- 3. archive contents --------------------------------------------------------------------------------------------
const sha7 = info.commit.slice(0, 7);
const base = `${pkg.version}-${sha7}`;
const out = path.join("dist", "cpanel");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const appArchive = `dms-tech-app-${base}.tar.gz`;
const modArchive = `dms-tech-node_modules-${base}.tar.gz`;

// everything Passenger (app.js → next) and the operational scripts (migrate, bootstrap, worker via tsx) read at runtime
const appEntries = ["app.js", "package.json", "package-lock.json", "next.config.mjs", "security-headers.mjs", "tsconfig.json", "prisma.config.ts", ".build-info.json", ".next", "public", "assets", "prisma", "src", "scripts"];
for (const e of appEntries) if (!existsSync(e)) fail(`${e} missing`);
// build caches/traces only — sensitive files are NOT excluded silently: the scan below fails the release instead
const appExcludes = [".next/cache", ".next/trace", ".next/trace-build", ".next/types", ".next/dev", "*.tsbuildinfo"];

// ---- 4. sensitive-file policy (applied to the real archive listings) -----------------------------------------------
const envFile = /(^|\/)\.env(\.[^/]+)?$/;
const envTemplate = /(^|\/)\.env\.(example|sample|template|defaults)$/;
const appForbidden = [
  [(f) => envFile.test(f) && !envTemplate.test(f), "environment file"],
  [(f) => /\.(pem|key|p12|pfx|crt|jks|keystore)$/i.test(f) || /(^|\/)id_(rsa|ed25519|ecdsa|dsa)/.test(f), "key / certificate"],
  [(f) => /\.(log|dump|sqlite3?|db|bak|backup|tmp|swp)$/i.test(f) || /\.sql\.gz$/i.test(f), "log / dump / temporary file"],
  [(f) => /\.sql$/i.test(f) && !/^prisma\/migrations\/[^/]+\/migration\.sql$/.test(f) && f !== "scripts/hosted/runtime-role.sql", "SQL file outside migrations"],
  [(f) => /(^|\/)(\.git|\.local|backups|coverage|\.vercel|\.env\.d)(\/|$)/.test(f), "VCS / local data / backups"],
  [(f) => /^(node_modules|tests|_prototype|docs|\.github)(\/|$)/.test(f), "not part of the app archive"]
];
const modForbidden = [
  [(f) => envFile.test(f) && !envTemplate.test(f), "environment file"],
  [(f) => /(^|\/)id_(rsa|ed25519|ecdsa|dsa)$/.test(f) || /\.(p12|pfx|jks|keystore)$/i.test(f), "private key store"],
  [(f) => /\.(dump|sqlite3?|bak)$/i.test(f) || /\.sql\.gz$/i.test(f), "dump"]
];

function scan(label, files, rules) {
  const hits = [];
  for (const f of files) for (const [test, why] of rules) if (test(f)) hits.push(`${f} (${why})`);
  if (hits.length) fail(`${label}: ${hits.length} sensitive file(s) — refusing to package:\n  ${hits.slice(0, 50).join("\n  ")}`);
  console.log(`✔ ${label}: ${files.length} entries, no sensitive files`);
}

// private keys pasted into source files
const keyBlock = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
function scanContents(files) {
  const hits = [];
  for (const f of files) {
    if (f.endsWith("/") || f.startsWith(".next/") || !existsSync(f) || !lstatSync(f).isFile() || statSync(f).size > 2_000_000) continue;
    if (keyBlock.test(readFileSync(f, "latin1"))) hits.push(f);
  }
  if (hits.length) fail(`private key material inside: ${hits.join(", ")}`);
  console.log("✔ app sources: no private key material");
}

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const tarList = (file) => execFileSync("tar", ["-tzf", file], { maxBuffer: 512 * 1024 * 1024 }).toString().split("\n").filter(Boolean).map((f) => f.replace(/^\.\//, ""));

if (dryRun && process.platform !== "linux") {
  console.log("ℹ --dry-run on a non-Linux host: archives are not created; checking the file policy on the working tree");
  const list = [];
  const walk = (p) => {
    const st = lstatSync(p);
    if (st.isDirectory() && !st.isSymbolicLink()) {
      if (appExcludes.includes(p.replace(/\\/g, "/"))) return;
      for (const n of readdirSync(p)) walk(path.join(p, n));
    } else list.push(p.replace(/\\/g, "/"));
  };
  appEntries.forEach(walk);
  scan("app (dry run)", list, appForbidden);
  scanContents(list);
  process.exit(0);
}

const tarArgs = ["--owner=0", "--group=0", "--numeric-owner"];
execFileSync("tar", ["-czf", path.join(out, appArchive), ...tarArgs, ...appExcludes.map((x) => `--exclude=./${x}`), ...appExcludes.filter((x) => x.startsWith("*")).map((x) => `--exclude=${x}`), ...appEntries.map((e) => `./${e}`)], { stdio: "inherit" });
execFileSync("tar", ["-czf", path.join(out, modArchive), ...tarArgs, "--exclude=./node_modules/.cache", "./node_modules"], { stdio: "inherit" });

const appFiles = tarList(path.join(out, appArchive));
const modFiles = tarList(path.join(out, modArchive));
scan(appArchive, appFiles, appForbidden);
scan(modArchive, modFiles, modForbidden);
scanContents(appFiles);
if (!modFiles.every((f) => f.startsWith("node_modules/"))) fail(`${modArchive} must contain only node_modules/`);
if (appFiles.some((f) => /^node_modules(\/|$)/.test(f))) fail(`${appArchive} must not contain node_modules`);
for (const must of ["app.js", ".next/BUILD_ID", ".next/csp-public.json", ".build-info.json", "package.json"]) if (!appFiles.includes(must)) fail(`${appArchive} lacks ${must}`);

// ---- 5. manifest ----------------------------------------------------------------------------------------------------
const glibc = process.report?.getReport?.().header?.glibcVersionRuntime ?? null;
const engines = readdirSync(path.join("node_modules", "@prisma", "engines")).filter((f) => f.startsWith("schema-engine-")).sort();
const manifest = {
  name: pkg.name,
  version: pkg.version,
  commit: info.commit,
  builtAt: info.builtAt,
  nextBuildId: buildId,
  migrations: info.migrations,
  build: { node: process.version, platform: `${process.platform}-${process.arch}`, glibc, runId: process.env.GITHUB_RUN_ID ?? null },
  prismaSchemaEngines: engines,
  archives: {
    app: { file: appArchive, bytes: statSync(path.join(out, appArchive)).size, sha256: sha256(path.join(out, appArchive)), extractTo: "<application root>  (e.g. /home/dmstechc/repositories/DMS-Tech)" },
    node_modules: { file: modArchive, bytes: statSync(path.join(out, modArchive)).size, sha256: sha256(path.join(out, modArchive)), extractTo: "<virtual environment>/lib  (e.g. /home/dmstechc/nodevenv/repositories/DMS-Tech/20/lib)" }
  }
};
writeFileSync(path.join(out, "DEPLOY_MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(path.join(out, "SHA256SUMS"), `${manifest.archives.app.sha256}  ${appArchive}\n${manifest.archives.node_modules.sha256}  ${modArchive}\n`);
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
console.log(`✔ ${appArchive} ${mb(manifest.archives.app.bytes)} (${appFiles.length} entries)`);
console.log(`✔ ${modArchive} ${mb(manifest.archives.node_modules.bytes)} (${modFiles.length} entries)`);
console.log(`✔ release ${pkg.version} ${info.commit} build ${buildId} → ${out}`);
