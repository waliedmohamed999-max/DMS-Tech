import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createEmployee, createSystemAccount, getEmployee, linkUser, updateEmployee } from "@/server/hr/employees";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

let orgId: string;
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
});

async function people() {
  const hr = await ctxFor((await makeUser(orgId, "hr@x.test", ["hr_manager"])).id);
  const gm = await ctxFor((await makeUser(orgId, "gm@x.test", ["general_manager"])).id);
  const admin = await ctxFor((await makeUser(orgId, "admin@x.test", ["super_admin"])).id);
  return { hr, gm, admin };
}

describe("employee identity and system account", () => {
  it("1. HR records gender, birth date and national ID; others see them masked; personal data needs the sensitive permission", async () => {
    const { hr, gm } = await people();
    const { id } = await createEmployee(hr, { firstName: "Sara", lastName: "Ali", joinDate: "2026-01-01", gender: "FEMALE", birthDate: "1995-04-10", nationalId: "1012345678" });
    const own = await getEmployee(hr, id);
    expect([own.employee.gender, own.employee.nationalId, own.employee.birthDate?.toISOString().slice(0, 10)]).toEqual(["FEMALE", "1012345678", "1995-04-10"]);
    const other = await getEmployee(gm, id);
    expect([other.employee.gender, other.employee.nationalId, other.employee.birthDate]).toEqual(["FEMALE", "••••••78", null]);
    // the general manager edits employees but not personal data (never writes a masked value back)
    await expect(updateEmployee(gm, id, { nationalId: "1099999999" })).rejects.toThrow(/sensitive/);
    await expect(updateEmployee(gm, id, { nationalId: "••••••78" })).rejects.toThrow();
    await expect(createEmployee(gm, { firstName: "X", lastName: "Y", joinDate: "2026-01-01", nationalId: "2012345678" })).rejects.toThrow(/sensitive/);
    await updateEmployee(gm, id, { jobTitle: "Designer", gender: "FEMALE" });
    // the audit trail never stores personal values
    const audit = await prisma.auditLog.findMany({ where: { entityId: id } });
    expect(JSON.stringify(audit.map((a) => a.after))).not.toContain("1012345678");
  });

  it("2. one employee per national ID; birth date not in the future; the format is checked", async () => {
    const { hr } = await people();
    await createEmployee(hr, { firstName: "A", lastName: "B", joinDate: "2026-01-01", nationalId: "2412345678" });
    await expect(createEmployee(hr, { firstName: "C", lastName: "D", joinDate: "2026-01-01", nationalId: "2412 345 678" })).rejects.toThrow(/NATIONAL_ID_TAKEN/);
    await expect(createEmployee(hr, { firstName: "C", lastName: "D", joinDate: "2026-01-01", birthDate: "2099-01-01" })).rejects.toThrow(/BIRTH_DATE_FUTURE/);
    await expect(createEmployee(hr, { firstName: "C", lastName: "D", joinDate: "2026-01-01", nationalId: "12-3" })).rejects.toThrow();
  });

  it("3. a system account created for an employee returns its temporary password; link and unlink an existing account", async () => {
    const { admin } = await people();
    const { id } = await createEmployee(admin, { firstName: "Omar", lastName: "K", joinDate: "2026-01-01", workEmail: "omar@x.test" });
    const role = await prisma.role.findFirstOrThrow({ where: { organizationId: orgId, key: "employee" } });
    const acc = await createSystemAccount(admin, id, { roleIds: [role.id] });
    expect(acc.tempPassword).toMatch(/^Dms-/);
    expect((await getEmployee(admin, id)).employee.user?.email).toBe("omar@x.test");
    await linkUser(admin, id, null);
    expect((await getEmployee(admin, id)).employee.userId).toBeNull();
    await linkUser(admin, id, acc.id);
    const other = await createEmployee(admin, { firstName: "Z", lastName: "Z", joinDate: "2026-01-01" });
    await expect(linkUser(admin, other.id, acc.id)).rejects.toThrow(/USER_ALREADY_LINKED/);
  });
});
