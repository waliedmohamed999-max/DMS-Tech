"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import "@/server";
import { login, logout, changeMyPassword, revokeMySession } from "@/server/auth/service";
import { createUser, resetUserPassword, setUserRoles, setUserStatus, updateUser } from "@/server/admin/users";
import { archiveDepartment, createRole, saveDepartment, setRolePermissions, updateSettings } from "@/server/admin/org";
import { cancelApproval, decideApproval } from "@/server/approvals/service";
import { latestNotifications, markNotificationsRead, unreadCount } from "@/server/feed";
import { globalSearch } from "@/server/dashboard/service";
import { prisma } from "@/server/db";
import { OS_LOCALE_COOKIE } from "@/i18n/request";
import { SESSION_COOKIE, sessionCookieOptions } from "./constants";
import { formToObject, runAction, type ActionResult } from "./action";
import { getSession } from "./dal";

const secure = process.env.NODE_ENV === "production";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function loginAction(_: unknown, fd: FormData): Promise<{ error?: string; email?: string }> {
  const h = await headers();
  const r = await login({
    email: String(fd.get("email") ?? ""),
    password: String(fd.get("password") ?? ""),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "local",
    userAgent: h.get("user-agent")
  });
  // return the email so the form can keep it (React resets form fields after an action)
  if (!r.ok) return { error: r.reason, email: String(fd.get("email") ?? "").slice(0, 160) };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, r.token, sessionCookieOptions(r.expiresAt));
  const next = String(fd.get("next") ?? "");
  // only allow internal OS redirects (no open redirect)
  redirect(next.startsWith("/app") && !next.startsWith("//") ? next : "/app");
}

export async function logoutAction() {
  const jar = await cookies();
  await logout(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/app/login");
}

export async function setLocaleAction(locale: "ar" | "en") {
  const jar = await cookies();
  jar.set(OS_LOCALE_COOKIE, locale, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  const s = await getSession();
  if (s) await prisma.user.update({ where: { id: s.user.id }, data: { locale } });
  return { ok: true } as const;
}

export async function changePasswordAction(_: unknown, fd: FormData): Promise<ActionResult<void>> {
  if (fd.get("next") !== fd.get("confirm")) return { ok: false, error: "PASSWORD_MISMATCH" };
  const keep = (await getSession())?.sessionId;
  return runAction((ctx) => changeMyPassword(ctx, String(fd.get("current") ?? ""), String(fd.get("next") ?? ""), keep), { allowMustChange: true });
}

export async function revokeSessionAction(id: string) {
  return runAction((ctx) => revokeMySession(ctx, id));
}

// ---------------------------------------------------------------------------
// Shell (topbar) — read-only, no revalidation
// ---------------------------------------------------------------------------

export async function notificationsPeekAction() {
  return runAction(async (ctx) => ({ items: await latestNotifications(ctx, 8), unread: await unreadCount(ctx) }), { revalidate: false });
}

export async function markReadAction(ids: string[] | "all") {
  return runAction((ctx) => markNotificationsRead(ctx, ids));
}

export async function searchAction(q: string) {
  return runAction((ctx) => globalSearch(ctx, q), { revalidate: false });
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export async function decideApprovalAction(approvalId: string, decision: "APPROVED" | "REJECTED", comment?: string) {
  return runAction((ctx) => decideApproval(ctx, { approvalId, decision, comment }));
}

export async function cancelApprovalAction(approvalId: string) {
  return runAction((ctx) => cancelApproval(ctx, approvalId));
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function createUserAction(_: unknown, fd: FormData) {
  return runAction((ctx) => createUser(ctx, formToObject(fd)));
}

export async function updateUserAction(_: unknown, fd: FormData) {
  return runAction((ctx) => updateUser(ctx, formToObject(fd)));
}

export async function setUserRolesAction(userId: string, roleIds: string[]) {
  return runAction((ctx) => setUserRoles(ctx, userId, roleIds));
}

export async function setUserStatusAction(userId: string, status: "ACTIVE" | "DISABLED") {
  return runAction((ctx) => setUserStatus(ctx, userId, status));
}

export async function resetPasswordAction(userId: string) {
  return runAction((ctx) => resetUserPassword(ctx, userId));
}

// ---------------------------------------------------------------------------
// Roles, departments, settings
// ---------------------------------------------------------------------------

export async function createRoleAction(_: unknown, fd: FormData) {
  return runAction(async (ctx) => {
    const r = await createRole(ctx, formToObject(fd));
    return { id: r.id };
  });
}

export async function setRolePermissionsAction(roleId: string, permissions: string[]) {
  return runAction((ctx) => setRolePermissions(ctx, roleId, permissions));
}

export async function saveDepartmentAction(_: unknown, fd: FormData) {
  return runAction(async (ctx) => {
    await saveDepartment(ctx, formToObject(fd));
  });
}

export async function archiveDepartmentAction(id: string) {
  return runAction((ctx) => archiveDepartment(ctx, id));
}

export async function updateSettingsAction(_: unknown, fd: FormData) {
  return runAction((ctx) => updateSettings(ctx, formToObject(fd)));
}
