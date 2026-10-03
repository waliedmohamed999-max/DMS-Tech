import { NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { SESSION_COOKIE } from "@/lib/os/constants";
import { osCsp } from "@/lib/os/csp";
import { publicCsp, publicRouteKey, type PublicCspManifest } from "@/lib/csp/public";
import { readFileSync } from "node:fs";
import path from "node:path";

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

const DEV = process.env.NODE_ENV !== "production";
let manifest: PublicCspManifest | null | undefined;
/** Build-time hash manifest (scripts/csp-manifest.mjs). Missing / stale → null: pages get the STRICT policy without
 *  hashes (inline scripts blocked, visibly broken) — never a weaker policy. release:verify checks it exists. */
function cspManifest() {
  if (manifest !== undefined) return manifest;
  try {
    const dir = path.join(process.cwd(), ".next");
    const m = JSON.parse(readFileSync(path.join(dir, "csp-public.json"), "utf8")) as PublicCspManifest;
    const buildId = readFileSync(path.join(dir, "BUILD_ID"), "utf8").trim();
    manifest = m.buildId === buildId ? m : null;
    if (!manifest) console.error(JSON.stringify({ level: "error", msg: "csp_manifest_stale", manifestBuild: m.buildId, buildId }));
  } catch {
    manifest = null;
    console.error(JSON.stringify({ level: "error", msg: "csp_manifest_missing" }));
  }
  return manifest;
}

function publicProxy(request: NextRequest) {
  if (DEV) {
    const res = intl(request);
    res.headers.set("Content-Security-Policy", publicCsp({ dev: true }));
    return res;
  }
  const m = cspManifest();
  const entry = m?.routes[publicRouteKey(request.nextUrl.pathname)] ?? null;
  let csp: string;
  let req = request;
  if (entry) csp = publicCsp({ entry });
  else {
    // dynamically rendered public page (e.g. /quote) or unknown path: per-request nonce, forwarded to the renderer
    const nonce = btoa(crypto.randomUUID());
    csp = publicCsp({ nonce, styleUnion: m?.styleUnion, notFound: m?.notFound });
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    req = new NextRequest(request, { headers });
  }
  const res = intl(req);
  if (res.status < 300 || res.status >= 400) res.headers.set("Content-Security-Policy", csp);
  return res;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/app" || pathname.startsWith("/app/")) return osProxy(request);
  return publicProxy(request);
}

export const config = {
  // every page route; skips api routes, Next internals and static files
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"]
};
