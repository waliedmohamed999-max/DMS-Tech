import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { changeEmployeeStatus, createEmployee } from "@/server/hr/employees";
import { employeeExpiries, expiringCount, expiryStage, listExpiries, setEmployeeExpiry, setExpiryWarningDays } from "@/server/hr/expiries";
import { sweepHr } from "@/server/hr/sweep";
import { addDays, todayIn, ymd } from "@/server/commercial/dates";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

let orgId: string;
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
});

const DAY = 86_400_000;

async function people() {
  const hr = await ctxFor((await makeUser(orgId, "hr@x.test", ["hr_manager"])).id);
  const emp = await ctxFor((await makeUser(orgId, "emp@x.test", ["employee"])).id);
  const ali = await createEmployee(hr, { firstName: "Ali", lastName: "Test", joinDate: "2026-01-01", userId: emp.userId });
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { timezone: true } });
  const today = todayIn(org.timezone);
  const inDays = (n: number) => ymd(addDays(today, n))!;
  const alerts = () => prisma.notification.findMany({ where: { userId: hr.userId, dedupeKey: { startsWith: "employee.expiry:" } }, orderBy: { createdAt: "asc" } });
  return { hr, emp, ali: ali.id, inDays, alerts };
}

describe("employee document expiry (iqama / visa / passport / contract)", () => {
  it("stages: warning window, final 14 days, expired", () => {
    expect(expiryStage(90, 60)).toBe("ok");
    expect(expiryStage(60, 60)).toBe("warning");
    expect(expiryStage(14, 60)).toBe("final");
    expect(expiryStage(0, 60)).toBe("final");
    expect(expiryStage(-1, 60)).toBe("expired");
  });

  it("HR records dates; the employee sees their own but cannot change them; the register lists what needs action", async () => {
    const { hr, emp, ali, inDays } = await people();
    await setEmployeeExpiry(hr, ali, "IQAMA", { expiryDate: inDays(30), number: "2412345678" });
    await setEmployeeExpiry(hr, ali, "CONTRACT", { expiryDate: inDays(200) });
    await expect(setEmployeeExpiry(emp, ali, "IQAMA", { expiryDate: inDays(400) })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setEmployeeExpiry(hr, ali, "DRIVING", { expiryDate: inDays(10) })).rejects.toThrow();

    const mine = await employeeExpiries(emp, ali);
    expect(mine.find((x) => x.kind === "IQAMA")?.record).toMatchObject({ days: 30, stage: "warning", number: "2412345678" });
    expect(mine.find((x) => x.kind === "PASSPORT")?.record).toBeNull();

    const due = await listExpiries(hr, {});
    expect(due.rows.map((r) => r.kind)).toEqual(["IQAMA"]);
    expect(due.counts).toMatchObject({ warning: 1, ok: 1, expired: 0, final: 0 });
    expect((await listExpiries(hr, { show: "all" })).rows).toHaveLength(2);
    expect(await expiringCount(hr)).toBe(1);
    await expect(listExpiries(emp, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.auditLog.count({ where: { action: "employee.expiry_set", entityId: ali } })).toBe(2);
    // the document number never reaches the audit trail
    expect(JSON.stringify(await prisma.auditLog.findMany({ where: { entityId: ali } }))).not.toContain("2412345678");
  });

  it("the sweep warns HR once per stage, renewal re-arms it, and a late entry sends one notice", async () => {
    const { hr, ali, inDays, alerts } = await people();
    await setEmployeeExpiry(hr, ali, "IQAMA", { expiryDate: inDays(30), number: "2412345678" });
    const now = Date.now();

    expect(await sweepHr(orgId, new Date(now))).toMatchObject({ documentsExpiring: 1 });
    expect(await sweepHr(orgId, new Date(now))).toMatchObject({ documentsExpiring: 0 });
    expect((await alerts()).map((n) => n.priority)).toEqual(["MEDIUM"]);
    expect((await alerts())[0].title).not.toContain("2412345678");

    expect(await sweepHr(orgId, new Date(now + 17 * DAY))).toMatchObject({ documentsExpiring: 1 }); // 13 days left
    expect(await sweepHr(orgId, new Date(now + 31 * DAY))).toMatchObject({ documentsExpiring: 1 }); // expired
    expect(await sweepHr(orgId, new Date(now + 32 * DAY))).toMatchObject({ documentsExpiring: 0 });
    expect((await alerts()).map((n) => n.priority)).toEqual(["MEDIUM", "HIGH", "URGENT"]);

    // renewed for a year: no alert now, warnings start again for the new date; the number is kept
    await setEmployeeExpiry(hr, ali, "IQAMA", { expiryDate: inDays(395) });
    expect(await prisma.employeeExpiry.findFirstOrThrow({ where: { employeeId: ali } })).toMatchObject({ warnedAt: null, finalWarnedAt: null, expiredNotifiedAt: null, number: "2412345678" });
    expect(await sweepHr(orgId, new Date(now))).toMatchObject({ documentsExpiring: 0 });
    expect(await sweepHr(orgId, new Date(now + 340 * DAY))).toMatchObject({ documentsExpiring: 1 });

    // a passport entered after it already expired → one urgent notice, not three
    await setEmployeeExpiry(hr, ali, "PASSPORT", { expiryDate: inDays(-5) });
    expect(await sweepHr(orgId, new Date(now))).toMatchObject({ documentsExpiring: 1 });
    expect((await alerts()).filter((n) => n.dedupeKey!.includes(":expired:")).length).toBe(2);
  });

  it("the warning window is configurable; former employees are not tracked", async () => {
    const { hr, ali, inDays } = await people();
    await setEmployeeExpiry(hr, ali, "VISA", { expiryDate: inDays(80) });
    expect(await expiringCount(hr)).toBe(0);
    await expect(setExpiryWarningDays(hr, { days: 10 })).rejects.toThrow(); // must exceed the 14-day final reminder
    await setExpiryWarningDays(hr, { days: 90 });
    expect(await expiringCount(hr)).toBe(1);

    await changeEmployeeStatus(hr, ali, { to: "TERMINATED", terminationDate: inDays(-1), reason: "Left the company" });
    expect(await expiringCount(hr)).toBe(0);
    expect(await sweepHr(orgId)).toMatchObject({ documentsExpiring: 0 });
  });
});
