import DecimalBase from "decimal.js";

/**
 * Commercial arithmetic — the single implementation used by the server (authoritative,
 * persisted) and by the quotation builder (live preview only; the server never accepts
 * totals from the browser). Decimal arithmetic, ROUND_HALF_UP to 2 decimals per line.
 *
 * Per line:
 *   gross    = round2(quantity × unitPrice)
 *   discount = PERCENT → round2(gross × value / 100) · FIXED → value · NONE → 0
 *   net      = gross − discount                       (line subtotal before tax)
 *   tax      = round2(net × rate / 100)              (rate = org VAT for STANDARD, else 0)
 *   total    = net + tax
 * Document: subtotal = Σ gross · discountTotal = Σ discount · taxTotal = Σ tax ·
 *           total = subtotal − discountTotal + taxTotal (= Σ line totals)
 */

export const Decimal = DecimalBase.clone({ precision: 40, rounding: DecimalBase.ROUND_HALF_UP });
export type Dec = InstanceType<typeof Decimal>;

export type DiscountKind = "NONE" | "PERCENT" | "FIXED";
export type TaxKind = "STANDARD" | "ZERO_RATED" | "EXEMPT";

export type LineInput = {
  quantity: string | number;
  unitPrice: string | number;
  discountType: DiscountKind;
  discountValue?: string | number | null;
  taxBehavior: TaxKind;
};

export type LineResult = { gross: string; discount: string; net: string; taxRate: string; tax: string; total: string };
export type Totals = { lines: LineResult[]; subtotal: string; discountTotal: string; taxTotal: string; total: string; discountPercent: string; maxLineDiscountPercent: string };

export class CalcError extends Error {
  constructor(public code: "QTY_INVALID" | "PRICE_INVALID" | "DISCOUNT_INVALID" | "DISCOUNT_PERCENT_OVER_100" | "DISCOUNT_EXCEEDS_LINE" | "VAT_INVALID", public line?: number) {
    super(code);
  }
}

const dec = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  try {
    const d = new Decimal(typeof v === "string" ? v.trim().replace(/,/g, "") : v);
    return d.isFinite() ? d : new Decimal(NaN);
  } catch {
    return new Decimal(NaN);
  }
};
const r2 = (d: Dec) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const s2 = (d: Dec) => r2(d).toFixed(2);

export function taxRateFor(kind: TaxKind, vatRate: string | number): Dec {
  const rate = dec(vatRate);
  if (rate.isNaN() || rate.lt(0) || rate.gt(100)) throw new CalcError("VAT_INVALID");
  return kind === "STANDARD" ? rate : new Decimal(0);
}

export function calcLine(i: LineInput, vatRate: string | number, index = 0): LineResult {
  const qty = dec(i.quantity);
  const price = dec(i.unitPrice);
  if (qty.isNaN() || qty.lte(0) || qty.decimalPlaces() > 3 || qty.gt(1_000_000)) throw new CalcError("QTY_INVALID", index);
  if (price.isNaN() || price.lt(0) || price.decimalPlaces() > 2 || price.gt(1e11)) throw new CalcError("PRICE_INVALID", index);
  const gross = r2(qty.mul(price));
  const value = dec(i.discountValue);
  if (i.discountType !== "NONE" && (value.isNaN() || value.lt(0) || value.decimalPlaces() > 2)) throw new CalcError("DISCOUNT_INVALID", index);
  let discount = new Decimal(0);
  if (i.discountType === "PERCENT") {
    if (value.gt(100)) throw new CalcError("DISCOUNT_PERCENT_OVER_100", index);
    discount = r2(gross.mul(value).div(100));
  } else if (i.discountType === "FIXED") {
    if (value.gt(gross)) throw new CalcError("DISCOUNT_EXCEEDS_LINE", index);
    discount = r2(value);
  }
  const net = gross.minus(discount);
  const rate = taxRateFor(i.taxBehavior, vatRate);
  const tax = r2(net.mul(rate).div(100));
  return { gross: s2(gross), discount: s2(discount), net: s2(net), taxRate: rate.toFixed(2), tax: s2(tax), total: s2(net.plus(tax)) };
}

export function calcTotals(lines: LineInput[], vatRate: string | number): Totals {
  const results = lines.map((l, i) => calcLine(l, vatRate, i));
  const sum = (k: keyof LineResult) => results.reduce((a, r) => a.plus(r[k]), new Decimal(0));
  const subtotal = sum("gross");
  const discountTotal = sum("discount");
  const taxTotal = sum("tax");
  const pct = (d: Dec, base: Dec) => (base.gt(0) ? d.div(base).mul(100) : new Decimal(0));
  const maxLine = results.reduce((m, r) => Decimal.max(m, pct(new Decimal(r.discount), new Decimal(r.gross))), new Decimal(0));
  return {
    lines: results,
    subtotal: s2(subtotal),
    discountTotal: s2(discountTotal),
    taxTotal: s2(taxTotal),
    total: s2(subtotal.minus(discountTotal).plus(taxTotal)),
    discountPercent: pct(discountTotal, subtotal).toDecimalPlaces(2).toFixed(2),
    maxLineDiscountPercent: maxLine.toDecimalPlaces(2).toFixed(2)
  };
}

/** Exact money formatting from a decimal string (no float conversion). */
export function formatMoney(v: string | number, locale: string, currency = "SAR"): string {
  const d = dec(v);
  const [int, frac] = r2(d.abs()).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = d.isNegative() && !d.isZero() ? "-" : "";
  const sym = currency === "SAR" ? (locale === "ar" ? "ر.س" : "SAR") : currency;
  return locale === "ar" ? `${sign}${grouped}.${frac} ${sym}` : `${sym} ${sign}${grouped}.${frac}`;
}
