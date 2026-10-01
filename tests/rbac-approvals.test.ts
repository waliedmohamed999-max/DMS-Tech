import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createUser, listUsers, setUserRoles, setUserStatus } from "@/server/admin/users";
import { createRole, setRolePermissions, updateSettings } from "@/server/admin/org";
import { decideApproval, listApprovals } from "@/server/approvals/service";
import { listActivity, listAudit } from "@/server/feed";
import { getAttention, getKpis } from "@/server/dashboard/service";
import { requirePermission } from "@/server/context";
import { ctxFor, makeUser, resetDb, roleId, setupOrg } from "./helpers";

let orgId: string;
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
});

async function delegatedAdmin() {
  const admin = await ctxFor((await makeUser(orgId, "root@x.test", ["super_admin"])).id);
  const role = await createRole(admin, { key: "it_admin", name: "IT Admin" });
  await setRolePermissions(admin, role.id, ["dashboard.view", "approvals.view", "admin.users.view", "admin.users.manage", "admin.roles.view"]);
  const it = await ctxFor((await makeUser(orgId, "it@x.test", [])).id);
  await prisma.userRole.create({ data: { userId: it.userId, roleId: role.id } });
  return { admin, it: await ctxFor(it.userId) };
}

describe("server-side permission enforcement", () => {
  it("an employee cannot list users, change settings, or read the audit log", async () => {
    const emp = await ctxFor((await makeUser(orgId, "emp@x.test", ["employee"])).id);
    await expect(listUsers(emp, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateSettings(emp, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listAudit(emp, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("unauthorized users cannot view payroll or approve quotations", async () => {
    const emp = await ctxFor((await makeUser(orgId, "emp2@x.test", ["employee"])).id);
    const rep = await ctxFor((await makeUser(orgId, "rep@x.test", ["sales_rep"])).id);
    expect(() => requirePermission(emp, "finance.payroll.view")).toThrow(/finance.payroll.view/);
    expect(() => requirePermission(rep, "sales.quotations.approve")).toThrow(/sales.quotations.approve/);
    expect(() => requirePermission(emp, "finance.invoices.view")).toThrow();
  });

  it("nobody can grant permissions they do not hold, and super_admin is immutable", async () => {
    const { admin, it } = await delegatedAdmin();
    const r = await createRole(admin, { key: "custom", name: "Custom" });
    // IT admin lacks admin.roles.manage entirely
    await expect(setRolePermissions(it, r.id, ["dashboard.view"])).rejects.toMatchObject({ code: "FORBIDDEN" });
    // unknown keys rejected
    await expect(setRolePermissions(admin, r.id, ["finance.anything"])).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setRolePermissions(admin, await roleId(orgId, "super_admin"), [])).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("users cannot disable themselves; delegated admins cannot disable privileged users", async () => {
    const { admin, it } = await delegatedAdmin();
    await expect(setUserStatus(admin, admin.userId, "DISABLED")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setUserStatus(it, admin.userId, "DISABLED")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("privileged role approval workflow", () => {
  it("delegated admin → approval → super admin approves → role granted, audited, notified", async () => {
    const { admin, it } = await delegatedAdmin();
    const { id, pendingRoles } = await createUser(it, {
      email: "fin@x.test",
      name: "Finance Person",
      roleIds: [await roleId(orgId, "employee"), await roleId(orgId, "finance_manager")]
    });
    expect(pendingRoles).toEqual(["finance_manager"]);

    // not granted yet
    const before = await ctxFor(id);
    expect(before.roleKeys).toEqual(["employee"]);
    expect(before.permissions.has("finance.payroll.view")).toBe(false);

    // super admin sees it in "mine" and gets a notification; requester does not see it in "mine"
    const mine = await listApprovals(admin, { view: "mine" });
    expect(mine.total).toBe(1);
    expect((await listApprovals(it, { view: "mine" })).total).toBe(0);
    expect(await prisma.notification.count({ where: { userId: admin.userId, category: "APPROVAL" } })).toBe(1);

    // the command center surfaces it
    const attention = await getAttention(admin);
    expect(attention.some((a) => a.category === "approval")).toBe(true);

    await decideApproval(admin, { approvalId: mine.items[0].id, decision: "APPROVED" });
    const after = await ctxFor(id);
    expect(after.roleKeys.sort()).toEqual(["employee", "finance_manager"]);
    expect(after.permissions.has("finance.payroll.view")).toBe(true);

    expect(await prisma.auditLog.count({ where: { action: "approval.approved" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "user.role_granted_via_approval" } })).toBe(1);
    // requester is told about the decision
    expect(await prisma.notification.count({ where: { userId: it.userId, category: "APPROVAL" } })).toBe(1);
    // and events were all processed
    expect(await prisma.domainEvent.count({ where: { status: { not: "PROCESSED" } } })).toBe(0);
  });

  it("cannot approve twice, cannot self-approve, rejection needs a reason", async () => {
    const { admin, it } = await delegatedAdmin();
    const target = await makeUser(orgId, "t@x.test", ["employee"]);
    await setUserRoles(it, target.id, [await roleId(orgId, "employee"), await roleId(orgId, "hr_manager")]);
    const a = (await listApprovals(admin, { view: "mine" })).items[0];

    await expect(decideApproval(it, { approvalId: a.id, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(decideApproval(admin, { approvalId: a.id, decision: "REJECTED" })).rejects.toMatchObject({ code: "VALIDATION" });
    await decideApproval(admin, { approvalId: a.id, decision: "REJECTED", comment: "Not needed" });
    await expect(decideApproval(admin, { approvalId: a.id, decision: "APPROVED" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await ctxFor(target.id)).roleKeys).toEqual(["employee"]);
  });

  it("a super admin's own requests cannot be self-approved", async () => {
    const { admin } = await delegatedAdmin();
    const other = await ctxFor((await makeUser(orgId, "root2@x.test", ["super_admin"])).id);
    // admin grants directly (holds grant_privileged) → no approval created
    const t = await makeUser(orgId, "t2@x.test", ["employee"]);
    const res = await setUserRoles(admin, t.id, [await roleId(orgId, "ceo")]);
    expect(res.pendingApproval).toEqual([]);
    expect((await listApprovals(other, { view: "mine" })).total).toBe(0);
  });
});

describe("activity & dashboard", () => {
  it("activity feed hides items the viewer lacks permission for", async () => {
    const { it } = await delegatedAdmin();
    await createUser(it, { email: "n@x.test", name: "New Person", roleIds: [await roleId(orgId, "employee")] });
    const emp = await ctxFor((await makeUser(orgId, "plain@x.test", ["employee"])).id);
    const forAdmin = await listActivity(it, {});
    const forEmp = await listActivity(emp, {});
    expect(forAdmin.items.some((a) => a.verb === "user.created")).toBe(true);
    expect(forEmp.items.some((a) => a.verb === "user.created")).toBe(false);
  });

  it("KPIs are real or explicitly planned — finance KPIs hidden from employees", async () => {
    const ceo = await ctxFor((await makeUser(orgId, "c@x.test", ["ceo"])).id);
    const emp = await ctxFor((await makeUser(orgId, "e@x.test", ["employee"])).id);
    const k = await getKpis(ceo);
    // Phase 5 made the finance KPIs live (billed — never labelled revenue)
    expect(k.find((x) => x.key === "invoiced")).toMatchObject({ state: "live", value: 0, format: "currency" });
    expect(k.find((x) => x.key === "revenue")).toBeUndefined();
    expect(k.find((x) => x.key === "team")).toMatchObject({ state: "live", value: 2 });
    const ke = await getKpis(emp);
    expect(ke.find((x) => x.key === "invoiced")).toBeUndefined();
    expect(ke.find((x) => x.key === "team")).toBeUndefined();
  });

  it("audit log rows cannot be modified or deleted", async () => {
    const { admin } = await delegatedAdmin();
    await expect(prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET action = 'tampered'`)).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "AuditLog"`)).rejects.toThrow(/append-only/);
    expect((await listAudit(admin, {})).total).toBeGreaterThan(0);
  });
});
