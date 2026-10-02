/**
 * Deployment gates (Phase 9 — docs/DEPLOYMENT-RUNBOOK.md). Read-only: never migrates, never resets.
 *
 *   npm run deploy:preflight   before deploy: configuration, migration status (pending / failed), schema drift,
 *                              recent verified backup (production)
 *   npm run deploy:verify      after deploy: no pending migrations, no drift, then /api/health, /api/ready and the smoke
 *                              suite against BASE_URL
 * Exit code 1 when a gate fails.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { validateConfig } from "../src/server/system/config";
import { prisma } from "../src/server/db";

type Gate = { gate: string; ok: boolean; detail?: string; warnOnly?: boolean };
const gates: Gate[] = [];

function prismaCmd(args: string) {
  const r = spawnSync(`npx prisma ${args}`, [], { shell: true, encoding: "utf8" });
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter((l) => !l.startsWith("Loaded Prisma config")).join("\n") };
}

async function main() {
  const mode = process.argv[2] ?? "preflight";
  const cfg = validateConfig();
  gates.push({ gate: "configuration", ok: cfg.ok, detail: cfg.issues.map((i) => `${i.level}:${i.key}:${i.code}`).join(", ") || "ok" });

  const status = prismaCmd("migrate status");
  const pending = /following migration[s]? have not yet been applied|not yet been applied/i.test(status.out);
  const failed = /failed/i.test(status.out) && !/up to date/i.test(status.out);
  if (mode === "preflight") gates.push({ gate: "migrations", ok: !failed, detail: failed ? "a migration FAILED — resolve before deploying" : pending ? "pending migrations will be applied by db:deploy" : "up to date", warnOnly: pending });
  else gates.push({ gate: "migrations", ok: status.code === 0 && !pending && !failed, detail: status.code === 0 && !pending ? "all applied" : "pending or failed migrations" });

  const diff = prismaCmd("migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script");
  const drift = !/empty migration/i.test(diff.out);
  // before deploy a diff is expected when migrations are pending; after deploy any diff is drift
  gates.push({ gate: "schema_drift", ok: mode === "preflight" ? !drift || pending : !drift, detail: drift ? (pending ? "differences = pending migrations" : "DATABASE DIFFERS FROM schema.prisma (manual change?)") : "none" });

  if (mode === "preflight") {
    const last = await prisma.backupRecord.findFirst({ where: { kind: "database", status: { in: ["COMPLETED", "VERIFIED"] } }, orderBy: { startedAt: "desc" } }).catch(() => null);
    const fresh = last && Date.now() - last.startedAt.getTime() < 24 * 3600_000;
    gates.push({ gate: "recent_backup", ok: Boolean(fresh) || process.env.NODE_ENV !== "production", warnOnly: process.env.NODE_ENV !== "production", detail: last ? `${last.status} ${last.startedAt.toISOString()}` : "none — run npm run db:backup first" });
  } else {
    const base = (process.env.BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
    if (!base) gates.push({ gate: "endpoints", ok: false, detail: "set BASE_URL" });
    else {
      const h = await fetch(`${base}/api/health`).then((r) => r.status).catch(() => 0);
      const r = await fetch(`${base}/api/ready`).then(async (x) => ({ s: x.status, b: await x.text() })).catch(() => ({ s: 0, b: "" }));
      gates.push({ gate: "health", ok: h === 200, detail: String(h) });
      gates.push({ gate: "ready", ok: r.s === 200, detail: r.s === 200 ? "ready" : r.b.slice(0, 300) });
      const smoke = spawnSync("npx tsx scripts/smoke.ts", [], { shell: true, encoding: "utf8", env: { ...process.env, BASE_URL: base } });
      gates.push({ gate: "smoke", ok: smoke.status === 0, detail: (smoke.stdout ?? "").trim().split("\n").slice(-1)[0] });
    }
  }
  const failedGates = gates.filter((g) => !g.ok && !g.warnOnly);
  console.log(JSON.stringify({ mode, ok: !failedGates.length, gates }, null, 2));
  if (failedGates.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
