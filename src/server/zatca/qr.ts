/**
 * ZATCA QR payload: Tag-Length-Value, base64 ([SEC] §4.1, [GUIDE] §6).
 *   Tag: 1 byte · Length: 1 byte (byte length of the UTF-8 value) · Value: UTF-8 bytes; no separators; base64 at the end.
 * Tags 1–5 (seller name, VAT number, ISO-8601 timestamp, total with VAT, VAT total) are fully specified and are
 * verified against the official worked example in [GUIDE] §6.4.
 * Tags 6–9 (hash, ECDSA signature, public key, CA signature) belong to the cryptographic stamp. The two official
 * documents differ on tag 6 ([SEC]: 32 raw bytes; [GUIDE] example: the 44-character base64 text) — this module encodes
 * whatever bytes the caller passes and takes no position; the stamp is applied only by a verified implementation
 * (see docs/ZATCA.md — simplified-invoice stamping is NOT implemented in this build).
 */
export type QrField = { tag: number; value: string | Buffer };

export function encodeTlv(fields: QrField[]): string {
  const parts: Buffer[] = [];
  for (const f of fields) {
    if (!Number.isInteger(f.tag) || f.tag < 1 || f.tag > 255) throw new Error(`QR_TAG_INVALID:${f.tag}`);
    const v = typeof f.value === "string" ? Buffer.from(f.value, "utf8") : f.value;
    if (v.length > 255) throw new Error(`QR_VALUE_TOO_LONG:${f.tag}`); // one length byte
    parts.push(Buffer.from([f.tag, v.length]), v);
  }
  return Buffer.concat(parts).toString("base64");
}

export function decodeTlv(b64: string): { tag: number; value: Buffer }[] {
  const b = Buffer.from(b64, "base64");
  const out: { tag: number; value: Buffer }[] = [];
  for (let i = 0; i < b.length; ) {
    const tag = b[i];
    const len = b[i + 1];
    if (len === undefined || i + 2 + len > b.length) throw new Error("QR_TRUNCATED");
    out.push({ tag, value: b.subarray(i + 2, i + 2 + len) });
    i += 2 + len;
  }
  return out;
}

/** Tags 1–5 (the part every e-invoice QR carries). Amounts are passed as already-formatted decimal strings. */
export function basicQrFields(x: { sellerName: string; vatNumber: string; timestamp: string; totalWithVat: string; vatTotal: string }): QrField[] {
  return [
    { tag: 1, value: x.sellerName },
    { tag: 2, value: x.vatNumber },
    { tag: 3, value: x.timestamp },
    { tag: 4, value: x.totalWithVat },
    { tag: 5, value: x.vatTotal }
  ];
}

/** [SEC] §4.1: "Base64 format with up to 700 characters". */
export const QR_MAX_CHARS = 700;
