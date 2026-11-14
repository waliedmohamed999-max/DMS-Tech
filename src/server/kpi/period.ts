import { todayIn } from "../commercial/dates";

/**
 * The one definition of "this month" for KPI code: the calendar month in the organization's
 * timezone. Two kinds of bounds are returned because the schema has two kinds of columns:
 *
 * - `dateFrom` / `dateTo` … for Postgres DATE columns (Invoice.issueDate, Payment.paymentDate,
 *   Expense.date). Those hold the business date as UTC midnight, so the bounds are UTC midnights
 *   of the org-local calendar dates.
 * - `from` / `to` … for timestamp columns (Opportunity.wonAt, createdAt, completedAt). Those hold
 *   real UTC instants, so the bound is the UTC instant of local midnight on the 1st
 *   (Asia/Riyadh: the previous day 21:00Z).
 *
 * The comparison period is the previous month up to the same point: same day-of-month for dates
 * (clamped to that month's last day) and the same elapsed time for instants (never past its end).
 * Everything is computed in JS from `now` — never from SQL now() or the server's local zone.
 */
export type OrgMonth = {
  timezone: string;
  today: Date;
  dateFrom: Date;
  dateTo: Date;
  prevDateFrom: Date;
  prevDateTo: Date;
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
};

/** Offset (ms) of `tz` from UTC at the given instant: local wall clock − UTC. */
function tzOffsetMs(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const p = (type: string) => Number(parts.find((x) => x.type === type)!.value);
  const wall = Date.UTC(p("year"), p("month") - 1, p("day"), p("hour"), p("minute"), p("second"));
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/** UTC instant at which the business date `date` (a UTC-midnight DATE value) starts in `tz`. */
export function startOfDayIn(tz: string, date: Date): Date {
  const wall = date.getTime();
  const first = wall - tzOffsetMs(tz, new Date(wall));
  return new Date(wall - tzOffsetMs(tz, new Date(first))); // second pass settles DST transitions
}

export function orgMonth(tz: string, now = new Date()): OrgMonth {
  const today = todayIn(tz, now);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const dateFrom = new Date(Date.UTC(y, m, 1));
  const prevDateFrom = new Date(Date.UTC(y, m - 1, 1));
  const prevLastDay = new Date(Date.UTC(y, m, 0));
  const sameDay = new Date(Date.UTC(y, m - 1, today.getUTCDate()));
  // Feb has no 30th: an overflowing day would land in the current month, so clamp to the previous month's end
  const prevDateTo = sameDay.getUTCMonth() === prevDateFrom.getUTCMonth() ? sameDay : prevLastDay;
  const from = startOfDayIn(tz, dateFrom);
  const prevFrom = startOfDayIn(tz, prevDateFrom);
  const prevTo = new Date(Math.min(prevFrom.getTime() + (now.getTime() - from.getTime()), from.getTime() - 1));
  return { timezone: tz, today, dateFrom, dateTo: today, prevDateFrom, prevDateTo, from, to: now, prevFrom, prevTo };
}

/** Start of the org-local month as a UTC instant (timestamp columns). */
export const startOfMonthIn = (tz: string, now = new Date()) => orgMonth(tz, now).from;

/** `orgMonth` for an organization id (reads its timezone). */
export async function orgMonthOf(organizationId: string, now = new Date()): Promise<OrgMonth> {
  const { prisma } = await import("../db");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
  return orgMonth(org.timezone, now);
}
