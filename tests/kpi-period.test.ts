import { describe, expect, it } from "vitest";
import { orgMonth, startOfDayIn, startOfMonthIn } from "@/server/kpi/period";

const iso = (d: Date) => d.toISOString();
const RIYADH = "Asia/Riyadh";

describe("orgMonth — one start-of-month for every KPI, in the organization's timezone", () => {
  it("Riyadh is already in the new month while UTC is still on the last evening of the old one", () => {
    // 2026-03-01 00:30 in Riyadh = 2026-02-28 21:30Z
    const m = orgMonth(RIYADH, new Date("2026-02-28T21:30:00.000Z"));
    expect(iso(m.today)).toBe("2026-03-01T00:00:00.000Z");
    expect(iso(m.dateFrom)).toBe("2026-03-01T00:00:00.000Z"); // DATE columns
    expect(iso(m.dateTo)).toBe("2026-03-01T00:00:00.000Z");
    expect(iso(m.from)).toBe("2026-02-28T21:00:00.000Z"); // timestamp columns: local midnight as a UTC instant
    expect(iso(m.to)).toBe("2026-02-28T21:30:00.000Z");
    // comparison: February up to the same point (1st, 30 minutes in)
    expect(iso(m.prevDateFrom)).toBe("2026-02-01T00:00:00.000Z");
    expect(iso(m.prevDateTo)).toBe("2026-02-01T00:00:00.000Z");
    expect(iso(m.prevFrom)).toBe("2026-01-31T21:00:00.000Z");
    expect(iso(m.prevTo)).toBe("2026-01-31T21:30:00.000Z");
  });

  it("the last millisecond before local midnight still belongs to the old month", () => {
    const m = orgMonth(RIYADH, new Date("2026-02-28T20:59:59.999Z")); // 23:59:59.999 on 28 Feb in Riyadh
    expect(iso(m.today)).toBe("2026-02-28T00:00:00.000Z");
    expect(iso(m.dateFrom)).toBe("2026-02-01T00:00:00.000Z");
    expect(iso(m.from)).toBe("2026-01-31T21:00:00.000Z");
    expect(iso(m.prevDateFrom)).toBe("2026-01-01T00:00:00.000Z");
    expect(iso(m.prevDateTo)).toBe("2026-01-28T00:00:00.000Z");
  });

  it("year boundary: 1 January in Riyadh compares against December", () => {
    const m = orgMonth(RIYADH, new Date("2026-12-31T22:00:00.000Z"));
    expect(iso(m.dateFrom)).toBe("2027-01-01T00:00:00.000Z");
    expect(iso(m.from)).toBe("2026-12-31T21:00:00.000Z");
    expect(iso(m.prevDateFrom)).toBe("2026-12-01T00:00:00.000Z");
    expect(iso(m.prevFrom)).toBe("2026-11-30T21:00:00.000Z");
  });

  it("the comparison period never spills into the current month (31 March vs. a 28-day February)", () => {
    const m = orgMonth(RIYADH, new Date("2026-03-31T09:00:00.000Z"));
    expect(iso(m.prevDateTo)).toBe("2026-02-28T00:00:00.000Z"); // not 3 March
    expect(m.prevTo.getTime()).toBe(m.from.getTime() - 1);
    expect(m.prevTo.getTime()).toBeLessThan(m.from.getTime());
  });

  it("does not depend on the server's own timezone or on UTC", () => {
    const now = new Date("2026-06-30T21:00:00.000Z"); // exactly 1 July 00:00 in Riyadh
    expect(iso(startOfMonthIn(RIYADH, now))).toBe("2026-06-30T21:00:00.000Z");
    expect(iso(startOfMonthIn("UTC", now))).toBe("2026-06-01T00:00:00.000Z");
    // a zone behind UTC and with DST: local midnight on 1 June is 04:00Z (EDT)
    expect(iso(startOfMonthIn("America/New_York", now))).toBe("2026-06-01T04:00:00.000Z");
    expect(iso(startOfDayIn("America/New_York", new Date("2026-01-01T00:00:00.000Z")))).toBe("2026-01-01T05:00:00.000Z"); // EST
  });
});
