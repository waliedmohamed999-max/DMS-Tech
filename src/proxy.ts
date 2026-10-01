import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { SESSION_COOKIE } from "@/lib/os/constants";

const intl = createIntlMiddleware(routing);

/**
 * /app (Business OS) never goes through locale routing. This is only an optimistic
 * gate (cookie presence) — real session + permission checks happen server-side
 * in the DAL and in every service function.
 */
function osProxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasSession && pathname !== "/app/login") {
    const url = new URL("/app/login", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/app" || pathname.startsWith("/app/")) return osProxy(request);
  return intl(request);
}

export const config = {
  // every page route; skips api routes, Next internals and static files
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"]
};
