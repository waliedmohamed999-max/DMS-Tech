import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma, QuotationStatus } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork, type Uow } from "../events/bus";
import { cancelApprovalTx, registerApprovalHandler, requestApprovalTx } from "../approvals/service";
import { nextYearlyNumber } from "../crm/sequence";
import { clientWhere, ownedWhere } from "../crm/scope";
import { systemActivity } from "../crm/activities";
import { optDate, optId, optText, reqText, parseListParams } from "../crm/normalize";
import { moveOpportunityStageTx, wonStageIdTx } from "../crm/opportunities";
import { calcTotals, CalcError, Decimal, type LineInput } from "@/lib/commercial/calc";
import { addDays, todayIn, yearIn, ymd } from "./dates";
import { renderQuotationPdf } from "../pdf/quotation";

/**
 * Quotations (Phase 3) — see docs/COMMERCIAL.md.
 *
 * A Quotation (one number, Q-YYYY-NNNNNN) owns versions. Only a DRAFT version is editable;
 * the database freezes commercial columns and items of every other status (trigger
 * quotation_version_freeze / quotation_item_freeze). Changing a quotation after it was
 * sent creates a new version (revision); the old one becomes SUPERSEDED and stays intact.
 *
 * Lifecycle (version status, mirrored on Quotation.status):
 *   DRAFT ─request review→ INTERNAL_REVIEW ─return→ DRAFT
 *   DRAFT | INTERNAL_REVIEW ─submit→ APPROVED (no rule triggered) | PENDING_APPROVAL
 *   PENDING_APPROVAL ─approve→ APPROVED · ─reject / withdraw→ DRAFT
 *   APPROVED ─reopen→ DRAFT (approval invalidated) · ─send→ SENT
 *   SENT ─viewed→ VIEWED
 *   SENT | VIEWED ─accept→ ACCEPTED (final) · ─client rejects→ REJECTED · ─validity passed→ EXPIRED
 *   SENT | VIEWED | REJECTED | EXPIRED ─revise→ new DRAFT version (SENT/VIEWED → SUPERSEDED)
 *   any non-final ─cancel→ CANCELLED (final)
 */

export const QUOTE_STATUSES = ["DRAFT", "INTERNAL_REVIEW", "PENDING_APPROVAL", "APPROVED", "SENT", "VIEWED", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED", "SUPERSEDED"] as const;

export const TRANSITIONS: Record<QuotationStatus, readonly QuotationStatus[]> = {
  DRAFT: ["INTERNAL_REVIEW", "PENDING_APPROVAL", "APPROVED", "CANCELLED"],
  INTERNAL_REVIEW: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "DRAFT", "CANCELLED"],
  APPROVED: ["SENT", "DRAFT", "CANCELLED"],
  SENT: ["VIEWED", "ACCEPTED", "REJECTED", "EXPIRED", "SUPERSEDED", "CANCELLED"],
  VIEWED: ["ACCEPTED", "REJECTED", "EXPIRED", "SUPERSEDED", "CANCELLED"],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
  SUPERSEDED: []
};

export const canTransition = (from: QuotationStatus, to: QuotationStatus) => TRANSITIONS[from].includes(to);
const assertTransition = (from: QuotationStatus, to: QuotationStatus) => {
  if (!canTransition(from, to)) throw conflict(`QUOTE_INVALID_TRANSITION:${from}->${to}`);
};

/** Statuses in which the client may have the document (sent artifact exists). */
export const SENT_STATES: QuotationStatus[] = ["SENT", "VIEWED", "ACCEPTED", "REJECTED", "EXPIRED", "SUPERSEDED"];

const label = (q: { number: string }, v: { versionNumber: number }) => `${q.number} V${v.versionNumber}`;
const activityDesc = (q: { id: string; number: string }, v: { versionNumber: number }) => ({ entityLabel: label(q, v), href: `/app/sales/quotations/${q.id}`, visibility: "sales.quotations.view" as const });

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const decStr = z.preprocess((v) => (v === null || v === undefined ? "" : String(v).replace(/[,\s]/g, "")), z.string().max(20));

const itemSchema = z.object({
  serviceId: optId,
  packageId: optId,
  name: reqText(1, 300),
  description: optText(4000),
  unit: optText(30),
  quantity: decStr,
  unitPrice: decStr,
  discountType: z.enum(["NONE", "PERCENT", "FIXED"]).default("NONE"),
  discountValue: decStr.default("0"),
  taxBehavior: z.enum(["STANDARD", "ZERO_RATED", "EXEMPT"]).default("STANDARD")
});
export type QuoteItemInput = z.input<typeof itemSchema>;

const draftSchema = z.object({
  clientId: z.string().min(1),
  contactId: optId,
  opportunityId: optId,
  ownerId: optId,
  language: z.enum(["ar", "en"]).default("ar"),
  currency: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : undefined), z.string().length(3).optional()),
  issueDate: optDate,
  validUntil: optDate,
  paymentTerms: optText(4000),
  deliveryTerms: optText(4000),
  termsAndConditions: optText(12000),
  notes: optText(4000),
  clientMessage: optText(4000),
  items: z.array(itemSchema).max(100).default([])
});
export type QuoteDraftInput = z.input<typeof draftSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function org(tx: Tx | typeof prisma, id: string) {
  return tx.organization.findUniqueOrThrow({ where: { id } });
}

/** Server-authoritative line computation + catalog snapshot. Browser totals are never read. */
async function buildItems(tx: Tx | typeof prisma, ctx: Ctx, items: z.output<typeof itemSchema>[], vatRate: string) {
  const serviceIds = [...new Set(items.map((i) => i.serviceId).filter(Boolean))] as string[];
  const packageIds = [...new Set(items.map((i) => i.packageId).filter(Boolean))] as string[];
  // sequential on purpose: a transaction is one connection (no parallel queries on it)
  const services = serviceIds.length ? await tx.service.findMany({ where: { organizationId: ctx.organizationId, id: { in: serviceIds } } }) : [];
  const packages = packageIds.length ? await tx.servicePackage.findMany({ where: { organizationId: ctx.organizationId, id: { in: packageIds } } }) : [];
  if (services.length !== serviceIds.length) throw invalid("UNKNOWN_SERVICE");
  if (packages.length !== packageIds.length) throw invalid("UNKNOWN_PACKAGE");
  const lineInputs: LineInput[] = items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice, discountType: i.discountType, discountValue: i.discountValue, taxBehavior: i.taxBehavior }));
  let totals;
  try {
    totals = calcTotals(lineInputs, vatRate);
  } catch (e) {
    if (e instanceof CalcError) throw invalid(e.code, { line: e.line });
    throw e;
  }
  const rows = items.map((i, n) => {
    const r = totals.lines[n];
    const svc = i.serviceId ? services.find((s) => s.id === i.serviceId) : null;
    const pkg = i.packageId ? packages.find((p) => p.id === i.packageId) : null;
    return {
      sortOrder: n,
      serviceId: i.serviceId ?? null,
      packageId: i.packageId ?? null,
      name: i.name,
      description: i.description ?? null,
      unit: i.unit ?? null,
      quantity: new Decimal(i.quantity).toFixed(3),
      unitPrice: new Decimal(i.unitPrice).toFixed(2),
      catalogUnitPrice: svc ? svc.basePrice.toFixed(2) : pkg ? pkg.defaultPrice.toFixed(2) : null,
      discountType: i.discountType,
      discountValue: i.discountType === "NONE" ? "0.00" : new Decimal(i.discountValue || 0).toFixed(2),
      grossAmount: r.gross,
      discountAmount: r.discount,
      subtotal: r.net,
      taxBehavior: i.taxBehavior,
      taxRate: r.taxRate,
      taxAmount: r.tax,
      total: r.total,
      _custom: !svc && !pkg,
      _priceOverride: Boolean((svc && svc.pricingModel !== "CUSTOM" && !new Decimal(i.unitPrice).eq(svc.basePrice.toString())) || (pkg && !new Decimal(i.unitPrice).eq(pkg.defaultPrice.toString())))
    };
  });
  return { rows, totals };
}

const stripFlags = <T extends { _custom: boolean; _priceOverride: boolean }>(r: T) => {
  const { _custom, _priceOverride, ...rest } = r;
  void _custom;
  void _priceOverride;
  return rest;
};

type VersionForHash = Prisma.QuotationVersionGetPayload<{ include: { items: true } }>;
type QuoteHeader = { clientId: string; contactId: string | null };

/** sha256 of every commercial field of a version + its items (order-stable). */
export function contentHashOf(q: QuoteHeader, v: VersionForHash) {
  const f2 = (d: { toFixed(n: number): string } | null) => (d == null ? null : d.toFixed(2));
  const canon = {
    clientId: q.clientId,
    contactId: q.contactId,
    language: v.language,
    currency: v.currency,
    issueDate: ymd(v.issueDate),
    validUntil: ymd(v.validUntil),
    vatRate: f2(v.vatRate),
    subtotal: f2(v.subtotal),
    discountTotal: f2(v.discountTotal),
    taxTotal: f2(v.taxTotal),
    total: f2(v.total),
    paymentTerms: v.paymentTerms,
    deliveryTerms: v.deliveryTerms,
    termsAndConditions: v.termsAndConditions,
    clientMessage: v.clientMessage,
    items: [...v.items]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => [i.serviceId, i.packageId, i.name, i.description, i.unit, i.quantity.toFixed(3), f2(i.unitPrice), i.discountType, f2(i.discountValue), i.taxBehavior, f2(i.taxRate), f2(i.grossAmount), f2(i.discountAmount), f2(i.subtotal), f2(i.taxAmount), f2(i.total)])
  };
  return createHash("sha256").update(JSON.stringify(canon)).digest("hex");
}

async function lockQuote(tx: Tx, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Quotation" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const q = await tx.quotation.findFirst({
    where: { id, organizationId: ctx.organizationId, ...(await ownedWhere(ctx)) },
    include: { currentVersion: { include: { items: true } }, client: { select: { id: true, displayName: true, status: true } }, opportunity: { select: { id: true, number: true, status: true, currency: true, pipelineId: true } } }
  });
  if (!q || !q.currentVersion) throw notFound("Quotation");
  return q as typeof q & { currentVersion: NonNullable<typeof q.currentVersion> };
}

async function assertContext(tx: Tx | typeof prisma, ctx: Ctx, input: { clientId: string; contactId?: string | null; opportunityId?: string | null; ownerId?: string | null }) {
  const client = await tx.client.findFirst({ where: { id: input.clientId, organizationId: ctx.organizationId, deletedAt: null, ...(await clientWhere(ctx)) } });
  if (!client) throw notFound("Client");
  if (client.status === "ARCHIVED") throw conflict("CLIENT_ARCHIVED");
  if (input.contactId) {
    const c = await tx.contact.findFirst({ where: { id: input.contactId, clientId: client.id, deletedAt: null } });
    if (!c) throw invalid("CONTACT_NOT_OF_CLIENT");
  }
  if (input.opportunityId) {
    const o = await tx.opportunity.findFirst({ where: { id: input.opportunityId, organizationId: ctx.organizationId, ...(await ownedWhere(ctx)) } });
    if (!o) throw notFound("Opportunity");
    if (o.clientId !== client.id) throw invalid("OPPORTUNITY_NOT_OF_CLIENT");
    if (o.status === "ARCHIVED") throw conflict("OPPORTUNITY_ARCHIVED");
  }
  if (input.ownerId && input.ownerId !== ctx.userId) {
    if (!can(ctx, "crm.opportunities.assign")) throw forbidden("crm.opportunities.assign");
    const u = await tx.user.findFirst({ where: { id: input.ownerId, organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null } });
    if (!u) throw invalid("UNKNOWN_OWNER");
  }
  return client;
}

/** CRM timeline entry on the opportunity (or the client when there is none). */
async function crmTrail(tx: Tx, ctx: Ctx, q: { id: string; number: string; clientId: string; opportunityId: string | null }, title: string, metadata: Record<string, unknown>) {
  await systemActivity(tx, ctx, {
    entityType: q.opportunityId ? "OPPORTUNITY" : "CLIENT",
    entityId: q.opportunityId ?? q.clientId,
    clientId: q.clientId,
    type: "STATUS_CHANGE",
    title,
    metadata: { quotationId: q.id, quotationNumber: q.number, ...metadata }
  });
}

async function setStatus(tx: Tx, quotationId: string, versionId: string, status: QuotationStatus, data: Prisma.QuotationVersionUncheckedUpdateInput = {}) {
  await tx.quotationVersion.update({ where: { id: versionId }, data: { ...data, status } });
  await tx.quotation.update({ where: { id: quotationId }, data: { status } });
}

// ---------------------------------------------------------------------------
// Create / edit drafts
// ---------------------------------------------------------------------------

export async function createQuotation(ctx: Ctx, raw: unknown, extra: { duplicatedFromId?: string } = {}) {
  requirePermission(ctx, "sales.quotations.create");
  const input = draftSchema.parse(raw);
  const ownerId = input.ownerId ?? ctx.userId;
  return unitOfWork(ctx, async (tx, uow) => {
    await assertContext(tx, ctx, { ...input, ownerId });
    const o = await org(tx, ctx.organizationId);
    const vatRate = o.vatRate.toFixed(2);
    const { rows, totals } = await buildItems(tx, ctx, input.items, vatRate);
    const today = todayIn(o.timezone);
    const issueDate = input.issueDate ?? today;
    const validUntil = input.validUntil ?? addDays(issueDate, o.quoteValidityDays);
    if (validUntil < issueDate) throw invalid("VALID_UNTIL_BEFORE_ISSUE");
    const number = await nextYearlyNumber(tx, ctx.organizationId, "Q", yearIn(o.timezone));
    const q = await tx.quotation.create({
      data: { organizationId: ctx.organizationId, number, clientId: input.clientId, contactId: input.contactId ?? null, opportunityId: input.opportunityId ?? null, ownerId, status: "DRAFT", duplicatedFromId: extra.duplicatedFromId ?? null, createdById: ctx.userId || null }
    });
    const v = await tx.quotationVersion.create({
      data: {
        organizationId: ctx.organizationId,
        quotationId: q.id,
        versionNumber: 1,
        status: "DRAFT",
        language: input.language,
        currency: input.currency ?? o.currency,
        issueDate,
        validUntil,
        vatRate,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        paymentTerms: input.paymentTerms ?? null,
        deliveryTerms: input.deliveryTerms ?? null,
        termsAndConditions: input.termsAndConditions ?? null,
        notes: input.notes ?? null,
        clientMessage: input.clientMessage ?? null,
        createdById: ctx.userId || null,
        items: { create: rows.map(stripFlags) }
      }
    });
    await tx.quotation.update({ where: { id: q.id }, data: { currentVersionId: v.id } });
    await uow.audit({ action: "quotation.created", entityType: "Quotation", entityId: q.id, after: { number, version: 1, clientId: q.clientId, opportunityId: q.opportunityId, ownerId, totals: { subtotal: totals.subtotal, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal, total: totals.total }, items: rows.length, duplicatedFromId: q.duplicatedFromId } });
    uow.emit({ type: "quotation.created", entityType: "Quotation", entityId: q.id, payload: { number, version: 1, total: totals.total, ownerId, opportunityId: q.opportunityId }, activity: activityDesc(q, v) });
    await crmTrail(tx, ctx, q, "quotation.created", { version: 1, total: totals.total, currency: v.currency });
    return { id: q.id, number, versionId: v.id };
  });
}

/** Edit the current DRAFT version (header + items). Anything else is refused server-side. */
export async function updateQuotationDraft(ctx: Ctx, quotationId: string, raw: unknown) {
  requirePermission(ctx, "sales.quotations.edit");
  const input = draftSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const q = await lockQuote(tx, ctx, quotationId);
    const v = q.currentVersion;
    if (v.status === "PENDING_APPROVAL") throw conflict("QUOTE_PENDING_APPROVAL_WITHDRAW_FIRST");
    if (v.status === "APPROVED") throw conflict("QUOTE_APPROVED_REOPEN_FIRST");
    if (SENT_STATES.includes(v.status)) throw conflict("QUOTE_SENT_CREATE_REVISION");
    if (v.status !== "DRAFT") throw conflict("QUOTE_NOT_EDITABLE");
    if (input.clientId !== q.clientId) throw invalid("CLIENT_IMMUTABLE");
    await assertContext(tx, ctx, { ...input, ownerId: input.ownerId ?? q.ownerId });
    const o = await org(tx, ctx.organizationId);
    const vatRate = o.vatRate.toFixed(2);
    const { rows, totals } = await buildItems(tx, ctx, input.items, vatRate);
    const issueDate = input.issueDate ?? v.issueDate;
    const validUntil = input.validUntil ?? v.validUntil;
    if (validUntil < issueDate) throw invalid("VALID_UNTIL_BEFORE_ISSUE");
    const before = { contactId: q.contactId, opportunityId: q.opportunityId, ownerId: q.ownerId, subtotal: v.subtotal.toFixed(2), discountTotal: v.discountTotal.toFixed(2), taxTotal: v.taxTotal.toFixed(2), total: v.total.toFixed(2), validUntil: ymd(v.validUntil), items: v.items.map((i) => ({ name: i.name, qty: i.quantity.toFixed(3), price: i.unitPrice.toFixed(2), total: i.total.toFixed(2) })) };
    await tx.quotationItem.deleteMany({ where: { versionId: v.id } });
    await tx.quotationVersion.update({
      where: { id: v.id },
      data: {
        language: input.language,
        currency: input.currency ?? v.currency,
        issueDate,
        validUntil,
        vatRate,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        paymentTerms: input.paymentTerms ?? null,
        deliveryTerms: input.deliveryTerms ?? null,
        termsAndConditions: input.termsAndConditions ?? null,
        notes: input.notes ?? null,
        clientMessage: input.clientMessage ?? null,
        approvalComment: null,
        items: { create: rows.map(stripFlags) }
      }
    });
    await tx.quotation.update({ where: { id: q.id }, data: { contactId: input.contactId ?? null, opportunityId: input.opportunityId ?? null, ownerId: input.ownerId ?? q.ownerId } });
    const after = { contactId: input.contactId ?? null, opportunityId: input.opportunityId ?? null, ownerId: input.ownerId ?? q.ownerId, subtotal: totals.subtotal, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal, total: totals.total, validUntil: ymd(validUntil), items: rows.map((i) => ({ name: i.name, qty: i.quantity, price: i.unitPrice, total: i.total })) };
    await uow.audit({ action: "quotation.updated", entityType: "Quotation", entityId: q.id, before, after });
    uow.emit({ type: "quotation.updated", entityType: "Quotation", entityId: q.id, payload: { number: q.number, version: v.versionNumber, total: totals.total } });
    return { id: q.id };
  });
}

// ---------------------------------------------------------------------------
// Review / approval
// ---------------------------------------------------------------------------

export type ApprovalReason = { code: "TOTAL_ABOVE_THRESHOLD" | "EXECUTIVE_THRESHOLD" | "DISCOUNT_ABOVE_THRESHOLD" | "CUSTOM_PRICING" | "NON_BASE_CURRENCY"; value?: string; limit?: string };

/** Approval rules from organization settings (nothing hard-coded). */
export function approvalRules(
  o: { currency: string; quoteApprovalThreshold: { toString(): string }; discountApprovalPercent: { toString(): string }; quoteExecutiveApprovalThreshold: { toString(): string } | null; quoteCustomPricingRequiresApproval: boolean },
  v: { currency: string; total: string; discountPercent: string; maxLineDiscountPercent: string; hasCustomPricing: boolean }
) {
  const reasons: ApprovalReason[] = [];
  const total = new Decimal(v.total);
  if (v.currency !== o.currency) reasons.push({ code: "NON_BASE_CURRENCY", value: v.currency, limit: o.currency });
  else {
    const exec = o.quoteExecutiveApprovalThreshold ? new Decimal(o.quoteExecutiveApprovalThreshold.toString()) : null;
    if (exec && total.gte(exec)) reasons.push({ code: "EXECUTIVE_THRESHOLD", value: total.toFixed(2), limit: exec.toFixed(2) });
    else if (total.gt(o.quoteApprovalThreshold.toString())) reasons.push({ code: "TOTAL_ABOVE_THRESHOLD", value: total.toFixed(2), limit: new Decimal(o.quoteApprovalThreshold.toString()).toFixed(2) });
  }
  const disc = Decimal.max(new Decimal(v.discountPercent), new Decimal(v.maxLineDiscountPercent));
  if (disc.gt(o.discountApprovalPercent.toString())) reasons.push({ code: "DISCOUNT_ABOVE_THRESHOLD", value: disc.toFixed(2), limit: new Decimal(o.discountApprovalPercent.toString()).toFixed(2) });
  if (o.quoteCustomPricingRequiresApproval && v.hasCustomPricing) reasons.push({ code: "CUSTOM_PRICING" });
  const executive = reasons.some((r) => r.code === "EXECUTIVE_THRESHOLD");
  return { reasons, requiredPermission: (executive ? "sales.quotations.approve_executive" : "sales.quotations.approve") as "sales.quotations.approve_executive" | "sales.quotations.approve" };
}

export async function requestInternalReview(ctx: Ctx, id: string) {
  requirePermission(ctx, "sales.quotations.edit");
  return unitOfWork(ctx, async (tx, uow) => {
    const q = await lockQuote(tx, ctx, id);
    const v = q.currentVersion;
    assertTransition(v.status, "INTERNAL_REVIEW");
    if (!v.items.length) throw invalid("QUOTE_NEEDS_ITEMS");
    await setStatus(tx, q.id, v.id, "INTERNAL_REVIEW");
    await uow.audit({ action: "quotation.review_requested", entityType: "Quotation", entityId: q.id, before: { status: v.status }, after: { status: "INTERNAL_REVIEW", version: v.versionNumber } });
    await crmTrail(tx, ctx, q, "quotation.review_requested", { version: v.versionNumber });
  });
}

/** INTERNAL_REVIEW → DRAFT, or APPROVED (not yet sent) → DRAFT which invalidates the approval. */
export async function reopenQuotation(ctx: Ctx, id: string) {
  requirePermission(ctx, "sales.quotations.edit");
  return unitOfWork(ctx, async (tx, uow) => {
    const q = await lockQuote(tx, ctx, id);
    const v = q.currentVersion;
    if (v.status !== "INTERNAL_REVIEW" && v.status !== "APPROVED") throw conflict(`QUOTE_INVALID_TRANSITION:${v.status}->DRAFT`);
    await setStatus(tx, q.id, v.id, "DRAFT", { approvedAt: null, approvedById: null, contentHash: null });
    await uow.audit({ action: "quotation.reopened", entityType: "Quotation", entityId: q.id, before: { status: v.status, approvedById: v.approvedById, contentHash: v.contentHash }, after: { status: "DRAFT", approvalInvalidated: v.status === "APPROVED" } });
    await crmTrail(tx, ctx, q, "quotation.reopened", { version: v.versionNumber });
  });
}

export async function submitQuotation(ctx: Ctx, id: string) {
  requirePermission(ctx, "sales.quotations.submit");
  return unitOfWork(ctx, async (tx, uow) => {
    const q = await lockQuote(tx, ctx, id);
    const v = q.currentVersion;
    if (v.status !== "DRAFT" && v.status !== "INTERNAL_REVIEW") throw conflict(`QUOTE_INVALID_TRANSITION:${v.status}->SUBMIT`);
    if (!v.items.length) throw invalid("QUOTE_NEEDS_ITEMS");
    if (new Decimal(v.total.toString()).lte(0)) throw invalid("QUOTE_TOTAL_ZERO");
    const o = await org(tx, ctx.organizationId);
    if (v.validUntil < todayIn(o.timezone)) throw invalid("VALID_UNTIL_IN_PAST");

    // re-derive totals from the stored lines (defence in depth) and evaluate the rules
    const lines: LineInput[] = v.items.map((i) => ({ quantity: i.quantity.toString(), unitPrice: i.unitPrice.toString(), discountType: i.discountType, discountValue: i.discountValue.toString(), taxBehavior: i.taxBehavior }));
    const t = calcTotals(lines, v.vatRate.toString());
    if (t.total !== v.total.toFixed(2)) throw conflict("QUOTE_TOTALS_MISMATCH");
    // custom pricing = a line that is not from the catalog, a CUSTOM-priced service, or a catalog line sold away from its catalog price
    const svcModels = new Map((await tx.service.findMany({ where: { id: { in: v.items.map((i) => i.serviceId).filter(Boolean) as string[] } }, select: { id: true, pricingModel: true } })).map((x) => [x.id, x.pricingModel]));
    const hasCustomPricing = v.items.some(
      (i) => (!i.serviceId && !i.packageId) || (i.serviceId && svcModels.get(i.serviceId) === "CUSTOM") || (i.catalogUnitPrice != null && !i.catalogUnitPrice.equals(i.unitPrice))
    );
    const { reasons, requiredPermission } = approvalRules(o, { currency: v.currency, total: t.total, discountPercent: t.discountPercent, maxLineDiscountPercent: t.maxLineDiscountPercent, hasCustomPricing });
    const hash = contentHashOf(q, v);
    const now = new Date();
    const snapshot = { quotationId: q.id, number: q.number, versionId: v.id, versionNumber: v.versionNumber, clientName: q.client.displayName, opportunityNumber: q.opportunity?.number ?? null, ownerId: q.ownerId, currency: v.currency, subtotal: t.subtotal, discountTotal: t.discountTotal, discountPercent: t.discountPercent, taxTotal: t.taxTotal, total: t.total, vatRate: v.vatRate.toFixed(2), reasons, contentHash: hash };

    if (!reasons.length) {
      await setStatus(tx, q.id, v.id, "APPROVED", { contentHash: hash, approvalRequired: false, approvalReasons: [], submittedAt: now, submittedById: ctx.userId, approvedAt: now, approvedById: null });
      await uow.audit({ action: "quotation.submitted", entityType: "Quotation", entityId: q.id, before: { status: v.status }, after: { ...snapshot, approvalRequired: false } });
      await uow.audit({ action: "quotation.approved", entityType: "Quotation", entityId: q.id, after: { version: v.versionNumber, auto: true, policy: "no approval rule triggered", contentHash: hash } });
      uow.emit({ type: "quotation.submitted", entityType: "Quotation", entityId: q.id, payload: { ...snapshot, approvalRequired: false }, activity: activityDesc(q, v) });
      uow.emit({ type: "quotation.approved", entityType: "Quotation", entityId: q.id, payload: { number: q.number, version: v.versionNumber, auto: true, ownerId: q.ownerId } });
      await crmTrail(tx, ctx, q, "quotation.approved", { version: v.versionNumber, auto: true });
      return { status: "APPROVED" as const, reasons };
    }

    await setStatus(tx, q.id, v.id, "PENDING_APPROVAL", { contentHash: hash, approvalRequired: true, approvalReasons: reasons as unknown as Prisma.InputJsonValue, submittedAt: now, submittedById: ctx.userId, approvalComment: null });
    const approval = await requestApprovalTx(tx, uow, ctx, {
      type: "QUOTATION",
      entityType: "Quotation",
      entityId: q.id,
      title: `${q.number} V${v.versionNumber} · ${q.client.displayName}`,
      summary: reasons.map((r) => r.code).join(", "),
      payload: snapshot,
      requiredPermission,
      priority: requiredPermission === "sales.quotations.approve_executive" ? "HIGH" : "MEDIUM",
      amount: Number(t.total),
      currency: v.currency
    });
    await tx.quotationVersion.update({ where: { id: v.id }, data: { approvalId: approval.id } });
    await uow.audit({ action: "quotation.submitted", entityType: "Quotation", entityId: q.id, before: { status: v.status }, after: { ...snapshot, approvalRequired: true, approvalId: approval.id, requiredPermission } });
    uow.emit({ type: "quotation.submitted", entityType: "Quotation", entityId: q.id, payload: { ...snapshot, approvalRequired: true, approvalId: approval.id }, activity: activityDesc(q, v) });
    await crmTrail(tx, ctx, q, "quotation.submitted", { version: v.versionNumber, reasons: reasons.map((r) => r.code) });
    return { status: "PENDING_APPROVAL" as const, reasons, approvalId: approval.id };
  });
}

/** Pull a pending submission back to DRAFT (cancels the approval request). */
export async function withdrawSubmission(ctx: Ctx, id: string) {
  requirePermission(ctx, "sales.quotations.submit");
  return unitOfWork(ctx, async (tx, uow) => {
    const q = await lockQuote(tx, ctx, id);
    const v = q.currentVersion;
    if (v.status !== "PENDING_APPROVAL" || !v.approvalId) throw conflict(`QUOTE_INVALID_TRANSITION:${v.status}->DRAFT`);
    await cancelApprovalTx(tx, uow, ctx, v.approvalId, { allowNonRequester: true }); // hook moves the version back to DRAFT
  });
}

async function lockVersionForApproval(tx: Tx, organizationId: string, approval: { id: string; payload: unknown }) {
  const p = approval.payload as { versionId: string; quotationId: string; contentHash: string };
  await tx.$queryRaw`SELECT id FROM "QuotationVersion" WHERE id = ${p.versionId} FOR UPDATE`;
  const v = await tx.quotationVersion.findFirst({ where: { id: p.versionId, organizationId }, include: { items: true, quotation: true } });
  if (!v) throw notFound("QuotationVersion");
  return { v, p };
}

registerApprovalHandler("QUOTATION", {
  async onApproved(tx, uow, approval, ctx) {
    const { v, p } = await lockVersionForApproval(tx, ctx.organizationId, approval);
    // the approval must belong to this exact submission of this exact content
    if (v.status !== "PENDING_APPROVAL" || v.approvalId !== approval.id) throw conflict("STALE_APPROVAL");
    if (v.quotation.currentVersionId !== v.id) throw conflict("STALE_APPROVAL");
    if (contentHashOf(v.quotation, v) !== p.contentHash || v.contentHash !== p.contentHash) throw conflict("STALE_APPROVAL");
    await setStatus(tx, v.quotationId, v.id, "APPROVED", { approvedAt: new Date(), approvedById: ctx.userId });
    await uow.audit({ action: "quotation.approved", entityType: "Quotation", entityId: v.quotationId, before: { status: "PENDING_APPROVAL" }, after: { version: v.versionNumber, approvalId: approval.id, approvedById: ctx.userId, contentHash: p.contentHash, total: v.total.toFixed(2) } });
    uow.emit({ type: "quotation.approved", entityType: "Quotation", entityId: v.quotationId, payload: { number: v.quotation.number, version: v.versionNumber, auto: false, ownerId: v.quotation.ownerId, requesterId: v.submittedById }, activity: activityDesc(v.quotation, v) });
    await crmTrail(tx, ctx, v.quotation, "quotation.approved", { version: v.versionNumber });
  },
  async onRejected(tx, uow, approval, ctx) {
    const { v } = await lockVersionForApproval(tx, ctx.organizationId, approval);
    if (v.status !== "PENDING_APPROVAL" || v.approvalId !== approval.id) throw conflict("STALE_APPROVAL");
    await setStatus(tx, v.quotationId, v.id, "DRAFT", { contentHash: null, approvalComment: approval.decisionComment ?? null });
    await uow.audit({ action: "quotation.rejected", entityType: "Quotation", entityId: v.quotationId, before: { status: "PENDING_APPROVAL" }, after: { status: "DRAFT", version: v.versionNumber, approvalId: approval.id, comment: approval.decisionComment } });
    uow.emit({ type: "quotation.rejected", entityType: "Quotation", entityId: v.quotationId, payload: { number: v.quotation.number, version: v.versionNumber, ownerId: v.quotation.ownerId, requesterId: v.submittedById, comment: approval.decisionComment }, activity: activityDesc(v.quotation, v) });
    await crmTrail(tx, ctx, v.quotation, "quotation.rejected", { version: v.versionNumber, reason: approval.decisionComment });
  },
  async onCancelled(tx, uow, approval, ctx) {
    const { v } = await lockVersionForApproval(tx, ctx.organizationId, approval);
    if (v.status !== "PENDING_APPROVAL" || v.approvalId !== approval.id) return; // already moved on (e.g. cancelled quotation)
    await setStatus(tx, v.quotationId, v.id, "DRAFT", { contentHash: null });
    await uow.audit({ action: "quotation.withdrawn", entityType: "Quotation", entityId: v.quotationId, before: { status: "PENDING_APPROVAL" }, after: { status: "DRAFT", version: v.versionNumber, approvalId: approval.id } });
    await crmTrail(tx, ctx, v.quotation, "quotation.withdrawn", { version: v.versionNumber });
  }
});

// ---------------------------------------------------------------------------
// Sending and the client's answer
// ---------------------------------------------------------------------------

const sendSchema = z.object({ method: z.enum(["EMAIL_MANUAL", "WHATSAPP_MANUAL", "IN_PERSON", "OTHER"]), note: optText(1000), confirm: z.literal(true) });

/**
 * Record that the APPROVED version was sent. No email is sent by the system (no email
 * integration is configured) — the user confirms they delivered it, and the exact PDF of
 * this version is stored as an append-only document (sha256 kept in the audit log).
 */
export async function markQuotationSent(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "sales.quotations.send");
  const input = sendSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const q = await lockQuote(tx, ctx, id);
    const v = q.currentVersion;
    assertTransition(v.status, "SENT");
    const o = await org(tx, ctx.organizationId);
    if (v.validUntil < todayIn(o.timezone)) throw conflict("QUOTE_VALIDITY_PASSED_REVISE");
    await setStatus(tx, q.id, v.id, "SENT", { sentAt: new Date(), sentById: ctx.userId, sendMethod: input.method, sentNote: input.note ?? null });
    const pdf = await renderQuotationPdf(tx, ctx.organizationId, v.id);
    await tx.commercialDocument.create({
      data: { organizationId: ctx.organizationId, kind: "QUOTATION_PDF", quotationVersionId: v.id, language: pdf.language, fileName: pdf.fileName, sha256: pdf.sha256, size: pdf.data.length, data: new Uint8Array(pdf.data), createdById: ctx.userId || null }
    });
    await uow.audit({ action: "quotation.sent", entityType: "Quotation", entityId: q.id, before: { status: v.status }, after: { version: v.versionNumber, method: input.method, note: input.note, total: v.total.toFixed(2), contentHash: v.contentHash, pdfSha256: pdf.sha256 } });
    uow.emit({ type: "quotation.sent", entityType: "Quotation", entityId: q.id, payload: { number: q.number, version: v.versionNumber, method: input.method, ownerId: q.ownerId }, activity: activityDesc(q, v) });
    await crmTrail(tx, ctx, q, "quotation.sent", { version: v.versionNumber, method: input.method });
  });
}

export async function markQuotationViewed(ctx: Ctx, id: string) {
  requirePermission(ctx, "sales.quotations.send");
  return unitOfWork(ctx, async (tx, uow) => {
    const q = await lockQuote(tx, ctx, id);
    const v = q.currentVersion;
    assertTransition(v.status, "VIEWED");
    await setStatus(tx, q.id, v.id, "VIEWED", { viewedAt: new Date() });
    await uow.audit({ action: "quotation.viewed", entityType: "Quotation", entityId: q.id, after: { version: v.versionNumber, recordedById: ctx.userId } });
    uow.emit({ type: "quotation.viewed", entityType: "Quotation", entityId: q.id, payload: { number: q.number, version: v.versionNumber } });
  });
}

const acceptSchema = z.object({ note: optText(1000), markOpportunityWon: z.boolean().default(true), confirm: z.literal(true), versionId: z.string().min(1) });

/**
 * Record the client's acceptance of the CURRENT sent version (manual confirmation — not a
 * digital signature). The DB guarantees one accepted version per quotation and one accepted
 * quotation per opportunity. If asked and allowed, the open opportunity is moved to Won in
 * the same transaction and its value set to the accepted net amount (excl. VAT).
 */
export async function acceptQuotation(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "sales.quotations.accept");
  const input = acceptSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const q = await lockQuote(tx, ctx, id);
    const v = q.currentVersion;
    if (v.id !== input.versionId) throw conflict("QUOTE_VERSION_CHANGED");
    assertTransition(v.status, "ACCEPTED");
    const o = await org(tx, ctx.organizationId);
    if (v.validUntil < todayIn(o.timezone)) throw conflict("QUOTE_EXPIRED");
    if (q.opportunityId) {
      const other = await tx.quotation.findFirst({ where: { opportunityId: q.opportunityId, status: "ACCEPTED", id: { not: q.id } }, select: { number: true } });
      if (other) throw conflict(`OPPORTUNITY_HAS_ACCEPTED_QUOTE:${other.number}`);
    }
    const now = new Date();
    await tx.quotationVersion.update({ where: { id: v.id }, data: { status: "ACCEPTED", acceptedAt: now, acceptedRecordedById: ctx.userId, acceptanceNote: input.note ?? null } });
    await tx.quotation.update({ where: { id: q.id }, data: { status: "ACCEPTED", acceptedVersionId: v.id } });
    await uow.audit({ action: "quotation.accepted", entityType: "Quotation", entityId: q.id, before: { status: v.status }, after: { version: v.versionNumber, versionId: v.id, recordedById: ctx.userId, recordedAt: now.toISOString(), method: "manual_record", note: input.note, total: v.total.toFixed(2), currency: v.currency, contentHash: v.contentHash } });
    uow.emit({ type: "quotation.accepted", entityType: "Quotation", entityId: q.id, payload: { number: q.number, version: v.versionNumber, total: v.total.toFixed(2), ownerId: q.ownerId, opportunityId: q.opportunityId }, activity: activityDesc(q, v) });
    await crmTrail(tx, ctx, q, "quotation.accepted", { version: v.versionNumber, total: v.total.toFixed(2), currency: v.currency });

    let opportunityWon = false;
    if (input.markOpportunityWon && q.opportunity && q.opportunity.status === "OPEN" && can(ctx, "crm.opportunities.mark_won") && can(ctx, "crm.opportunities.move_stage")) {
      const net = new Decimal(v.subtotal.toString()).minus(v.discountTotal.toString()).toFixed(2);
      const before = await tx.opportunity.findUniqueOrThrow({ where: { id: q.opportunity.id }, select: { estimatedValue: true, currency: true } });
      if (before.currency === v.currency) {
        await tx.opportunity.update({ where: { id: q.opportunity.id }, data: { estimatedValue: net } });
        await uow.audit({ action: "opportunity.updated", entityType: "Opportunity", entityId: q.opportunity.id, before: { estimatedValue: before.estimatedValue.toFixed(2) }, after: { estimatedValue: net, reason: `accepted ${q.number} V${v.versionNumber} (net excl. VAT)` } });
      }
      await moveOpportunityStageTx(tx, uow, ctx, { id: q.opportunity.id, stageId: await wonStageIdTx(tx, q.opportunity.pipelineId) });
      opportunityWon = true;
    }
    return { opportunityWon };
  });
}

const rejectSchema = z.object({ reason: reqText(3, 1000) });

export async function rejectQuotationByClient(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "sales.quotations.reject");
  const input = rejectSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const q = await lockQuote(tx, ctx, id);
    const v = q.currentVersion;
    assertTransition(v.status, "REJECTED");
    await setStatus(tx, q.id, v.id, "REJECTED", { rejectedAt: new Date(), rejectionReason: input.reason, rejectionRecordedById: ctx.userId });
    await uow.audit({ action: "quotation.client_rejected", entityType: "Quotation", entityId: q.id, before: { status: v.status }, after: { version: v.versionNumber, reason: input.reason, recordedById: ctx.userId } });
    uow.emit({ type: "quotation.rejected_by_client", entityType: "Quotation", entityId: q.id, payload: { number: q.number, version: v.versionNumber, reason: input.reason, ownerId: q.ownerId }, activity: activityDesc(q, v) });
    await crmTrail(tx, ctx, q, "quotation.client_rejected", { version: v.versionNumber, reason: input.reason });
  });
}

const cancelSchema = z.object({ reason: reqText(3, 1000) });

export async function cancelQuotation(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "sales.quotations.cancel");
  const input = cancelSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const q = await lockQuote(tx, ctx, id);
    const v = q.currentVersion;
    assertTransition(v.status, "CANCELLED");
    if (v.status === "PENDING_APPROVAL" && v.approvalId) await cancelApprovalTx(tx, uow, ctx, v.approvalId, { allowNonRequester: true, runHook: false });
    await setStatus(tx, q.id, v.id, "CANCELLED", { cancelledAt: new Date(), cancelReason: input.reason });
    await uow.audit({ action: "quotation.cancelled", entityType: "Quotation", entityId: q.id, before: { status: v.status }, after: { version: v.versionNumber, reason: input.reason } });
    uow.emit({ type: "quotation.cancelled", entityType: "Quotation", entityId: q.id, payload: { number: q.number, version: v.versionNumber, reason: input.reason } });
    await crmTrail(tx, ctx, q, "quotation.cancelled", { version: v.versionNumber, reason: input.reason });
  });
}

// ---------------------------------------------------------------------------
// Revision (same number, new version) vs Duplicate (new number)
// ---------------------------------------------------------------------------

function copyItems(items: VersionForHash["items"]) {
  return items
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((i) => ({ serviceId: i.serviceId, packageId: i.packageId, name: i.name, description: i.description, unit: i.unit, quantity: i.quantity.toString(), unitPrice: i.unitPrice.toString(), discountType: i.discountType, discountValue: i.discountValue.toString(), taxBehavior: i.taxBehavior }));
}

const REVISABLE: QuotationStatus[] = ["SENT", "VIEWED", "REJECTED", "EXPIRED"];

/**
 * New version of the same proposal. The previous version is never modified commercially:
 * a SENT/VIEWED one becomes SUPERSEDED (cannot be accepted any more); REJECTED/EXPIRED stay.
 * Lines are copied as historical snapshots (no catalog re-pricing); VAT is recalculated with
 * the current organization rate because this is a new commercial offer.
 */
export async function createRevision(ctx: Ctx, id: string) {
  requirePermission(ctx, "sales.quotations.edit");
  return unitOfWork(ctx, async (tx, uow) => {
    const q = await lockQuote(tx, ctx, id);
    const prev = q.currentVersion;
    if (!REVISABLE.includes(prev.status)) throw conflict(prev.status === "ACCEPTED" ? "QUOTE_ACCEPTED_IMMUTABLE" : `QUOTE_NOT_REVISABLE:${prev.status}`);
    const o = await org(tx, ctx.organizationId);
    const vatRate = o.vatRate.toFixed(2);
    const items = copyItems(prev.items);
    const { rows, totals } = await buildItems(tx, ctx, items.map((i) => itemSchema.parse(i)), vatRate);
    const today = todayIn(o.timezone);
    const maxV = await tx.quotationVersion.aggregate({ where: { quotationId: q.id }, _max: { versionNumber: true } });
    const versionNumber = (maxV._max.versionNumber ?? 0) + 1;
    if (prev.status === "SENT" || prev.status === "VIEWED") await tx.quotationVersion.update({ where: { id: prev.id }, data: { status: "SUPERSEDED", supersededAt: new Date() } });
    const v = await tx.quotationVersion.create({
      data: {
        organizationId: ctx.organizationId,
        quotationId: q.id,
        versionNumber,
        status: "DRAFT",
        language: prev.language,
        currency: prev.currency,
        issueDate: today,
        validUntil: addDays(today, o.quoteValidityDays),
        vatRate,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        paymentTerms: prev.paymentTerms,
        deliveryTerms: prev.deliveryTerms,
        termsAndConditions: prev.termsAndConditions,
        notes: prev.notes,
        clientMessage: prev.clientMessage,
        revisedFromId: prev.id,
        createdById: ctx.userId || null,
        items: { create: rows.map(stripFlags) }
      }
    });
    await tx.quotation.update({ where: { id: q.id }, data: { currentVersionId: v.id, status: "DRAFT" } });
    await uow.audit({ action: "quotation.revised", entityType: "Quotation", entityId: q.id, before: { version: prev.versionNumber, status: prev.status, total: prev.total.toFixed(2) }, after: { version: versionNumber, previousStatus: prev.status === "SENT" || prev.status === "VIEWED" ? "SUPERSEDED" : prev.status, total: totals.total } });
    uow.emit({ type: "quotation.revised", entityType: "Quotation", entityId: q.id, payload: { number: q.number, fromVersion: prev.versionNumber, version: versionNumber }, activity: activityDesc(q, v) });
    await crmTrail(tx, ctx, q, "quotation.revised", { version: versionNumber, fromVersion: prev.versionNumber });
    return { id: q.id, versionId: v.id, versionNumber };
  });
}

/** A separate proposal: new quotation number, V1 DRAFT, same client/opportunity and lines. */
export async function duplicateQuotation(ctx: Ctx, id: string) {
  requirePermission(ctx, "sales.quotations.create");
  const src = await prisma.quotation.findFirst({ where: { id, organizationId: ctx.organizationId, ...(await ownedWhere(ctx)) }, include: { currentVersion: { include: { items: true } } } });
  if (!src?.currentVersion) throw notFound("Quotation");
  const v = src.currentVersion;
  return createQuotation(
    ctx,
    {
      clientId: src.clientId,
      contactId: src.contactId,
      opportunityId: src.opportunityId,
      language: v.language,
      currency: v.currency,
      paymentTerms: v.paymentTerms,
      deliveryTerms: v.deliveryTerms,
      termsAndConditions: v.termsAndConditions,
      notes: v.notes,
      clientMessage: v.clientMessage,
      items: copyItems(v.items)
    },
    { duplicatedFromId: src.id }
  );
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const QUOTES_PAGE_SIZE = 25;
const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum([...QUOTE_STATUSES, "open", "awaiting"]).optional(),
  client: z.string().max(40).optional(),
  owner: z.string().max(40).optional(),
  opportunity: z.string().max(40).optional(),
  approval: z.enum(["pending", "required", "none"]).optional(),
  expiring: z.enum(["soon", "past"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.enum(["updatedAt", "createdAt", "number", "total", "validUntil"]).default("updatedAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1)
});

export async function listQuotations(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "sales.quotations.view");
  const f = parseListParams(listSchema, raw);
  const o = await org(prisma, ctx.organizationId);
  const today = todayIn(o.timezone);
  const and: Prisma.QuotationWhereInput[] = [];
  if (f.q) and.push({ OR: [{ number: { contains: f.q.toUpperCase() } }, { client: { displayName: { contains: f.q, mode: "insensitive" } } }, { opportunity: { title: { contains: f.q, mode: "insensitive" } } }] });
  if (f.status === "open") and.push({ status: { in: ["DRAFT", "INTERNAL_REVIEW", "PENDING_APPROVAL", "APPROVED", "SENT", "VIEWED"] } });
  else if (f.status === "awaiting") and.push({ status: { in: ["SENT", "VIEWED"] } });
  else if (f.status) and.push({ status: f.status });
  if (f.client) and.push({ clientId: f.client });
  if (f.opportunity) and.push({ opportunityId: f.opportunity });
  if (f.owner) and.push(f.owner === "me" ? { ownerId: ctx.userId } : { ownerId: f.owner });
  if (f.approval === "pending") and.push({ status: "PENDING_APPROVAL" });
  if (f.approval === "required") and.push({ currentVersion: { approvalRequired: true } });
  if (f.approval === "none") and.push({ currentVersion: { approvalRequired: false } });
  if (f.expiring === "soon") and.push({ status: { in: ["SENT", "VIEWED"] }, currentVersion: { validUntil: { gte: today, lte: addDays(today, Math.max(o.quoteExpiryWarningDays, 7)) } } });
  if (f.expiring === "past") and.push({ status: "EXPIRED" });
  if (f.from) and.push({ createdAt: { gte: new Date(`${f.from}T00:00:00Z`) } });
  if (f.to) and.push({ createdAt: { lt: addDays(new Date(`${f.to}T00:00:00Z`), 1) } });
  // scope fragment is itself an AND list — merge, never overwrite it (see crm/scope.ts)
  const scope = await ownedWhere(ctx);
  const where: Prisma.QuotationWhereInput = { organizationId: ctx.organizationId, AND: [...(scope.AND ?? []), ...and] };
  const orderBy: Prisma.QuotationOrderByWithRelationInput =
    f.sort === "total" ? { currentVersion: { total: f.dir } } : f.sort === "validUntil" ? { currentVersion: { validUntil: f.dir } } : { [f.sort]: f.dir };
  const [items, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      orderBy,
      skip: (f.page - 1) * QUOTES_PAGE_SIZE,
      take: QUOTES_PAGE_SIZE,
      include: {
        client: { select: { id: true, displayName: true } },
        opportunity: { select: { id: true, number: true, title: true } },
        owner: { select: { id: true, name: true, nameAr: true } },
        currentVersion: { select: { id: true, versionNumber: true, total: true, currency: true, validUntil: true, approvalRequired: true, status: true } }
      }
    }),
    prisma.quotation.count({ where })
  ]);
  return { items, total, page: f.page, pageSize: QUOTES_PAGE_SIZE, today };
}

export async function getQuotation(ctx: Ctx, id: string, versionNumber?: number) {
  requirePermission(ctx, "sales.quotations.view");
  const q = await prisma.quotation.findFirst({
    where: { id, organizationId: ctx.organizationId, ...(await ownedWhere(ctx)) },
    include: {
      client: { select: { id: true, number: true, displayName: true, email: true, phone: true, taxNumber: true, city: true, country: true, address: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, jobTitle: true } },
      opportunity: { select: { id: true, number: true, title: true, status: true } },
      owner: { select: { id: true, name: true, nameAr: true } },
      versions: { orderBy: { versionNumber: "desc" }, select: { id: true, versionNumber: true, status: true, total: true, currency: true, createdAt: true, sentAt: true, acceptedAt: true, supersededAt: true, contentHash: true } },
      contracts: { select: { id: true, number: true, status: true, quotationVersionId: true } }
    }
  });
  if (!q) throw notFound("Quotation");
  const wanted = versionNumber ? q.versions.find((v) => v.versionNumber === versionNumber) : q.versions.find((v) => v.id === q.currentVersionId);
  if (!wanted) throw notFound("QuotationVersion");
  const [version, approvals, documents] = await Promise.all([
    prisma.quotationVersion.findUniqueOrThrow({ where: { id: wanted.id }, include: { items: { orderBy: { sortOrder: "asc" } } } }),
    prisma.approval.findMany({ where: { organizationId: ctx.organizationId, type: "QUOTATION", entityId: q.id }, orderBy: { createdAt: "desc" }, include: { requestedBy: { select: { name: true, nameAr: true } }, decidedBy: { select: { name: true, nameAr: true } } } }),
    prisma.commercialDocument.findMany({ where: { quotationVersionId: { in: q.versions.map((v) => v.id) } }, select: { id: true, quotationVersionId: true, language: true, fileName: true, sha256: true, size: true, createdAt: true }, orderBy: { createdAt: "desc" } })
  ]);
  const people = [version.submittedById, version.approvedById, version.sentById, version.acceptedRecordedById, version.rejectionRecordedById].filter(Boolean) as string[];
  const users = people.length ? await prisma.user.findMany({ where: { id: { in: people } }, select: { id: true, name: true, nameAr: true } }) : [];
  return { quotation: q, version, isCurrent: version.id === q.currentVersionId, approvals, documents, users };
}

/** Open opportunities of a client for the builder (scope-filtered). */
export async function opportunityOptions(ctx: Ctx, clientId: string) {
  requirePermission(ctx, "sales.quotations.create");
  return prisma.opportunity.findMany({
    where: { organizationId: ctx.organizationId, clientId, status: { in: ["OPEN", "WON"] }, ...(await ownedWhere(ctx)) },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, number: true, title: true, status: true }
  });
}

/** Quotations of an opportunity / client (tabs). Scope-filtered. */
export async function quotationsFor(ctx: Ctx, where: { opportunityId?: string; clientId?: string }) {
  if (!can(ctx, "sales.quotations.view")) return null;
  return prisma.quotation.findMany({
    where: { organizationId: ctx.organizationId, ...where, ...(await ownedWhere(ctx)) },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { owner: { select: { name: true, nameAr: true } }, currentVersion: { select: { versionNumber: true, total: true, currency: true, validUntil: true } } }
  });
}

export { buildItems as _buildItemsForTests };
