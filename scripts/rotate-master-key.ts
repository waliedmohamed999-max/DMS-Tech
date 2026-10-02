/**
 * Controlled re-encryption of integration secrets (docs/SECURITY.md#secret-rotation).
 *
 *   INTEGRATION_MASTER_KEY_OLD=<current key> INTEGRATION_MASTER_KEY=<new key> npm run secrets:rotate            # dry run
 *   INTEGRATION_MASTER_KEY_OLD=<current key> INTEGRATION_MASTER_KEY=<new key> npm run secrets:rotate -- --apply
 *
 * All-or-nothing: every secret is decrypted with the OLD key first; if any fails, nothing is changed. Then all rows are
 * re-encrypted with the NEW key in ONE transaction (keyVersion + 1). Deploy the new key to every instance right after.
 * Secret values are never printed. Back up the database first.
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import { decrypt, encrypt } from "../src/server/integrations/secrets";

const keyOf = (name: string) => {
  const raw = process.env[name]?.trim();
  const k = raw ? Buffer.from(raw, "base64") : null;
  if (!k || k.length !== 32) throw new Error(`${name} must be base64 of 32 bytes`);
  return k;
};

async function main() {
  const oldKey = keyOf("INTEGRATION_MASTER_KEY_OLD");
  const newKey = keyOf("INTEGRATION_MASTER_KEY");
  if (oldKey.equals(newKey)) throw new Error("new key equals old key");
  const rows = await prisma.integrationSecret.findMany();
  const plain: { id: string; value: string; keyVersion: number }[] = [];
  const failed: string[] = [];
  for (const r of rows) {
    try {
      plain.push({ id: r.id, value: decrypt(r, oldKey), keyVersion: r.keyVersion });
    } catch {
      failed.push(r.id);
    }
  }
  if (failed.length) throw new Error(`${failed.length} secret(s) cannot be decrypted with INTEGRATION_MASTER_KEY_OLD — nothing changed`);
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ dryRun: true, secrets: rows.length, decryptable: plain.length }));
    return;
  }
  await prisma.$transaction(async (tx) => {
    for (const p of plain) await tx.integrationSecret.update({ where: { id: p.id }, data: { ...encrypt(p.value, newKey), keyVersion: p.keyVersion + 1, rotatedAt: new Date() } });
    const org = await tx.organization.findFirst({ select: { id: true } });
    if (org) await tx.auditLog.create({ data: { organizationId: org.id, action: "integration.master_key_rotated", entityType: "IntegrationSecret", after: { secrets: plain.length }, ip: "system", userAgent: "rotate-master-key" } });
  });
  console.log(JSON.stringify({ ok: true, rotated: plain.length }));
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
