import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { requirePermission, type Ctx } from "../context";
import { conflict, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { optDate } from "../crm/normalize";
import { todayIn } from "../commercial/dates";
import { contractMilestoneEligibility } from "../projects/insights";
import { Decimal } from "@/lib/commercial/calc";
import { insertDraftTx, orgFinance, type DraftRefs, type InvoiceItemInput } from "./invoices";
import { LIVE_INVOICE } from "./access";

/**
 * Billing eligibility — deterministic rules (no AI, no automatic invoices). Each candidate says
 * whether it can be invoiced now, why (reasons), what blocks it (blockers) and a suggested net
 * amount when the commercial record defines one. Creating the invoice is always an explicit
 * finance action (createInvoiceFromSource); duplicates are blocked here AND by partial unique
 * indexes (Invoice_one_live_per_* / InvoiceTimeEntry_one_live_link).
 *
 *   CONTRACT_MILESTONE  ACTIVE/EXPIRING contract; milestone not cancelled; eligible when delivered
 *                       (all linked project milestones completed), marked COMPLETED, or its due date
 *                       has arrived (payment schedule). Amount = contract net × percentage
 *                       (or × amount / contract value).
 *   CONTRACT            ACTIVE/EXPIRING contract WITHOUT milestones → the accepted version's lines.
 *   QUOTATION           accepted quotation with no live contract → the accepted version's lines.
 *   PROJECT             COMPLETED project whose commercial source is not billed by milestones /
 *                       contract → project budget minus what is already billed against it.
 *   TIME                approved + billable time entries of a project not linked to a live invoice.
 *   MANUAL              always available with finance.invoices.create (custom lines).
 * Retainer-period billing is not modelled (no recurring contract model yet) — documented limitation.
 */

export type SourceType = "CONTRACT_MILESTONE" | "CONTRACT" | "QUOTATION" | "PROJECT" | "TIME";
export type Candidate = {
  type: SourceType;
  id: string;
  clientId: string;
  clientName: string;
  label: string;
  ref: string;
  eligible: boolean;
  reasons: string[];
  blockers: { code: string; params?: Record<string, string | number> }[];
  amount: string | null;
  currency: string;
  projectId?: string | null;
  contractId?: string | null;
  meta?: Record<string, string | number | null>;
};

const r2 = (d: InstanceType<typeof Decimal>) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

function milestoneNet(c: { subtotal: Prisma.Decimal; discountTotal: Prisma.Decimal; contractValue: Prisma.Decimal }, m: { percentage: Prisma.Decimal | null; amount: Prisma.Decimal | null }) {
  const net = new Decimal(c.subtotal.toString()).minus(c.discountTotal.toString());
  if (m.percentage) return r2(net.mul(m.percentage.toString()).div(100));
  if (m.amount && c.contractValue.gt(0)) return r2(net.mul(m.amount.toString()).div(c.contractValue.toString()));
  return null;
}

type Filter = { clientId?: string; projectId?: string; contractId?: string };

export async function billingCandidates(db: Tx | typeof prisma, ctx: Ctx, f: Filter = {}): Promise<Candidate[]> {
  const org = await orgFinance(db, ctx.organizationId);
  const today = todayIn(org.timezone);
  const out: Candidate[] = [];
  const liveByMilestone = new Map<string, string>();
  const liveContract = new Map<string, string>();
  const liveVersion = new Map<string, string>();
  const liveProject = new Map<string, string>();
  const live = await db.invoice.findMany({
    where: { organizationId: ctx.organizationId, status: LIVE_INVOICE, OR: [{ contractMilestoneId: { not: null } }, { sourceType: { in: ["CONTRACT", "QUOTATION", "PROJECT"] } }] },
    select: { id: true, number: true, sourceType: true, contractMilestoneId: true, contractId: true, quotationVersionId: true, projectId: true }
  });
  for (const i of live) {
    const label = i.number ?? "DRAFT";
    if (i.contractMilestoneId) liveByMilestone.set(i.contractMilestoneId, label);
    if (i.sourceType === "CONTRACT" && i.contractId) liveContract.set(i.contractId, label);
    if (i.sourceType === "QUOTATION" && i.quotationVersionId) liveVersion.set(i.quotationVersionId, label);
    if (i.sourceType === "PROJECT" && i.projectId) liveProject.set(i.projectId, label);
  }

  // contracts + milestones
  const contracts = await db.contract.findMany({
    where: { organizationId: ctx.organizationId, status: { in: ["ACTIVE", "EXPIRING"] }, ...(f.clientId ? { clientId: f.clientId } : {}), ...(f.contractId ? { id: f.contractId } : {}), ...(f.projectId ? { projects: { some: { id: f.projectId } } } : {}) },
    include: { client: { select: { displayName: true } }, milestones: { orderBy: { sortOrder: "asc" } }, projects: { where: { status: { not: "CANCELLED" } }, select: { id: true } } },
    orderBy: { number: "asc" }
  });
  for (const c of contracts) {
    const projectId = c.projects[0]?.id ?? null;
    const live = c.milestones.filter((m) => m.status !== "CANCELLED");
    if (live.length) {
      const elig = await contractMilestoneEligibility(c.id);
      for (const m of live) {
        const reasons: string[] = [];
        if (elig[m.id]?.eligible) reasons.push("MILESTONE_DELIVERED");
        if (m.status === "COMPLETED") reasons.push("MILESTONE_COMPLETED");
        if (m.dueDate && m.dueDate <= today) reasons.push("MILESTONE_DUE");
        const blockers: Candidate["blockers"] = [];
        if (liveByMilestone.has(m.id)) blockers.push({ code: "ALREADY_INVOICED", params: { number: liveByMilestone.get(m.id)! } });
        if (!reasons.length) blockers.push({ code: elig[m.id] ? "DELIVERY_IN_PROGRESS" : "NOT_DUE_NOT_DELIVERED", params: m.dueDate ? { due: m.dueDate.toISOString().slice(0, 10) } : {} });
        const amount = milestoneNet(c, m);
        if (!amount || amount.lte(0)) blockers.push({ code: "NO_AMOUNT" });
        out.push({ type: "CONTRACT_MILESTONE", id: m.id, clientId: c.clientId, clientName: c.client.displayName, label: m.title, ref: c.number, eligible: !blockers.length, reasons, blockers, amount: amount?.toFixed(2) ?? null, currency: c.currency, projectId, contractId: c.id, meta: { percentage: m.percentage?.toFixed(2) ?? null, due: m.dueDate?.toISOString().slice(0, 10) ?? null } });
      }
    } else {
      const blockers: Candidate["blockers"] = [];
      if (liveContract.has(c.id)) blockers.push({ code: "ALREADY_INVOICED", params: { number: liveContract.get(c.id)! } });
      if (!c.quotationVersionId) blockers.push({ code: "NO_ACCEPTED_VERSION" });
      const net = new Decimal(c.subtotal.toString()).minus(c.discountTotal.toString());
      out.push({ type: "CONTRACT", id: c.id, clientId: c.clientId, clientName: c.client.displayName, label: c.title, ref: c.number, eligible: !blockers.length, reasons: ["CONTRACT_ACTIVE"], blockers, amount: net.toFixed(2), currency: c.currency, projectId, contractId: c.id });
    }
  }

  // accepted quotations without a live contract (a contract always wins)
  if (!f.contractId) {
    const quotes = await db.quotation.findMany({
      where: { organizationId: ctx.organizationId, status: "ACCEPTED", acceptedVersionId: { not: null }, contracts: { none: { status: { not: "CANCELLED" } } }, ...(f.clientId ? { clientId: f.clientId } : {}), ...(f.projectId ? { projects: { some: { id: f.projectId } } } : {}) },
      include: { client: { select: { displayName: true } }, projects: { where: { status: { not: "CANCELLED" } }, select: { id: true } } }
    });
    for (const q of quotes) {
      const v = await db.quotationVersion.findUnique({ where: { id: q.acceptedVersionId! }, select: { id: true, versionNumber: true, subtotal: true, discountTotal: true, currency: true } });
      if (!v) continue;
      const blockers: Candidate["blockers"] = liveVersion.has(v.id) ? [{ code: "ALREADY_INVOICED", params: { number: liveVersion.get(v.id)! } }] : [];
      out.push({ type: "QUOTATION", id: q.id, clientId: q.clientId, clientName: q.client.displayName, label: `${q.number} V${v.versionNumber}`, ref: q.number, eligible: !blockers.length, reasons: ["QUOTATION_ACCEPTED"], blockers, amount: new Decimal(v.subtotal.toString()).minus(v.discountTotal.toString()).toFixed(2), currency: v.currency, projectId: q.projects[0]?.id ?? null });
    }
  }

  // completed projects + unbilled approved billable time
  const projects = await db.project.findMany({
    where: { organizationId: ctx.organizationId, type: "CLIENT", clientId: { not: null }, ...(f.clientId ? { clientId: f.clientId } : {}), ...(f.projectId ? { id: f.projectId } : {}), ...(f.contractId ? { contractId: f.contractId } : {}), OR: [{ status: "COMPLETED" }, { timeEntries: { some: { status: "APPROVED", billable: true, invoiceLinks: { none: { releasedAt: null } } } } }] },
    include: { client: { select: { displayName: true } }, contract: { select: { id: true, milestones: { where: { status: { not: "CANCELLED" } }, select: { id: true } } } } }
  });
  for (const p of projects) {
    if (p.status === "COMPLETED") {
      const blockers: Candidate["blockers"] = [];
      if (liveProject.has(p.id)) blockers.push({ code: "ALREADY_INVOICED", params: { number: liveProject.get(p.id)! } });
      if (p.contract?.milestones.length) blockers.push({ code: "BILLED_BY_MILESTONES" });
      else if (p.contractId && liveContract.has(p.contractId)) blockers.push({ code: "CONTRACT_INVOICED", params: { number: liveContract.get(p.contractId)! } });
      else if (p.quotationVersionId && liveVersion.has(p.quotationVersionId)) blockers.push({ code: "QUOTATION_INVOICED", params: { number: liveVersion.get(p.quotationVersionId)! } });
      const billed = await db.invoice.aggregate({ where: { projectId: p.id, status: LIVE_INVOICE }, _sum: { subtotal: true, discountTotal: true } });
      const billedNet = new Decimal((billed._sum.subtotal ?? 0).toString()).minus((billed._sum.discountTotal ?? 0).toString());
      const remaining = p.budgetAmount ? Decimal.max(new Decimal(p.budgetAmount.toString()).minus(billedNet), 0) : null;
      out.push({ type: "PROJECT", id: p.id, clientId: p.clientId!, clientName: p.client!.displayName, label: p.name, ref: p.number, eligible: !blockers.length, reasons: ["PROJECT_COMPLETED"], blockers, amount: remaining?.toFixed(2) ?? null, currency: p.currency ?? org.currency, projectId: p.id, contractId: p.contractId });
    }
    const time = await db.timeEntry.aggregate({ where: { projectId: p.id, status: "APPROVED", billable: true, invoiceLinks: { none: { releasedAt: null } } }, _sum: { minutes: true }, _count: true });
    if (time._count > 0) {
      const minutes = time._sum.minutes ?? 0;
      const rate = org.defaultHourlyBillingRate;
      out.push({ type: "TIME", id: p.id, clientId: p.clientId!, clientName: p.client!.displayName, label: p.name, ref: p.number, eligible: true, reasons: ["APPROVED_BILLABLE_TIME"], blockers: [], amount: rate ? r2(new Decimal(minutes).div(60).mul(rate.toString())).toFixed(2) : null, currency: org.currency, projectId: p.id, contractId: p.contractId, meta: { minutes, entries: time._count } });
    }
  }
  return out;
}

export async function listBillingCandidates(ctx: Ctx, f: Filter = {}) {
  requirePermission(ctx, "finance.invoices.create");
  return billingCandidates(prisma, ctx, f);
}

const fromSourceSchema = z.object({
  type: z.enum(["CONTRACT_MILESTONE", "CONTRACT", "QUOTATION", "PROJECT", "TIME"]),
  id: z.string().min(1),
  timeEntryIds: z.array(z.string().min(1)).max(2000).optional(),
  issueDate: optDate,
  dueDate: optDate
});

/**
 * Create a DRAFT from an eligible billing source. The source row is locked first (concurrent
 * attempts serialise), eligibility is re-evaluated inside the transaction, and the partial
 * unique indexes reject anything that slips through. Upstream records are only READ.
 */
export async function createInvoiceFromSource(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "finance.invoices.create");
  const input = fromSourceSchema.parse(raw);
  try {
    return await unitOfWork(ctx, async (tx, uow) => {
      const org = await orgFinance(tx, ctx.organizationId);
      let refs: DraftRefs;
      let clientId: string;
      let contactId: string | null = null;
      let language: "ar" | "en" = org.defaultLocale;
      let currency = org.currency;
      let paymentTerms: string | null = null;
      let items: InvoiceItemInput[] = [];
      let timeIds: { id: string; minutes: number; userId: string; userName: string }[] = [];

      const versionLines = async (versionId: string): Promise<InvoiceItemInput[]> =>
        (await tx.quotationItem.findMany({ where: { versionId }, orderBy: { sortOrder: "asc" } })).map((x) => ({
          description: x.description ? `${x.name} — ${x.description}` : x.name, serviceId: x.serviceId, unit: x.unit, quantity: x.quantity.toFixed(3), unitPrice: x.unitPrice.toFixed(2), discountType: x.discountType, discountValue: x.discountValue.toFixed(2), taxBehavior: x.taxBehavior
        }));

      if (input.type === "CONTRACT_MILESTONE") {
        const pre = await tx.contractMilestone.findFirst({ where: { id: input.id, contract: { organizationId: ctx.organizationId } }, select: { contractId: true } });
        if (!pre) throw notFound("ContractMilestone");
        await tx.$queryRaw`SELECT id FROM "Contract" WHERE id = ${pre.contractId} FOR UPDATE`;
        const cands = await billingCandidates(tx, ctx, { contractId: pre.contractId });
        const cand = cands.find((x) => x.type === "CONTRACT_MILESTONE" && x.id === input.id);
        if (!cand) throw notFound("ContractMilestone");
        if (!cand.eligible) throw conflict(`NOT_BILLABLE:${cand.blockers.map((b) => b.code).join(",")}`);
        const c = await tx.contract.findUniqueOrThrow({ where: { id: pre.contractId }, include: { milestones: { where: { id: input.id } } } });
        const m = c.milestones[0];
        refs = { sourceType: "CONTRACT_MILESTONE", contractId: c.id, contractMilestoneId: m.id, quotationId: c.quotationId, quotationVersionId: c.quotationVersionId, projectId: cand.projectId ?? null };
        ({ clientId, contactId, language, currency, paymentTerms } = { clientId: c.clientId, contactId: c.contactId, language: c.language, currency: c.currency, paymentTerms: c.paymentTerms });
        const pct = m.percentage ? ` (${m.percentage.toFixed(2).replace(/\.00$/, "")}%)` : "";
        items = [{ description: `${c.number} — ${m.title}${pct}`, quantity: "1", unitPrice: cand.amount!, taxBehavior: c.taxTotal.gt(0) || c.subtotal.isZero() ? "STANDARD" : "ZERO_RATED" }];
      } else if (input.type === "CONTRACT") {
        await tx.$queryRaw`SELECT id FROM "Contract" WHERE id = ${input.id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
        const cand = (await billingCandidates(tx, ctx, { contractId: input.id })).find((x) => x.type === "CONTRACT" && x.id === input.id);
        if (!cand) throw notFound("Contract");
        if (!cand.eligible) throw conflict(`NOT_BILLABLE:${cand.blockers.map((b) => b.code).join(",")}`);
        const c = await tx.contract.findUniqueOrThrow({ where: { id: input.id } });
        refs = { sourceType: "CONTRACT", contractId: c.id, quotationId: c.quotationId, quotationVersionId: c.quotationVersionId, projectId: cand.projectId ?? null };
        ({ clientId, contactId, language, currency, paymentTerms } = { clientId: c.clientId, contactId: c.contactId, language: c.language, currency: c.currency, paymentTerms: c.paymentTerms });
        items = await versionLines(c.quotationVersionId!);
      } else if (input.type === "QUOTATION") {
        await tx.$queryRaw`SELECT id FROM "Quotation" WHERE id = ${input.id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
        const cand = (await billingCandidates(tx, ctx, {})).find((x) => x.type === "QUOTATION" && x.id === input.id);
        if (!cand) throw notFound("Quotation");
        if (!cand.eligible) throw conflict(`NOT_BILLABLE:${cand.blockers.map((b) => b.code).join(",")}`);
        const q = await tx.quotation.findUniqueOrThrow({ where: { id: input.id } });
        const v = await tx.quotationVersion.findUniqueOrThrow({ where: { id: q.acceptedVersionId! } });
        refs = { sourceType: "QUOTATION", quotationId: q.id, quotationVersionId: v.id, projectId: cand.projectId ?? null };
        ({ clientId, contactId, language, currency, paymentTerms } = { clientId: q.clientId, contactId: q.contactId, language: v.language, currency: v.currency, paymentTerms: v.paymentTerms });
        items = await versionLines(v.id);
      } else {
        await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${input.id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
        const cand = (await billingCandidates(tx, ctx, { projectId: input.id })).find((x) => x.type === input.type && x.id === input.id);
        if (!cand) throw notFound(input.type === "TIME" ? "BillableTime" : "Project");
        if (!cand.eligible) throw conflict(`NOT_BILLABLE:${cand.blockers.map((b) => b.code).join(",")}`);
        const p = await tx.project.findUniqueOrThrow({ where: { id: input.id }, include: { contract: { select: { contactId: true, paymentTerms: true, language: true } } } });
        refs = { sourceType: input.type, projectId: p.id, contractId: p.contractId, quotationId: p.quotationId, quotationVersionId: p.quotationVersionId };
        ({ clientId, contactId, language, currency, paymentTerms } = { clientId: p.clientId!, contactId: p.contract?.contactId ?? null, language: p.contract?.language ?? org.defaultLocale, currency: p.currency ?? org.currency, paymentTerms: p.contract?.paymentTerms ?? null });
        if (input.type === "PROJECT") {
          items = [{ description: `${p.number} — ${p.name}`, projectId: p.id, quantity: "1", unitPrice: cand.amount ?? "0", taxBehavior: "STANDARD" }];
        } else {
          const entries = await tx.timeEntry.findMany({
            where: { projectId: p.id, status: "APPROVED", billable: true, invoiceLinks: { none: { releasedAt: null } }, ...(input.timeEntryIds?.length ? { id: { in: input.timeEntryIds } } : {}) },
            include: { user: { select: { name: true, nameAr: true } } },
            orderBy: [{ userId: "asc" }, { date: "asc" }]
          });
          if (input.timeEntryIds?.length && entries.length !== new Set(input.timeEntryIds).size) throw conflict("TIME_NOT_BILLABLE");
          if (!entries.length) throw conflict("TIME_NOT_BILLABLE");
          timeIds = entries.map((e) => ({ id: e.id, minutes: e.minutes, userId: e.userId, userName: (language === "ar" && e.user.nameAr) || e.user.name }));
          const byUser = new Map<string, { name: string; minutes: number }>();
          for (const e of timeIds) byUser.set(e.userId, { name: e.userName, minutes: (byUser.get(e.userId)?.minutes ?? 0) + e.minutes });
          const rate = org.defaultHourlyBillingRate?.toFixed(2) ?? "0";
          items = [...byUser.values()].map((u) => ({ description: `${p.number} — ${language === "ar" ? "ساعات عمل" : "Time"}: ${u.name}`, projectId: p.id, unit: language === "ar" ? "ساعة" : "hour", quantity: new Decimal(u.minutes).div(60).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed(3), unitPrice: rate, taxBehavior: "STANDARD" as const }));
        }
      }
      const { invoice, itemIds } = await insertDraftTx(tx, uow, ctx, { clientId, contactId, language, currency, paymentTerms, issueDate: input.issueDate ?? undefined, dueDate: input.dueDate ?? undefined, items }, refs);
      if (timeIds.length) {
        const userOrder = [...new Set(timeIds.map((t) => t.userId))];
        for (const t of timeIds) await tx.invoiceTimeEntry.create({ data: { invoiceId: invoice.id, invoiceItemId: itemIds[userOrder.indexOf(t.userId)] ?? null, timeEntryId: t.id, minutes: t.minutes } });
        await uow.audit({ action: "invoice.time_linked", entityType: "Invoice", entityId: invoice.id, after: { timeEntries: timeIds.length, minutes: timeIds.reduce((s, t) => s + t.minutes, 0) } });
      }
      return { id: invoice.id };
    });
  } catch (e) {
    // a concurrent creator won the partial unique index race
    if ((e as { code?: string }).code === "P2002") throw conflict("ALREADY_INVOICED");
    throw e;
  }
}

export async function projectBillingSummary(db: Tx | typeof prisma, ctx: Ctx, projectId: string) {
  const cands = await billingCandidates(db, ctx, { projectId });
  return cands;
}

