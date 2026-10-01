import { z } from "zod";

/** Shared normalisation + validation helpers for CRM input. */

export const blankToNull = (v: unknown) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim().replace(/[ \t]+/g, " ")) : v);

export const normEmail = (e?: string | null) => (e ? e.trim().toLowerCase() : null);

/**
 * Phone normalisation for matching (not display). Keeps digits only and converts
 * Saudi local forms to E.164 digits: 05XXXXXXXX / 5XXXXXXXX / 009665... → 9665XXXXXXXX.
 * Other countries keep their digits (00 prefix → international). Returns null if too short.
 */
export function normPhone(p?: string | null): string | null {
  if (!p) return null;
  let d = p.trim().replace(/^\+/, "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (/^05\d{8}$/.test(d)) d = "966" + d.slice(1);
  else if (/^5\d{8}$/.test(d)) d = "966" + d;
  return d.length >= 8 ? d : null;
}

/** Money as a decimal string with at most 2 fraction digits. No float math anywhere. */
export const money = z.preprocess((v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[,\s]/g, "").trim();
  return s === "" ? null : s;
}, z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "MONEY_FORMAT").nullable());

export const optText = (max: number) => z.preprocess(blankToNull, z.string().max(max).nullable().optional());
export const reqText = (min: number, max: number) => z.preprocess(blankToNull, z.string().min(min).max(max));
export const optEmail = z.preprocess(blankToNull, z.email("EMAIL_FORMAT").max(160).nullable().optional());
export const optPhone = z.preprocess(blankToNull, z.string().regex(/^\+?[\d\s()-]{7,20}$/, "PHONE_FORMAT").nullable().optional());
export const optDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.date().nullable().optional());
export const optId = z.preprocess(blankToNull, z.string().min(1).max(40).nullable().optional());
export const intPct = z.coerce.number().int().min(0).max(100);

/**
 * List filters come from the URL: a hand-edited or stale param must not 500 the page.
 * Invalid keys are dropped (falling back to their defaults) instead of throwing.
 */
export function parseListParams<T extends z.ZodType>(schema: T, raw: unknown): z.output<T> {
  const input: Record<string, unknown> = { ...((raw as Record<string, unknown> | null) ?? {}) };
  for (let i = 0; i < 20; i++) {
    const r = schema.safeParse(input);
    if (r.success) return r.data;
    const bad = new Set(r.error.issues.map((x) => x.path[0]).filter((k): k is string => typeof k === "string" && k in input));
    if (!bad.size) throw r.error;
    for (const k of bad) delete input[k];
  }
  return schema.parse({});
}
