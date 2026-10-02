import { createHash } from "node:crypto";
import { z } from "zod";
import type { InvoiceStatus, Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork, type Uow } from "../events/bus";
import { optDate, optId, optText, parseListParams, reqText } from "../crm/normalize";
import { nextYearlyNumber } from "../crm/sequence";
import { addDays, todayIn, ymd } from "../commercial/dates";
import { CalcError, Decimal, calcTotals, type LineInput } from "@/lib/commercial/calc";
import { and, financeAll, invoiceWhere, OPEN_INVOICE } from "./access";

/**
 * Invoices — docs/FINANCE.md.
 *
 * Manual lifecycle (server-enforced):
 *   DRAFT ──issue──► ISSUED ──mark sent──► SENT
 *   DRAFT ──cancel (reason)──► CANCELLED          (a draft that is never issued)
 *   ISSUED / SENT / OVERDUE (nothing paid) ──void (reason)──► VOID   (+ optional replacement draft)
 * Payment-driven states are DERIVED (deriveStatus) from allocations and dates — never set by hand:
 *   PARTIALLY_PAID · PAID · OVERDUE (due date passed with a balance; set by payments and the sweep)
 *
 * Content (client, lines, amounts, dates, terms) is editable only in DRAFT. Issuing assigns the
 * number (INV-YYYY-NNNNNN, Sequence), snapshots seller/buyer/payment instructions, hashes the
 * content and stores the PDF bytes (CommercialDocument INVOICE_PDF). The database freezes all of
 * it from then on (Invoice_freeze / InvoiceItem_freeze triggers).
 */

export const MANUAL_ACTIONS: Record<string, readonly InvoiceStatus[]> = {
  issue: ["DRAFT"],
  edit: ["DRAFT"],
  cancel: ["DRAFT"],
  send: ["ISSUED", "OVERDUE", "PARTIALLY_PAID"],
  void: ["ISSUED", "SENT", "OVERDUE"]
};

const decStr = z.preprocess((v) => (v === null || v === undefined ? "" : String(v).replace(/[,\s]/g, "")), z.string().max(20));
export const itemSchema = z.object({
  description: reqText(1, 500),
  serviceId: optId,
  projectId: optId,
  unit: optText(30),
  quantity: decStr,
  unitPrice: decStr,
  discountType: z.enum(["NONE", "PERCENT", "FIXED"]).default("NONE"),
  discountValue: decStr.default("0"),
  taxBehavior: z.enum(["STANDARD", "ZERO_RATED", "EXEMPT"]).default("STANDARD")
});
export type InvoiceItemInput = z.input<typeof itemSchema>;

const draftSchema = z.object({
  clientId: z.string().min(1),
  contactId: optId,
  language: z.enum(["ar", "en"]).default("ar"),
  currency: z.string().trim().length(3).toUpperCase().default("SAR"),
  issueDate: optDate,
  dueDate: optDate,
  paymentTerms: optText(2000),
  notes: optText(4000),
  items: z.array(itemSchema).max(200)
});

// ---------------------------------------------------------------------------
// Calculation (server-authoritative)
// ---------------------------------------------------------------------------

export async function buildLines(db: Tx | typeof prisma, ctx: Ctx, items: z.output<typeof itemSchema>[], vatRate: string) {
  const serviceIds = [...new Set(items.map((i) => i.serviceId).filter(Boolean))] as string[];
  const services = serviceIds.length ? await db.service.findMany({ where: { organizationId: ctx.organizationId, id: { in: serviceIds } }, select: { id: true } }) : [];
  if (services.length !== serviceIds.length) throw invalid("UNKNOWN_SERVICE");
  let totals;
  try {
    totals = calcTotals(items.map((i): LineInput => ({ quantity: i.quantity, unitPrice: i.unitPrice, discountType: i.discountType, discountValue: i.discountValue, taxBehavior: i.taxBehavior })), vatRate);
  } catch (e) {
    if (e instanceof CalcError) throw invalid(e.code, { line: e.line });
    throw e;
  }
  const rows = items.map((i, n) => {
    const r = totals.lines[n];
    return {
      sortOrder: n,
      description: i.description,
      serviceId: i.serviceId ?? null,
      projectId: i.projectId ?? null,
      unit: i.unit ?? null,
      quantity: new Decimal(i.quantity).toFixed(3),
      unitPrice: new Decimal(i.unitPrice).toFixed(2),
      discountType: i.discountType,
      discountValue: i.discountType === "NONE" ? "0.00" : new Decimal(i.discountValue || 0).toFixed(2),
      grossAmount: r.gross,
      discountAmount: r.discount,
      subtotal: r.net,
      taxBehavior: i.taxBehavior,
      taxRate: r.taxRate,
      taxAmount: r.tax,
      total: r.total
    };
  });
  return { rows, totals };
}

/** Payment-driven status. `paid` and `total` are decimal strings; dates are UTC-midnight dates. */
export function deriveStatus(i: { total: string; paid: string; sentAt: Date | null; dueDate: Date; today: Date }): InvoiceStatus {
  const total = new Decimal(i.total);
  const paid = new Decimal(i.paid);
  if (total.gt(0) && paid.gte(total)) return "PAID";
  if (i.dueDate < i.today) return "OVERDUE";
  if (paid.gt(0)) return "PARTIALLY_PAID";
  return i.sentAt ? "SENT" : "ISSUED";
}

export async function orgFinance(db: Tx | typeof prisma, organizationId: string) {
  return db.organization.findUniqueOrThrow({ where: { id: organizationId } });
}

/**
 * Recompute paidAmount / balance / status of an issued invoice from its allocations
 * (non-reversed payments). Caller must hold the invoice row lock. Emits invoice.paid /
 * invoice.partially_paid on transitions (invoice.overdue is emitted once by the finance sweep).
 */
export async function recomputeInvoiceTx(tx: Tx, uow: Uow | null, invoiceId: string, today: Date) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (inv.status === "DRAFT" || inv.status === "CANCELLED" || inv.status === "VOID") return inv;
  const agg = await tx.paymentAllocation.aggregate({ where: { invoiceId, payment: { status: "RECORDED" } }, _sum: { amount: true } });
  const paid = new Decimal((agg._sum.amount ?? 0).toString());
  if (paid.gt(inv.total.toString())) throw conflict("INVOICE_OVERPAID");
  const status = deriveStatus({ total: inv.total.toFixed(2), paid: paid.toFixed(2), sentAt: inv.sentAt, dueDate: inv.dueDate, today });
  const balance = new Decimal(inv.total.toString()).minus(paid);
  const updated = await tx.invoice.update({
    where: { id: invoiceId },
    data: { paidAmount: paid.toFixed(2), balanceDue: balance.toFixed(2), status, paidAt: status === "PAID" ? (inv.paidAt ?? new Date()) : null }
  });
  if (uow && status !== inv.status) {
    const payload = { invoiceId, number: inv.number, clientId: inv.clientId, total: inv.total.toFixed(2), paid: paid.toFixed(2), balance: balance.toFixed(2), currency: inv.currency, ownerId: inv.createdById, from: inv.status, to: status };
    const activity = { entityLabel: inv.number ?? "", href: `/app/finance/invoices/${invoiceId}`, visibility: "finance.invoices.view" as const };
    if (status === "PAID") uow.emit({ type: "invoice.paid", entityType: "Invoice", entityId: invoiceId, payload, activity });
    else if (status === "PARTIALLY_PAID") uow.emit({ type: "invoice.partially_paid", entityType: "Invoice", entityId: invoiceId, payload });
    await uow.audit({ action: "invoice.status_changed", entityType: "Invoice", entityId: invoiceId, before: { status: inv.status, paidAmount: inv.paidAmount.toFixed(2) }, after: { status, paidAmount: paid.toFixed(2), balanceDue: balance.toFixed(2) } });
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Draft create / update
// ---------------------------------------------------------------------------

export type DraftRefs = {
  sourceType: "CONTRACT" | "CONTRACT_MILESTONE" | "QUOTATION" | "PROJECT" | "TIME" | "MANUAL";
  quotationId?: string | null;
  quotationVersionId?: string | null;
  contractId?: string | null;
  projectId?: string | null;
  contractMilestoneId?: string | null;
  replacesInvoiceId?: string | null;
};

/** Insert a DRAFT (inside the caller's unit of work). Returns the invoice and created line ids in order. */
export async function insertDraftTx(tx: Tx, uow: Uow, ctx: Ctx, raw: z.input<typeof draftSchema>, refs: DraftRefs) {
  const input = draftSchema.parse(raw);
  const org = await orgFinance(tx, ctx.organizationId);
  const client = await tx.client.findFirst({ where: { id: input.clientId, organizationId: ctx.organizationId, deletedAt: null } });
  if (!client) throw invalid("UNKNOWN_CLIENT");
  if (input.contactId && !(await tx.contact.findFirst({ where: { id: input.contactId, clientId: client.id } }))) throw invalid("CONTACT_NOT_OF_CLIENT");
  const today = todayIn(org.timezone);
  const issueDate = input.issueDate ?? today;
  const dueDate = input.dueDate ?? addDays(issueDate, org.invoiceDueDays);
  if (dueDate < issueDate) throw invalid("DUE_BEFORE_ISSUE");
  const { rows, totals } = await buildLines(tx, ctx, input.items, org.vatRate.toFixed(2));
  const inv = await tx.invoice.create({
    data: {
      organizationId: ctx.organizationId,
      sourceType: refs.sourceType,
      clientId: client.id,
      contactId: input.contactId ?? null,
      quotationId: refs.quotationId ?? null,
      quotationVersionId: refs.quotationVersionId ?? null,
      contractId: refs.contractId ?? null,
      projectId: refs.projectId ?? null,
      contractMilestoneId: refs.contractMilestoneId ?? null,
      replacesInvoiceId: refs.replacesInvoiceId ?? null,
      language: input.language,
      currency: input.currency,
      issueDate,
      dueDate,
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      paidAmount: "0",
      balanceDue: totals.total,
      paymentTerms: input.paymentTerms ?? null,
      notes: input.notes ?? null,
      createdById: ctx.userId || null
    }
  });
  const ids: string[] = [];
  for (const r of rows) ids.push((await tx.invoiceItem.create({ data: { ...r, invoiceId: inv.id } })).id);
  await uow.audit({ action: "invoice.created", entityType: "Invoice", entityId: inv.id, after: { ...refs, clientId: client.id, total: totals.total, currency: input.currency, lines: rows.length } });
  uow.emit({ type: "invoice.created", entityType: "Invoice", entityId: inv.id, payload: { invoiceId: inv.id, sourceType: refs.sourceType, clientId: client.id, projectId: refs.projectId ?? null, contractId: refs.contractId ?? null, total: totals.total } });
  return { invoice: inv, itemIds: ids };
}

/** Manual / custom operational invoice. */
export async function createInvoice(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "finance.invoices.create");
  return unitOfWork(ctx, async (tx, uow) => {
    const { invoice } = await insertDraftTx(tx, uow, ctx, raw as z.input<typeof draftSchema>, { sourceType: "MANUAL" });
    return { id: invoice.id };
  });
}

async function lockInvoice(tx: Tx, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const inv = await tx.invoice.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!inv) throw notFound("Invoice");
  return inv;
}

export async function updateInvoiceDraft(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "finance.invoices.edit");
  return unitOfWork(ctx, async (tx, uow) => {
    const inv = await lockInvoice(tx, ctx, id);
    if (inv.status !== "DRAFT") throw conflict(`INVOICE_FROZEN:${inv.status}`);
    const input = draftSchema.parse(raw);
    if (input.clientId !== inv.clientId && inv.sourceType !== "MANUAL") throw invalid("CLIENT_FIXED_BY_SOURCE");
    const org = await orgFinance(tx, ctx.organizationId);
    if (!(await tx.client.findFirst({ where: { id: input.clientId, organizationId: ctx.organizationId, deletedAt: null } }))) throw invalid("UNKNOWN_CLIENT");
    if (input.contactId && !(await tx.contact.findFirst({ where: { id: input.contactId, clientId: input.clientId } }))) throw invalid("CONTACT_NOT_OF_CLIENT");
    const issueDate = input.issueDate ?? inv.issueDate;
    const dueDate = input.dueDate ?? inv.dueDate;
    if (dueDate < issueDate) throw invalid("DUE_BEFORE_ISSUE");
    const { rows, totals } = await buildLines(tx, ctx, input.items, org.vatRate.toFixed(2));
    // time-billed lines keep their links by position (sortOrder) so editing a rate does not unlink the time
    const oldItems = await tx.invoiceItem.findMany({ where: { invoiceId: id }, orderBy: { sortOrder: "asc" }, select: { id: true, sortOrder: true } });
    const links = await tx.invoiceTimeEntry.findMany({ where: { invoiceId: id, releasedAt: null }, select: { id: true, invoiceItemId: true } });
    const posOf = new Map(oldItems.map((x) => [x.id, x.sortOrder]));
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    const newIds: string[] = [];
    for (const r of rows) newIds.push((await tx.invoiceItem.create({ data: { ...r, invoiceId: id } })).id);
    for (const l of links) {
      const pos = l.invoiceItemId ? posOf.get(l.invoiceItemId) : undefined;
      if (pos !== undefined && newIds[pos]) await tx.invoiceTimeEntry.update({ where: { id: l.id }, data: { invoiceItemId: newIds[pos] } });
    }
    const after = await tx.invoice.update({
      where: { id },
      data: {
        clientId: input.clientId, contactId: input.contactId ?? null, language: input.language, currency: input.currency, issueDate, dueDate,
        paymentTerms: input.paymentTerms ?? null, notes: input.notes ?? null,
        subtotal: totals.subtotal, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal, total: totals.total, balanceDue: totals.total
      }
    });
    await uow.audit({ action: "invoice.updated", entityType: "Invoice", entityId: id, before: { total: inv.total.toFixed(2), issueDate: ymd(inv.issueDate), dueDate: ymd(inv.dueDate) }, after: { total: after.total.toFixed(2), issueDate: ymd(issueDate), dueDate: ymd(dueDate), lines: rows.length } });
    return { id };
  });
}

// ---------------------------------------------------------------------------
// Issue / send / cancel / void
// ---------------------------------------------------------------------------

function hashOf(inv: { number: string | null; clientId: string; currency: string; issueDate: Date; dueDate: Date; subtotal: { toFixed(n: number): string }; discountTotal: { toFixed(n: number): string }; taxTotal: { toFixed(n: number): string }; total: { toFixed(n: number): string } }, items: { description: string; quantity: { toFixed(n: number): string }; unitPrice: { toFixed(n: number): string }; discountAmount: { toFixed(n: number): string }; taxRate: { toFixed(n: number): string }; taxAmount: { toFixed(n: number): string }; total: { toFixed(n: number): string } }[], seller: unknown, buyer: unknown) {
  const canon = {
    n: inv.number, c: inv.clientId, cur: inv.currency, i: ymd(inv.issueDate), d: ymd(inv.dueDate),
    t: [inv.subtotal.toFixed(2), inv.discountTotal.toFixed(2), inv.taxTotal.toFixed(2), inv.total.toFixed(2)],
    l: items.map((x) => [x.description, x.quantity.toFixed(3), x.unitPrice.toFixed(2), x.discountAmount.toFixed(2), x.taxRate.toFixed(2), x.taxAmount.toFixed(2), x.total.toFixed(2)]),
    s: seller, b: buyer
  };
  return createHash("sha256").update(JSON.stringify(canon)).digest("hex");
}

export async function issueInvoice(ctx: Ctx, id: string) {
  requirePermission(ctx, "finance.invoices.issue");
  return unitOfWork(ctx, async (tx, uow) => {
    const inv = await lockInvoice(tx, ctx, id);
    if (inv.status !== "DRAFT") throw conflict(`INVOICE_NOT_DRAFT:${inv.status}`);
    const items = await tx.invoiceItem.findMany({ where: { invoiceId: id }, orderBy: { sortOrder: "asc" } });
    if (!items.length) throw invalid("INVOICE_NEEDS_ITEMS");
    if (!inv.total.gt(0)) throw invalid("INVOICE_TOTAL_ZERO");
    const org = await orgFinance(tx, ctx.organizationId);
    const today = todayIn(org.timezone);
    if (inv.issueDate > today) throw invalid("ISSUE_DATE_IN_FUTURE");
    const client = await tx.client.findUniqueOrThrow({ where: { id: inv.clientId } });
    const contact = inv.contactId ? await tx.contact.findUnique({ where: { id: inv.contactId } }) : null;
    const number = await nextYearlyNumber(tx, ctx.organizationId, "INV", inv.issueDate.getUTCFullYear());
    const seller = { name: org.name, nameAr: org.nameAr, legalName: org.legalName, vatNumber: org.vatNumber, crNumber: org.crNumber, address: org.address, city: org.city, country: org.country, phone: org.phone, email: org.email };
    const buyer = {
      name: client.displayName, taxNumber: client.taxNumber ?? null, address: client.address ?? null, city: client.city ?? null, email: contact?.email ?? client.email ?? null, phone: contact?.phone ?? client.phone ?? null,
      contact: contact ? `${contact.firstName} ${contact.lastName ?? ""}`.trim() : null, contactTitle: contact?.jobTitle ?? null
    };
    const contentHash = hashOf({ ...inv, number }, items, seller, buyer);
    const status = deriveStatus({ total: inv.total.toFixed(2), paid: "0", sentAt: null, dueDate: inv.dueDate, today });
    const res = await tx.invoice.updateMany({
      where: { id, status: "DRAFT" },
      data: { number, status, issuedAt: new Date(), issuedById: ctx.userId || null, sellerSnapshot: seller, buyerSnapshot: buyer, paymentInstructions: org.invoicePaymentInstructions, contentHash }
    });
    if (res.count !== 1) throw conflict("INVOICE_NOT_DRAFT");
    // exact issued artifact (append-only) — later downloads of the original serve these bytes
    const { renderInvoicePdf } = await import("../pdf/invoice");
    const pdf = await renderInvoicePdf(tx, ctx.organizationId, id, { original: true });
    await tx.commercialDocument.create({ data: { organizationId: ctx.organizationId, kind: "INVOICE_PDF", invoiceId: id, language: pdf.language, fileName: pdf.fileName, sha256: pdf.sha256, size: pdf.data.length, data: new Uint8Array(pdf.data), createdById: ctx.userId || null } });
    await uow.audit({ action: "invoice.issued", entityType: "Invoice", entityId: id, before: { status: "DRAFT" }, after: { status, number, total: inv.total.toFixed(2), currency: inv.currency, contentHash, pdfSha256: pdf.sha256 } });
    uow.emit({ type: "invoice.issued", entityType: "Invoice", entityId: id, payload: { invoiceId: id, number, clientId: inv.clientId, total: inv.total.toFixed(2), currency: inv.currency, projectId: inv.projectId, contractId: inv.contractId, ownerId: inv.createdById }, activity: { entityLabel: number, href: `/app/finance/invoices/${id}`, visibility: "finance.invoices.view" } });
    return { id, number };
  });
}

const sendSchema = z.object({ method: z.enum(["EMAIL_MANUAL", "WHATSAPP_MANUAL", "IN_PERSON", "PORTAL_MANUAL", "OTHER"]), note: optText(1000), confirm: z.literal(true) });

/** Record that the invoice was delivered to the client outside the system (no email is sent). */
export async function markInvoiceSent(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "finance.invoices.send");
  const input = sendSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const inv = await lockInvoice(tx, ctx, id);
    if (inv.sentAt) throw conflict("INVOICE_ALREADY_SENT");
    if (!MANUAL_ACTIONS.send.includes(inv.status)) throw conflict(`INVOICE_INVALID_TRANSITION:${inv.status}`);
    const org = await orgFinance(tx, ctx.organizationId);
    const sentAt = new Date();
    const status = deriveStatus({ total: inv.total.toFixed(2), paid: inv.paidAmount.toFixed(2), sentAt, dueDate: inv.dueDate, today: todayIn(org.timezone) });
    await tx.invoice.update({ where: { id }, data: { sentAt, sentById: ctx.userId || null, sentMethod: input.method, status } });
    await uow.audit({ action: "invoice.sent", entityType: "Invoice", entityId: id, before: { status: inv.status }, after: { status, method: input.method, note: input.note, recordedById: ctx.userId } });
    uow.emit({ type: "invoice.sent", entityType: "Invoice", entityId: id, payload: { invoiceId: id, number: inv.number, method: input.method, clientId: inv.clientId }, activity: { entityLabel: inv.number ?? "", href: `/app/finance/invoices/${id}`, visibility: "finance.invoices.view" } });
    return { id, status };
  });
}

async function releaseTime(tx: Tx, invoiceId: string) {
  return (await tx.invoiceTimeEntry.updateMany({ where: { invoiceId, releasedAt: null }, data: { releasedAt: new Date() } })).count;
}

const reasonSchema = z.object({ reason: reqText(5, 1000) });

export async function cancelInvoiceDraft(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "finance.invoices.cancel");
  const { reason } = reasonSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const inv = await lockInvoice(tx, ctx, id);
    if (inv.status !== "DRAFT") throw conflict(`INVOICE_INVALID_TRANSITION:${inv.status}`);
    const released = await releaseTime(tx, id);
    await tx.invoice.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: ctx.userId || null, cancelReason: reason } });
    await uow.audit({ action: "invoice.cancelled", entityType: "Invoice", entityId: id, before: { status: "DRAFT" }, after: { status: "CANCELLED", reason, releasedTimeEntries: released } });
    uow.emit({ type: "invoice.cancelled", entityType: "Invoice", entityId: id, payload: { invoiceId: id, kind: "CANCELLED", reason } });
    return { id };
  });
}

const voidSchema = z.object({ reason: reqText(5, 1000), replace: z.boolean().default(false) });

/**
 * Void an issued invoice that has no (non-reversed) payments. The number stays used and the
 * stored PDF stays as issued. Linked time is released (billable again). With `replace`, a new
 * DRAFT copy is created (replacesInvoiceId) carrying the same source and the released time.
 */
export async function voidInvoice(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "finance.invoices.cancel");
  const input = voidSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const inv = await lockInvoice(tx, ctx, id);
    if (inv.paidAmount.gt(0)) throw conflict("INVOICE_HAS_PAYMENTS"); // reverse the payments first
    if (!MANUAL_ACTIONS.void.includes(inv.status)) throw conflict(`INVOICE_INVALID_TRANSITION:${inv.status}`);
    const links = await tx.invoiceTimeEntry.findMany({ where: { invoiceId: id, releasedAt: null }, include: { item: { select: { sortOrder: true } } } });
    await releaseTime(tx, id);
    await tx.invoice.update({ where: { id }, data: { status: "VOID", voidedAt: new Date(), voidedById: ctx.userId || null, voidReason: input.reason } });
    let replacementId: string | null = null;
    if (input.replace) {
      if (!can(ctx, "finance.invoices.create")) throw forbidden("finance.invoices.create");
      const items = await tx.invoiceItem.findMany({ where: { invoiceId: id }, orderBy: { sortOrder: "asc" } });
      const { invoice, itemIds } = await insertDraftTx(
        tx, uow, ctx,
        {
          clientId: inv.clientId, contactId: inv.contactId, language: inv.language, currency: inv.currency, paymentTerms: inv.paymentTerms, notes: inv.notes,
          items: items.map((x) => ({ description: x.description, serviceId: x.serviceId, projectId: x.projectId, unit: x.unit, quantity: x.quantity.toFixed(3), unitPrice: x.unitPrice.toFixed(2), discountType: x.discountType, discountValue: x.discountValue.toFixed(2), taxBehavior: x.taxBehavior }))
        },
        { sourceType: inv.sourceType, quotationId: inv.quotationId, quotationVersionId: inv.quotationVersionId, contractId: inv.contractId, projectId: inv.projectId, contractMilestoneId: inv.contractMilestoneId, replacesInvoiceId: id }
      );
      for (const l of links) await tx.invoiceTimeEntry.create({ data: { invoiceId: invoice.id, invoiceItemId: l.item ? (itemIds[l.item.sortOrder] ?? null) : null, timeEntryId: l.timeEntryId, minutes: l.minutes } });
      replacementId = invoice.id;
    }
    await uow.audit({ action: "invoice.voided", entityType: "Invoice", entityId: id, before: { status: inv.status, number: inv.number }, after: { status: "VOID", reason: input.reason, releasedTimeEntries: links.length, replacementId } });
    uow.emit({ type: "invoice.cancelled", entityType: "Invoice", entityId: id, payload: { invoiceId: id, number: inv.number, kind: "VOID", reason: input.reason, replacementId }, activity: { entityLabel: inv.number ?? "", href: `/app/finance/invoices/${id}`, visibility: "finance.invoices.view" } });
    return { id, replacementId };
  });
}

// ---------------------------------------------------------------------------
// Collections (manual — the system does not send email / WhatsApp)
// ---------------------------------------------------------------------------

const noteSchema = z.object({
  kind: z.enum(["NOTE", "REMINDER", "PROMISE_TO_PAY"]).default("NOTE"),
  channel: z.enum(["EMAIL", "PHONE", "WHATSAPP", "IN_PERSON", "OTHER"]).nullable().optional(),
  note: reqText(2, 2000),
  followUpAt: optDate
});

export async function addCollectionNote(ctx: Ctx, invoiceId: string, raw: unknown) {
  requirePermission(ctx, "finance.collections.manage");
  const input = noteSchema.parse(raw);
  if (input.kind === "REMINDER" && !input.channel) throw invalid("CHANNEL_REQUIRED");
  return unitOfWork(ctx, async (tx, uow) => {
    const inv = await lockInvoice(tx, ctx, invoiceId);
    if (!["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE"].includes(inv.status)) throw conflict(`INVOICE_NOT_OPEN:${inv.status}`);
    const n = await tx.invoiceCollectionNote.create({ data: { invoiceId, kind: input.kind, channel: input.channel ?? null, note: input.note, followUpAt: input.followUpAt ?? null, createdById: ctx.userId || null } });
    await tx.invoice.update({ where: { id: invoiceId }, data: { ...(input.followUpAt !== undefined ? { nextFollowUpAt: input.followUpAt } : {}), ...(input.kind === "REMINDER" ? { lastReminderAt: new Date() } : {}) } });
    await uow.audit({ action: input.kind === "REMINDER" ? "invoice.reminder_recorded" : "invoice.collection_note", entityType: "Invoice", entityId: invoiceId, after: { kind: input.kind, channel: input.channel, followUpAt: ymd(input.followUpAt ?? null), method: "manual_record" } });
    return { id: n.id };
  });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const INVOICES_PAGE_SIZE = 25;
const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED", "VOID", "open"]).optional(),
  client: z.string().max(40).optional(),
  project: z.string().max(40).optional(),
  owner: z.string().max(40).optional(),
  issueFrom: optDate,
  issueTo: optDate,
  dueFrom: optDate,
  dueTo: optDate,
  sort: z.enum(["issueDate", "dueDate", "total", "balanceDue", "number", "createdAt"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1)
});

export async function invoiceListWhere(ctx: Ctx, raw: unknown) {
  const f = parseListParams(listSchema, raw ?? {});
  const filters: Prisma.InvoiceWhereInput[] = [];
  if (f.q) filters.push({ OR: [{ number: { contains: f.q, mode: "insensitive" } }, { client: { displayName: { contains: f.q, mode: "insensitive" } } }, { project: { name: { contains: f.q, mode: "insensitive" } } }] });
  if (f.status === "open") filters.push({ status: OPEN_INVOICE });
  else if (f.status) filters.push({ status: f.status });
  if (f.client) filters.push({ clientId: f.client });
  if (f.project) filters.push({ projectId: f.project });
  if (f.owner) filters.push({ createdById: f.owner === "me" ? ctx.userId : f.owner });
  if (f.issueFrom || f.issueTo) filters.push({ issueDate: { ...(f.issueFrom ? { gte: f.issueFrom } : {}), ...(f.issueTo ? { lte: f.issueTo } : {}) } });
  if (f.dueFrom || f.dueTo) filters.push({ dueDate: { ...(f.dueFrom ? { gte: f.dueFrom } : {}), ...(f.dueTo ? { lte: f.dueTo } : {}) } });
  const where = and<Prisma.InvoiceWhereInput>({ organizationId: ctx.organizationId }, await invoiceWhere(ctx), { AND: filters });
  return { f, where };
}

export async function listInvoices(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "finance.invoices.view");
  const { f, where } = await invoiceListWhere(ctx, raw);
  const org = await orgFinance(prisma, ctx.organizationId);
  const orderBy: Prisma.InvoiceOrderByWithRelationInput[] = f.sort === "number" ? [{ number: { sort: f.dir, nulls: "last" } }] : [{ [f.sort]: f.dir }];
  const [items, total, sums] = await Promise.all([
    prisma.invoice.findMany({
      where, orderBy: [...orderBy, { id: "desc" }], skip: (f.page - 1) * INVOICES_PAGE_SIZE, take: INVOICES_PAGE_SIZE,
      include: { client: { select: { id: true, displayName: true } }, project: { select: { id: true, number: true, name: true } }, createdBy: { select: { id: true, name: true, nameAr: true } } }
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({ where: and<Prisma.InvoiceWhereInput>(where, { AND: [{ status: { notIn: ["DRAFT", "CANCELLED", "VOID"] }, currency: org.currency }] }), _sum: { total: true, paidAmount: true, balanceDue: true } })
  ]);
  return { items, total, page: f.page, pageSize: INVOICES_PAGE_SIZE, filters: f, currency: org.currency, sums: { total: sums._sum.total?.toFixed(2) ?? "0.00", paid: sums._sum.paidAmount?.toFixed(2) ?? "0.00", balance: sums._sum.balanceDue?.toFixed(2) ?? "0.00" } };
}

export async function getInvoice(ctx: Ctx, id: string) {
  requirePermission(ctx, "finance.invoices.view");
  const inv = await prisma.invoice.findFirst({
    where: and<Prisma.InvoiceWhereInput>({ id, organizationId: ctx.organizationId }, await invoiceWhere(ctx)),
    include: {
      client: { select: { id: true, displayName: true, number: true, taxNumber: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      project: { select: { id: true, number: true, name: true, status: true } },
      contract: { select: { id: true, number: true, title: true, status: true, contractValue: true, currency: true } },
      contractMilestone: { select: { id: true, title: true, status: true, percentage: true, amount: true } },
      quotation: { select: { id: true, number: true } },
      quotationVersion: { select: { id: true, versionNumber: true } },
      createdBy: { select: { id: true, name: true, nameAr: true } },
      items: { orderBy: { sortOrder: "asc" }, include: { service: { select: { nameAr: true, nameEn: true } }, _count: { select: { timeLinks: true } } } },
      allocations: { orderBy: { createdAt: "asc" }, include: { payment: { select: { id: true, number: true, paymentDate: true, method: true, status: true, reference: true, amount: true, reversalReason: true } } } },
      collectionNotes: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true, nameAr: true } } } },
      documents: { select: { id: true, language: true, sha256: true, size: true, createdAt: true, fileName: true } },
      _count: { select: { timeLinks: { where: { releasedAt: null } } } }
    }
  });
  if (!inv) throw notFound("Invoice");
  const replacedBy = await prisma.invoice.findFirst({ where: { replacesInvoiceId: id, organizationId: ctx.organizationId }, select: { id: true, number: true, status: true } });
  const replaces = inv.replacesInvoiceId ? await prisma.invoice.findFirst({ where: { id: inv.replacesInvoiceId }, select: { id: true, number: true } }) : null;
  const users = [inv.issuedById, inv.sentById, inv.cancelledById, inv.voidedById].filter(Boolean) as string[];
  const people = users.length ? await prisma.user.findMany({ where: { id: { in: users } }, select: { id: true, name: true, nameAr: true } }) : [];
  // payments / commercial references are shown only to those allowed to see them
  const canPayments = can(ctx, "finance.payments.view");
  return { invoice: { ...inv, allocations: canPayments ? inv.allocations : [] }, replacedBy, replaces, people, canPayments, full: financeAll(ctx) };
}

/** Open invoices of a client (payment form). */
export async function openInvoicesForClient(ctx: Ctx, clientId: string) {
  requirePermission(ctx, "finance.payments.create");
  return prisma.invoice.findMany({
    where: and<Prisma.InvoiceWhereInput>({ organizationId: ctx.organizationId, clientId, status: OPEN_INVOICE, balanceDue: { gt: 0 } }, await invoiceWhere(ctx)),
    orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    select: { id: true, number: true, dueDate: true, total: true, balanceDue: true, currency: true, status: true }
  });
}

export async function invoiceActivity(ctx: Ctx, id: string) {
  requirePermission(ctx, "finance.invoices.view");
  return prisma.auditLog.findMany({
    where: { organizationId: ctx.organizationId, OR: [{ entityType: "Invoice", entityId: id }, { action: { startsWith: "payment." }, after: { path: ["invoiceIds"], array_contains: [id] } }] },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { name: true, nameAr: true } } }
  });
}
