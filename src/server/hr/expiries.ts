import { z } from "zod";
import type { EmployeeExpiryKind, Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { forbidden } from "../errors";
import { unitOfWork } from "../events/bus";
import { optDate, optText } from "../crm/normalize";
import { addDays, todayIn, ymd } from "../commercial/dates";
import { employeeAccess, myEmployee } from "./access";

/**
 * Expiring employee documents — iqama, work visa, passport, employment contract (docs/HR.md). Renewing late exposes
 * the company to fines, so HR is warned early:
 *   · first warning when the date enters the window (Organization.employeeExpiryWarningDays, default 60)
 *   · final reminder FINAL_WARNING_DAYS before the date
 *   · expired notice the day after
 * Each signal is claimed once per date (warnedAt / finalWarnedAt / expiredNotifiedAt); a new date clears the claims.
 * Only the most urgent stage is sent when several are due at once (e.g. a date entered late).
 */
export const EXPIRY_KINDS = ["IQAMA", "VISA", "PASSPORT", "CONTRACT"] as const satisfies readonly EmployeeExpiryKind[];
export const FINAL_WARNING_DAYS = 14;
export type ExpiryStage = "expired" | "final" | "warning" | "ok";

/** People who no longer work here are not tracked. */
const CURRENT: Prisma.EmployeeWhereInput = { status: { notIn: ["TERMINATED", "ARCHIVED"] } };

export const daysUntil = (today: Date, date: Date) => Math.round((date.getTime() - today.getTime()) / 86_400_000);

export function expiryStage(days: number, warnDays: number): ExpiryStage {
  if (days < 0) return "expired";
  if (days <= FINAL_WARNING_DAYS) return "final";
  if (days <= warnDays) return "warning";
  return "ok";
}

/** HR-office scope only (records.all, or own department) — not the self / manager relation. */
async function hrScope(ctx: Ctx): Promise<Prisma.EmployeeWhereInput> {
  if (can(ctx, "hr.records.all")) return {};
  const me = can(ctx, "hr.records.department") ? await myEmployee(ctx) : null;
  return me?.departmentId ? { departmentId: me.departmentId } : { id: "__none__" };
}

async function orgSettings(organizationId: string) {
  return prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true, employeeExpiryWarningDays: true } });
}

const listSchema = z.object({ kind: z.enum(EXPIRY_KINDS).optional().catch(undefined), show: z.enum(["due", "all"]).catch("due") });

/** The expiry register: every tracked document of current employees, soonest first, with counts per stage. */
export async function listExpiries(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "hr.employees.view");
  const input = listSchema.parse(raw ?? {});
  const org = await orgSettings(ctx.organizationId);
  const today = todayIn(org.timezone);
  const rows = await prisma.employeeExpiry.findMany({
    where: { organizationId: ctx.organizationId, employee: { AND: [CURRENT, await hrScope(ctx)] } },
    orderBy: { expiryDate: "asc" },
    take: 2000,
    include: { employee: { select: { id: true, number: true, displayName: true, nameAr: true, jobTitle: true } } }
  });
  const all = rows.map((r) => {
    const days = daysUntil(today, r.expiryDate);
    return { ...r, days, stage: expiryStage(days, org.employeeExpiryWarningDays) };
  });
  const counts = { expired: 0, final: 0, warning: 0, ok: 0 };
  for (const r of all) counts[r.stage]++;
  const shown = all.filter((r) => (!input.kind || r.kind === input.kind) && (input.show === "all" || r.stage !== "ok"));
  return { ...input, warnDays: org.employeeExpiryWarningDays, counts, rows: shown, numbers: can(ctx, "hr.employees.sensitive") };
}

/** Documents that need action (expired or inside the warning window) — for the HR dashboard; null without access. */
export async function expiringCount(ctx: Ctx) {
  if (!can(ctx, "hr.employees.view")) return null;
  const org = await orgSettings(ctx.organizationId);
  const limit = addDays(todayIn(org.timezone), org.employeeExpiryWarningDays);
  return prisma.employeeExpiry.count({ where: { organizationId: ctx.organizationId, expiryDate: { lte: limit }, employee: { AND: [CURRENT, await hrScope(ctx)] } } });
}

/** One employee's documents (employee page). Numbers only for HR with sensitive access, or the employee. */
export async function employeeExpiries(ctx: Ctx, employeeId: string) {
  const { rel } = await employeeAccess(prisma, ctx, employeeId);
  if (!rel.hr && !rel.self) throw forbidden("hr.employees.view (HR scope)");
  const org = await orgSettings(ctx.organizationId);
  const today = todayIn(org.timezone);
  const rows = await prisma.employeeExpiry.findMany({ where: { employeeId } });
  const showNumber = rel.self || can(ctx, "hr.employees.sensitive");
  return EXPIRY_KINDS.map((kind) => {
    const r = rows.find((x) => x.kind === kind);
    if (!r) return { kind, record: null };
    const days = daysUntil(today, r.expiryDate);
    return { kind, record: { expiryDate: r.expiryDate, number: showNumber ? r.number : r.number ? "••••" : null, days, stage: expiryStage(days, org.employeeExpiryWarningDays) } };
  });
}

const setSchema = z.object({ expiryDate: optDate, number: optText(40) });

/** Set / renew (new date → warnings re-arm) or remove (blank date) one document of an employee. No `number` key keeps the stored one. */
export async function setEmployeeExpiry(ctx: Ctx, employeeId: string, kind: string, raw: unknown) {
  requirePermission(ctx, "hr.employees.edit");
  const k = z.enum(EXPIRY_KINDS).parse(kind);
  const input = setSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const { rel } = await employeeAccess(tx, ctx, employeeId, { lock: true });
    if (!rel.hr) throw forbidden("hr.employees.edit (HR scope)");
    const before = await tx.employeeExpiry.findUnique({ where: { employeeId_kind: { employeeId, kind: k } } });
    if (!input.expiryDate) {
      if (!before) return { removed: false };
      await tx.employeeExpiry.delete({ where: { id: before.id } });
      await uow.audit({ action: "employee.expiry_removed", entityType: "Employee", entityId: employeeId, before: { kind: k, expiryDate: ymd(before.expiryDate) } });
      return { removed: true };
    }
    const renewed = !before || ymd(before.expiryDate) !== ymd(input.expiryDate);
    const data = { number: input.number === undefined ? (before?.number ?? null) : input.number, expiryDate: input.expiryDate, updatedById: ctx.userId, ...(renewed ? { warnedAt: null, finalWarnedAt: null, expiredNotifiedAt: null } : {}) };
    await tx.employeeExpiry.upsert({ where: { employeeId_kind: { employeeId, kind: k } }, create: { organizationId: ctx.organizationId, employeeId, kind: k, ...data }, update: data });
    // the document number itself stays out of the audit trail
    await uow.audit({ action: "employee.expiry_set", entityType: "Employee", entityId: employeeId, before: before ? { kind: k, expiryDate: ymd(before.expiryDate) } : undefined, after: { kind: k, expiryDate: ymd(input.expiryDate) } });
    return { removed: false };
  });
}

const warnSchema = z.object({ days: z.coerce.number().int().min(FINAL_WARNING_DAYS + 1).max(365) });

/** How early the first warning goes out (same permission as the other HR settings). */
export async function setExpiryWarningDays(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "hr.attendance.manage");
  const { days } = warnSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { employeeExpiryWarningDays: true } });
    await tx.organization.update({ where: { id: ctx.organizationId }, data: { employeeExpiryWarningDays: days } });
    await uow.audit({ action: "hr.expiry_warning_days_changed", entityType: "Organization", entityId: ctx.organizationId, before: { days: before.employeeExpiryWarningDays }, after: { days } });
  });
}

/** HR sweep step: emit `employee.expiry` once per stage and date (see the header). */
export async function sweepExpiries(organizationId: string, today: Date, now: Date, ctx: Ctx) {
  const org = await orgSettings(organizationId);
  const due = await prisma.employeeExpiry.findMany({
    where: {
      organizationId,
      employee: CURRENT,
      expiryDate: { lte: addDays(today, org.employeeExpiryWarningDays) },
      OR: [{ warnedAt: null }, { finalWarnedAt: null, expiryDate: { lte: addDays(today, FINAL_WARNING_DAYS) } }, { expiredNotifiedAt: null, expiryDate: { lt: today } }]
    },
    include: { employee: { select: { displayName: true, nameAr: true } } },
    take: 1000
  });
  let sent = 0;
  for (const r of due) {
    const days = daysUntil(today, r.expiryDate);
    const stage = expiryStage(days, org.employeeExpiryWarningDays);
    if (stage === "ok") continue;
    const claim = stage === "expired" ? "expiredNotifiedAt" : stage === "final" ? "finalWarnedAt" : "warnedAt";
    await unitOfWork(ctx, async (tx, uow) => {
      // the less urgent stages are claimed too, so a late entry gets one notice, not three
      const data = { warnedAt: r.warnedAt ?? now, ...(stage !== "warning" ? { finalWarnedAt: r.finalWarnedAt ?? now } : {}), ...(stage === "expired" ? { expiredNotifiedAt: now } : {}) };
      const c = await tx.employeeExpiry.updateMany({ where: { id: r.id, expiryDate: r.expiryDate, [claim]: null }, data });
      if (c.count !== 1) return;
      uow.emit({
        type: "employee.expiry",
        entityType: "Employee",
        entityId: r.employeeId,
        payload: { expiryId: r.id, employeeId: r.employeeId, kind: r.kind, stage, name: r.employee.displayName, nameAr: r.employee.nameAr ?? r.employee.displayName, date: ymd(r.expiryDate), days: String(Math.abs(days)) }
      });
      sent++;
    });
  }
  return sent;
}
