import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { conflict } from "../errors";

/**
 * Application-level field encryption for RESTRICTED values (Phase 10 — docs/SECURITY.md#field-encryption).
 *
 *  · AES-256-GCM (authenticated): ciphertext + 96-bit random IV + 128-bit auth tag + key version.
 *  · Key: HR_FIELD_KEY (base64, 32 bytes) — deliberately SEPARATE from INTEGRATION_MASTER_KEY.
 *    HR_FIELD_KEY_VERSION (default 1) labels new ciphertexts; HR_FIELD_KEY_PREVIOUS decrypts the previous version
 *    during a rotation (`npm run hr:encrypt-iban -- --rotate --apply`).
 *  · Associated data binds a ciphertext to its field AND owner (e.g. "EmployeeBankAccount.iban:<employeeId>"), so an
 *    encrypted value copied onto another employee's row fails authentication instead of decrypting.
 * No homemade crypto: Node's OpenSSL AES-GCM only.
 */
export type Sealed = { ciphertext: string; iv: string; tag: string; keyVersion: number };
type Env = Record<string, string | undefined>;

const keyFrom = (raw: string | undefined) => {
  if (!raw) return null;
  const k = Buffer.from(raw.trim(), "base64");
  return k.length === 32 ? k : null;
};
export const fieldKeyVersion = (env: Env = process.env) => Number(env.HR_FIELD_KEY_VERSION ?? 1) || 1;
export const fieldCryptoAvailable = (env: Env = process.env) => Boolean(keyFrom(env.HR_FIELD_KEY));

function keyForVersion(version: number, env: Env) {
  const current = fieldKeyVersion(env);
  if (version === current) return keyFrom(env.HR_FIELD_KEY);
  if (version === current - 1) return keyFrom(env.HR_FIELD_KEY_PREVIOUS);
  return null;
}

export function seal(value: string, aad: string, env: Env = process.env): Sealed {
  const key = keyFrom(env.HR_FIELD_KEY);
  if (!key) throw conflict("FIELD_KEY_NOT_CONFIGURED");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), keyVersion: fieldKeyVersion(env) };
}

export function open(sealed: Sealed, aad: string, env: Env = process.env): string {
  const key = keyForVersion(sealed.keyVersion, env);
  if (!key) throw conflict(`FIELD_KEY_UNAVAILABLE:v${sealed.keyVersion}`);
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
  d.setAAD(Buffer.from(aad, "utf8"));
  d.setAuthTag(Buffer.from(sealed.tag, "base64"));
  try {
    return Buffer.concat([d.update(Buffer.from(sealed.ciphertext, "base64")), d.final()]).toString("utf8");
  } catch {
    // wrong key, tampered ciphertext / tag, or a value moved to another owner
    throw conflict("FIELD_DECRYPTION_FAILED");
  }
}

export const ibanAad = (employeeId: string) => `EmployeeBankAccount.iban:${employeeId}`;
