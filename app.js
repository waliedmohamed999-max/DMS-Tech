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

app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => {
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
