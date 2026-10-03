/**
 * Go-live gate (Phase 10). Read-only. Exit 1 on any BLOCK.
 *   npm run go-live:check                    # target: production
 *   npm run go-live:check -- --env staging   # rehearse the same gate on staging
 *   npm run go-live:check -- --offline       # skip the live HTTPS probe
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import { goLiveChecks, verdict } from "../src/server/system/golive";
import type { AppEnv } from "../src/server/system/environment";

const i = process.argv.indexOf("--env");
const target = (i > 0 ? process.argv[i + 1] : "production") as AppEnv;

goLiveChecks({ target, probeUrl: !process.argv.includes("--offline") })
  .then((r) => {
    const v = verdict(r);
    const w = Math.max(...r.map((x) => x.key.length));
    for (const x of r) console.log(`${x.level.padEnd(5)}  ${x.key.padEnd(w)}  ${x.detail}`);
    console.log(`\nGO-LIVE VERDICT (${target}): ${v}  — ${r.filter((x) => x.level === "BLOCK").length} block(s), ${r.filter((x) => x.level === "WARN").length} warning(s)`);
    if (v === "BLOCK") process.exitCode = 1;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
