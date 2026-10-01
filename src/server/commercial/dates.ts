/**
 * Business dates in the organization's timezone. Quotation validity and contract dates are
 * calendar dates (Postgres DATE, stored as UTC midnight), so "today" must be the local date.
 */
export function todayIn(tz: string, now = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return new Date(`${ymd}T00:00:00.000Z`);
}

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export const yearIn = (tz: string, now = new Date()) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric" }).format(now));

/** YYYY-MM-DD of a DATE column value. */
export const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
