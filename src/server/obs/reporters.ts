import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { setErrorReporter, type ErrorReporter } from "./errors";
import { currentObs } from "./context";
import { setLogSink } from "./log";
import { redact, redactString } from "./redact";
import { buildInfo } from "../system/buildinfo";
import { appEnv } from "../system/environment";

/**
 * External observability wiring (Phase 10, hardened in Phase 11 — docs/OBSERVABILITY.md). Chosen by configuration
 * only; nothing reports "configured" unless a destination is actually set.
 *
 *   SENTRY_DSN=https://<key>@<host>/<project>  → Sentry envelope API (no SDK)
 *   ERROR_REPORT_WEBHOOK_URL (+ _TOKEN)        → generic JSON webhook (any alerting / log tool that accepts HTTPS POST)
 *   ERROR_REPORT_SAMPLE_RATE=0..1 (default 1)  → share of unexpected errors that are sent (all are still logged)
 *   LOG_DIR=/var/log/dms-os                    → structured logs ALSO appended to <LOG_DIR>/dms-YYYY-MM-DD.jsonl
 *
 * Every event carries: environment (APP_ENV), release (version + commit), Next.js BUILD_ID, process (web / worker /
 * script), request id + correlation id, category, code, where, a redacted message and normalized stack frames
 * (app-relative paths, no absolute machine paths). Never: request bodies, headers / cookies, passwords, tokens,
 * payroll, IBANs or document contents (central redaction, src/server/obs/redact.ts).
 *
 * Delivery (shared by both adapters) is fire-and-forget and can never fail or slow the original request:
 *   · 5 s timeout per attempt; network error / 5xx → ONE retry after 1 s; other 4xx → dropped (counted)
 *   · 429 → honours Retry-After (default 60 s): events are dropped (counted) until the window passes
 *   · at most 20 deliveries in flight; beyond that events are dropped (counted) — no unbounded memory
 *   · counters exposed by reporterDeliveryStats() (system health / release:verify)
 */
type Fetch = typeof fetch;
export type ProcessKind = "web" | "worker" | "script";

const stats = { sent: 0, failed: 0, dropped: 0, sampledOut: 0, retried: 0, lastError: null as string | null, lastSuccessAt: null as string | null, rateLimitedUntil: null as string | null };
export const reporterDeliveryStats = () => ({ ...stats });
export const resetReporterDeliveryStats = () => Object.assign(stats, { sent: 0, failed: 0, dropped: 0, sampledOut: 0, retried: 0, lastError: null, lastSuccessAt: null, rateLimitedUntil: null });

let inFlight = 0;
let blockedUntil = 0;
const MAX_IN_FLIGHT = 20;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type DeliveryOptions = { timeoutMs?: number; retryDelayMs?: number };
/** POST with timeout / single retry / 429 back-off / in-flight cap. Resolves to the outcome, never rejects. */
export async function deliver(fetchImpl: Fetch, url: string, init: RequestInit, opts: DeliveryOptions = {}): Promise<"sent" | "failed" | "dropped"> {
  if (Date.now() < blockedUntil || inFlight >= MAX_IN_FLIGHT) {
    stats.dropped++;
    return "dropped";
  }
  inFlight++;
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let status = 0;
      try {
        const r = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs ?? 5000) });
        status = r.status;
        await r.body?.cancel().catch(() => undefined);
        if (r.ok) {
          stats.sent++;
          stats.lastSuccessAt = new Date().toISOString();
          return "sent";
        }
        if (status === 429) {
          const ra = Number(r.headers.get("retry-after"));
          blockedUntil = Date.now() + (Number.isFinite(ra) && ra > 0 ? ra * 1000 : 60_000);
          stats.rateLimitedUntil = new Date(blockedUntil).toISOString();
          stats.failed++;
          stats.lastError = "HTTP_429";
          return "failed";
        }
        stats.lastError = `HTTP_${status}`;
        if (status < 500) break; // 4xx: the event / credentials are wrong — retrying will not help
      } catch (e) {
        stats.lastError = (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError" ? "TIMEOUT" : "NETWORK";
      }
      if (attempt === 1) {
        stats.retried++;
        await sleep(opts.retryDelayMs ?? 1000);
      }
    }
    stats.failed++;
    return "failed";
  } finally {
    inFlight--;
  }
}

/** Next.js build id of the running server (absent for scripts run from source). */
export function nextBuildId(root = process.cwd()): string | null {
  try {
    const p = path.join(root, ".next", "BUILD_ID");
    return existsSync(p) ? readFileSync(p, "utf8").trim() : null;
  } catch {
    return null;
  }
}

export type StackFrame = { function: string; filename?: string; lineno?: number; colno?: number; in_app: boolean };
/** "at fn (C:\\…\\src\\server\\x.ts:12:5)" → { function: "fn", filename: "src/server/x.ts", lineno: 12, colno: 5 } — absolute paths stripped. */
export function normalizeStack(stack: string | undefined, root = process.cwd()): StackFrame[] {
  const rootN = root.replace(/\\/g, "/").replace(/\/$/, "");
  return (stack ?? "")
    .split("\n")
    .slice(1, 30)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("at "))
    .map((l) => {
      const m = /^at (?:(.+?) \()?(.*?):(\d+):(\d+)\)?$/.exec(l);
      if (!m) return { function: redactString(l.slice(3)).slice(0, 200), in_app: false };
      let file = m[2].replace(/\\/g, "/").replace(/^file:\/\/\/?/, "");
      if (file.toLowerCase().startsWith(rootN.toLowerCase())) file = file.slice(rootN.length + 1);
      else if (/^([A-Za-z]:)?\//.test(file)) file = file.split("/").slice(-3).join("/"); // foreign absolute path → tail only
      return { function: redactString(m[1] ?? "<anonymous>").slice(0, 200), filename: file.slice(0, 300), lineno: Number(m[3]), colno: Number(m[4]), in_app: !file.includes("node_modules") && !file.startsWith("node:") };
    })
    .slice(0, 20);
}

function commonContext(context: Record<string, unknown>, processKind: ProcessKind) {
  const b = buildInfo();
  const o = currentObs();
  return {
    environment: appEnv(),
    release: `dms-os@${b.version}${b.commit ? `+${b.commit.slice(0, 12)}` : ""}`,
    build: nextBuildId(),
    process: processKind,
    requestId: (context.ref as string | null | undefined) ?? o?.requestId ?? null,
    correlationId: o?.correlationId ?? null,
    module: o?.module ?? null,
    job: o?.job ?? null
  };
}

const sampled = (rate: number) => rate >= 1 || Math.random() < rate;

function parseDsn(dsn: string) {
  const u = new URL(dsn);
  const project = u.pathname.replace(/^\/+|\/+$/g, "");
  if (!u.username || !project) throw new Error("invalid SENTRY_DSN");
  return { key: decodeURIComponent(u.username), endpoint: `${u.protocol}//${u.host}/api/${project}/envelope/`, dsn: `${u.protocol}//${u.username}@${u.host}/${project}` };
}

export type ReporterOptions = { fetchImpl?: Fetch; sampleRate?: number; process?: ProcessKind; delivery?: DeliveryOptions; onDelivered?: (outcome: string) => void };

export function sentryReporter(dsn: string, fetchOrOpts: Fetch | ReporterOptions = {}): ErrorReporter {
  const o: ReporterOptions = typeof fetchOrOpts === "function" ? { fetchImpl: fetchOrOpts } : fetchOrOpts;
  const d = parseDsn(dsn);
  return {
    name: "sentry",
    configured: true,
    capture(e, context) {
      if (!sampled(o.sampleRate ?? 1)) return void stats.sampledOut++;
      const err = e as Error;
      const c = commonContext(context, o.process ?? "web");
      const eventId = randomUUID().replace(/-/g, "");
      const event = {
        event_id: eventId,
        timestamp: Date.now() / 1000,
        level: "error",
        platform: "node",
        environment: c.environment,
        release: c.release,
        dist: c.build ?? undefined,
        exception: { values: [{ type: err?.name ?? "Error", value: redactString(String(err?.message ?? e)).slice(0, 1000), stacktrace: { frames: normalizeStack(err?.stack).reverse() } }] },
        tags: { ref: String(c.requestId ?? ""), correlation_id: String(c.correlationId ?? ""), category: String(context.category ?? ""), where: String(context.where ?? ""), process: c.process, build: String(c.build ?? ""), module: String(c.module ?? "") },
        extra: redact(context, "log") as Record<string, unknown>
      };
      const body = `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: d.dsn })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
      const b = buildInfo();
      void deliver(o.fetchImpl ?? fetch, d.endpoint, { method: "POST", headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${d.key}, sentry_client=dms-os/${b.version}` }, body }, o.delivery).then((r) => o.onDelivered?.(r));
    }
  };
}

export function webhookReporter(url: string, token: string | undefined, fetchOrOpts: Fetch | ReporterOptions = {}): ErrorReporter {
  const o: ReporterOptions = typeof fetchOrOpts === "function" ? { fetchImpl: fetchOrOpts } : fetchOrOpts;
  return {
    name: "webhook",
    configured: true,
    capture(e, context) {
      if (!sampled(o.sampleRate ?? 1)) return void stats.sampledOut++;
      const err = e as Error;
      const c = commonContext(context, o.process ?? "web");
      const payload = { ts: new Date().toISOString(), ...c, version: buildInfo().version, ref: c.requestId, category: context.category ?? null, where: context.where ?? null, error: { name: err?.name, message: redactString(String(err?.message ?? e)).slice(0, 1000), frames: normalizeStack(err?.stack) }, context: redact(context, "log") };
      void deliver(o.fetchImpl ?? fetch, url, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload) }, o.delivery).then((r) => o.onDelivered?.(r));
    }
  };
}

/** Persistent JSONL log files (one per UTC day) in addition to stdout. */
export function fileLogSink(dir: string) {
  let ready: Promise<unknown> | null = null;
  return (line: string) => {
    process.stdout.write(line + "\n");
    ready ??= mkdir(dir, { recursive: true });
    const file = path.join(dir, `dms-${new Date().toISOString().slice(0, 10)}.jsonl`);
    void ready.then(() => appendFile(file, line + "\n")).catch(() => undefined);
  };
}

export const sampleRateOf = (env: Record<string, string | undefined>) => {
  const n = Number(env.ERROR_REPORT_SAMPLE_RATE ?? 1);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
};

/** Called once per process (instrumentation for the web server, the worker / scripts themselves). */
export function configureObservability(env: Record<string, string | undefined> = process.env, processKind: ProcessKind = "web") {
  const opts: ReporterOptions = { sampleRate: sampleRateOf(env), process: processKind };
  if (env.SENTRY_DSN) setErrorReporter(sentryReporter(env.SENTRY_DSN, opts));
  else if (env.ERROR_REPORT_WEBHOOK_URL) setErrorReporter(webhookReporter(env.ERROR_REPORT_WEBHOOK_URL, env.ERROR_REPORT_WEBHOOK_TOKEN, opts));
  if (env.LOG_DIR) setLogSink(fileLogSink(env.LOG_DIR));
}
