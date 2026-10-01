import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import "@/server"; // registers subscribers + approval handlers
import { resolveSession, type SessionUser } from "@/server/auth/service";
import type { Ctx } from "@/server/context";
import type { Permission } from "@/server/rbac/permissions";
import { SESSION_COOKIE } from "./constants";

/**
 * Data Access Layer for the Business OS (Next docs: "Creating a Data Access Layer").
 * Every page and server action obtains its Ctx here; services re-check permissions.
 */

export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveSession(token);
});

async function requestMeta() {
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null, userAgent: h.get("user-agent") };
}

export function toCtx(s: SessionUser, meta?: Ctx["meta"]): Ctx {
  return {
    organizationId: s.user.organizationId,
    userId: s.user.id,
    userName: s.user.name,
    roleKeys: s.roleKeys,
    permissions: new Set(s.permissions),
    meta
  };
}

/** For pages: redirect to login when there is no live session. */
export const requireSession = cache(async () => {
  const s = await getSession();
  if (!s) redirect("/app/login");
  return s;
});

export const requireCtx = cache(async (): Promise<Ctx> => toCtx(await requireSession(), await requestMeta()));

/** For pages: returns the ctx when allowed, or `null` so the page renders <PermissionDenied/>. */
export async function pageCtx(permission?: Permission): Promise<{ ctx: Ctx; allowed: boolean }> {
  const s = await requireSession();
  if (s.user.mustChangePassword) redirect("/app/me?force=1");
  const ctx = await requireCtx();
  return { ctx, allowed: !permission || ctx.permissions.has(permission) };
}
