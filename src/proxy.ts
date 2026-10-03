import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { SESSION_COOKIE } from "@/lib/os/constants";
import { osCsp } from "@/lib/os/csp";

const intl = createIntlMiddleware(routing);

/**
 * /app (Business OS) never goes through locale routing. This is only an optimistic
 * gate (cookie presence) — real session + permission checks happen server-side
 * in the DAL and in every service function.
 */
/** File / PDF routes send their own `sandbox` CSP (src/lib/os/csp.ts has the page policy). */
const FILE_ROUTE = /\/(pdf|download|payslip)$/;

function osProxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasSession && pathname !== "/app/login") {
    const url = new URL("/app/login", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  // Phase 10: one request id per request (kept from a trusted edge if it is well-formed) — logs, events, outbox share it
  const incoming = request.headers.get("x-request-id");
  const requestId = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  let res: NextResponse;
  if (FILE_ROUTE.test(pathname)) res = NextResponse.next({ request: { headers: requestHeaders } });
  else {
    const nonce = btoa(crypto.randomUUID());
    const csp = osCsp(nonce);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
  }
  res.headers.set("x-request-id", requestId);
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
