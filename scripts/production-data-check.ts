/**
 * Demo / QA artefact scan (Phase 10). Read-only. Exit 1 if ANY demo account, shared demo password, QA fixture,
 * fake e-mail domain, demo-created business record, placeholder bank text or demo bank account exists.
 *   npm run production:data-check
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import { demoArtifacts } from "../src/server/system/golive";

demoArtifacts()
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    console.log(r.clean ? "PASS — no demo artefacts" : "BLOCK — demo artefacts present (counts only shown)");
    if (!r.clean) process.exitCode = 1;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
