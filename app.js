/**
 * Production entrypoint for cPanel / CloudLinux Node.js Selector + Phusion Passenger (docs/CPANEL_DEPLOYMENT.md).
 *
 * Why a custom server (and not `output: "standalone"`):
 *  - Passenger loads ONE startup file and owns the process lifecycle; it hands the app its own socket instead of a
 *    TCP port. Next.js' supported way to listen on a socket you are given is the programmatic API (`next({ ... })`).
 *  - The build runs in place on the host (full node_modules), and src/proxy.ts reads .next/csp-public.json + BUILD_ID
 *    from process.cwd(); standalone output would move the server into .next/standalone and need extra copy steps.
 *
 * Passenger:  the app listens on 'passenger' (Passenger's reverse-port binding) — no port is chosen here.
 * Elsewhere:  `npm run start:passenger` listens on PORT (default 3000) and HOST (default 127.0.0.1).
 *
 * Never starts a daemon or child process. Logs are JSON lines on stdout/stderr (→ the Passenger log); clients only
 * ever get a generic 500. Requires a completed `npm run cpanel:build` (or `npm run build`).
 */
"use strict";

// must run before anything can call server.listen(): we bind to Passenger explicitly below
if (typeof PhusionPassenger !== "undefined") PhusionPassenger.configure({ autoInstall: false });

const { existsSync } = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const log = (level, msg, extra) => {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, process: "web", ...extra });
  (level === "error" || level === "warn" ? console.error : console.log)(line);
};
const errInfo = (e) => ({ error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined });

// .build-info.json, .next/csp-public.json and prisma/migrations are resolved from the working directory
process.chdir(__dirname);

if (process.env.NODE_ENV !== "production") {
  log("warn", "node_env_forced_production", { was: process.env.NODE_ENV ?? null });
  process.env.NODE_ENV = "production";
}

const underPassenger = typeof PhusionPassenger !== "undefined";
const port = Number.parseInt(process.env.PORT ?? "", 10) || 3000;
const host = process.env.HOST || "127.0.0.1";

if (!existsSync(path.join(__dirname, ".next", "BUILD_ID"))) {
  log("error", "startup_refused", { reason: "NO_PRODUCTION_BUILD", fix: "run `npm run cpanel:build`, then restart the application" });
  process.exit(1);
}
if (!existsSync(path.join(__dirname, ".next", "csp-public.json"))) {
  // the public site still works (strict CSP fallback), but the build was not made with `npm run build`
  log("warn", "csp_manifest_missing", { fix: "build with `npm run cpanel:build` (runs the postbuild CSP manifest)" });
}

// same policy as `next start`: log, keep serving (Passenger restarts the process if it does exit)
process.on("unhandledRejection", (e) => log("error", "unhandled_rejection", errInfo(e)));
process.on("uncaughtException", (e) => log("error", "uncaught_exception", errInfo(e)));

let next;
try {
  next = require("next");
} catch (e) {
  log("error", "startup_refused", { reason: "NEXT_NOT_INSTALLED", fix: "run NPM Install in the cPanel Node.js application", ...errInfo(e) });
  process.exit(1);
}

// hostname/port here only form Next's INTERNAL request URL (not the bind address). They must stay "localhost" + one fixed
// port: the proxy's (next-intl) rewrites are issued against http://localhost:<port>, and a different internal origin
// makes Next treat them as external → "/" and "/about" answer 307 to themselves (verified on Next 16.3.4).
const app = next({ dev: false, dir: __dirname, hostname: "localhost", port });
const handle = app.getRequestHandler();

// Under Passenger, Apache is the edge proxy. Passenger's "secure headers" (prefix "!~") cannot be sent by clients —
// Passenger rejects any request that tries — so they are the only trustworthy client address / scheme.
// This does here what deploy/nginx/dms-os.conf does elsewhere: client-supplied forwarding headers are discarded and
// replaced (the app trusts the FIRST X-Forwarded-For entry for rate limits and audit — a spoofed value would let one
// client pose as many and bypass per-IP login / lead limits).
const { isIP } = require("node:net");
const siteOrigin = (() => {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
    return u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
})();
// last (rightmost) entry of a comma-separated forwarding header = the one added by the nearest proxy;
// a client can only prepend values, never append after the proxy's own
const lastEntry = (v) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean).pop() ?? "";
let headersReported = false;
function fromPassenger(req, res) {
  if (!headersReported) {
    // once per process, NAMES only (never values): shows which forwarding headers this Passenger actually sends
    headersReported = true;
    const names = Object.keys(req.headers).filter((h) => h.startsWith("!~") || /^x-forwarded-|^x-real-ip$/.test(h));
    log("info", "passenger_headers", { names });
  }
  const secureProto = req.headers["!~passenger-proto"];
  const proto = secureProto === "https" || secureProto === "http" ? secureProto : lastEntry(req.headers["x-forwarded-proto"]).toLowerCase();
  // plain HTTP → canonical HTTPS URL (never the client's Host header). Only when the request is explicitly marked http,
  // so a missing header can never cause a redirect loop. ACME / AutoSSL validation stays on HTTP.
  if (proto === "http" && siteOrigin && !(req.url ?? "").startsWith("/.well-known/")) {
    res.statusCode = 308;
    res.setHeader("Location", siteOrigin + (req.url ?? "/"));
    res.setHeader("Cache-Control", "no-store");
    res.end();
    return false;
  }
  // client address: Passenger's unspoofable header, else the proxy-appended last X-Forwarded-For entry
  const secureClient = String(req.headers["!~passenger-client-address"] ?? "").trim();
  const client = isIP(secureClient) ? secureClient : lastEntry(req.headers["x-forwarded-for"]);
  delete req.headers["x-forwarded-host"];
  if (isIP(client)) {
    req.headers["x-forwarded-for"] = client;
    req.headers["x-real-ip"] = client;
  } else {
    // nothing trustworthy: drop client-supplied values rather than letting them choose their rate-limit bucket
    delete req.headers["x-forwarded-for"];
    delete req.headers["x-real-ip"];
  }
  if (proto === "https" || proto === "http") req.headers["x-forwarded-proto"] = proto;
  return true;
}

app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => {
      if (underPassenger && !fromPassenger(req, res)) return;
      Promise.resolve(handle(req, res)).catch((e) => {
        log("error", "request_failed", { method: req.method, path: (req.url ?? "").split("?")[0], ...errInfo(e) });
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
        }
        res.end("Internal Server Error");
      });
    });
    server.on("error", (e) => {
      log("error", "server_error", errInfo(e));
      process.exit(1);
    });

    const shutdown = (signal) => {
      log("info", "shutdown", { signal });
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 10_000).unref();
    };
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));

    if (underPassenger) {
      server.listen("passenger", () => log("info", "listening", { via: "passenger", node: process.version }));
    } else {
      server.listen(port, host, () => log("info", "listening", { url: `http://${host}:${port}`, node: process.version }));
    }
  })
  .catch((e) => {
    log("error", "startup_failed", errInfo(e));
    process.exit(1);
  });
