import { prisma } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { forbidden } from "../errors";
import { ymd } from "../commercial/dates";
import { invoiceListWhere } from "./invoices";
import { paymentListWhere } from "./payments";
import { expenseListWhere } from "./expenses";
import { arAging } from "./insights";

/**
 * CSV exports (UTF-8 with BOM so Excel opens Arabic correctly). Each export re-uses the SAME
 * filtered + permission-scoped where clause as its list page — there is no unrestricted export.
 * Capped at 10 000 rows; formula-like cells are neutralised (CSV injection).
 */
export type ExportKind = "invoices" | "payments" | "expenses" | "aging";
const MAX = 10_000;

const cell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : v instanceof Date ? ymd(v) ?? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header: string[], rows: unknown[][]) => "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

export async function exportCsv(ctx: Ctx, kind: ExportKind, params: Record<string, string>) {
  const { page: _page, ...filters } = params;
  void _page;
  if (kind === "invoices") {
    requirePermission(ctx, "finance.invoices.view");
    const { where } = await invoiceListWhere(ctx, filters);
    const rows = await prisma.invoice.findMany({ where, orderBy: { createdAt: "desc" }, take: MAX, include: { client: { select: { displayName: true } }, project: { select: { number: true } } } });
    return csv(["number", "status", "source", "client", "project", "issue_date", "due_date", "currency", "subtotal", "discount", "vat", "total", "paid", "balance"], rows.map((i) => [i.number ?? "DRAFT", i.status, i.sourceType, i.client.displayName, i.project?.number, i.issueDate, i.dueDate, i.currency, i.subtotal.toFixed(2), i.discountTotal.toFixed(2), i.taxTotal.toFixed(2), i.total.toFixed(2), i.paidAmount.toFixed(2), i.balanceDue.toFixed(2)]));
  }
  if (kind === "payments") {
    requirePermission(ctx, "finance.payments.view");
    const { where } = await paymentListWhere(ctx, filters);
    const rows = await prisma.payment.findMany({ where, orderBy: { paymentDate: "desc" }, take: MAX, include: { client: { select: { displayName: true } }, allocations: { include: { invoice: { select: { number: true } } } } } });
    return csv(["number", "status", "date", "client", "method", "reference", "currency", "amount", "invoices"], rows.map((p) => [p.number, p.status, p.paymentDate, p.client.displayName, p.method, p.reference, p.currency, p.amount.toFixed(2), p.allocations.map((a) => `${a.invoice.number}:${a.amount.toFixed(2)}`).join(" ")]));
  }
  if (kind === "expenses") {
    if (!can(ctx, "finance.expenses.view") && !can(ctx, "finance.expenses.create")) throw forbidden("finance.expenses.view");
    const { where } = await expenseListWhere(ctx, filters);
    const rows = await prisma.expense.findMany({ where, orderBy: { date: "desc" }, take: MAX, include: { category: { select: { nameEn: true } }, vendor: { select: { name: true } }, project: { select: { number: true } }, submittedBy: { select: { name: true } } } });
    return csv(["number", "status", "date", "category", "vendor", "project", "submitted_by", "description", "currency", "amount", "vat", "total"], rows.map((e) => [e.number, e.status, e.date, e.category.nameEn, e.vendor?.name, e.project?.number, e.submittedBy.name, e.description, e.currency, e.amount.toFixed(2), e.taxAmount.toFixed(2), e.total.toFixed(2)]));
  }
  requirePermission(ctx, "finance.invoices.view");
  const a = await arAging(ctx, filters.client ? { clientId: filters.client } : {});
  return csv(["invoice", "client", "due_date", "days_past_due", "bucket", "currency", "balance"], a.invoices.map((i) => [i.number, i.client.displayName, i.dueDate, i.daysPastDue, i.bucket, a.currency, i.balanceDue.toFixed(2)]));
}
