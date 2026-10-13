import { z } from "zod";
import type { Prisma, RecurringInterval } from "@/generated/prisma/client";
import { prisma } from "../db";
import { requirePermission, type Ctx } from "../context";
import { conflict, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { optId, optText, reqText } from "../crm/normalize";
import { nextNumber } from "../crm/sequence";
import { addDays, todayIn, ymd } from "../commercial/dates";
import { isPermission } from "../rbac/permissions";
import { buildLines, insertDraftTx, issueInvoice, itemSchema, orgFinance } from "./invoices";
import { emailInvoice } from "./invoice-email";
import { isEmail } from "../notify/mailer";

/**
 * Recurring invoices (subscriptions, retainers, the dedicated tech team plans) — docs/FINANCE.md.
 *
 * A schedule bills one period per interval (monthly / quarterly / 6-monthly / yearly) on nextRunDate. Generation runs in
 * the finance sweep (and right after a schedule is created) AS THE SCHEDULE OWNER with that person's current
 * permissions: a draft always; issued when autoIssue is on and the owner may issue; e-mailed when autoSend is on and
 * the owner may send. An owner who is disabled or lost finance.invoices.create pauses the schedule (pauseReason).
 * Periods are anchored on the start date (31 Jan → 28/29 Feb → 31 Mar), one live invoice per period is guaranteed by
 * the partial unique index "Invoice_recurring_one_per_period", and a sweep catches up at most 3 missed periods per run.
 */

const MONTHS: Record<RecurringInterval, number> = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6, ANNUAL: 12 };
const MAX_CATCH_UP = 3;

/** The k-th period start: start date + k × step months, the day clamped to the month's length. */
export function periodStart(start: Date, interval: RecurringInterval, k: number): Date {
  const months = start.getUTCMonth() + k * MONTHS[interval];
  const y = start.getUTCFullYear() + Math.floor(months / 12);
  const m = ((months % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(start.getUTCDate(), last)));
}
const periodIndex = (start: Date, interval: RecurringInterval, d: Date) =>
  Math.round(((d.getUTCFullYear() - start.getUTCFullYear()) * 12 + d.getUTCMonth() - start.getUTCMonth()) / MONTHS[interval]);

export function periodLabel(from: Date, interval: RecurringInterval, start: Date, lang: "ar" | "en") {
  const to = addDays(periodStart(start, interval, periodIndex(start, interval, from) + 1), -1);
  const f = (d: Date, withYear: boolean) => new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(d);
  return `${f(from, from.getUTCFullYear() !== to.getUTCFullYear())} – ${f(to, true)}`;
}

const lineSchema = itemSchema.omit({ projectId: true });
/** The schedule's stored lines, re-validated on every read. */
const storedLines = (json: Prisma.JsonValue) => z.array(lineSchema).parse(json);
const scheduleSchema = z
  .object({
    clientId: z.string().min(1),
    contactId: optId,
    title: reqText(2, 200),
    interval: z.enum(["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"]),
    startDate: z.coerce.date(),
    endDate: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.date().nullable()).optional(),
    maxOccurrences: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(600).nullable()).optional(),
    language: z.enum(["ar", "en"]).default("ar"),
    dueDays: z.coerce.number().int().min(0).max(365).default(30),
    autoIssue: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()).default(false),
    autoSend: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()).default(false),
    sendTo: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() || null : v ?? null), z.string().refine(isEmail, "EMAIL_INVALID").nullable()).optional(),
    paymentTerms: optText(2000),
    notes: optText(4000),
    items: z.array(lineSchema).min(1).max(50)
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, { message: "END_BEFORE_START", path: ["endDate"] })
  .refine((d) => !d.autoSend || d.autoIssue, { message: "AUTO_SEND_NEEDS_AUTO_ISSUE", path: ["autoSend"] });

/** Current permissions of a user (the schedule owner), or null when the account is not active. */
async function ownerCtx(organizationId: string, userId: string | null): Promise<Ctx | null> {
  if (!userId) return null;
  const u = await prisma.user.findFirst({ where: { id: userId, organizationId, status: "ACTIVE" }, include: { roles: { include: { role: { include: { permissions: true } } } } } });
  if (!u) return null;
  return {
    organizationId,
    userId: u.id,
    userName: u.name,
    roleKeys: u.roles.map((r) => r.role.key),
    permissions: new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission)).filter(isPermission)),
    meta: { ip: "system", userAgent: "recurring-invoices" }
  };
}

export async function createRecurring(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "finance.invoices.create");
  const input = scheduleSchema.parse(raw);
  const rec = await unitOfWork(ctx, async (tx, uow) => {
    const client = await tx.client.findFirst({ where: { id: input.clientId, organizationId: ctx.organizationId, deletedAt: null } });
    if (!client) throw invalid("UNKNOWN_CLIENT");
    if (input.contactId && !(await tx.contact.findFirst({ where: { id: input.contactId, clientId: client.id } }))) throw invalid("CONTACT_NOT_OF_CLIENT");
    const org = await orgFinance(tx, ctx.organizationId);
    await buildLines(tx, ctx, input.items.map((i) => ({ ...i, projectId: null })), org.vatRate.toFixed(2)); // validates lines and services
    const r = await tx.recurringInvoice.create({
      data: {
        organizationId: ctx.organizationId,
        number: await nextNumber(tx, ctx.organizationId, "REC"),
        clientId: client.id,
        contactId: input.contactId ?? null,
        title: input.title,
        interval: input.interval,
        startDate: input.startDate,
        nextRunDate: input.startDate,
        endDate: input.endDate ?? null,
        maxOccurrences: input.maxOccurrences ?? null,
        language: input.language,
        currency: org.currency,
        dueDays: input.dueDays,
        autoIssue: input.autoIssue,
        autoSend: input.autoSend,
        sendTo: input.sendTo ?? null,
        paymentTerms: input.paymentTerms ?? null,
        notes: input.notes ?? null,
        items: input.items as unknown as Prisma.InputJsonValue,
        createdById: ctx.userId || null
      }
    });
    await uow.audit({ action: "recurring_invoice.created", entityType: "RecurringInvoice", entityId: r.id, after: { number: r.number, clientId: client.id, interval: r.interval, startDate: ymd(r.startDate), autoIssue: r.autoIssue, autoSend: r.autoSend } });
    return r;
  });
  await runSchedule(rec.id, new Date()); // a start date of today (or earlier) bills right away
  return { id: rec.id };
}

export async function setRecurringStatus(ctx: Ctx, id: string, status: "ACTIVE" | "PAUSED" | "ENDED") {
  requirePermission(ctx, "finance.invoices.create");
  const res = await unitOfWork(ctx, async (tx, uow) => {
    const r = await tx.recurringInvoice.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!r) throw notFound("RecurringInvoice");
    if (r.status === "ENDED") throw conflict("RECURRING_ENDED");
    await tx.recurringInvoice.update({ where: { id }, data: { status, pauseReason: null } });
    await uow.audit({ action: "recurring_invoice.status", entityType: "RecurringInvoice", entityId: id, before: { status: r.status }, after: { status } });
    return status;
  });
  if (res === "ACTIVE") await runSchedule(id, new Date());
  return { status: res };
}

export async function listRecurring(ctx: Ctx) {
  requirePermission(ctx, "finance.invoices.view");
  const rows = await prisma.recurringInvoice.findMany({ where: { organizationId: ctx.organizationId }, orderBy: [{ status: "asc" }, { nextRunDate: "asc" }], include: { client: { select: { id: true, displayName: true } } } });
  const org = await orgFinance(prisma, ctx.organizationId);
  return Promise.all(rows.map(async (r) => ({ ...r, total: (await buildLines(prisma, ctx, storedLines(r.items).map((i) => ({ ...i, projectId: null })), org.vatRate.toFixed(2))).totals.total })));
}

export async function getRecurring(ctx: Ctx, id: string) {
  requirePermission(ctx, "finance.invoices.view");
  const r = await prisma.recurringInvoice.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { client: { select: { id: true, displayName: true } }, invoices: { orderBy: { recurringPeriodStart: "desc" }, select: { id: true, number: true, status: true, total: true, balanceDue: true, currency: true, recurringPeriodStart: true, issueDate: true, dueDate: true } } }
  });
  if (!r) throw notFound("RecurringInvoice");
  const org = await orgFinance(prisma, ctx.organizationId);
  const lines = storedLines(r.items);
  const { totals } = await buildLines(prisma, ctx, lines.map((i) => ({ ...i, projectId: null })), org.vatRate.toFixed(2));
  const owner = r.createdById ? await prisma.user.findUnique({ where: { id: r.createdById }, select: { name: true, nameAr: true } }) : null;
  return { schedule: r, lines, totals, owner };
}

/**
 * Bills every due period of one schedule (at most MAX_CATCH_UP per call). Each period: draft in one transaction with
 * the schedule advance (row lock), then issue / e-mail as the owner. Returns the created invoice ids.
 */
export async function runSchedule(id: string, now = new Date()) {
  const created: string[] = [];
  for (let n = 0; n < MAX_CATCH_UP; n++) {
    const r = await prisma.recurringInvoice.findUnique({ where: { id } });
    if (!r || r.status !== "ACTIVE") break;
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: r.organizationId }, select: { timezone: true } });
    const today = todayIn(org.timezone, now);
    if (r.nextRunDate > today) break;
    const ctx = await ownerCtx(r.organizationId, r.createdById);
    if (!ctx || !ctx.permissions.has("finance.invoices.create")) {
      await prisma.recurringInvoice.update({ where: { id }, data: { status: "PAUSED", pauseReason: "OWNER_NO_PERMISSION" } });
      break;
    }
    const k = periodIndex(r.startDate, r.interval, r.nextRunDate);
    const period = r.nextRunDate;
    const following = periodStart(r.startDate, r.interval, k + 1);
    const ended = (r.endDate && period > r.endDate) || (r.maxOccurrences !== null && r.generatedCount >= r.maxOccurrences);
    if (ended) {
      await prisma.recurringInvoice.update({ where: { id }, data: { status: "ENDED" } });
      break;
    }
    const label = periodLabel(period, r.interval, r.startDate, r.language as "ar" | "en");
    const invoiceId = await unitOfWork(ctx, async (tx, uow) => {
      const locked = await tx.$queryRaw<{ nextRunDate: Date }[]>`SELECT "nextRunDate" FROM "RecurringInvoice" WHERE id = ${id} FOR UPDATE`;
      if (!locked.length || locked[0].nextRunDate.getTime() !== period.getTime()) return null; // another run advanced it
      const exists = await tx.invoice.findFirst({ where: { recurringInvoiceId: id, recurringPeriodStart: period, status: { notIn: ["CANCELLED", "VOID"] } }, select: { id: true } });
      let invId: string | null = exists?.id ?? null;
      if (!invId) {
        const items = storedLines(r.items).map((i) => ({ ...i, description: i.description.replaceAll("{period}", label) }));
        const periodNote = r.language === "ar" ? `فترة الفاتورة: ${label} — ${r.title} (${r.number})` : `Billing period: ${label} — ${r.title} (${r.number})`;
        const { invoice } = await insertDraftTx(
          tx,
          uow,
          ctx,
          { clientId: r.clientId, contactId: r.contactId ?? undefined, language: r.language as "ar" | "en", currency: r.currency, issueDate: period, dueDate: addDays(period, r.dueDays), paymentTerms: r.paymentTerms ?? undefined, notes: [periodNote, r.notes].filter(Boolean).join("\n"), items },
          { sourceType: "MANUAL", recurringInvoiceId: id, recurringPeriodStart: period }
        );
        invId = invoice.id;
      }
      const count = r.generatedCount + (exists ? 0 : 1);
      const done = (r.endDate && following > r.endDate) || (r.maxOccurrences !== null && count >= r.maxOccurrences);
      await tx.recurringInvoice.update({ where: { id }, data: { nextRunDate: following, generatedCount: count, status: done ? "ENDED" : "ACTIVE" } });
      await uow.audit({ action: "recurring_invoice.generated", entityType: "RecurringInvoice", entityId: id, after: { invoiceId: invId, period: ymd(period), next: done ? null : ymd(following) } });
      return exists ? null : invId;
    });
    if (!invoiceId) continue;
    created.push(invoiceId);
    // optional automation — a failure leaves a draft (or an unsent invoice) and is recorded, never retried blindly
    if (r.autoIssue && ctx.permissions.has("finance.invoices.issue")) {
      try {
        await issueInvoice(ctx, invoiceId);
        if (r.autoSend && ctx.permissions.has("finance.invoices.send")) {
          const contact = r.contactId ? await prisma.contact.findUnique({ where: { id: r.contactId }, select: { email: true } }) : null;
          const client = await prisma.client.findUniqueOrThrow({ where: { id: r.clientId }, select: { email: true } });
          const to = r.sendTo ?? contact?.email ?? client.email;
          if (to) await emailInvoice(ctx, invoiceId, { to, language: r.language });
        }
      } catch (e) {
        await unitOfWork(ctx, async (_tx, uow) => {
          await uow.audit({ action: "recurring_invoice.automation_failed", entityType: "RecurringInvoice", entityId: id, after: { invoiceId, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) } });
        });
      }
    }
  }
  return created;
}

/** Finance sweep entry: every active schedule whose next run date has come. */
export async function runDueSchedules(organizationId: string, now = new Date()) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
  const due = await prisma.recurringInvoice.findMany({ where: { organizationId, status: "ACTIVE", nextRunDate: { lte: todayIn(org.timezone, now) } }, select: { id: true }, take: 200 });
  let invoices = 0;
  for (const d of due) invoices += (await runSchedule(d.id, now)).length;
  return { schedules: due.length, invoices };
}
