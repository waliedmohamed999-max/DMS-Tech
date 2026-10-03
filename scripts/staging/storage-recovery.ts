/**
 * STAGING document-storage recovery test (Phase 10). Never runs in production.
 * storage:backup → simulate a LOST file and a CORRUPTED file → storage:verify detects both → the app refuses to serve
 * the corrupted bytes (checksum on download) → restore both files from the backup copy → verify clean → download OK.
 * Also: an authenticated user without document access cannot download (employee smoke account).
 *   node scripts/staging/with-env.mjs . SMOKE_PASSWORD=… ADMIN_PASSWORD=… npx tsx scripts/staging/storage-recovery.ts
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { prisma } from "../../src/server/db";
import { appEnv } from "../../src/server/system/environment";
import { isPermission } from "../../src/server/rbac/permissions";
import type { Ctx } from "../../src/server/context";
import { updateDocumentMeta } from "../../src/server/ops/documents";

const A = "http://127.0.0.1:3200";
const checks: [string, boolean, unknown?][] = [];
const sh = (cmd: string) => {
  try {
    return { code: 0, out: execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    const x = e as { status: number; stdout: string };
    return { code: x.status, out: x.stdout };
  }
};

async function login(email: string, password: string) {
  const html = await (await fetch(`${A}/app/login`)).text();
  const fd = new FormData();
  const un = (v: string) => v.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  for (const [tag] of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    if (name?.startsWith("$ACTION")) fd.append(un(name), un(/value="([^"]*)"/.exec(tag)?.[1] ?? ""));
  }
  fd.append("email", email);
  fd.append("password", password);
  fd.append("next", "/app");
  const r = await fetch(`${A}/app/login`, { method: "POST", body: fd, redirect: "manual", headers: { origin: A, "x-forwarded-for": "10.66.1.1" } });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}

async function main() {
  if (appEnv() === "production") throw new Error("refused in production");
  const root = process.env.DOCUMENT_STORAGE_DIR!;
  const versions = await prisma.documentVersion.findMany({ where: { storageDriver: "local" }, orderBy: { createdAt: "asc" }, select: { id: true, documentId: true, versionNumber: true, storageKey: true, sha256: true } });
  if (versions.length < 2) throw new Error("need at least two stored document versions");
  const lost = versions[0];
  const corrupt = versions[versions.length - 1];
  const fileOf = (k: string) => path.join(root, k);

  const v0 = sh("npm run --silent storage:verify");
  checks.push(["baseline storage:verify clean", v0.code === 0, JSON.parse(v0.out).ok + "/" + versions.length]);
  const b = sh("npm run --silent storage:backup");
  const dest = JSON.parse(b.out.trim().split("\n").pop()!).dest as string;
  checks.push(["storage:backup wrote a copy + manifest", existsSync(path.join(dest, "MANIFEST.json"))]);

  const admin = await login("ops.lead@dmstech.sa", process.env.ADMIN_PASSWORD!);
  const dl = async (v: typeof corrupt, cookie = admin) => fetch(`${A}/app/documents/${v.documentId}/download?v=${v.versionNumber}`, { headers: { cookie }, redirect: "manual" });
  const before = await dl(corrupt);
  checks.push(["download before damage → 200", before.status === 200]);
  await before.arrayBuffer();

  // simulate loss + corruption (staging files only)
  renameSync(fileOf(lost.storageKey), fileOf(lost.storageKey) + ".lost");
  const orig = readFileSync(fileOf(corrupt.storageKey));
  writeFileSync(fileOf(corrupt.storageKey), Buffer.concat([orig, Buffer.from("tampered")]));
  const v1 = sh("npm run --silent storage:verify");
  const probs = JSON.parse(v1.out).problems as { id: string; problem: string }[];
  checks.push(["storage:verify detects MISSING + HASH_MISMATCH (exit 1)", v1.code === 1 && probs.some((p) => p.id === lost.id && p.problem === "MISSING") && probs.some((p) => p.id === corrupt.id && p.problem === "HASH_MISMATCH"), probs]);
  const bad = await dl(corrupt);
  const badBody = Buffer.from(await bad.arrayBuffer());
  const servedTampered = createHash("sha256").update(badBody).digest("hex") !== corrupt.sha256 && badBody.length > 0 && bad.status === 200;
  checks.push(["corrupted file is NOT served (checksum on download)", !servedTampered && bad.status !== 200, bad.status]);
  const missing = await dl(lost);
  await missing.arrayBuffer();
  checks.push(["missing file → error, not a crash page with internals", missing.status >= 400, missing.status]);

  // restore from the backup copy
  copyFileSync(path.join(dest, lost.storageKey), fileOf(lost.storageKey));
  copyFileSync(path.join(dest, corrupt.storageKey), fileOf(corrupt.storageKey));
  sh(`node -e "require('fs').rmSync(process.argv[1])" "${fileOf(lost.storageKey)}.lost"`);
  const v2 = sh("npm run --silent storage:verify");
  checks.push(["after restore from backup: storage:verify clean", v2.code === 0]);
  const after = await dl(corrupt);
  const afterBody = Buffer.from(await after.arrayBuffer());
  checks.push(["download after restore → 200 + hash matches", after.status === 200 && createHash("sha256").update(afterBody).digest("hex") === corrupt.sha256]);

  // authorization (docs/SECURITY.md): INTERNAL company documents = documents.view (employees may read);
  // CONFIDENTIAL / RESTRICTED company documents = documents.manage only
  const emp = await login("smoke.automation@dmstech.sa", process.env.SMOKE_PASSWORD!);
  const internal = await dl(corrupt, emp);
  await internal.arrayBuffer();
  checks.push(["employee + INTERNAL company document → allowed (by design: documents.view)", internal.status === 200, internal.status]);
  const u = await prisma.user.findFirstOrThrow({ where: { email: "ops.lead@dmstech.sa" }, include: { roles: { include: { role: { include: { permissions: true } } } } } });
  const adminCtx: Ctx = { organizationId: u.organizationId, userId: u.id, userName: u.name, roleKeys: u.roles.map((r) => r.role.key), permissions: new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission)).filter(isPermission)) };
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: corrupt.documentId } });
  await updateDocumentMeta(adminCtx, doc.id, { title: doc.title, description: doc.description, classification: "CONFIDENTIAL", tags: doc.tags });
  try {
    const denied = await dl(corrupt, emp);
    await denied.arrayBuffer();
    checks.push(["employee + CONFIDENTIAL company document → denied", denied.status === 403 || denied.status === 404, denied.status]);
    const mgr = await dl(corrupt);
    await mgr.arrayBuffer();
    checks.push(["documents.manage + CONFIDENTIAL → allowed", mgr.status === 200, mgr.status]);
  } finally {
    await updateDocumentMeta(adminCtx, doc.id, { title: doc.title, description: doc.description, classification: doc.classification, tags: doc.tags });
  }
  const anon = await fetch(`${A}/app/documents/${corrupt.documentId}/download`, { redirect: "manual" });
  checks.push(["anonymous → redirect to login / 401", [302, 303, 307, 401, 403].includes(anon.status), anon.status]);

  for (const [k, ok, d] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${k}${d !== undefined ? `  (${typeof d === "string" || typeof d === "number" ? d : JSON.stringify(d)})` : ""}`);
  const failed = checks.filter(([, ok]) => !ok).length;
  console.log(failed ? `STORAGE-RECOVERY: ${failed} FAILED` : `STORAGE-RECOVERY: PASS (${checks.length} checks)`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
