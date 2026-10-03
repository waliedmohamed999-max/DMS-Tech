import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { systemCtx } from "@/server/context";
import { unitOfWork } from "@/server/events/bus";
import { login, resolveSession } from "@/server/auth/service";
import { setUserStatus } from "@/server/admin/users";
import { changeEmployeeStatus, createEmployee, updateEmployee } from "@/server/hr/employees";
import { revokeEmployeeAccessTx } from "@/server/hr/offboarding";
import { sweepHr } from "@/server/hr/sweep";
import { goLiveChecks } from "@/server/system/golive";
import { addDays, todayIn, ymd } from "@/server/commercial/dates";
import { ctxFor, makeUser, PASSWORD, resetDb, setupOrg } from "./helpers";

/** Phase 11 (P11-B) — secure employee offboarding: account disabled + sessions revoked on the effective date. */
let orgId: string;
let tz: string;
beforeEach(async () => {
  await resetDb();
  const org = await setupOrg();
  orgId = org.id;
  tz = (await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })).timezone;
});

const code = (re: RegExp) => ({ message: expect.stringMatching(re) });
const today = () => todayIn(tz);

async function setup(roles: string[] = ["employee"], email = "leaver@x.test") {
  const hr = await ctxFor((await makeUser(orgId, "hr@x.test", ["hr_manager"])).id);
  await makeUser(orgId, "admin1@x.test", ["super_admin"]);
  const user = await makeUser(orgId, email, roles);
  const emp = await createEmployee(hr, { firstName: "Lea", lastName: "Ver", userId: user.id, joinDate: "2026-01-01", personalEmail: "lea@home.test", personalPhone: "+966500000111" });
  const s = await login({ email, password: PASSWORD, ip: "10.0.0.1" });
  if (!s.ok) throw new Error("login failed");
  return { hr, user, emp, token: s.token };
}

const audits = (action: string, entityId: string) => prisma.auditLog.count({ where: { action, entityId } });

describe("termination effective today", () => {
  it("disables the linked account, revokes every session, audits and emits — history kept", async () => {
    const { hr, user, emp, token } = await setup();
    const s2 = await login({ email: "leaver@x.test", password: PASSWORD, ip: "10.0.0.2" });
    expect(await resolveSession(token)).not.toBeNull();
    const r = await changeEmployeeStatus(hr, emp.id, { to: "TERMINATED", reason: "Resigned", terminationDate: ymd(today()) });
    expect(r.access).toBe("revoked_now");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("DISABLED");
    expect(await resolveSession(token)).toBeNull();
    expect(s2.ok && (await resolveSession(s2.token))).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    expect(await login({ email: "leaver@x.test", password: PASSWORD, ip: "10.0.0.3" })).toMatchObject({ ok: false, reason: "DISABLED" });
    expect(await audits("user.disabled", user.id)).toBe(1);
    expect(await audits("employee.access_revoked", emp.id)).toBe(1);
    expect(await prisma.domainEvent.count({ where: { type: "employee.access_revoked", entityId: emp.id } })).toBe(1);
    expect(await prisma.domainEvent.count({ where: { type: "user.disabled", entityId: user.id } })).toBe(1);
    // nothing deleted
    expect(await prisma.user.count({ where: { id: user.id, deletedAt: null } })).toBe(1);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: emp.id } })).accessRevokedAt).not.toBeNull();
  });

  it("is idempotent: a retry / second worker changes nothing and writes no second audit", async () => {
    const { hr, user, emp } = await setup();
    await changeEmployeeStatus(hr, emp.id, { to: "TERMINATED", reason: "Resigned", terminationDate: ymd(today()) });
    const ctx = systemCtx(orgId);
    const again = await unitOfWork(ctx, (tx, uow) => revokeEmployeeAccessTx(tx, uow, emp.id, new Date(), "scheduled_termination"));
    expect(again.outcome).toBe("already_done");
    expect((await sweepHr(orgId)) as { accessRevoked?: number }).toMatchObject({ accessRevoked: 0 });
    expect(await audits("user.disabled", user.id)).toBe(1);
  });

  it("concurrent revocations (two worker instances) disable the account exactly once", async () => {
    const { hr, user, emp } = await setup();
    // schedule (future) so nothing happens at the status change, then race two revocations
    await changeEmployeeStatus(hr, emp.id, { to: "TERMINATED", reason: "Contract end", terminationDate: ymd(addDays(today(), 5)) });
    const ctx = systemCtx(orgId);
    const run = () => unitOfWork(ctx, (tx, uow) => revokeEmployeeAccessTx(tx, uow, emp.id, new Date(), "scheduled_termination")).catch((e) => ({ outcome: `error:${(e as Error).message}` }));
    const res = await Promise.all([run(), run(), run()]);
    expect(res.filter((r) => r.outcome === "revoked")).toHaveLength(1);
    expect(await audits("user.disabled", user.id)).toBe(1);
    expect(await audits("employee.access_revoked", emp.id)).toBe(1);
  });
});

describe("edge cases", () => {
  it("ordinary HR edits and non-final status changes never disable the account", async () => {
    const { hr, user, emp, token } = await setup();
    await updateEmployee(hr, emp.id, { firstName: "Leah", lastName: "Ver", joinDate: "2026-01-01", userId: user.id });
    if ((await prisma.employee.findUniqueOrThrow({ where: { id: emp.id } })).status === "PROBATION") await changeEmployeeStatus(hr, emp.id, { to: "ACTIVE" });
    await changeEmployeeStatus(hr, emp.id, { to: "SUSPENDED", reason: "Investigation" });
    await changeEmployeeStatus(hr, emp.id, { to: "ACTIVE" });
    await changeEmployeeStatus(hr, emp.id, { to: "ON_LEAVE" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("ACTIVE");
    expect(await resolveSession(token)).not.toBeNull();
    expect(await audits("employee.access_revoked", emp.id)).toBe(0);
  });

  it("an employee without a system account is terminated normally (recorded, nothing to disable)", async () => {
    const hr = await ctxFor((await makeUser(orgId, "hr@x.test", ["hr_manager"])).id);
    const emp = await createEmployee(hr, { firstName: "No", lastName: "Account", joinDate: "2026-01-01", personalEmail: "no@home.test", personalPhone: "+966500000112" });
    const r = await changeEmployeeStatus(hr, emp.id, { to: "TERMINATED", reason: "Resigned", terminationDate: ymd(today()) });
    expect(r.access).toBe("revoked_now");
    const a = await prisma.auditLog.findFirstOrThrow({ where: { action: "employee.access_revoked", entityId: emp.id } });
    expect(a.after).toMatchObject({ outcome: "no_account" });
  });

  it("an account that is already disabled stays disabled; remaining sessions are still revoked; no duplicate user.disabled", async () => {
    const { hr, user, emp } = await setup();
    await prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });
    await changeEmployeeStatus(hr, emp.id, { to: "TERMINATED", reason: "Resigned", terminationDate: ymd(today()) });
    expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    expect(await audits("user.disabled", user.id)).toBe(0);
    const a = await prisma.auditLog.findFirstOrThrow({ where: { action: "employee.access_revoked", entityId: emp.id } });
    expect(a.after).toMatchObject({ outcome: "already_disabled" });
  });
});

describe("future-dated termination", () => {
  it("keeps access until the effective day; the HR sweep (worker) revokes on that day, once", async () => {
    const { hr, user, emp, token } = await setup();
    const effective = addDays(today(), 2);
    const r = await changeEmployeeStatus(hr, emp.id, { to: "TERMINATED", reason: "Notice period", terminationDate: ymd(effective) });
    expect(r.access).toBe("scheduled");
    expect(await resolveSession(token)).not.toBeNull();
    // the day before: nothing
    expect(await sweepHr(orgId, addDays(new Date(), 1))).toMatchObject({ accessRevoked: 0 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("ACTIVE");
    // effective day
    expect(await sweepHr(orgId, addDays(new Date(), 2))).toMatchObject({ accessRevoked: 1 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("DISABLED");
    expect(await resolveSession(token)).toBeNull();
    expect(await sweepHr(orgId, addDays(new Date(), 3))).toMatchObject({ accessRevoked: 0 });
    const a = await prisma.auditLog.findFirstOrThrow({ where: { action: "user.disabled", entityId: user.id } });
    expect(a.after).toMatchObject({ reason: "offboarding", trigger: "scheduled_termination" });
  });

  it("archiving a scheduled leaver revokes immediately", async () => {
    const { hr, user, emp } = await setup();
    await changeEmployeeStatus(hr, emp.id, { to: "TERMINATED", reason: "Notice period", terminationDate: ymd(addDays(today(), 10)) });
    const r = await changeEmployeeStatus(hr, emp.id, { to: "ARCHIVED" });
    expect(r.access).toBe("revoked_now");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("DISABLED");
  });
});

describe("break-glass guard", () => {
  it("the last active Super Admin cannot be offboarded (termination refused, nothing changed)", async () => {
    const hr = await ctxFor((await makeUser(orgId, "hr@x.test", ["hr_manager"])).id);
    const boss = await makeUser(orgId, "boss@x.test", ["super_admin"]);
    const emp = await createEmployee(hr, { firstName: "Bo", lastName: "Ss", userId: boss.id, joinDate: "2026-01-01", personalEmail: "bo@home.test", personalPhone: "+966500000113" });
    await expect(changeEmployeeStatus(hr, emp.id, { to: "TERMINATED", reason: "Resigned", terminationDate: ymd(today()) })).rejects.toMatchObject(code(/LAST_SUPER_ADMIN/));
    await expect(changeEmployeeStatus(hr, emp.id, { to: "TERMINATED", reason: "Resigned", terminationDate: ymd(addDays(today(), 3)) })).rejects.toMatchObject(code(/LAST_SUPER_ADMIN/));
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: emp.id } })).status).not.toBe("TERMINATED");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: boss.id } })).status).toBe("ACTIVE");
    // with a second named admin the same termination goes through
    await makeUser(orgId, "boss2@x.test", ["super_admin"]);
    await changeEmployeeStatus(hr, emp.id, { to: "TERMINATED", reason: "Resigned", terminationDate: ymd(today()) });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: boss.id } })).status).toBe("DISABLED");
  });

  it("accounts that are not employees (service / smoke / break-glass) are never touched by the sweep", async () => {
    const svc = await makeUser(orgId, "smoke@x.test", ["employee"]);
    await sweepHr(orgId, addDays(new Date(), 30));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: svc.id } })).status).toBe("ACTIVE");
  });
});

describe("go-live check", () => {
  it("normal offboarding is PASS; an admin re-enabling an offboarded account is flagged", async () => {
    const { hr, user, emp } = await setup();
    await changeEmployeeStatus(hr, emp.id, { to: "TERMINATED", reason: "Resigned", terminationDate: ymd(today()) });
    const check = async () => (await goLiveChecks({ target: "staging", probeUrl: false })).find((c) => c.key === "offboarding_accounts")!;
    expect((await check()).level).toBe("PASS");
    const admin = await ctxFor((await prisma.user.findFirstOrThrow({ where: { email: "admin1@x.test" } })).id);
    await setUserStatus(admin, user.id, "ACTIVE");
    const c = await check();
    expect(c.level).toBe("WARN");
    expect(c.detail).toMatch(/re-enabled/);
  });
});
