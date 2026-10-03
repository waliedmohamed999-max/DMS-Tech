import { prisma } from "../db";
import { fieldCryptoAvailable, fieldKeyVersion, ibanAad, open, seal } from "../security/fieldcrypto";

/**
 * Legacy plaintext IBAN → AES-256-GCM (Phase 10). Per row, in one transaction: encrypt → decrypt and compare →
 * write ciphertext + clear plaintext → read back and decrypt again. A row that fails is left untouched and reported.
 * `rotate` re-encrypts rows of an older key version. Values are never returned, printed or logged.
 */
export async function encryptLegacyIbans(opts: { apply: boolean; rotate?: boolean }) {
  if (!fieldCryptoAvailable()) throw new Error("HR_FIELD_KEY is not configured (base64 of 32 bytes)");
  const current = fieldKeyVersion();
  const rows = opts.rotate
    ? await prisma.employeeBankAccount.findMany({ where: { ibanKeyVersion: { lt: current } } })
    : await prisma.employeeBankAccount.findMany({ where: { iban: { not: null } } });
  let processed = 0;
  const failed: string[] = [];
  for (const r of rows) {
    const aad = ibanAad(r.employeeId);
    let plain: string;
    try {
      plain = opts.rotate ? open({ ciphertext: r.ibanCiphertext!, iv: r.ibanIv!, tag: r.ibanTag!, keyVersion: r.ibanKeyVersion! }, aad) : r.iban!;
      const sealed = seal(plain, aad);
      if (open(sealed, aad) !== plain) throw new Error("verification failed");
      if (opts.apply)
        await prisma.$transaction(async (tx) => {
          const fresh = await tx.employeeBankAccount.findUniqueOrThrow({ where: { id: r.id } });
          if (!opts.rotate && fresh.iban !== plain) throw new Error("row changed during migration");
          await tx.employeeBankAccount.update({ where: { id: r.id }, data: { ibanCiphertext: sealed.ciphertext, ibanIv: sealed.iv, ibanTag: sealed.tag, ibanKeyVersion: sealed.keyVersion, ibanLast4: plain.slice(-4), iban: null } });
          const back = await tx.employeeBankAccount.findUniqueOrThrow({ where: { id: r.id } });
          if (open({ ciphertext: back.ibanCiphertext!, iv: back.ibanIv!, tag: back.ibanTag!, keyVersion: back.ibanKeyVersion! }, aad) !== plain) throw new Error("post-write verification failed");
        });
      processed++;
    } catch {
      failed.push(r.id);
    }
  }
  if (opts.apply) {
    const org = await prisma.organization.findFirst({ select: { id: true } });
    if (org) await prisma.auditLog.create({ data: { organizationId: org.id, action: opts.rotate ? "hr.iban_key_rotated" : "hr.iban_encrypted", entityType: "EmployeeBankAccount", after: { rows: processed, failed: failed.length, keyVersion: current }, ip: "system", userAgent: "hr-encrypt-iban" } });
  }
  const plaintextRemaining = await prisma.employeeBankAccount.count({ where: { iban: { not: null } } });
  return { mode: opts.rotate ? "rotate" : "encrypt", dryRun: !opts.apply, candidates: rows.length, processed, failed: failed.length, failedIds: failed, plaintextRemaining };
}
