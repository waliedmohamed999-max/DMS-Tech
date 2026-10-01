import { z } from "zod";
import type { ContractStatus, Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { nextYearlyNumber } from "../crm/sequence";
import { ownedWhere } from "../crm/scope";
import { systemActivity } from "../crm/activities";
import { optDate, optId, optText, reqText, parseListParams } from "../crm/normalize";
import { Decimal } from "@/lib/commercial/calc";
import { addDays, todayIn, yearIn, ymd } from "./dates";

/**
 * Contracts (Phase 3) — created from an ACCEPTED quotation version only. Commercial values
 * (currency, subtotal, discount, VAT, total, payment terms) are copied from that exact
 * version and never recalculated from the catalog. Commercial terms freeze when the
 * contract becomes ACTIVE (DB trigger contract_freeze).
 *
 *   DRAFT ⇄ INTERNAL_REVIEW → AWAITING_SIGNATURE → ACTIVE → EXPIRING → EXPIRED (system)
 *   AWAITING_SIGNATURE / INTERNAL_REVIEW → DRAFT
 *   ACTIVE | EXPIRING → TERMINATED (reason)
 *   DRAFT | INTERNAL_REVIEW | AWAITING_SIGNATURE → CANCELLED (reason)
 */

export const CONTRACT_STATUSES = ["DRAFT", "INTERNAL_REVIEW", "AWAITING_SIGNATURE", "ACTIVE", "EXPIRING", "EXPIRED", "TERMINATED", "CANCELLED"] as const;

export const CONTRACT_TRANSITIONS: Record<ContractStatus, readonly ContractStatus[]> = {
  DRAFT: ["INTERNAL_REVIEW", "AWAITING_SIGNATURE", "CANCELLED"],
  INTERNAL_REVIEW: ["DRAFT", "AWAITING_SIGNATURE", "CANCELLED"],
  AWAITING_SIGNATURE: ["DRAFT", "ACTIVE", "CANCELLED"],
  ACTIVE: ["EXPIRING", "EXPIRED", "TERMINATED"],
  EXPIRING: ["ACTIVE", "EXPIRED", "TERMINATED"],
  EXPIRED: [],
  TERMINATED: [],
  CANCELLED: []
};
const EDITABLE: ContractStatus[] = ["DRAFT", "INTERNAL_REVIEW"];

const assertTransition = (from: ContractStatus, to: ContractStatus) => {
  if (!CONTRACT_TRANSITIONS[from].includes(to)) throw conflict(`CONTRACT_INVALID_TRANSITION:${from}->${to}`);
};
const activityDesc = (c: { id: string; number: string; title: string }) => ({ entityLabel: `${c.number} · ${c.title}`, href: `/app/sales/contracts/${c.id}`, visibility: "sales.contracts.view" as const });

async function trail(tx: Tx, ctx: Ctx, c: { id: string; number: string; clientId: string; opportunityId: string | null }, title: string, metadata: Record<string, unknown> = {}) {
  await systemActivity(tx, ctx, {
    entityType: c.opportunityId ? "OPPORTUNITY" : "CLIENT",
    entityId: c.opportunityId ?? c.clientId,
    clientId: c.clientId,
    type: "STATUS_CHANGE",
    title,
    metadata: { contractId: c.id, contractNumber: c.number, ...metadata }
  });
}

async function lockContract(tx: Tx, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Contract" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const c = await tx.contract.findFirst({ where: { id, organizationId: ctx.organizationId, ...(await ownedWhere(ctx)) }, include: { milestones: { orderBy: { sortOrder: "asc" } } } });
  if (!c) throw notFound("Contract");
  return c;
}

// ---------------------------------------------------------------------------
// Create from accepted quotation
// ---------------------------------------------------------------------------

const createSchema = z.object({ title: optText(200), startDate: optDate, endDate: optDate });

export async function createContractFromQuotation(ctx: Ctx, quotationId: string, raw: unknown = {}) {
  requirePermission(ctx, "sales.contracts.create");
  const input = createSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    await tx.$queryRaw`SELECT id FROM "Quotation" WHERE id = ${quotationId} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    const q = await tx.quotation.findFirst({ where: { id: quotationId, organizationId: ctx.organizationId, ...(await ownedWhere(ctx)) }, include: { client: { select: { displayName: true } } } });
    if (!q) throw notFound("Quotation");
    if (q.status !== "ACCEPTED" || !q.acceptedVersionId) throw conflict("QUOTE_NOT_ACCEPTED");
    const live = await tx.contract.findFirst({ where: { quotationVersionId: q.acceptedVersionId, status: { not: "CANCELLED" } }, select: { number: true } });
    if (live) throw conflict(`CONTRACT_EXISTS:${live.number}`);
    const v = await tx.quotationVersion.findUniqueOrThrow({ where: { id: q.acceptedVersionId }, include: { items: { orderBy: { sortOrder: "asc" } } } });
    if (input.startDate && input.endDate && input.endDate < input.startDate) throw invalid("END_BEFORE_START");
    const o = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
    const number = await nextYearlyNumber(tx, ctx.organizationId, "CTR", yearIn(o.timezone));
    const scope = v.items.map((i) => `• ${i.name}${i.quantity.equals(1) ? "" : ` × ${i.quantity.toFixed(3).replace(/\.?0+$/, "")}${i.unit ? ` ${i.unit}` : ""}`}${i.description ? `\n  ${i.description.replace(/\n/g, "\n  ")}` : ""}`).join("\n");
    const c = await tx.contract.create({
      data: {
        organizationId: ctx.organizationId,
        number,
        clientId: q.clientId,
        contactId: q.contactId,
        opportunityId: q.opportunityId,
        quotationId: q.id,
        quotationVersionId: v.id,
        title: input.title ?? `${q.client.displayName} — ${v.items[0]?.name ?? q.number}`,
        status: "DRAFT",
        language: v.language,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        currency: v.currency,
        subtotal: v.subtotal,
        discountTotal: v.discountTotal,
        taxTotal: v.taxTotal,
        contractValue: v.total,
        paymentTerms: v.paymentTerms,
        scopeOfWork: [scope, v.deliveryTerms].filter(Boolean).join("\n\n"),
        terms: v.termsAndConditions,
        ownerId: q.ownerId ?? ctx.userId,
        createdById: ctx.userId || null
      }
    });
    await uow.audit({ action: "contract.created", entityType: "Contract", entityId: c.id, after: { number, quotation: q.number, quotationVersion: v.versionNumber, quotationVersionId: v.id, contentHash: v.contentHash, contractValue: v.total.toFixed(2), currency: v.currency } });
    uow.emit({ type: "contract.created", entityType: "Contract", entityId: c.id, payload: { number, quotationId: q.id, quotationNumber: q.number, version: v.versionNumber, value: v.total.toFixed(2), ownerId: c.ownerId }, activity: activityDesc(c) });
    await trail(tx, ctx, c, "contract.created", { quotationNumber: q.number, version: v.versionNumber });
    return { id: c.id, number };
  });
}

// ---------------------------------------------------------------------------
// Edit (DRAFT / INTERNAL_REVIEW only) + milestones
// ---------------------------------------------------------------------------

const decOpt = z.preprocess((v) => (v === "" || v == null ? null : String(v).replace(/[,\s]/g, "")), z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "MONEY_FORMAT").nullable());

const milestoneSchema = z.object({
  id: optId,
  title: reqText(2, 200),
  description: optText(2000),
  amount: decOpt.optional(),
  percentage: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().min(0).max(100).nullable()).optional(),
  dueDate: optDate,
  status: z.enum(["PENDING", "COMPLETED", "CANCELLED"]).default("PENDING")
});

const updateSchema = z.object({
  title: reqText(3, 200),
  contactId: optId,
  startDate: optDate,
  endDate: optDate,
  renewalDate: optDate,
  paymentTerms: optText(4000),
  scopeOfWork: optText(20000),
  terms: optText(20000),
  milestones: z.array(milestoneSchema).max(50).default([])
});

export async function updateContract(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "sales.contracts.edit");
  const input = updateSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const c = await lockContract(tx, ctx, id);
    if (!EDITABLE.includes(c.status)) throw conflict(`CONTRACT_NOT_EDITABLE:${c.status}`);
    if (input.startDate && input.endDate && input.endDate < input.startDate) throw invalid("END_BEFORE_START");
    if (input.contactId && !(await tx.contact.findFirst({ where: { id: input.contactId, clientId: c.clientId, deletedAt: null } }))) throw invalid("CONTACT_NOT_OF_CLIENT");
    const sumAmount = input.milestones.reduce((a, m) => a.plus(m.amount ?? 0), new Decimal(0));
    const sumPct = input.milestones.reduce((a, m) => a.plus(m.percentage ?? 0), new Decimal(0));
    if (sumAmount.gt(c.contractValue.toString())) throw invalid("MILESTONES_EXCEED_VALUE");
    if (sumPct.gt(100)) throw invalid("MILESTONES_EXCEED_100");
    const before = { title: c.title, startDate: ymd(c.startDate), endDate: ymd(c.endDate), paymentTerms: c.paymentTerms, scopeOfWork: c.scopeOfWork, terms: c.terms, milestones: c.milestones.map((m) => ({ title: m.title, amount: m.amount?.toFixed(2) ?? null, percentage: m.percentage?.toFixed(2) ?? null, dueDate: ymd(m.dueDate) })) };
    await tx.contractMilestone.deleteMany({ where: { contractId: c.id } });
    const after = await tx.contract.update({
      where: { id: c.id },
      data: {
        title: input.title,
        contactId: input.contactId ?? c.contactId,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        renewalDate: input.renewalDate ?? null,
        paymentTerms: input.paymentTerms ?? null,
        scopeOfWork: input.scopeOfWork ?? null,
        terms: input.terms ?? null,
        milestones: { create: input.milestones.map((m, i) => ({ title: m.title, description: m.description ?? null, amount: m.amount ?? null, percentage: m.percentage == null ? null : String(m.percentage), dueDate: m.dueDate ?? null, status: m.status, sortOrder: i })) }
      }
    });
    await uow.audit({ action: "contract.updated", entityType: "Contract", entityId: c.id, before, after: { title: after.title, startDate: ymd(after.startDate), endDate: ymd(after.endDate), paymentTerms: after.paymentTerms, scopeOfWork: after.scopeOfWork, terms: after.terms, milestones: input.milestones.map((m) => ({ title: m.title, amount: m.amount ?? null, percentage: m.percentage ?? null, dueDate: ymd(m.dueDate ?? null) })) } });
    uow.emit({ type: "contract.updated", entityType: "Contract", entityId: c.id, payload: { number: c.number } });
  });
}

/** Milestone delivery status can be tracked on a contract in force (not commercial terms). */
export async function setMilestoneStatus(ctx: Ctx, contractId: string, milestoneId: string, status: "PENDING" | "COMPLETED" | "CANCELLED") {
  requirePermission(ctx, "sales.contracts.edit");
  return unitOfWork(ctx, async (tx, uow) => {
    const c = await lockContract(tx, ctx, contractId);
    if (["EXPIRED", "TERMINATED", "CANCELLED"].includes(c.status)) throw conflict(`CONTRACT_CLOSED:${c.status}`);
    const m = c.milestones.find((x) => x.id === milestoneId);
    if (!m) throw notFound("ContractMilestone");
    await tx.contractMilestone.update({ where: { id: m.id }, data: { status, completedAt: status === "COMPLETED" ? new Date() : null } });
    await uow.audit({ action: "contract.milestone_updated", entityType: "Contract", entityId: c.id, before: { milestone: m.title, status: m.status }, after: { status } });
    await trail(tx, ctx, c, "contract.milestone_updated", { milestone: m.title, status });
  });
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

async function move(ctx: Ctx, id: string, to: ContractStatus, perm: "sales.contracts.edit" | "sales.contracts.activate" | "sales.contracts.terminate", data: Prisma.ContractUncheckedUpdateInput, action: string, event: string | null, meta: Record<string, unknown> = {}, check?: (c: Awaited<ReturnType<typeof lockContract>>) => void) {
  requirePermission(ctx, perm);
  return unitOfWork(ctx, async (tx, uow) => {
    const c = await lockContract(tx, ctx, id);
    assertTransition(c.status, to);
    check?.(c);
    await tx.contract.update({ where: { id: c.id }, data: { ...data, status: to } });
    await uow.audit({ action, entityType: "Contract", entityId: c.id, before: { status: c.status }, after: { status: to, ...meta } });
    if (event) uow.emit({ type: event, entityType: "Contract", entityId: c.id, payload: { number: c.number, ownerId: c.ownerId, ...meta }, activity: activityDesc(c) });
    await trail(tx, ctx, c, action, meta);
  });
}

export const requestContractReview = (ctx: Ctx, id: string) => move(ctx, id, "INTERNAL_REVIEW", "sales.contracts.edit", {}, "contract.review_requested", null);
export const returnContractToDraft = (ctx: Ctx, id: string) => move(ctx, id, "DRAFT", "sales.contracts.edit", {}, "contract.returned_to_draft", null);
export const sendContractForSignature = (ctx: Ctx, id: string) =>
  move(ctx, id, "AWAITING_SIGNATURE", "sales.contracts.edit", {}, "contract.sent_for_signature", null, {}, (c) => {
    if (!c.startDate) throw invalid("CONTRACT_START_REQUIRED");
  });

const activateSchema = z.object({ signedAt: z.coerce.date(), confirm: z.literal(true) });
/** Signed copy received outside the system (manual record — not an e-signature). */
export async function activateContract(ctx: Ctx, id: string, raw: unknown) {
  const input = activateSchema.parse(raw);
  // signedAt is a calendar date: compare with the company's "today", not the UTC instant
  // (otherwise contracts signed "today" were refused between local midnight and UTC midnight)
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });
  if (input.signedAt > todayIn(org.timezone)) throw invalid("SIGNED_AT_IN_FUTURE");
  return move(ctx, id, "ACTIVE", "sales.contracts.activate", { signedAt: input.signedAt, activatedAt: new Date(), activatedById: ctx.userId }, "contract.activated", "contract.activated", { signedAt: input.signedAt.toISOString(), recordedById: ctx.userId });
}

const reasonSchema = z.object({ reason: reqText(3, 1000) });
export async function terminateContract(ctx: Ctx, id: string, raw: unknown) {
  const { reason } = reasonSchema.parse(raw);
  return move(ctx, id, "TERMINATED", "sales.contracts.terminate", { terminatedAt: new Date(), terminationReason: reason }, "contract.terminated", "contract.terminated", { reason });
}
export async function cancelContract(ctx: Ctx, id: string, raw: unknown) {
  const { reason } = reasonSchema.parse(raw);
  return move(ctx, id, "CANCELLED", "sales.contracts.edit", { cancelledAt: new Date(), cancelReason: reason }, "contract.cancelled", "contract.cancelled", { reason });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const CONTRACTS_PAGE_SIZE = 25;
const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum([...CONTRACT_STATUSES, "live"]).optional(),
  client: z.string().max(40).optional(),
  owner: z.string().max(40).optional(),
  expiring: z.enum(["soon"]).optional(),
  page: z.coerce.number().int().min(1).default(1)
});

export async function listContracts(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "sales.contracts.view");
  const f = parseListParams(listSchema, raw);
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
  const today = todayIn(o.timezone);
  const and: Prisma.ContractWhereInput[] = [];
  if (f.q) and.push({ OR: [{ number: { contains: f.q.toUpperCase() } }, { title: { contains: f.q, mode: "insensitive" } }, { client: { displayName: { contains: f.q, mode: "insensitive" } } }] });
  if (f.status === "live") and.push({ status: { in: ["ACTIVE", "EXPIRING"] } });
  else if (f.status) and.push({ status: f.status });
  if (f.client) and.push({ clientId: f.client });
  if (f.owner) and.push({ ownerId: f.owner === "me" ? ctx.userId : f.owner });
  if (f.expiring) and.push({ status: { in: ["ACTIVE", "EXPIRING"] }, endDate: { gte: today, lte: addDays(today, o.contractExpiryWarningDays) } });
  const scope = await ownedWhere(ctx);
  const where: Prisma.ContractWhereInput = { organizationId: ctx.organizationId, AND: [...(scope.AND ?? []), ...and] };
  const [items, total] = await Promise.all([
    prisma.contract.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (f.page - 1) * CONTRACTS_PAGE_SIZE,
      take: CONTRACTS_PAGE_SIZE,
      include: { client: { select: { id: true, displayName: true } }, owner: { select: { name: true, nameAr: true } }, quotation: { select: { id: true, number: true } }, quotationVersion: { select: { versionNumber: true } } }
    }),
    prisma.contract.count({ where })
  ]);
  return { items, total, page: f.page, pageSize: CONTRACTS_PAGE_SIZE };
}

export async function getContract(ctx: Ctx, id: string) {
  requirePermission(ctx, "sales.contracts.view");
  const c = await prisma.contract.findFirst({
    where: { id, organizationId: ctx.organizationId, ...(await ownedWhere(ctx)) },
    include: {
      client: { select: { id: true, number: true, displayName: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      opportunity: { select: { id: true, number: true, title: true } },
      quotation: { select: { id: true, number: true } },
      quotationVersion: { select: { id: true, versionNumber: true, total: true, contentHash: true, acceptedAt: true } },
      owner: { select: { id: true, name: true, nameAr: true } },
      milestones: { orderBy: { sortOrder: "asc" } },
      documents: { select: { id: true, fileName: true, sha256: true, createdAt: true } }
    }
  });
  if (!c) throw notFound("Contract");
  return c;
}

export async function contractsFor(ctx: Ctx, where: { clientId?: string; opportunityId?: string }) {
  if (!can(ctx, "sales.contracts.view")) return null;
  return prisma.contract.findMany({
    where: { organizationId: ctx.organizationId, ...where, ...(await ownedWhere(ctx)) },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { quotation: { select: { id: true, number: true } }, quotationVersion: { select: { versionNumber: true } }, owner: { select: { name: true, nameAr: true } } }
  });
}
