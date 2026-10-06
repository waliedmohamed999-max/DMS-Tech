/**
 * Writes .build-info.json (version, commit, build time, shipped migrations) — run automatically before `next build`.
 * Contains no environment values.
 *
 * Plain Node.js (no tsx/ts-node) so the production build path works on hosts that install without devDependencies
 * (cPanel / CloudLinux Node.js Selector — docs/CPANEL_DEPLOYMENT.md). Same behaviour as the former build-info.ts.
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
let commit = process.env.GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null;
if (!commit) {
  try {
    commit = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    commit = null;
  }
}
const migrations = readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const info = { version: pkg.version, commit, builtAt: new Date().toISOString(), migrations };
writeFileSync(".build-info.json", JSON.stringify(info, null, 2) + "\n");
console.log(`build-info: v${info.version} ${commit?.slice(0, 12) ?? "(no commit)"} · ${migrations.length} migrations`);
