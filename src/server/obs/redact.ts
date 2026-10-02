/**
 * Central redaction (docs/OBSERVABILITY.md#redaction). Used by the structured logger, the error reporter and
 * (for the SECRET subset) by audit / event sanitization.
 *
 *  SECRET  — credentials of any kind: never stored in audit, events, logs or error reports.
 *  PRIVATE — personal / payroll data: never written to logs or error reports (audit keeps its own, permission-gated history).
 *  CONTENT — document / message bodies and binary payloads: replaced by a size marker in logs.
 */
export const SECRET_KEYS = [
  "password", "passwordhash", "newpassword", "currentpassword", "token", "accesstoken", "refreshtoken", "idtoken", "sessiontoken", "secret",
  "signingsecret", "appsecret", "clientsecret", "secretaccesskey", "accesskeyid", "apikey", "verifytoken", "authorization", "cookie",
  "set-cookie", "x-hub-signature-256", "x-dms-signature", "ciphertext", "authtag", "masterkey", "integration_master_key", "dsn"
];
export const PRIVATE_KEYS = [
  "iban", "ibanencrypted", "ibanlast4", "accountnumber", "bankaccount", "salary", "basesalary", "basicsalary", "housingallowance",
  "transportallowance", "allowances", "deductions", "grosspay", "netpay", "gross", "net", "compensation", "nationalid", "passportnumber",
  "iqamanumber", "dateofbirth"
];
export const CONTENT_KEYS = ["data", "content", "filecontent", "body", "rawbody", "buffer", "file"];

const SECRET = new Set(SECRET_KEYS);
const PRIVATE = new Set(PRIVATE_KEYS);
const CONTENT = new Set(CONTENT_KEYS);
const norm = (k: string) => k.toLowerCase().replace(/_/g, "");

/** Strings that look like credentials even under an innocent key. */
const VALUE_PATTERNS: [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]"],
  [/\b(EAA[A-Za-z0-9]{10,}|ya29\.[A-Za-z0-9._-]{10,}|sk_(live|test)_[A-Za-z0-9]{10,}|AKIA[A-Z0-9]{12,})/g, "[redacted-token]"],
  [/\b(access_token|refresh_token|token|password|secret|signature)=([^&\s"']+)/gi, "$1=[redacted]"],
  [/\bSA\d{2}[0-9A-Z]{18,22}\b/g, "[redacted-iban]"],
  [/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgres://[redacted]"]
];

export function redactString(s: string) {
  let out = s;
  for (const [re, rep] of VALUE_PATTERNS) out = out.replace(re, rep);
  return out;
}

type Mode = "log" | "audit";

/** Deep copy with sensitive keys replaced. "audit" only removes SECRET keys (history keeps business values). */
export function redact(value: unknown, mode: Mode = "log", depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null) return value;
  if (typeof value === "string") return mode === "log" ? redactString(value) : value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return value;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return `[binary ${(value as Uint8Array).length} bytes]`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: mode === "log" ? redactString(value.message) : value.message };
  if (seen.has(value)) return "[circular]";
  if (depth > 8) return "[depth]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => redact(v, mode, depth + 1, seen));
  // Decimal-like (Prisma) → string
  if (typeof (value as { toFixed?: unknown }).toFixed === "function" && typeof (value as { d?: unknown }).d !== "undefined") return String(value);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = norm(k);
    if (SECRET.has(n)) out[k] = "[redacted]";
    else if (mode === "log" && PRIVATE.has(n)) out[k] = "[private]";
    else if (mode === "log" && CONTENT.has(n) && (typeof v === "string" ? v.length > 200 : typeof v === "object" && v !== null && (Buffer.isBuffer(v) || v instanceof Uint8Array))) out[k] = typeof v === "string" ? `[text ${v.length} chars]` : `[binary ${(v as Uint8Array).length} bytes]`;
    else out[k] = redact(v, mode, depth + 1, seen);
  }
  return out;
}
