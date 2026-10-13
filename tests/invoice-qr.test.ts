import { describe, expect, it } from "vitest";
import { encodeQr } from "@/server/pdf/qrcode";
import { zatcaQr } from "@/server/pdf/invoice";
import { decodeTlv } from "@/server/zatca/qr";

/** Finder pattern at (x, y) = top-left corner of its 7×7 square. */
const finderAt = (m: boolean[][], x: number, y: number) =>
  [0, 1, 2, 3, 4, 5, 6].every((dy) => [0, 1, 2, 3, 4, 5, 6].every((dx) => m[y + dy][x + dx] === (Math.max(Math.abs(dx - 3), Math.abs(dy - 3)) !== 2)));

describe("invoice QR", () => {
  it("1. the ZATCA payload carries seller, VAT no., time of issue, total with VAT and VAT (TLV tags 1–5)", () => {
    const b64 = zatcaQr({ legalName: "DMS Tech", vatNumber: "310123456700003" }, { issuedAt: new Date("2026-10-14T09:30:15.123Z"), total: { toFixed: () => "36627.50" }, taxTotal: { toFixed: () => "4777.50" } });
    expect(decodeTlv(b64).map((f) => [f.tag, f.value.toString("utf8")])).toEqual([
      [1, "DMS Tech"],
      [2, "310123456700003"],
      [3, "2026-10-14T09:30:15Z"],
      [4, "36627.50"],
      [5, "4777.50"]
    ]);
  });

  it("2. the encoder picks the smallest version and draws the three finder patterns", () => {
    for (const [text, size] of [
      ["A", 21],
      ["https://dmstech.sa", 25],
      ["x".repeat(150), 49]
    ] as const) {
      const m = encodeQr(text);
      expect(m.length).toBe(size);
      expect(m.every((row) => row.length === size)).toBe(true);
      expect(finderAt(m, 0, 0) && finderAt(m, size - 7, 0) && finderAt(m, 0, size - 7)).toBe(true);
      expect(m[size - 8][8]).toBe(true); // the always-dark module
    }
  });

  it("3. it is deterministic and refuses data beyond version 20", () => {
    expect(encodeQr("ZATCA")).toEqual(encodeQr("ZATCA"));
    expect(() => encodeQr("x".repeat(700))).toThrow("QR_DATA_TOO_LONG");
  });
});
