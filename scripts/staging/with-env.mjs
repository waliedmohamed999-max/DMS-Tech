// LOCAL STAGING REHEARSAL — run a command with ONLY the staging environment file (no development .env):
//   node scripts/staging/with-env.mjs <cwd> <command...>
// dotenv-based scripts read the same file through DOTENV_CONFIG_PATH; values never print.
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const file = path.resolve(".local/staging/staging.env");
const vars = Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const [cwd, ...rest] = process.argv.slice(2);
// leading KEY=VALUE arguments override the staging file (e.g. a temporary instance on a restored database)
const overrides = {};
while (rest.length && /^[A-Z][A-Z0-9_]*=/.test(rest[0])) {
  const a = rest.shift();
  overrides[a.slice(0, a.indexOf("="))] = a.slice(a.indexOf("=") + 1);
}
const cmd = rest;
// start from a clean environment: only OS basics + the staging file (development variables never leak in)
const keep = ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "HOME", "ComSpec", "COMSPEC", "PATHEXT", "WINDIR", "windir", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS", "ProgramFiles", "ProgramData", "SystemDrive"];
const base = Object.fromEntries(keep.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
// quote arguments that the shell would otherwise split / interpret (URLs with & ? =, paths with spaces)
const q = (a) => (/[\s&|<>^"()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
const child = spawn(cmd.map(q).join(" "), { cwd: path.resolve(cwd), env: { ...base, ...vars, ...overrides, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("RUN_"))), DOTENV_CONFIG_PATH: file }, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 1));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill(s));
