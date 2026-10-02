export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-dms_os" : "dms_os";

/**
 * Session cookie attributes (Phase 9 review): HttpOnly (no script access), Secure + "__Host-" prefix in production
 * (HTTPS only, host-bound, path "/"), SameSite=Lax (not sent on cross-site POST), absolute expiry = server session expiry.
 */
export const sessionCookieOptions = (expires: Date, production = process.env.NODE_ENV === "production") =>
  ({ httpOnly: true, secure: production, sameSite: "lax", path: "/", expires }) as const;
