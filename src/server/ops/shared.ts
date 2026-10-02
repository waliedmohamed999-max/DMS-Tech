import { z } from "zod";
import { Decimal } from "@/lib/commercial/calc";
import { prisma, type Tx } from "../db";
import type { Ctx } from "../context";

/** Shared helpers for the Phase 7 operations services (docs/OPERATIONS.md). */

export const D = (v: { toString(): string } | number | string | null | undefined) => new Decimal(v === null || v === undefined || v === "" ? 0 : v.toString());
export const r2 = (d: InstanceType<typeof Decimal>) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** decimal string from user input ("1,250.5" → "1250.5"); rejects negatives / garbage */
export const decIn = (scale = 2) =>
  z.preprocess(
    (v) => (v === null || v === undefined || v === "" ? "0" : String(v).replace(/[,\s]/g, "")),
    z.string().regex(scale === 3 ? /^\d{1,9}(\.\d{1,3})?$/ : /^\d{1,12}(\.\d{1,2})?$/, "AMOUNT_INVALID")
  );

export async function orgOf(db: Tx | typeof prisma, organizationId: string) {
  return db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true, currency: true, vatRate: true } });
}

/** line math, server-authoritative: subtotal = qty × price − discount; tax = subtotal × rate; total = subtotal + tax */
export function lineMath(i: { quantity: string; unitPrice: string; discountAmount?: string; taxRate: string }) {
  const gross = D(i.quantity).mul(D(i.unitPrice));
  const disc = r2(D(i.discountAmount ?? "0"));
  if (disc.gt(r2(gross))) return null;
  const subtotal = r2(gross.minus(disc));
  const tax = r2(subtotal.mul(D(i.taxRate)).div(100));
  return { subtotal, discount: disc, tax, total: subtotal.plus(tax) };
}

export const myDept = async (ctx: Ctx) => (await prisma.user.findUnique({ where: { id: ctx.userId }, select: { departmentId: true } }))?.departmentId ?? null;
