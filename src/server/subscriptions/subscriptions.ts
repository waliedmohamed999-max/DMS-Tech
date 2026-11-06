import { z } from "zod";
import { Prisma, type RecurringInterval, type Subscription, type SubscriptionChangeKind } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, invalid, notFound } from "../errors";
import { unitOfWork, type Uow } from "../events/bus";
import { optId, optText, reqText } from "../crm/normalize";
import { nextNumber } from "../crm/sequence";
import { addDays, todayIn, ymd } from "../commercial/dates";
import { isEmail } from "../notify/mailer";
import { addMonths, insertScheduleTx, intervalMonths, nextPeriodOnOrAfter, parseSchedule, runSchedule } from "../finance/recurring";

/**
 * Client subscriptions — docs/SUBSCRIPTIONS.md.
 *
 * A subscription is the commercial record of a client on a recurring package: plan, price per period (before VAT),
 * billing interval, minimum commitment, the current term and automatic renewal, pause and cancellation.
 * Billing is delegated to ONE linked RecurringInvoice schedule, which the service layer keeps in step:
 *   · pause / resume            → schedule PAUSED / ACTIVE (a resume never bills the paused periods)
 *   · scheduled cancellation    → schedule endDate = last day of service (periods starting after it are not billed)
 *   · no automatic renewal      → schedule endDate = end of the current term
 *   · plan / price change       → the schedule's line, from the next invoice on
 * The schedule cannot be paused / ended on its own (MANAGED_BY_SUBSCRIPTION). Billing needs finance.invoices.create:
 * sales can record a subscription and finance switches billing on later ("billing not started").
 *
 * Statuses: ACTIVE → PAUSED → ACTIVE · ACTIVE/PAUSED → ENDING (cancellation scheduled) → ENDED · → ENDED (now / term over).
 * The subscriptions sweep (run with billing automation) ends due cancellations, renews terms and sends renewal notices.
 */

export const RENEWAL_NOTICE_DAYS = 30;
const INTERVALS = ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"] as const;
const money = z.preprocess((v) => (v === null || v === undefined ? "" : String(v).replace(/[,\s]/g, "")), z.string().regex(/^\d{1,11}(\.\d{1,2})?$/, "PRICE_INVALID"));
const bool = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());
const day = z.coerce.date();

const billingSchema = z
  .object({
    dueDays: z.coerce.number().int().min(0).max(365).default(7),
    language: z.enum(["ar", "en"]).default("ar"),
    autoIssue: bool.default(false),
    autoSend: bool.default(false),
    sendTo: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() || null : v ?? null), z.string().refine(isEmail, "EMAIL_INVALID").nullable()).optional(),
    paymentTerms: optText(2000)
  })
  .refine((d) => !d.autoSend || d.autoIssue, { message: "AUTO_SEND_NEEDS_AUTO_ISSUE", path: ["autoSend"] });

const createSchema = z.object({
  clientId: z.string().min(1),
  contactId: optId,
  ownerId: optId,
  contractId: optId,
  serviceId: optId,
  planKey: optText(80),
  name: reqText(2, 200),
  description: optText(2000),
  interval: z.enum(INTERVALS),
  price: money,
  taxBehavior: z.enum(["STANDARD", "ZERO_RATED", "EXEMPT"]).default("STANDARD"),
  startDate: day,
  commitmentMonths: z.coerce.number().int().min(0).max(60).default(0),
  autoRenew: bool.default(true),
  renewalMonths: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(1).max(36).optional()),
  notes: optText(4000),
  /** null / absent = record the subscription without billing (finance starts it later) */
  billing: billingSchema.nullable().optional()
});

const planSchema = z.object({
  name: reqText(2, 200),
  description: optText(2000),
  price: money,
  serviceId: optId,
  planKey: optText(80),
  taxBehavior: z.enum(["STANDARD", "ZERO_RATED", "EXEMPT"]).optional(),
  note: optText(1000)
});
const termsSchema = z.object({
  autoRenew: bool,
  renewalMonths: z.coerce.number().int().min(1).max(36),
  ownerId: optId,
  contactId: optId,
  contractId: optId,
  notes: optText(4000)
});
const cancelSchema = z.object({ when: z.enum(["term_end", "date", "now"]), date: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.date().nullable()).optional(), reason: reqText(3, 1000) });

/** Monthly value of a price per period (MRR contribution). */
export const monthlyValue = (price: Prisma.Decimal | string | number, interval: RecurringInterval) => new Prisma.Decimal(price).div(intervalMonths(interval));

/** Last day of a term that starts on `from` and lasts `months` (inclusive). */
const termEnd = (from: Date, months: number) => addDays(addMonths(from, months), -1);

function checkMultiple(months: number, interval: RecurringInterval, code: string) {
  if (months % intervalMonths(interval) !== 0) throw invalid(code);
}

const lineFor = (s: { name: string; serviceId: string | null; price: Prisma.Decimal | string; taxBehavior: string }) => [
  { description: `${s.name} — {period}`, serviceId: s.serviceId, quantity: "1", unitPrice: new Prisma.Decimal(s.price).toFixed(2), discountType: "NONE", discountValue: "0", taxBehavior: s.taxBehavior }
];

async function orgToday(organizationId: string, db: Tx | typeof prisma = prisma, now = new Date()) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
  return todayIn(org.timezone, now);
}

async function logChange(tx: Tx, ctx: Ctx, s: { id: string }, kind: SubscriptionChangeKind, effectiveDate: Date, data: { before?: unknown; after?: unknown; note?: string | null } = {}) {
  await tx.subscriptionChange.create({
    data: {
      organizationId: ctx.organizationId,
      subscriptionId: s.id,
      kind,
      effectiveDate,
      before: data.before === undefined ? Prisma.JsonNull : (data.before as Prisma.InputJsonValue),
      after: data.after === undefined ? Prisma.JsonNull : (data.after as Prisma.InputJsonValue),
      note: data.note ?? null,
      actorId: ctx.userId || null
    }
  });
}

const label = (s: { number: string; name: string }) => `${s.number} · ${s.name}`;
const activity = (s: { id: string; number: string; name: string }) => ({ entityLabel: label(s), href: `/app/subscriptions/${s.id}`, visibility: "subscriptions.view" as const });

async function lock(tx: Tx, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Subscription" WHERE id = ${id} FOR UPDATE`;
  const s = await tx.subscription.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!s) throw notFound("Subscription");
  return s;
}

async function checkRefs(tx: Tx, ctx: Ctx, clientId: string, r: { contactId?: string | null; ownerId?: string | null; contractId?: string | null; serviceId?: string | null }) {
  if (r.contactId && !(await tx.contact.findFirst({ where: { id: r.contactId, clientId, deletedAt: null } }))) throw invalid("CONTACT_NOT_OF_CLIENT");
  if (r.ownerId && !(await tx.user.findFirst({ where: { id: r.ownerId, organizationId: ctx.organizationId, status: "ACTIVE" } }))) throw invalid("UNKNOWN_OWNER");
  if (r.contractId && !(await tx.contract.findFirst({ where: { id: r.contractId, organizationId: ctx.organizationId, clientId } }))) throw invalid("CONTRACT_NOT_OF_CLIENT");
  if (r.serviceId && !(await tx.service.findFirst({ where: { id: r.serviceId, organizationId: ctx.organizationId } }))) throw invalid("UNKNOWN_SERVICE");
}

/** The schedule's end date implied by the subscription: last day of service when cancelling, the term end without renewal. */
const scheduleEnd = (s: Pick<Subscription, "status" | "cancelAt" | "autoRenew" | "termEndDate">) => (s.status === "ENDING" ? s.cancelAt : !s.autoRenew ? s.termEndDate : null);

/** Creates the billing schedule for a subscription inside the transaction, billing from `from`. */
async function attachBillingTx(tx: Tx, uow: Uow, ctx: Ctx, s: Subscription, billing: z.output<typeof billingSchema>, from: Date) {
  requirePermission(ctx, "finance.invoices.create");
  const input = parseSchedule({
    clientId: s.clientId,
    contactId: s.contactId,
    title: label(s),
    interval: s.interval,
    startDate: ymd(from),
    endDate: ymd(scheduleEnd(s)),
    language: billing.language,
    dueDays: billing.dueDays,
    autoIssue: billing.autoIssue,
    autoSend: billing.autoSend,
    sendTo: billing.sendTo ?? null,
    paymentTerms: billing.paymentTerms ?? null,
    notes: null,
    items: lineFor(s)
  });
  const rec = await insertScheduleTx(tx, uow, ctx, input);
  await tx.subscription.update({ where: { id: s.id }, data: { recurringInvoiceId: rec.id } });
  return rec;
}

export async function createSubscription(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "subscriptions.manage");
  const input = createSchema.parse(raw);
  const renewalMonths = input.renewalMonths ?? intervalMonths(input.interval);
  checkMultiple(input.commitmentMonths, input.interval, "COMMITMENT_NOT_MULTIPLE");
  checkMultiple(renewalMonths, input.interval, "RENEWAL_NOT_MULTIPLE");
  if (Number(input.price) <= 0) throw invalid("PRICE_INVALID");
  if (input.billing) requirePermission(ctx, "finance.invoices.create");
  const out = await unitOfWork(ctx, async (tx, uow) => {
    const client = await tx.client.findFirst({ where: { id: input.clientId, organizationId: ctx.organizationId, deletedAt: null } });
    if (!client) throw invalid("UNKNOWN_CLIENT");
    await checkRefs(tx, ctx, client.id, input);
    const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { currency: true } });
    const s = await tx.subscription.create({
      data: {
        organizationId: ctx.organizationId,
        number: await nextNumber(tx, ctx.organizationId, "SUB"),
        clientId: client.id,
        contactId: input.contactId ?? null,
        ownerId: input.ownerId ?? (ctx.userId || null),
        contractId: input.contractId ?? null,
        serviceId: input.serviceId ?? null,
        planKey: input.planKey ?? null,
        name: input.name,
        description: input.description ?? null,
        interval: input.interval,
        price: input.price,
        currency: org.currency,
        taxBehavior: input.taxBehavior,
        startDate: input.startDate,
        commitmentMonths: input.commitmentMonths,
        termEndDate: input.commitmentMonths ? termEnd(input.startDate, input.commitmentMonths) : null,
        autoRenew: input.autoRenew,
        renewalMonths,
        notes: input.notes ?? null,
        createdById: ctx.userId || null
      }
    });
    await logChange(tx, ctx, s, "CREATED", s.startDate, { after: { name: s.name, price: s.price.toFixed(2), interval: s.interval, commitmentMonths: s.commitmentMonths, autoRenew: s.autoRenew } });
    let recId: string | null = null;
    if (input.billing) {
      recId = (await attachBillingTx(tx, uow, ctx, s, input.billing, s.startDate)).id;
      await logChange(tx, ctx, s, "BILLING_STARTED", s.startDate);
    }
    await uow.audit({ action: "subscription.created", entityType: "Subscription", entityId: s.id, after: { number: s.number, clientId: client.id, name: s.name, price: s.price.toFixed(2), interval: s.interval, commitmentMonths: s.commitmentMonths, billing: Boolean(recId) } });
    uow.emit({ type: "subscription.created", entityType: "Subscription", entityId: s.id, payload: { subscriptionId: s.id, number: s.number, clientName: client.displayName, name: s.name }, activity: activity(s) });
    return { id: s.id, recId };
  });
  if (out.recId) await runSchedule(out.recId, new Date()); // a start date of today (or earlier) bills right away
  return { id: out.id };
}

/** Switch billing on for a subscription recorded without it; billing starts at the next period on or after today. */
export async function startBilling(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "subscriptions.manage");
  requirePermission(ctx, "finance.invoices.create");
  const billing = billingSchema.parse(raw);
  const recId = await unitOfWork(ctx, async (tx, uow) => {
    const s = await lock(tx, ctx, id);
    if (s.recurringInvoiceId) throw conflict("BILLING_ALREADY_STARTED");
    if (s.status === "ENDED") throw conflict("SUBSCRIPTION_ENDED");
    const from = nextPeriodOnOrAfter(s.startDate, s.interval, await orgToday(ctx.organizationId, tx));
    const rec = await attachBillingTx(tx, uow, ctx, s, billing, from);
    if (s.status === "PAUSED") await tx.recurringInvoice.update({ where: { id: rec.id }, data: { status: "PAUSED", pauseReason: "SUBSCRIPTION_PAUSED" } });
    await logChange(tx, ctx, s, "BILLING_STARTED", from);
    await uow.audit({ action: "subscription.billing_started", entityType: "Subscription", entityId: id, after: { recurringInvoiceId: rec.id, from: ymd(from) } });
    return rec.id;
  });
  await runSchedule(recId, new Date());
  return { id };
}

export async function changePlan(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "subscriptions.manage");
  const input = planSchema.parse(raw);
  if (Number(input.price) <= 0) throw invalid("PRICE_INVALID");
  return unitOfWork(ctx, async (tx, uow) => {
    const s = await lock(tx, ctx, id);
    if (s.status === "ENDED") throw conflict("SUBSCRIPTION_ENDED");
    await checkRefs(tx, ctx, s.clientId, { serviceId: input.serviceId });
    const before = { name: s.name, price: s.price.toFixed(2), serviceId: s.serviceId, planKey: s.planKey, taxBehavior: s.taxBehavior };
    const next = await tx.subscription.update({
      where: { id },
      data: { name: input.name, description: input.description ?? s.description, price: input.price, serviceId: input.serviceId ?? null, planKey: input.planKey ?? null, taxBehavior: input.taxBehavior ?? s.taxBehavior }
    });
    const after = { name: next.name, price: next.price.toFixed(2), serviceId: next.serviceId, planKey: next.planKey, taxBehavior: next.taxBehavior };
    if (s.recurringInvoiceId) {
      if (!can(ctx, "finance.invoices.create")) throw invalid("BILLING_NEEDS_FINANCE");
      await tx.recurringInvoice.update({ where: { id: s.recurringInvoiceId }, data: { items: lineFor(next) as unknown as Prisma.InputJsonValue, title: label(next) } });
    }
    const effective = s.recurringInvoiceId ? (await tx.recurringInvoice.findUniqueOrThrow({ where: { id: s.recurringInvoiceId }, select: { nextRunDate: true } })).nextRunDate : await orgToday(ctx.organizationId, tx);
    await logChange(tx, ctx, s, "PLAN_CHANGED", effective, { before, after, note: input.note });
    await uow.audit({ action: "subscription.plan_changed", entityType: "Subscription", entityId: id, before, after });
    uow.emit({ type: "subscription.plan_changed", entityType: "Subscription", entityId: id, payload: { subscriptionId: id, number: s.number, from: before.price, to: after.price }, activity: activity(next) });
    return { id };
  });
}

export async function updateTerms(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "subscriptions.manage");
  const input = termsSchema.parse(raw);
  const recId = await unitOfWork(ctx, async (tx, uow) => {
    const s = await lock(tx, ctx, id);
    if (s.status === "ENDED") throw conflict("SUBSCRIPTION_ENDED");
    checkMultiple(input.renewalMonths, s.interval, "RENEWAL_NOT_MULTIPLE");
    await checkRefs(tx, ctx, s.clientId, input);
    const next = await tx.subscription.update({
      where: { id },
      data: { autoRenew: input.autoRenew, renewalMonths: input.renewalMonths, ownerId: input.ownerId ?? null, contactId: input.contactId ?? null, contractId: input.contractId ?? null, notes: input.notes ?? null }
    });
    if (s.recurringInvoiceId && s.autoRenew !== next.autoRenew) await syncScheduleEnd(tx, next);
    if (s.recurringInvoiceId && s.contactId !== next.contactId) await tx.recurringInvoice.update({ where: { id: s.recurringInvoiceId }, data: { contactId: next.contactId } });
    const changed = (["autoRenew", "renewalMonths", "ownerId", "contactId", "contractId", "notes"] as const).filter((k) => String(s[k] ?? "") !== String(next[k] ?? ""));
    if (changed.length) await uow.audit({ action: "subscription.updated", entityType: "Subscription", entityId: id, after: { changed, autoRenew: next.autoRenew, renewalMonths: next.renewalMonths } });
    return next.status === "ACTIVE" ? next.recurringInvoiceId : null;
  });
  if (recId) await runSchedule(recId, new Date());
  return { id };
}

/** Keeps the schedule's end date (and an ENDED-by-end-date schedule) in step with the subscription. */
async function syncScheduleEnd(tx: Tx, s: Subscription) {
  if (!s.recurringInvoiceId) return;
  const r = await tx.recurringInvoice.findUniqueOrThrow({ where: { id: s.recurringInvoiceId } });
  const endDate = scheduleEnd(s);
  // a schedule that stopped only because it reached its end date resumes when that end moves later or goes away
  const reopen = r.status === "ENDED" && s.status !== "ENDED" && s.status !== "PAUSED" && (!endDate || r.nextRunDate <= endDate);
  await tx.recurringInvoice.update({ where: { id: r.id }, data: { endDate, ...(reopen ? { status: "ACTIVE", pauseReason: null } : {}) } });
}

export async function pauseSubscription(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "subscriptions.manage");
  const { reason } = z.object({ reason: reqText(3, 1000) }).parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const s = await lock(tx, ctx, id);
    if (s.status !== "ACTIVE") throw conflict(`SUBSCRIPTION_INVALID_TRANSITION:${s.status}`);
    const today = await orgToday(ctx.organizationId, tx);
    await tx.subscription.update({ where: { id }, data: { status: "PAUSED", pausedAt: today, pauseReason: reason } });
    if (s.recurringInvoiceId) await tx.recurringInvoice.update({ where: { id: s.recurringInvoiceId }, data: { status: "PAUSED", pauseReason: "SUBSCRIPTION_PAUSED" } });
    await logChange(tx, ctx, s, "PAUSED", today, { note: reason });
    await uow.audit({ action: "subscription.paused", entityType: "Subscription", entityId: id, before: { status: s.status }, after: { status: "PAUSED", reason } });
    uow.emit({ type: "subscription.paused", entityType: "Subscription", entityId: id, payload: { subscriptionId: id, number: s.number }, activity: activity(s) });
    return { id };
  });
}

export async function resumeSubscription(ctx: Ctx, id: string) {
  requirePermission(ctx, "subscriptions.manage");
  const recId = await unitOfWork(ctx, async (tx, uow) => {
    const s = await lock(tx, ctx, id);
    if (s.status !== "PAUSED") throw conflict(`SUBSCRIPTION_INVALID_TRANSITION:${s.status}`);
    const today = await orgToday(ctx.organizationId, tx);
    const next = await tx.subscription.update({ where: { id }, data: { status: "ACTIVE", pausedAt: null, pauseReason: null } });
    if (s.recurringInvoiceId) {
      const r = await tx.recurringInvoice.findUniqueOrThrow({ where: { id: s.recurringInvoiceId } });
      // the paused periods are never billed: billing continues from the next period start on or after today
      const nextRun = r.nextRunDate >= today ? r.nextRunDate : nextPeriodOnOrAfter(r.startDate, r.interval, today);
      await tx.recurringInvoice.update({ where: { id: r.id }, data: { status: "ACTIVE", pauseReason: null, nextRunDate: nextRun } });
      await syncScheduleEnd(tx, next);
    }
    await logChange(tx, ctx, s, "RESUMED", today, { before: { pausedAt: ymd(s.pausedAt) } });
    await uow.audit({ action: "subscription.resumed", entityType: "Subscription", entityId: id, before: { status: "PAUSED" }, after: { status: "ACTIVE" } });
    uow.emit({ type: "subscription.resumed", entityType: "Subscription", entityId: id, payload: { subscriptionId: id, number: s.number }, activity: activity(s) });
    return s.recurringInvoiceId;
  });
  if (recId) await runSchedule(recId, new Date());
  return { id };
}

/**
 * Cancel at the end of the current term, on a date (the last day of service), or now. A date inside the minimum
 * commitment is allowed but recorded as an early termination (the commercial consequence is agreed with the client).
 */
export async function cancelSubscription(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "subscriptions.manage");
  const input = cancelSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const s = await lock(tx, ctx, id);
    if (s.status === "ENDED") throw conflict("SUBSCRIPTION_ENDED");
    const today = await orgToday(ctx.organizationId, tx);
    let cancelAt: Date;
    if (input.when === "now") cancelAt = today;
    else if (input.when === "term_end") {
      if (!s.termEndDate) throw invalid("NO_TERM_END");
      cancelAt = s.termEndDate;
    } else {
      if (!input.date) throw invalid("CANCEL_DATE_REQUIRED");
      cancelAt = input.date;
    }
    if (cancelAt < today) throw invalid("CANCEL_DATE_PAST");
    if (cancelAt < s.startDate) throw invalid("CANCEL_BEFORE_START");
    const commitmentEnd = s.commitmentMonths ? termEnd(s.startDate, s.commitmentMonths) : null;
    const early = Boolean(commitmentEnd && cancelAt < commitmentEnd);
    const endNow = input.when === "now";
    const next = await tx.subscription.update({
      where: { id },
      data: endNow
        ? { status: "ENDED", cancelAt, cancelReason: input.reason, endedAt: new Date(), pausedAt: null, pauseReason: null }
        : { status: "ENDING", cancelAt, cancelReason: input.reason, pausedAt: null, pauseReason: null }
    });
    if (s.recurringInvoiceId) {
      if (endNow) await tx.recurringInvoice.update({ where: { id: s.recurringInvoiceId }, data: { status: "ENDED", endDate: cancelAt } });
      else {
        // a paused subscription that is being cancelled resumes billing until its last day only if it was active
        if (s.status === "PAUSED") await tx.recurringInvoice.update({ where: { id: s.recurringInvoiceId }, data: { endDate: cancelAt } });
        else await syncScheduleEnd(tx, next);
      }
    }
    await logChange(tx, ctx, s, endNow ? "ENDED" : "CANCEL_SCHEDULED", cancelAt, { before: { status: s.status }, after: { cancelAt: ymd(cancelAt), early }, note: input.reason });
    await uow.audit({ action: endNow ? "subscription.ended" : "subscription.cancel_scheduled", entityType: "Subscription", entityId: id, before: { status: s.status }, after: { status: next.status, cancelAt: ymd(cancelAt), early, reason: input.reason } });
    uow.emit({ type: endNow ? "subscription.ended" : "subscription.cancel_scheduled", entityType: "Subscription", entityId: id, payload: { subscriptionId: id, number: s.number, cancelAt: ymd(cancelAt) ?? "", early: String(early) }, activity: activity(s) });
    return { id, early };
  });
}

export async function revokeCancellation(ctx: Ctx, id: string) {
  requirePermission(ctx, "subscriptions.manage");
  const recId = await unitOfWork(ctx, async (tx, uow) => {
    const s = await lock(tx, ctx, id);
    if (s.status !== "ENDING") throw conflict(`SUBSCRIPTION_INVALID_TRANSITION:${s.status}`);
    const today = await orgToday(ctx.organizationId, tx);
    const next = await tx.subscription.update({ where: { id }, data: { status: "ACTIVE", cancelAt: null, cancelReason: null } });
    if (s.recurringInvoiceId) {
      const r = await tx.recurringInvoice.findUniqueOrThrow({ where: { id: s.recurringInvoiceId } });
      // cancelled while paused: billing restarts from the next period (the paused periods are never billed)
      if (r.status === "PAUSED") await tx.recurringInvoice.update({ where: { id: r.id }, data: { status: "ACTIVE", pauseReason: null, nextRunDate: r.nextRunDate >= today ? r.nextRunDate : nextPeriodOnOrAfter(r.startDate, r.interval, today) } });
      await syncScheduleEnd(tx, next);
    }
    await logChange(tx, ctx, s, "CANCEL_REVOKED", today, { before: { cancelAt: ymd(s.cancelAt) } });
    await uow.audit({ action: "subscription.cancel_revoked", entityType: "Subscription", entityId: id, before: { status: "ENDING", cancelAt: ymd(s.cancelAt) }, after: { status: "ACTIVE" } });
    return s.recurringInvoiceId;
  });
  if (recId) await runSchedule(recId, new Date());
  return { id };
}

export async function addSubscriptionNote(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "subscriptions.manage");
  const { note } = z.object({ note: reqText(2, 2000) }).parse(raw);
  return unitOfWork(ctx, async (tx) => {
    const s = await lock(tx, ctx, id);
    await logChange(tx, ctx, s, "NOTE", await orgToday(ctx.organizationId, tx), { note });
    return { id };
  });
}

// ---------------------------------------------------------------------------
// Sweep — ends due cancellations, renews terms, sends renewal notices (idempotent; run under the billing lease)
// ---------------------------------------------------------------------------

export async function sweepSubscriptions(organizationId: string, now = new Date()) {
  const { systemCtx } = await import("../context");
  const ctx = systemCtx(organizationId, { ip: "system", userAgent: "subscriptions-sweep" });
  const today = await orgToday(organizationId, prisma, now);
  const out = { ended: 0, renewed: 0, expired: 0, notices: 0 };

  // 1 · scheduled cancellations whose last day of service has passed
  const due = await prisma.subscription.findMany({ where: { organizationId, status: "ENDING", cancelAt: { lt: today } }, select: { id: true }, take: 500 });
  for (const d of due) {
    await unitOfWork(ctx, async (tx, uow) => {
      const s = await lock(tx, ctx, d.id);
      if (s.status !== "ENDING" || !s.cancelAt || s.cancelAt >= today) return;
      await tx.subscription.update({ where: { id: s.id }, data: { status: "ENDED", endedAt: now } });
      if (s.recurringInvoiceId) await tx.recurringInvoice.update({ where: { id: s.recurringInvoiceId }, data: { status: "ENDED" } });
      await logChange(tx, ctx, s, "ENDED", s.cancelAt, { note: s.cancelReason });
      await uow.audit({ action: "subscription.ended", entityType: "Subscription", entityId: s.id, before: { status: "ENDING" }, after: { status: "ENDED", cancelAt: ymd(s.cancelAt) } });
      uow.emit({ type: "subscription.ended", entityType: "Subscription", entityId: s.id, payload: { subscriptionId: s.id, number: s.number, ownerId: s.ownerId ?? "", cancelAt: ymd(s.cancelAt) ?? "" }, activity: activity(s) });
      out.ended++;
    });
  }

  // 2 · terms that are over: renew (automatic renewal) or end
  const over = await prisma.subscription.findMany({ where: { organizationId, status: { in: ["ACTIVE", "PAUSED"] }, termEndDate: { lt: today } }, select: { id: true }, take: 500 });
  for (const o of over) {
    await unitOfWork(ctx, async (tx, uow) => {
      const s = await lock(tx, ctx, o.id);
      if (!(s.status === "ACTIVE" || s.status === "PAUSED") || !s.termEndDate || s.termEndDate >= today) return;
      if (s.autoRenew) {
        let end = s.termEndDate;
        while (end < today) end = termEnd(addDays(end, 1), s.renewalMonths);
        const next = await tx.subscription.update({ where: { id: s.id }, data: { termEndDate: end, renewalNoticeFor: null } });
        await syncScheduleEnd(tx, next);
        await logChange(tx, ctx, s, "RENEWED", addDays(s.termEndDate, 1), { before: { termEndDate: ymd(s.termEndDate) }, after: { termEndDate: ymd(end) } });
        await uow.audit({ action: "subscription.renewed", entityType: "Subscription", entityId: s.id, before: { termEndDate: ymd(s.termEndDate) }, after: { termEndDate: ymd(end) } });
        uow.emit({ type: "subscription.renewed", entityType: "Subscription", entityId: s.id, payload: { subscriptionId: s.id, number: s.number, ownerId: s.ownerId ?? "", termEndDate: ymd(end) ?? "" }, activity: activity(s) });
        out.renewed++;
      } else {
        await tx.subscription.update({ where: { id: s.id }, data: { status: "ENDED", endedAt: now, cancelAt: s.termEndDate, cancelReason: s.cancelReason ?? "TERM_ENDED" } });
        if (s.recurringInvoiceId) await tx.recurringInvoice.update({ where: { id: s.recurringInvoiceId }, data: { status: "ENDED" } });
        await logChange(tx, ctx, s, "ENDED", s.termEndDate, { note: "TERM_ENDED" });
        await uow.audit({ action: "subscription.ended", entityType: "Subscription", entityId: s.id, before: { status: s.status }, after: { status: "ENDED", reason: "TERM_ENDED", termEndDate: ymd(s.termEndDate) } });
        uow.emit({ type: "subscription.ended", entityType: "Subscription", entityId: s.id, payload: { subscriptionId: s.id, number: s.number, ownerId: s.ownerId ?? "", cancelAt: ymd(s.termEndDate) ?? "" }, activity: activity(s) });
        out.expired++;
      }
    });
  }

  // 3 · renewal notices: once per term end, RENEWAL_NOTICE_DAYS ahead (the owner decides before it renews or ends)
  const soon = await prisma.subscription.findMany({ where: { organizationId, status: "ACTIVE", termEndDate: { gte: today, lte: addDays(today, RENEWAL_NOTICE_DAYS) } }, include: { client: { select: { displayName: true } } }, take: 500 });
  for (const s of soon) {
    if (s.renewalNoticeFor && s.termEndDate && s.renewalNoticeFor.getTime() === s.termEndDate.getTime()) continue;
    await unitOfWork(ctx, async (tx, uow) => {
      const r = await tx.subscription.updateMany({ where: { id: s.id, status: "ACTIVE", termEndDate: s.termEndDate, OR: [{ renewalNoticeFor: null }, { renewalNoticeFor: { not: s.termEndDate! } }] }, data: { renewalNoticeFor: s.termEndDate } });
      if (r.count !== 1) return;
      uow.emit({ type: "subscription.renewal_due", entityType: "Subscription", entityId: s.id, payload: { subscriptionId: s.id, number: s.number, name: s.name, clientName: s.client.displayName, ownerId: s.ownerId ?? "", termEndDate: ymd(s.termEndDate) ?? "", autoRenew: String(s.autoRenew) } });
      out.notices++;
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "PAUSED", "ENDING", "ENDED", "current", "renewing", "unbilled"]).optional(),
  client: z.string().max(40).optional()
});

export async function listSubscriptions(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "subscriptions.view");
  const f = listSchema.safeParse(raw ?? {}).data ?? {};
  const today = await orgToday(ctx.organizationId);
  const where: Prisma.SubscriptionWhereInput = { organizationId: ctx.organizationId };
  const and: Prisma.SubscriptionWhereInput[] = [];
  if (f.q) and.push({ OR: [{ name: { contains: f.q, mode: "insensitive" } }, { number: { contains: f.q.toUpperCase() } }, { client: { displayName: { contains: f.q, mode: "insensitive" } } }] });
  if (!f.status || f.status === "current") and.push({ status: { not: "ENDED" } });
  else if (f.status === "renewing") and.push({ status: "ACTIVE", termEndDate: { gte: today, lte: addDays(today, RENEWAL_NOTICE_DAYS) } });
  else if (f.status === "unbilled") and.push({ status: { not: "ENDED" }, recurringInvoiceId: null });
  else and.push({ status: f.status });
  if (f.client) and.push({ clientId: f.client });
  const rows = await prisma.subscription.findMany({
    where: { ...where, AND: and },
    orderBy: [{ status: "asc" }, { termEndDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 300,
    include: { client: { select: { id: true, displayName: true } }, recurring: { select: { id: true, number: true, nextRunDate: true, status: true } } }
  });
  return { rows, filters: f, today };
}

/** Headline numbers: MRR / ARR (active, ending and paused excluded), counts, renewals, new and churn in 30 days. */
export async function subscriptionMetrics(ctx: Ctx) {
  requirePermission(ctx, "subscriptions.view");
  const today = await orgToday(ctx.organizationId);
  const since = addDays(today, -30);
  const all = await prisma.subscription.findMany({ where: { organizationId: ctx.organizationId }, select: { status: true, price: true, interval: true, termEndDate: true, startDate: true, endedAt: true, recurringInvoiceId: true, currency: true } });
  let mrr = new Prisma.Decimal(0);
  const counts = { ACTIVE: 0, PAUSED: 0, ENDING: 0, ENDED: 0 };
  let renewing = 0, fresh = 0, churned = 0, unbilled = 0, churnedMrr = new Prisma.Decimal(0);
  for (const s of all) {
    counts[s.status]++;
    if (s.status === "ACTIVE" || s.status === "ENDING") mrr = mrr.plus(monthlyValue(s.price, s.interval));
    if (s.status === "ACTIVE" && s.termEndDate && s.termEndDate >= today && s.termEndDate <= addDays(today, RENEWAL_NOTICE_DAYS)) renewing++;
    if (s.startDate >= since && s.startDate <= today) fresh++;
    if (s.status === "ENDED" && s.endedAt && s.endedAt >= since) {
      churned++;
      churnedMrr = churnedMrr.plus(monthlyValue(s.price, s.interval));
    }
    if (s.status !== "ENDED" && !s.recurringInvoiceId) unbilled++;
  }
  const base = counts.ACTIVE + counts.ENDING + counts.PAUSED + churned;
  return { mrr: mrr.toFixed(2), arr: mrr.times(12).toFixed(2), counts, renewing, fresh, churned, churnedMrr: churnedMrr.toFixed(2), churnRate: base ? Math.round((churned / base) * 1000) / 10 : 0, unbilled, currency: all[0]?.currency ?? "SAR" };
}

export async function getSubscription(ctx: Ctx, id: string) {
  requirePermission(ctx, "subscriptions.view");
  const s = await prisma.subscription.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      client: { select: { id: true, displayName: true, number: true } },
      service: { select: { id: true, nameAr: true, nameEn: true } },
      changes: { orderBy: { createdAt: "desc" }, take: 200 },
      recurring: {
        include: {
          invoices: can(ctx, "finance.invoices.view")
            ? { orderBy: { recurringPeriodStart: "desc" }, take: 60, select: { id: true, number: true, status: true, total: true, balanceDue: true, currency: true, recurringPeriodStart: true, dueDate: true } }
            : false
        }
      }
    }
  });
  if (!s) throw notFound("Subscription");
  const userIds = [...new Set([s.ownerId, s.createdById, ...s.changes.map((c) => c.actorId)].filter(Boolean) as string[])];
  const [users, contact, contract, org] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, nameAr: true } }),
    s.contactId ? prisma.contact.findUnique({ where: { id: s.contactId }, select: { id: true, firstName: true, lastName: true, email: true } }) : null,
    s.contractId ? prisma.contract.findUnique({ where: { id: s.contractId }, select: { id: true, number: true, title: true } }) : null,
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { vatRate: true, timezone: true } })
  ]);
  const vat = s.taxBehavior === "STANDARD" ? new Prisma.Decimal(org.vatRate).div(100) : new Prisma.Decimal(0);
  const today = todayIn(org.timezone);
  return {
    s,
    users: Object.fromEntries(users.map((u) => [u.id, u])),
    contact,
    contract,
    today,
    commitmentEnd: s.commitmentMonths ? termEnd(s.startDate, s.commitmentMonths) : null,
    priceWithVat: s.price.times(vat.plus(1)).toDecimalPlaces(2).toFixed(2),
    vatRate: org.vatRate.toFixed(2).replace(/\.00$/, ""),
    monthly: monthlyValue(s.price, s.interval).toDecimalPlaces(2).toFixed(2)
  };
}

export async function clientSubscriptions(ctx: Ctx, clientId: string) {
  requirePermission(ctx, "subscriptions.view");
  return prisma.subscription.findMany({ where: { organizationId: ctx.organizationId, clientId }, orderBy: [{ status: "asc" }, { startDate: "desc" }], select: { id: true, number: true, name: true, status: true, price: true, interval: true, currency: true, termEndDate: true, startDate: true, recurringInvoiceId: true } });
}

/** Options for the forms: clients, contacts by client, owners, services, contracts by client. */
export async function subscriptionFormData(ctx: Ctx) {
  requirePermission(ctx, "subscriptions.view");
  const [clients, contacts, owners, services, contracts, org] = await Promise.all([
    prisma.client.findMany({ where: { organizationId: ctx.organizationId, deletedAt: null, status: { not: "ARCHIVED" } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true, number: true } }),
    prisma.contact.findMany({ where: { organizationId: ctx.organizationId, clientId: { not: null }, deletedAt: null }, orderBy: { firstName: "asc" }, select: { id: true, clientId: true, firstName: true, lastName: true } }),
    prisma.user.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true } }),
    prisma.service.findMany({ where: { organizationId: ctx.organizationId, active: true }, orderBy: { nameEn: "asc" }, select: { id: true, nameAr: true, nameEn: true } }),
    prisma.contract.findMany({ where: { organizationId: ctx.organizationId, status: { notIn: ["CANCELLED", "TERMINATED"] } }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, clientId: true, number: true, title: true } }),
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true, vatRate: true } })
  ]);
  const byClient = <T extends { clientId: string | null }>(rows: T[], f: (r: T) => { id: string; label: string }) => {
    const out: Record<string, { id: string; label: string }[]> = {};
    for (const r of rows) if (r.clientId) (out[r.clientId] ??= []).push(f(r));
    return out;
  };
  return {
    today: ymd(todayIn(org.timezone))!,
    vatRate: org.vatRate.toFixed(2).replace(/\.00$/, ""),
    clients: clients.map((c) => ({ id: c.id, label: `${c.displayName} · ${c.number}` })),
    contactsByClient: byClient(contacts, (c) => ({ id: c.id, label: `${c.firstName} ${c.lastName ?? ""}`.trim() })),
    contractsByClient: byClient(contracts, (c) => ({ id: c.id, label: `${c.number} · ${c.title}` })),
    owners: owners.map((u) => ({ id: u.id, name: u.name, nameAr: u.nameAr })),
    services: services.map((s) => ({ id: s.id, nameAr: s.nameAr, nameEn: s.nameEn }))
  };
}
