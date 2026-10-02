import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { prisma, type Tx } from "../db";
import { invalid } from "../errors";

/**
 * IntegrationSecretStore (docs/INTEGRATIONS.md#secrets).
 *
 * A connection never holds secret values — only references in `secretRefs`:
 *   env:VAR_NAME   value lives in the process environment / platform secret manager (dev + managed prod)
 *   enc:<id>       value stored AES-256-GCM encrypted in IntegrationSecret with INTEGRATION_MASTER_KEY
 *                  (32-byte key, base64). Without a master key the UI cannot store secrets — env refs only.
 * Secret values are resolved only inside adapters at call time; they are never returned by an API, rendered,
 * logged, written to audit snapshots, or included in executions / webhook metadata.
 */

const ENV_REF = /^env:([A-Z][A-Z0-9_]{1,80})$/;

export function masterKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const raw = env.INTEGRATION_MASTER_KEY?.trim();
  if (!raw) return null;
  const k = Buffer.from(raw, "base64");
  return k.length === 32 ? k : null;
}
export const secretStoreAvailable = () => Boolean(masterKey());

export function encrypt(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: c.getAuthTag().toString("base64") };
}
export function decrypt(row: { ciphertext: string; iv: string; authTag: string }, key: Buffer) {
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(row.iv, "base64"));
  d.setAuthTag(Buffer.from(row.authTag, "base64"));
  return Buffer.concat([d.update(Buffer.from(row.ciphertext, "base64")), d.final()]).toString("utf8");
}

/** Store (or reference) one secret; returns the reference to keep in secretRefs. */
export async function putSecret(tx: Tx, organizationId: string, connectionId: string, name: string, value: string) {
  const v = value.trim();
  const m = ENV_REF.exec(v);
  if (m) return `env:${m[1]}`;
  const key = masterKey();
  if (!key) throw invalid("SECRET_STORE_NOT_CONFIGURED");
  if (v.length < 4 || v.length > 4096) throw invalid("SECRET_INVALID");
  const enc = encrypt(v, key);
  const row = await tx.integrationSecret.upsert({
    where: { connectionId_name: { connectionId, name } },
    create: { organizationId, connectionId, name, ...enc },
    update: { ...enc, rotatedAt: new Date() }
  });
  return `enc:${row.id}`;
}

/** Resolve a reference to its value (server-side only, inside adapters). */
export async function resolveSecret(ref: string | undefined | null, env: Record<string, string | undefined> = process.env): Promise<string | null> {
  if (!ref) return null;
  const m = ENV_REF.exec(ref);
  if (m) return env[m[1]]?.trim() || null;
  if (ref.startsWith("enc:")) {
    const key = masterKey(env);
    if (!key) return null;
    const row = await prisma.integrationSecret.findUnique({ where: { id: ref.slice(4) } });
    if (!row) return null;
    try {
      return decrypt(row, key);
    } catch {
      return null;
    }
  }
  return null;
}

export async function resolveAll(refs: Record<string, string>) {
  const out: Record<string, string | null> = {};
  for (const [k, r] of Object.entries(refs ?? {})) out[k] = await resolveSecret(r);
  return out;
}

/** Redacted state for the UI: where a secret comes from — never its value. */
export async function secretStates(refs: Record<string, string>, names: string[]) {
  const out: Record<string, "env_set" | "env_missing" | "stored" | "missing"> = {};
  for (const n of names) {
    const r = refs?.[n];
    if (!r) out[n] = "missing";
    else if (r.startsWith("env:")) out[n] = (await resolveSecret(r)) ? "env_set" : "env_missing";
    else out[n] = (await resolveSecret(r)) ? "stored" : "missing";
  }
  return out;
}

/** Strip anything secret-looking from provider errors before they are stored or shown. */
export function sanitizeError(text: unknown, secrets: (string | null | undefined)[] = []) {
  let s = typeof text === "string" ? text : text instanceof Error ? text.message : JSON.stringify(text ?? "");
  for (const v of secrets) if (v && v.length >= 4) s = s.split(v).join("[redacted]");
  s = s
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1[redacted]")
    .replace(/((?:access|refresh|id)_token|token|secret|password|api[_-]?key|signature|authorization)(["']?\s*[:=]\s*["']?)[^"'&\s,}]{4,}/gi, "$1$2[redacted]")
    .replace(/\bEAA[A-Za-z0-9]{20,}\b/g, "[redacted]")
    .replace(/\bya29\.[A-Za-z0-9._-]+/g, "[redacted]");
  return s.slice(0, 500);
}
