import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { requirePermission, type Ctx } from "../context";
import { conflict, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { optText, parseListParams, reqText, optDate } from "../crm/normalize";
import { nextYearlyNumber } from "../crm/sequence";
import { todayIn, ymd } from "../commercial/dates";
import { Decimal } from "@/lib/commercial/calc";
import { and, invoiceWhere, paymentWhere } from "./access";
import { orgFinance, recomputeInvoiceTx } from "./invoices";

/**
 * Payments — docs/FINANCE.md.
 *
 * Policy (explicit, Phase 5):
 *   · a payment belongs to one client and is FULLY allocated to that client's open invoices in the
 *     same currency (Σ allocations = amount); there is no unallocated credit / overpayment;
 *   · each allocation ≤ the invoice's remaining balance (checked under row locks, and the
 *     Invoice_amounts_valid CHECK refuses paid > total);
 *   · a form resubmission with the same idempotency key returns the original payment;
 *   · payments are never edited or deleted (DB trigger) — a wrong payment is REVERSED with a reason,
 *     and every affected invoice's paid / balance / status is recomputed from the remaining
 *     (non-reversed) allocations in the same transaction.
 */

const decStr = z.preprocess((v) => (v === null || v === undefined ? "" : String(v).replace(/[,\s]/g, "")), z.string().regex(/^\d+(\.\d{1,2})?$/, "AMOUNT_INVALID"));
const recordSchema = z.object({
  clientId: z.string().min(1),
  amount: decStr,
  currency: z.string().trim().length(3).toUpperCase().default("SAR"),
  paymentDate: z.coerce.date(),
  method: z.enum(["BANK_TRANSFER", "CASH", "CARD", "PAYMENT_GATEWAY", "OTHER"]),
  reference: optText(120),
  notes: optText(2000),
  idempotencyKey: z.string().trim().min(8).max(80).optional(),
  allocations: z.array(z.object({ invoiceId: z.string().min(1), amount: decStr })).min(1).max(50)
});

export async function recordPayment(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "finance.payments.create");
  const input = recordSchema.parse(raw);
  const amount = new Decimal(input.amount);
  if (amount.lte(0)) throw invalid("AMOUNT_INVALID");
  const ids = input.allocations.map((a) => a.invoiceId);
  if (new Set(ids).size !== ids.length) throw invalid("DUPLICATE_ALLOCATION");
  const allocSum = input.allocations.reduce((s, a) => s.plus(a.amount), new Decimal(0));
  if (input.allocations.some((a) => new Decimal(a.amount).lte(0))) throw invalid("ALLOCATION_INVALID");
  if (!allocSum.eq(amount)) throw invalid("ALLOCATION_MUST_EQUAL_AMOUNT");

  if (input.idempotencyKey) {
    const prior = await prisma.payment.findFirst({ where: { organizationId: ctx.organizationId, idempotencyKey: input.idempotencyKey } });
    if (prior) return { id: prior.id, number: prior.number, duplicate: true };
  }
  try {
    return await unitOfWork(ctx, async (tx, uow) => {
      const org = await orgFinance(tx, ctx.organizationId);
      const today = todayIn(org.timezone);
      if (input.paymentDate > today) throw invalid("PAYMENT_DATE_IN_FUTURE");
      const client = await tx.client.findFirst({ where: { id: input.clientId, organizationId: ctx.organizationId } });
      if (!client) throw invalid("UNKNOWN_CLIENT");
      // lock invoices in a stable order (no deadlocks between concurrent payments)
      const scope = await invoiceWhere(ctx);
      for (const id of [...ids].sort()) await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
      const invoices = await tx.invoice.findMany({ where: and<Prisma.InvoiceWhereInput>({ id: { in: ids }, organizationId: ctx.organizationId }, scope) });
      if (invoices.length !== ids.length) throw notFound("Invoice");
      for (const a of input.allocations) {
        const inv = invoices.find((x) => x.id === a.invoiceId)!;
        if (inv.clientId !== client.id) throw invalid(`INVOICE_NOT_OF_CLIENT:${inv.number}`);
        if (inv.currency !== input.currency) throw invalid(`CURRENCY_MISMATCH:${inv.number}`);
        if (!["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE"].includes(inv.status)) throw conflict(`INVOICE_NOT_PAYABLE:${inv.number ?? inv.status}`);
        if (new Decimal(a.amount).gt(inv.balanceDue.toString())) throw conflict(`ALLOCATION_EXCEEDS_BALANCE:${inv.number}`);
      }
      const number = await nextYearlyNumber(tx, ctx.organizationId, "PAY", input.paymentDate.getUTCFullYear());
      const p = await tx.payment.create({
        data: {
          organizationId: ctx.organizationId, number, clientId: client.id, amount: amount.toFixed(2), currency: input.currency, paymentDate: input.paymentDate,
          method: input.method, reference: input.reference ?? null, notes: input.notes ?? null, idempotencyKey: input.idempotencyKey ?? null, createdById: ctx.userId || null
        }
      });
      for (const a of input.allocations) await tx.paymentAllocation.create({ data: { paymentId: p.id, invoiceId: a.invoiceId, amount: new Decimal(a.amount).toFixed(2) } });
      const results: { id: string; number: string | null; status: string; balance: string }[] = [];
      for (const a of input.allocations) {
        const after = await recomputeInvoiceTx(tx, uow, a.invoiceId, today);
        results.push({ id: after.id, number: after.number, status: after.status, balance: after.balanceDue.toFixed(2) });
      }
      await uow.audit({ action: "payment.created", entityType: "Payment", entityId: p.id, after: { number, clientId: client.id, amount: amount.toFixed(2), currency: input.currency, method: input.method, paymentDate: ymd(input.paymentDate), reference: input.reference, invoiceIds: ids } });
      await uow.audit({ action: "payment.allocated", entityType: "Payment", entityId: p.id, after: { invoiceIds: ids, allocations: input.allocations, results } });
      uow.emit({
        type: "payment.recorded", entityType: "Payment", entityId: p.id,
        payload: { paymentId: p.id, number, clientId: client.id, clientName: client.displayName, amount: amount.toFixed(2), currency: input.currency, invoiceIds: ids, owners: invoices.map((i) => i.createdById).filter(Boolean).join(",") },
        activity: { entityLabel: `${number} · ${client.displayName}`, href: `/app/finance/payments/${p.id}`, visibility: "finance.payments.view" }
      });
      return { id: p.id, number, duplicate: false, invoices: results };
    });
  } catch (e) {
    // the same idempotency key raced in from a second request → return the winner
    if ((e as { code?: string }).code === "P2002" && input.idempotencyKey) {
      const prior = await prisma.payment.findFirst({ where: { organizationId: ctx.organizationId, idempotencyKey: input.idempotencyKey } });
      if (prior) return { id: prior.id, number: prior.number, duplicate: true };
    }
    throw e;
  }
}

const reverseSchema = z.object({ reason: reqText(5, 1000) });

export async function reversePayment(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "finance.payments.reverse");
  const { reason } = reverseSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    const p = await tx.payment.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { allocations: true } });
    if (!p) throw notFound("Payment");
    if (p.status !== "RECORDED") throw conflict("PAYMENT_ALREADY_REVERSED");
    const invIds = [...new Set(p.allocations.map((a) => a.invoiceId))].sort();
    for (const iid of invIds) await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${iid} FOR UPDATE`;
    const res = await tx.payment.updateMany({ where: { id, status: "RECORDED" }, data: { status: "REVERSED", reversedAt: new Date(), reversedById: ctx.userId || null, reversalReason: reason } });
    if (res.count !== 1) throw conflict("PAYMENT_ALREADY_REVERSED");
    const org = await orgFinance(tx, ctx.organizationId);
    const today = todayIn(org.timezone);
    const results = [];
    for (const iid of invIds) {
      const after = await recomputeInvoiceTx(tx, uow, iid, today);
      results.push({ id: iid, number: after.number, status: after.status, balance: after.balanceDue.toFixed(2) });
    }
    await uow.audit({ action: "payment.reversed", entityType: "Payment", entityId: id, before: { status: "RECORDED", amount: p.amount.toFixed(2) }, after: { status: "REVERSED", reason, invoiceIds: invIds, results } });
    uow.emit({ type: "payment.reversed", entityType: "Payment", entityId: id, payload: { paymentId: id, number: p.number, amount: p.amount.toFixed(2), reason, invoiceIds: invIds }, activity: { entityLabel: p.number, href: `/app/finance/payments/${id}`, visibility: "finance.payments.view" } });
    return { id, invoices: results };
  });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const PAYMENTS_PAGE_SIZE = 25;
const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  client: z.string().max(40).optional(),
  method: z.enum(["BANK_TRANSFER", "CASH", "CARD", "PAYMENT_GATEWAY", "OTHER"]).optional(),
  status: z.enum(["RECORDED", "REVERSED"]).optional(),
  from: optDate,
  to: optDate,
  page: z.coerce.number().int().min(1).default(1)
});

export async function paymentListWhere(ctx: Ctx, raw: unknown) {
  const f = parseListParams(listSchema, raw ?? {});
  const filters: Prisma.PaymentWhereInput[] = [];
  if (f.q) filters.push({ OR: [{ number: { contains: f.q, mode: "insensitive" } }, { reference: { contains: f.q, mode: "insensitive" } }, { client: { displayName: { contains: f.q, mode: "insensitive" } } }] });
  if (f.client) filters.push({ clientId: f.client });
  if (f.method) filters.push({ method: f.method });
  if (f.status) filters.push({ status: f.status });
  if (f.from || f.to) filters.push({ paymentDate: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } });
  return { f, where: and<Prisma.PaymentWhereInput>({ organizationId: ctx.organizationId }, await paymentWhere(ctx), { AND: filters }) };
}

export async function listPayments(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "finance.payments.view");
  const { f, where } = await paymentListWhere(ctx, raw);
  const [items, total, sum] = await Promise.all([
    prisma.payment.findMany({ where, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }], skip: (f.page - 1) * PAYMENTS_PAGE_SIZE, take: PAYMENTS_PAGE_SIZE, include: { client: { select: { id: true, displayName: true } }, allocations: { include: { invoice: { select: { id: true, number: true } } } } } }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({ where: and<Prisma.PaymentWhereInput>(where, { AND: [{ status: "RECORDED" }] }), _sum: { amount: true } })
  ]);
  return { items, total, page: f.page, pageSize: PAYMENTS_PAGE_SIZE, filters: f, sum: sum._sum.amount?.toFixed(2) ?? "0.00" };
}

export async function getPayment(ctx: Ctx, id: string) {
  requirePermission(ctx, "finance.payments.view");
  const p = await prisma.payment.findFirst({
    where: and<Prisma.PaymentWhereInput>({ id, organizationId: ctx.organizationId }, await paymentWhere(ctx)),
    include: { client: { select: { id: true, displayName: true } }, createdBy: { select: { name: true, nameAr: true } }, allocations: { include: { invoice: { select: { id: true, number: true, total: true, balanceDue: true, status: true, currency: true } } } } }
  });
  if (!p) throw notFound("Payment");
  const reverser = p.reversedById ? await prisma.user.findUnique({ where: { id: p.reversedById }, select: { name: true, nameAr: true } }) : null;
  return { payment: p, reverser };
}

/** Clients that currently have open invoices (payment form picker). */
export async function clientsWithOpenInvoices(ctx: Ctx) {
  requirePermission(ctx, "finance.payments.create");
  const rows = await prisma.invoice.groupBy({
    by: ["clientId"],
    where: and<Prisma.InvoiceWhereInput>({ organizationId: ctx.organizationId, status: { in: ["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE"] }, balanceDue: { gt: 0 } }, await invoiceWhere(ctx)),
    _sum: { balanceDue: true }
  });
  const clients = rows.length ? await prisma.client.findMany({ where: { id: { in: rows.map((r) => r.clientId) } }, select: { id: true, displayName: true } }) : [];
  return clients.map((c) => ({ id: c.id, label: c.displayName, balance: rows.find((r) => r.clientId === c.id)?._sum.balanceDue?.toFixed(2) ?? "0.00" })).sort((a, b) => a.label.localeCompare(b.label));
}
