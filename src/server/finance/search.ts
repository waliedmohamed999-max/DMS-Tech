import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { can, type Ctx } from "../context";
import type { SearchHit } from "../crm/search";
import { and, expenseWhere, invoiceWhere, paymentWhere } from "./access";

/** Invoices, payments, expenses, vendors — each group needs its own finance permission and scope. */
export async function financeSearch(ctx: Ctx, term: string): Promise<SearchHit[]> {
  const upper = term.toUpperCase();
  const out: SearchHit[] = [];
  if (can(ctx, "finance.invoices.view")) {
    const rows = await prisma.invoice.findMany({
      where: and<Prisma.InvoiceWhereInput>({ organizationId: ctx.organizationId }, await invoiceWhere(ctx), { AND: [{ OR: [{ number: { contains: upper } }, { client: { displayName: { contains: term, mode: "insensitive" } } }] }] }),
      take: 5, orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, client: { select: { displayName: true } } }
    });
    out.push(...rows.map((i) => ({ type: "invoice", id: i.id, title: `${i.number ?? "DRAFT"} · ${i.client.displayName}`, subtitle: i.status, href: `/app/finance/invoices/${i.id}` })));
  }
  if (can(ctx, "finance.payments.view")) {
    const rows = await prisma.payment.findMany({
      where: and<Prisma.PaymentWhereInput>({ organizationId: ctx.organizationId }, await paymentWhere(ctx), { AND: [{ OR: [{ number: { contains: upper } }, { reference: { contains: term, mode: "insensitive" } }] }] }),
      take: 4, orderBy: { paymentDate: "desc" }, select: { id: true, number: true, status: true, client: { select: { displayName: true } } }
    });
    out.push(...rows.map((p) => ({ type: "payment", id: p.id, title: `${p.number} · ${p.client.displayName}`, subtitle: p.status, href: `/app/finance/payments/${p.id}` })));
  }
  if (can(ctx, "finance.expenses.view") || can(ctx, "finance.expenses.create")) {
    const rows = await prisma.expense.findMany({
      where: and<Prisma.ExpenseWhereInput>({ organizationId: ctx.organizationId }, expenseWhere(ctx), { AND: [{ OR: [{ number: { contains: upper } }, { description: { contains: term, mode: "insensitive" } }] }] }),
      take: 4, orderBy: { date: "desc" }, select: { id: true, number: true, status: true, description: true }
    });
    out.push(...rows.map((e) => ({ type: "expense", id: e.id, title: `${e.number} · ${e.description.slice(0, 60)}`, subtitle: e.status, href: `/app/finance/expenses/${e.id}` })));
  }
  if (can(ctx, "finance.vendors.view")) {
    const rows = await prisma.vendor.findMany({ where: { organizationId: ctx.organizationId, OR: [{ number: { contains: upper } }, { name: { contains: term, mode: "insensitive" } }] }, take: 4, select: { id: true, number: true, name: true, status: true } });
    out.push(...rows.map((v) => ({ type: "vendor", id: v.id, title: `${v.number} · ${v.name}`, subtitle: v.status, href: `/app/finance/vendors?q=${encodeURIComponent(v.number)}` })));
  }
  return out;
}
