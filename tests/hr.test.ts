import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { decideApproval } from "@/server/approvals/service";
import { globalSearch } from "@/server/dashboard/service";
import { migrateLegacyPermissions } from "@/server/rbac/migrate";
import { createEmployee, getEmployee, listEmployees, updateEmployee } from "@/server/hr/employees";
import { addCompensation, bankAccounts, compensationHistory, revealBankAccount, setBankAccount } from "@/server/hr/compensation";
import { addHoliday, recordAttendance } from "@/server/hr/attendance";
import { balances, cancelLeaveRequest, createLeaveRequest, grantOpeningBalances, saveLeaveType } from "@/server/hr/leave";
import { addAdjustment, calculatePeriod, closePeriod, createPeriod, getPeriod, listPeriods, markPayrollPaid, payslipEntry, removeAdjustment, submitPayroll, withdrawPayroll } from "@/server/hr/payroll";
import { addEvaluation, convertToEmployee, createCandidate, createJob, createOffer, moveStage, recordOfferResponse, scheduleInterview, sendOffer, setJobStatus, submitOffer } from "@/server/hr/recruitment";
import { createReview, employeePerformance, updateReview } from "@/server/hr/performance";
import { sweepHr } from "@/server/hr/sweep";
import { financeKpis } from "@/server/finance/insights";
import { renderPayslip } from "@/server/pdf/payslip";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";
import "@/server/hr/leave";
import "@/server/hr/payroll";
import "@/server/hr/recruitment";

let orgId: string;
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
});

const code = (re: RegExp) => ({ message: expect.stringMatching(re) });
const D = (s: string) => new Date(`${s}T00:00:00Z`);

/** HR manager, CEO, finance manager, accountant, project manager, a line manager and two employees — each with an Employee record where it makes sense. */
async function people() {
  const u = {
    hr: await ctxFor((await makeUser(orgId, "hr@x.test", ["hr_manager"])).id),
    ceo: await ctxFor((await makeUser(orgId, "ceo@x.test", ["ceo"])).id),
    fm: await ctxFor((await makeUser(orgId, "fm@x.test", ["finance_manager"])).id),
    acc: await ctxFor((await makeUser(orgId, "acc@x.test", ["accountant"])).id),
    pm: await ctxFor((await makeUser(orgId, "pm@x.test", ["project_manager"])).id),
    mgr: await ctxFor((await makeUser(orgId, "mgr@x.test", ["line_manager"])).id),
    mgr2: await ctxFor((await makeUser(orgId, "mgr2@x.test", ["line_manager"])).id),
    emp: await ctxFor((await makeUser(orgId, "emp@x.test", ["employee"])).id),
    emp2: await ctxFor((await makeUser(orgId, "emp2@x.test", ["employee"])).id)
  };
  const mk = (first: string, userId: string | null, managerId?: string | null, extra: Record<string, unknown> = {}) => createEmployee(u.hr, { firstName: first, lastName: "Test", userId, managerId: managerId ?? null, joinDate: "2026-01-01", personalEmail: `${first.toLowerCase()}@home.test`, personalPhone: "+966500000111", ...extra });
  const hrE = await mk("Huda", u.hr.userId);
  const mgrE = await mk("Majed", u.mgr.userId);
  const mgr2E = await mk("Mona", u.mgr2.userId);
  const empE = await mk("Eyad", u.emp.userId, mgrE.id);
  const emp2E = await mk("Eman", u.emp2.userId, mgr2E.id);
  return { u, e: { hr: hrE.id, mgr: mgrE.id, mgr2: mgr2E.id, emp: empE.id, emp2: emp2E.id } };
}

describe("employees & hierarchy", () => {
  it("1–3. employees exist without users, link at most one user, and get race-free numbers", async () => {
    const { u } = await people();
    const solo = await createEmployee(u.hr, { firstName: "Sami", lastName: "NoAccount", joinDate: "2026-02-01" });
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: solo.id } })).userId).toBeNull();
    await expect(createEmployee(u.hr, { firstName: "Dup", lastName: "Link", joinDate: "2026-02-01", userId: u.emp.userId })).rejects.toMatchObject(code(/^USER_ALREADY_LINKED/));
    const many = await Promise.all([1, 2, 3, 4, 5].map((n) => createEmployee(u.hr, { firstName: `P${n}`, lastName: "Race", joinDate: "2026-02-01" })));
    expect(new Set(many.map((m) => m.number)).size).toBe(5);
    expect(many.every((m) => /^EMP-\d{6}$/.test(m.number))).toBe(true);
    await expect(createEmployee(u.emp, { firstName: "X", lastName: "Y", joinDate: "2026-02-01" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("4. manager cycles are refused (service and database)", async () => {
    const { u, e } = await people();
    // mgr → emp; make emp manage mgr = cycle
    await expect(updateEmployee(u.hr, e.mgr, { managerId: e.emp })).rejects.toMatchObject(code(/^MANAGER_CYCLE/));
    await expect(updateEmployee(u.hr, e.emp, { managerId: e.emp })).rejects.toMatchObject(code(/^MANAGER_CYCLE/));
    await expect(prisma.employee.update({ where: { id: e.mgr }, data: { managerId: e.emp } })).rejects.toThrow(/MANAGER_CYCLE/);
    await updateEmployee(u.hr, e.mgr, { managerId: e.hr });
    expect((await prisma.auditLog.count({ where: { action: "employee.manager_changed", entityId: e.mgr } }))).toBe(1);
  });
});

describe("compensation & bank", () => {
  it("5–7. salary is private: managers and colleagues never see it; history is append-only", async () => {
    const { u, e } = await people();
    await addCompensation(u.hr, e.emp, { baseSalary: "10000", housingAllowance: "2500", effectiveFrom: "2026-01-01" });
    await addCompensation(u.hr, e.emp, { baseSalary: "12000", housingAllowance: "3000", effectiveFrom: "2026-07-01" });
    await expect(compensationHistory(u.mgr, e.emp)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await getEmployee(u.mgr, e.emp)).can.compensation).toBe(false);
    await expect(compensationHistory(u.emp2, e.emp)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(compensationHistory(u.pm, e.emp)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await compensationHistory(u.emp, e.emp)).length).toBe(2); // own
    const rows = await compensationHistory(u.hr, e.emp);
    expect(rows.map((r) => [r.baseSalary.toFixed(2), r.effectiveTo?.toISOString().slice(0, 10) ?? null])).toEqual([["12000.00", null], ["10000.00", "2026-06-30"]]);
    await expect(prisma.employeeCompensation.update({ where: { id: rows[1].id }, data: { baseSalary: "1" } })).rejects.toThrow(/HISTORY_IMMUTABLE/);
    await expect(prisma.employeeCompensation.delete({ where: { id: rows[0].id } })).rejects.toThrow(/HISTORY_IMMUTABLE/);
    await expect(addCompensation(u.hr, e.emp, { baseSalary: "1", effectiveFrom: "2026-03-01" })).rejects.toMatchObject(code(/^EFFECTIVE_DATE_NOT_AFTER_CURRENT/));
    await expect(prisma.employeeCompensation.create({ data: { organizationId: orgId, employeeId: e.emp, baseSalary: "1", effectiveFrom: D("2026-05-01"), effectiveTo: D("2026-05-31") } })).rejects.toThrow(/PERIOD_OVERLAP/);
    await expect(addCompensation(u.hr, e.hr, { baseSalary: "1", effectiveFrom: "2026-02-01" })).rejects.toMatchObject({ code: "FORBIDDEN" }); // own
    expect(await prisma.auditLog.count({ where: { action: "compensation.changed", entityId: e.emp } })).toBe(1);
  });

  it("8. bank details are masked; the full IBAN is an audited reveal for hr.bank.manage only", async () => {
    const { u, e } = await people();
    await setBankAccount(u.hr, e.emp, { bankName: "Riyad Bank", iban: "SA03 8000 0000 6080 1016 7519", accountName: "Eyad Test", effectiveFrom: "2026-01-01" });
    const [b] = await bankAccounts(u.hr, e.emp);
    // Phase 10: masked from the stored last 4 digits only (no decryption for listing)
    expect(b.iban).toBe("•••• •••• •••• 7519");
    expect((await bankAccounts(u.emp, e.emp))[0].iban).toBe("•••• •••• •••• 7519");
    // stored encrypted: no plaintext column value, ciphertext does not contain the IBAN
    const row = await prisma.employeeBankAccount.findUniqueOrThrow({ where: { id: b.id } });
    expect(row.iban).toBeNull();
    expect(row).toMatchObject({ ibanLast4: "7519", ibanKeyVersion: 1 });
    expect(JSON.stringify(row)).not.toContain("SA0380000000608010167519");
    await expect(bankAccounts(u.mgr, e.emp)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(bankAccounts(u.ceo, e.emp)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(revealBankAccount(u.ceo, b.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await revealBankAccount(u.hr, b.id)).iban).toBe("SA0380000000608010167519");
    const audits = await prisma.auditLog.findMany({ where: { entityId: e.emp, action: { startsWith: "bank." } } });
    expect(audits.map((a) => a.action).sort()).toEqual(["bank.changed", "bank.revealed"]);
    expect(JSON.stringify(audits)).not.toContain("SA0380000000608010167519");
    // personal contact data is masked for managers, visible to HR and self
    expect((await getEmployee(u.mgr, e.emp)).employee.personalEmail).toBe("e•••@home.test");
    expect((await getEmployee(u.hr, e.emp)).employee.personalEmail).toBe("eyad@home.test");
    expect((await listEmployees(u.hr, {})).items[0]).not.toHaveProperty("personalEmail");
  });
});

describe("attendance", () => {
  it("9–11. manual entry, invalid times refused, corrections audited with before/after", async () => {
    const { u, e } = await people();
    await recordAttendance(u.hr, { employeeId: e.emp, date: "2026-09-15", status: "PRESENT", checkIn: "09:00", checkOut: "17:00" });
    const rec = await prisma.attendanceRecord.findFirstOrThrow({ where: { employeeId: e.emp } });
    expect([rec.workMinutes, rec.status]).toEqual([480, "PRESENT"]);
    await expect(recordAttendance(u.hr, { employeeId: e.emp, date: "2026-09-16", status: "PRESENT", checkIn: "17:00", checkOut: "09:00" })).rejects.toMatchObject(code(/^CHECKOUT_BEFORE_CHECKIN/));
    await expect(prisma.attendanceRecord.update({ where: { id: rec.id }, data: { checkOut: new Date(rec.checkIn!.getTime() - 60_000) } })).rejects.toThrow();
    await recordAttendance(u.hr, { employeeId: e.emp, date: "2026-09-15", status: "LATE", checkIn: "09:40", checkOut: "17:00", notes: "Traffic" });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "attendance.corrected", entityId: e.emp } });
    expect([(audit.before as { status: string }).status, (audit.after as { status: string }).status]).toEqual(["PRESENT", "LATE"]);
    await expect(recordAttendance(u.mgr, { employeeId: e.emp, date: "2026-09-15", status: "ABSENT" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("leave", () => {
  async function annualWithBalance(u: Awaited<ReturnType<typeof people>>["u"]) {
    const t = await prisma.leaveType.findFirstOrThrow({ where: { organizationId: orgId, key: "annual" } });
    await saveLeaveType(u.hr, { id: t.id, nameAr: t.nameAr, nameEn: t.nameEn, paid: true, defaultBalanceDays: 21 });
    await grantOpeningBalances(u.hr, 2027);
    return t;
  }

  it("12–13, 15. a request is routed to the direct manager through the approval engine and consumes the ledger", async () => {
    const { u, e } = await people();
    const t = await annualWithBalance(u);
    // Sun 7 – Tue 9 March 2027 = 3 working days (Sun–Thu policy)
    const r = await createLeaveRequest(u.emp, { leaveTypeId: t.id, startDate: "2027-03-07", endDate: "2027-03-09", reason: "Family trip" });
    expect(r.days).toBe(3);
    const lr = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: r.id } });
    const a = await prisma.approval.findUniqueOrThrow({ where: { id: lr.approvalId! } });
    expect([a.type, a.status, a.assigneeId, lr.status]).toEqual(["LEAVE", "PENDING", u.mgr.userId, "SUBMITTED"]);
    await decideApproval(u.mgr, { approvalId: a.id, decision: "APPROVED" });
    expect((await prisma.leaveRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("APPROVED");
    let bal = (await balances(u.emp, e.emp, 2027)).find((b) => b.type.key === "annual")!;
    expect([bal.opening, bal.usage, bal.remaining]).toEqual(["21.00", "3.00", "18.00"]);
    expect(await prisma.attendanceRecord.count({ where: { employeeId: e.emp, status: "ON_LEAVE" } })).toBe(3);
    await expect(createLeaveRequest(u.emp, { leaveTypeId: t.id, startDate: "2027-03-08", endDate: "2027-03-08" })).rejects.toMatchObject(code(/^LEAVE_OVERLAP/));
    await expect(createLeaveRequest(u.emp, { leaveTypeId: t.id, startDate: "2027-04-04", endDate: "2027-05-13" })).rejects.toMatchObject(code(/^INSUFFICIENT_BALANCE/));
    await cancelLeaveRequest(u.hr, r.id, { reason: "Trip cancelled" });
    bal = (await balances(u.hr, e.emp, 2027)).find((b) => b.type.key === "annual")!;
    expect([bal.reversal, bal.remaining]).toEqual(["3.00", "21.00"]);
    await expect(prisma.leaveLedgerEntry.deleteMany({ where: { employeeId: e.emp } })).rejects.toThrow(/LEDGER_IMMUTABLE/);
    // approval after cancellation is impossible
    await expect(decideApproval(u.mgr, { approvalId: a.id, decision: "APPROVED" })).rejects.toMatchObject(code(/APPROVAL_ALREADY_DECIDED/));
  });

  it("14. self-approval and approval by an unrelated manager are blocked; rejection needs a reason", async () => {
    const { u } = await people();
    const t = await annualWithBalance(u);
    const r = await createLeaveRequest(u.emp, { leaveTypeId: t.id, startDate: "2027-03-07", endDate: "2027-03-07" });
    const a = (await prisma.leaveRequest.findUniqueOrThrow({ where: { id: r.id } })).approvalId!;
    await expect(decideApproval(u.mgr2, { approvalId: a, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(decideApproval(u.emp, { approvalId: a, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(decideApproval(u.mgr, { approvalId: a, decision: "REJECTED" })).rejects.toMatchObject(code(/REJECTION_REASON_REQUIRED/));
    // HR's own leave (no manager) goes to HR — the requester cannot decide it
    const own = await createLeaveRequest(u.hr, { leaveTypeId: t.id, startDate: "2027-03-14", endDate: "2027-03-14" });
    const ownA = (await prisma.leaveRequest.findUniqueOrThrow({ where: { id: own.id } })).approvalId!;
    await expect(decideApproval(u.hr, { approvalId: ownA, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("16. configured holidays are excluded from leave days", async () => {
    const { u } = await people();
    const t = await annualWithBalance(u);
    await addHoliday(u.hr, { date: "2027-03-08", name: "Company day" });
    const r = await createLeaveRequest(u.emp, { leaveTypeId: t.id, startDate: "2027-03-07", endDate: "2027-03-09" });
    expect(r.days).toBe(2);
    await expect(createLeaveRequest(u.emp, { leaveTypeId: t.id, startDate: "2027-03-12", endDate: "2027-03-13" })).rejects.toMatchObject(code(/^NO_WORKING_DAYS/));
  });
});

describe("payroll", () => {
  async function setup() {
    const p = await people();
    await addCompensation(p.u.hr, p.e.emp, { baseSalary: "10000", housingAllowance: "2500", transportAllowance: "500", effectiveFrom: "2026-01-01" });
    await addCompensation(p.u.hr, p.e.mgr, { baseSalary: "20000", effectiveFrom: "2026-01-01" });
    const late = await createEmployee(p.u.hr, { firstName: "New", lastName: "Joiner", joinDate: "2026-09-16" });
    await addCompensation(p.u.hr, late.id, { baseSalary: "6000", effectiveFrom: "2026-09-16" });
    const period = await createPeriod(p.u.hr, { periodStart: "2026-09-01", periodEnd: "2026-09-30", payDate: "2026-09-30" });
    return { ...p, period: period.id, late: late.id };
  }

  it("17–19. lifecycle is enforced, totals are server-calculated, paid payroll is a frozen snapshot", async () => {
    const { u, e, period, late } = await setup();
    await expect(submitPayroll(u.hr, period)).rejects.toMatchObject(code(/^PAYROLL_INVALID_TRANSITION/));
    await expect(markPayrollPaid(u.fm, period, {})).rejects.toMatchObject(code(/^PAYROLL_NOT_APPROVED/));
    await addAdjustment(u.hr, period, { employeeId: e.emp, componentKey: "BONUS", amount: "1000", reason: "Q3 delivery" });
    await addAdjustment(u.hr, period, { employeeId: e.emp, componentKey: "DEDUCTION", amount: "200", reason: "Advance repayment" });
    await expect(addAdjustment(u.hr, period, { employeeId: e.emp, componentKey: "BASE_SALARY", amount: "1", reason: "nope" })).rejects.toMatchObject(code(/^COMPONENT_NOT_ADJUSTABLE/));
    const calc = await calculatePeriod(u.hr, period);
    expect(calc.employees).toBe(3); // employees without compensation are skipped
    const entries = await prisma.payrollEntry.findMany({ where: { periodId: period } });
    const emp = entries.find((x) => x.employeeId === e.emp)!;
    expect([emp.grossPay.toFixed(2), emp.totalDeductions.toFixed(2), emp.netPay.toFixed(2), emp.bonuses.toFixed(2)]).toEqual(["14000.00", "200.00", "13800.00", "1000.00"]);
    expect(entries.find((x) => x.employeeId === late)!.baseSalary.toFixed(2)).toBe("3000.00"); // 15 / 30 days
    const p = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: period } });
    expect([p.status, p.netTotal.toFixed(2), p.employeeCount]).toEqual(["REVIEW", "36800.00", 3]);
    // an adjustment after calculation forces a recalculation before submission
    await addAdjustment(u.hr, period, { employeeId: e.emp, componentKey: "COMMISSION", amount: "300", reason: "Deal" });
    await expect(submitPayroll(u.hr, period)).rejects.toMatchObject(code(/^PAYROLL_STALE_RECALCULATE/));
    await calculatePeriod(u.hr, period);
    const s = await submitPayroll(u.hr, period);
    await decideApproval(u.ceo, { approvalId: s.approvalId, decision: "APPROVED" });
    await markPayrollPaid(u.fm, period, { paymentReference: "WPS-2026-09" });
    await addCompensation(u.hr, e.emp, { baseSalary: "20000", effectiveFrom: "2026-10-01" });
    const after = await prisma.payrollEntry.findFirstOrThrow({ where: { periodId: period, employeeId: e.emp } });
    expect([after.baseSalary.toFixed(2), after.netPay.toFixed(2)]).toEqual(["10000.00", "14100.00"]);
    await expect(prisma.payrollEntry.update({ where: { id: after.id }, data: { notes: undefined, netPay: "1", grossPay: "1", totalDeductions: "0", deductions: "0", baseSalary: "1", housingAllowance: "0", transportAllowance: "0", bonuses: "0", otherEarnings: "0" } })).rejects.toThrow(/PAYROLL_FROZEN/);
    await expect(calculatePeriod(u.hr, period)).rejects.toMatchObject(code(/^PAYROLL_INVALID_TRANSITION/));
    await closePeriod(u.hr, period);
    expect((await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: period } })).status).toBe("CLOSED");
  });

  it("20–22. payroll is invisible to the unauthorised; approval is single and never by the preparer; payment happens once", async () => {
    const { u, period } = await setup();
    for (const who of [u.emp, u.mgr, u.pm, u.acc]) await expect(listPeriods(who)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await calculatePeriod(u.ceo, period); // CEO prepares this time
    const s = await submitPayroll(u.ceo, period);
    await expect(decideApproval(u.ceo, { approvalId: s.approvalId, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const r = await Promise.allSettled([decideApproval(u.fm, { approvalId: s.approvalId, decision: "APPROVED" }), decideApproval(u.fm, { approvalId: s.approvalId, decision: "APPROVED" })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const pays = await Promise.allSettled([markPayrollPaid(u.fm, period, {}), markPayrollPaid(u.fm, period, {})]);
    expect(pays.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    await expect(markPayrollPaid(u.fm, period, {})).rejects.toMatchObject(code(/^PAYROLL_ALREADY_PAID/));
    await expect(prisma.payrollPeriod.update({ where: { id: period }, data: { status: "REVIEW" } })).rejects.toThrow(/PAYROLL_FROZEN/);
    await expect(prisma.payrollPeriod.delete({ where: { id: period } })).rejects.toThrow(/PAYROLL_IMMUTABLE/);
    expect(await prisma.auditLog.count({ where: { action: "payroll.paid", entityId: period } })).toBe(1);
  });

  it("21b. an approver paid in the payroll may approve it — unless it carries their own bonus / deduction", async () => {
    const { u, period } = await setup();
    const fmE = await createEmployee(u.hr, { firstName: "Fahad", lastName: "Test", userId: u.fm.userId, joinDate: "2026-01-01" });
    await addCompensation(u.hr, fmE.id, { baseSalary: "15000", effectiveFrom: "2026-01-01" });
    const adj = await addAdjustment(u.hr, period, { employeeId: fmE.id, componentKey: "BONUS", amount: "2000", reason: "Year-end bonus" });
    await calculatePeriod(u.hr, period);
    const s1 = await submitPayroll(u.hr, period);
    await expect(decideApproval(u.fm, { approvalId: s1.approvalId, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await withdrawPayroll(u.hr, period);
    await removeAdjustment(u.hr, adj.id);
    await calculatePeriod(u.hr, period);
    const s2 = await submitPayroll(u.hr, period);
    await decideApproval(u.fm, { approvalId: s2.approvalId, decision: "APPROVED" });
    expect((await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: period } })).status).toBe("APPROVED");
  });

  it("23, 35. payslips: own paid slip or hr.payroll.view; finance sees totals only, never employee salaries", async () => {
    const { u, e, period } = await setup();
    await calculatePeriod(u.hr, period);
    const entry = await prisma.payrollEntry.findFirstOrThrow({ where: { periodId: period, employeeId: e.emp }, include: { period: true } });
    await expect(payslipEntry(u.emp, entry.id)).rejects.toMatchObject({ code: "FORBIDDEN" }); // not paid yet
    const s = await submitPayroll(u.hr, period);
    await decideApproval(u.ceo, { approvalId: s.approvalId, decision: "APPROVED" });
    await markPayrollPaid(u.fm, period, {});
    expect((await payslipEntry(u.emp, entry.id)).id).toBe(entry.id);
    expect((await payslipEntry(u.hr, entry.id)).id).toBe(entry.id);
    for (const who of [u.emp2, u.mgr, u.fm, u.acc]) await expect(payslipEntry(who, entry.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const pdf = await renderPayslip(orgId, { ...entry, period: await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: period } }) }, "ar");
    expect(pdf.data.subarray(0, 5).toString()).toBe("%PDF-");
    // finance: period totals yes, employee lines / salaries no
    const fmView = await getPeriod(u.fm, period);
    expect([fmView.entries, fmView.adjustments, fmView.period.netTotal.toFixed(2)]).toEqual([null, null, "36000.00"]);
    await expect(compensationHistory(u.fm, e.emp)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const k = await financeKpis(u.fm, { from: D("2026-01-01"), to: new Date() });
    expect(k.payrollPaid).toBe("36000.00");
    expect(await prisma.notification.count({ where: { userId: u.emp.userId, dedupeKey: `payslip:${entry.id}` } })).toBe(1);
  });
});

describe("recruitment", () => {
  it("24–30. job → candidate → stages → interview → offer approval → acceptance → one employee", async () => {
    const { u } = await people();
    const job = await createJob(u.hr, { title: "Frontend Engineer", location: "Riyadh", headcount: 1 });
    await expect(createCandidate(u.hr, { firstName: "Rana", lastName: "K", email: "rana@cv.test", jobId: job.id })).rejects.toMatchObject(code(/^JOB_NOT_OPEN/));
    await setJobStatus(u.hr, job.id, "OPEN");
    const cand = await createCandidate(u.hr, { firstName: "Rana", lastName: "K", email: "Rana@CV.test", source: "LINKEDIN", jobId: job.id, salaryExpectation: 15000 });
    await expect(createCandidate(u.hr, { firstName: "Rana", lastName: "Again", email: "rana@cv.test" })).rejects.toMatchObject(code(/^CANDIDATE_EXISTS/));
    const app = cand.applicationId!;
    await expect(moveStage(u.hr, app, { to: "OFFER" })).rejects.toMatchObject(code(/^STAGE_INVALID_TRANSITION/));
    await expect(moveStage(u.hr, app, { to: "HIRED" })).rejects.toMatchObject(code(/^USE_HIRE_CONVERSION/));
    await expect(moveStage(u.hr, app, { to: "REJECTED" })).rejects.toMatchObject(code(/^REASON_REQUIRED/));
    await moveStage(u.hr, app, { to: "SCREENING" });
    await moveStage(u.hr, app, { to: "INTERVIEW", from: "SCREENING" });
    await expect(moveStage(u.hr, app, { to: "TECHNICAL", from: "SCREENING" })).rejects.toMatchObject(code(/^APPLICATION_STALE/));
    await scheduleInterview(u.hr, app, { scheduledAt: "2027-01-10T10:00:00Z", type: "VIDEO", interviewerIds: [u.mgr.userId], location: "https://meet.example/abc" });
    expect(await prisma.notification.count({ where: { userId: u.mgr.userId, category: "HR" } })).toBe(1);
    await addEvaluation(u.mgr, app, { rating: 4, recommendation: "YES", notes: "Strong React" }); // interviewer, no recruitment permission
    await expect(addEvaluation(u.emp, app, { rating: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const offer = await createOffer(u.hr, app, { jobTitle: "Frontend Engineer", salary: "14000", housingAllowance: "3500", startDate: "2027-02-01", expiresAt: "2027-01-20" });
    await expect(createOffer(u.hr, app, { jobTitle: "Second offer", salary: "1", startDate: "2027-02-01" })).rejects.toMatchObject(code(/^OFFER_EXISTS/));
    await submitOffer(u.hr, offer.id);
    const approvalId = (await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } })).approvalId!;
    await expect(decideApproval(u.hr, { approvalId, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" }); // author
    await decideApproval(u.ceo, { approvalId, decision: "APPROVED" });
    await expect(convertToEmployee(u.hr, offer.id, {})).rejects.toMatchObject(code(/^OFFER_NOT_ACCEPTED/));
    await sendOffer(u.hr, offer.id);
    await recordOfferResponse(u.hr, offer.id, { decision: "ACCEPTED", confirm: true });
    const results = await Promise.allSettled([convertToEmployee(u.hr, offer.id, {}), convertToEmployee(u.hr, offer.id, {})]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(convertToEmployee(u.hr, offer.id, {})).rejects.toMatchObject(code(/^ALREADY_CONVERTED/));
    const a = await prisma.application.findUniqueOrThrow({ where: { id: app }, include: { hiredEmployee: { include: { compensations: true } } } });
    expect([a.stage, a.status, a.hiredEmployee?.jobTitle, a.hiredEmployee?.userId, a.hiredEmployee?.compensations[0].baseSalary.toFixed(2)]).toEqual(["HIRED", "HIRED", "Frontend Engineer", null, "14000.00"]);
    expect(await prisma.employee.count({ where: { firstName: "Rana" } })).toBe(1);
    expect(await prisma.domainEvent.count({ where: { type: "employee.hired" } })).toBe(1);
  });
});

describe("performance, search, sweep, permissions", () => {
  it("31. reviews are visible to the employee (when completed), the manager and HR — nobody else", async () => {
    const { u, e } = await people();
    const r = await createReview(u.mgr, { employeeId: e.emp, periodLabel: "2026-H2", periodStart: "2026-07-01", periodEnd: "2026-12-31", dueDate: "2027-01-15" });
    await expect(createReview(u.mgr2, { employeeId: e.emp, periodLabel: "2026-H2", periodStart: "2026-07-01", periodEnd: "2026-12-31" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const who of [u.emp2, u.pm, u.mgr2, u.fm]) await expect(employeePerformance(who, e.emp)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await employeePerformance(u.emp, e.emp)).reviews).toHaveLength(0); // still a draft
    expect((await employeePerformance(u.hr, e.emp)).reviews).toHaveLength(1);
    await expect(updateReview(u.mgr, r.id, { status: "COMPLETED" })).rejects.toMatchObject(code(/^RATING_AND_SUMMARY_REQUIRED/));
    await updateReview(u.mgr, r.id, { status: "COMPLETED", rating: 4, summary: "Consistent delivery" });
    expect((await employeePerformance(u.emp, e.emp)).reviews).toHaveLength(1);
    await expect(updateReview(u.emp, r.id, { summary: "self edit" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("32. HR search only returns people inside the caller's HR scope", async () => {
    const { u } = await people();
    const hits = async (ctx: typeof u.hr, term: string) => (await globalSearch(ctx, term)).filter((h) => h.type === "employee").map((h) => h.title);
    expect((await hits(u.hr, "Test")).length).toBe(5);
    expect(await hits(u.emp, "Test")).toEqual([expect.stringContaining("Eyad")]);
    const mine = await hits(u.mgr, "Test");
    expect(mine).toHaveLength(2);
    expect(mine).toEqual(expect.arrayContaining([expect.stringContaining("Eyad"), expect.stringContaining("Majed")]));
    expect(await hits(u.pm, "Eyad")).toEqual([]);
  });

  it("33–34. the HR sweep is idempotent (lease + claims) and notifications are deduplicated", async () => {
    const { u, e } = await people();
    await prisma.attendancePolicy.update({ where: { organizationId: orgId }, data: { workingDays: [0, 1, 2, 3, 4, 5, 6] } });
    await createReview(u.mgr, { employeeId: e.emp, periodLabel: "2026-H2", periodStart: "2026-07-01", periodEnd: "2026-12-31", dueDate: "2026-01-01" });
    const first = await sweepHr(orgId);
    expect(first).toMatchObject({ reviewsDue: 1 });
    expect((first as { missingAttendance: number }).missingAttendance).toBe(5); // all five linked employees, yesterday
    const notes = await prisma.notification.count({ where: { category: "HR" } });
    await Promise.all([sweepHr(orgId), sweepHr(orgId)]);
    expect(await sweepHr(orgId)).toMatchObject({ missingAttendance: 0, reviewsDue: 0, leaveStarting: 0, offersExpiring: 0 });
    expect(await prisma.notification.count({ where: { category: "HR" } })).toBe(notes);
    expect(await prisma.notification.count({ where: { userId: u.mgr.userId, dedupeKey: { startsWith: "review.due:" } } })).toBe(1);
  });

  it("custom roles with legacy HR / payroll keys are migrated once, audited, never broadened", async () => {
    const role = await prisma.role.create({ data: { organizationId: orgId, key: "hr_assistant", name: "HR assistant", isSystem: false, permissions: { create: [{ permission: "finance.payroll.manage" }, { permission: "hr.employees.manage" }, { permission: "hr.recruitment.manage" }] } } });
    await migrateLegacyPermissions(orgId);
    await migrateLegacyPermissions(orgId);
    const perms = (await prisma.rolePermission.findMany({ where: { roleId: role.id } })).map((p) => p.permission).sort();
    expect(perms).toEqual(["hr.employees.archive", "hr.employees.create", "hr.employees.edit", "hr.employees.view", "hr.payroll.prepare", "hr.payroll.view", "hr.recruitment.manage", "hr.recruitment.view"]);
    for (const x of ["hr.payroll.approve", "hr.payroll.pay", "hr.compensation.view", "hr.records.all"]) expect(perms).not.toContain(x);
  });
});
