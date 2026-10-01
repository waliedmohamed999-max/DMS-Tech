import type { Prisma } from "@/generated/prisma/client";
import { can, type Ctx } from "../context";
import { clientWhere } from "../crm/scope";
import { projectWhere } from "../projects/access";

/**
 * Finance visibility — stricter than CRM / delivery and enforced in every finance query.
 *
 *   finance.records.all      every invoice, payment and expense (finance team, management)
 *   otherwise, invoices:     only with finance.invoices.view, and only
 *                              · sellers (crm.opportunities.view + crm.clients.view): invoices of clients in their CRM scope
 *                              · project viewers: invoices linked to projects in their project scope
 *   payments:                finance.payments.view + (records.all or allocations to visible invoices)
 *   expenses:                finance.expenses.view + records.all → all; otherwise only own (submitted or incurred)
 *
 * Cost, margin and cost rates are never derivable from these lists: they need
 * finance.profitability.view / finance.cost_rates.view on top (see costing.ts).
 * All fragments are AND-wrapped so callers' search OR clauses cannot widen them.
 */
export const financeAll = (ctx: Ctx) => can(ctx, "finance.records.all");

export async function invoiceWhere(ctx: Ctx): Promise<Prisma.InvoiceWhereInput> {
  if (!can(ctx, "finance.invoices.view")) return { id: "__none__" };
  if (financeAll(ctx)) return {};
  const ors: Prisma.InvoiceWhereInput[] = [];
  if (can(ctx, "crm.opportunities.view") && can(ctx, "crm.clients.view")) ors.push({ client: (await clientWhere(ctx)) as Prisma.ClientWhereInput });
  if (can(ctx, "projects.view")) ors.push({ projectId: { not: null }, project: (await projectWhere(ctx)) as Prisma.ProjectWhereInput });
  return ors.length ? { AND: [{ OR: ors }] } : { id: "__none__" };
}

export async function paymentWhere(ctx: Ctx): Promise<Prisma.PaymentWhereInput> {
  if (!can(ctx, "finance.payments.view")) return { id: "__none__" };
  if (financeAll(ctx)) return {};
  return { AND: [{ allocations: { some: { invoice: await invoiceWhere(ctx) } } }] };
}

export function expenseWhere(ctx: Ctx): Prisma.ExpenseWhereInput {
  if (can(ctx, "finance.expenses.view") && financeAll(ctx)) return {};
  return { AND: [{ OR: [{ submittedById: ctx.userId }, { userId: ctx.userId }] }] };
}

/** Merge a scope fragment with extra filters without overwriting AND (bug class seen in Phase 2/3). */
export function and<T extends { AND?: unknown }>(...parts: T[]): T {
  const all: unknown[] = [];
  const rest: Record<string, unknown> = {};
  for (const p of parts) {
    if (!p) continue;
    const { AND, ...others } = p as { AND?: unknown };
    if (AND) all.push(...(Array.isArray(AND) ? AND : [AND]));
    Object.assign(rest, others);
  }
  return { ...rest, ...(all.length ? { AND: all } : {}) } as T;
}

export const OPEN_INVOICE: Prisma.InvoiceWhereInput["status"] = { in: ["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE"] };
export const LIVE_INVOICE: Prisma.InvoiceWhereInput["status"] = { notIn: ["CANCELLED", "VOID"] };
/** billed = issued and not voided */
export const BILLED_INVOICE: Prisma.InvoiceWhereInput["status"] = { in: ["ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"] };
