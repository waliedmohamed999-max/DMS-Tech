import { spawn } from "node:child_process";
import { prisma } from "../src/server/db";

/** `prisma migrate deploy` against another database (temp verify / restore target) — never DATABASE_URL itself. */
export function migrateTo(url: string) {
  return new Promise<void>((resolve, reject) => {
    // fixed command string (no user input) — the target URL travels in the environment only
    const p = spawn("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: ["ignore", "pipe", "pipe"], shell: true });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`migrate deploy failed (${code}): ${err.slice(0, 300)}`))));
  });
}

/** Backup lifecycle in the audit log (organization = the bootstrapped one). Never contains credentials. */
export async function auditBackup(action: string, after: Record<string, unknown>) {
  const org = await prisma.organization.findFirst({ where: { slug: process.env.OS_ORG_SLUG ?? "dms-tech" }, select: { id: true } }).catch(() => null);
  if (!org) return;
  await prisma.auditLog.create({ data: { organizationId: org.id, actorId: null, action, entityType: "BackupRecord", entityId: (after.id as string) ?? null, after: after as object, ip: "system", userAgent: "backup-script" } }).catch(() => undefined);
}
