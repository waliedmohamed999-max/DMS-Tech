import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, isPermission, PRIVILEGED_ROLE_KEYS, resolveRolePermissions, SYSTEM_ROLES } from "@/server/rbac/permissions";

const role = (k: string) => resolveRolePermissions(SYSTEM_ROLES.find((r) => r.key === k)!);

describe("permission catalog", () => {
  it("every system role only references catalog permissions", () => {
    for (const r of SYSTEM_ROLES) for (const p of resolveRolePermissions(r)) expect(isPermission(p)).toBe(true);
  });
  it("super admin holds every permission", () => {
    expect(role("super_admin").sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
  it("privileged role keys exist", () => {
    for (const k of PRIVILEGED_ROLE_KEYS) expect(SYSTEM_ROLES.some((r) => r.key === k)).toBe(true);
  });
  it("employees cannot see payroll, sensitive HR data, finance or admin", () => {
    const p = role("employee");
    for (const x of ["finance.payroll.view", "hr.employees.sensitive", "finance.invoices.view", "admin.users.manage", "sales.quotations.approve"] as const) expect(p).not.toContain(x);
  });
  it("sales reps cannot approve quotations; sales managers can", () => {
    expect(role("sales_rep")).not.toContain("sales.quotations.approve");
    expect(role("sales_manager")).toContain("sales.quotations.approve");
  });
  it("general manager cannot see payroll bank/salary details or manage admin", () => {
    expect(role("general_manager")).not.toContain("hr.employees.sensitive");
    expect(role("general_manager")).not.toContain("admin.users.manage");
  });
  it("only super admin can grant privileged roles directly", () => {
    for (const r of SYSTEM_ROLES.filter((x) => x.key !== "super_admin")) expect(resolveRolePermissions(r)).not.toContain("admin.roles.grant_privileged");
  });
});
