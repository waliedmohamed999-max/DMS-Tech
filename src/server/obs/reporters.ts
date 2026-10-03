import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { setErrorReporter, type ErrorReporter } from "./errors";
import { setLogSink } from "./log";
import { redact, redactString } from "./redact";
import { buildInfo } from "../system/buildinfo";
import { appEnv } from "../system/environment";

/**
 * External observability wiring (Phase 10 — docs/OBSERVABILITY.md#external). Chosen by configuration only;
 * nothing reports "configured" unless a destination is actually set.
 *
 *   SENTRY_DSN=https://<key>@<host>/<project>  → Sentry (envelope API, no SDK); events carry the request reference
 *   ERROR_REPORT_WEBHOOK_URL (+ _TOKEN)        → generic JSON webhook (any alerting / log tool that accepts HTTPS POST)
 *   LOG_DIR=/var/log/dms-os                    → structured logs ALSO appended to <LOG_DIR>/dms-YYYY-MM-DD.jsonl
 *
 * Payloads contain: category, code, reference, where, a redacted message and stack frames — never request bodies,
 * passwords, tokens, payroll, IBANs or document contents (central redaction).
 */
type Fetch = typeof fetch;

function parseDsn(dsn: string) {
  const u = new URL(dsn);
  const project = u.pathname.replace(/^\/+|\/+$/g, "");
  if (!u.username || !project) throw new Error("invalid SENTRY_DSN");
  return { key: decodeURIComponent(u.username), endpoint: `${u.protocol}//${u.host}/api/${project}/envelope/`, dsn: `${u.protocol}//${u.username}@${u.host}/${project}` };
}

export function sentryReporter(dsn: string, fetchImpl: Fetch = fetch): ErrorReporter {
  const d = parseDsn(dsn);
  const b = buildInfo();
  return {
    name: "sentry",
    configured: true,
    capture(e, context) {
      const err = e as Error;
      const eventId = randomUUID().replace(/-/g, "");
      const event = {
        event_id: eventId,
        timestamp: Date.now() / 1000,
        level: "error",
        platform: "node",
        environment: appEnv(),
        release: `dms-os@${b.version}${b.commit ? `+${b.commit.slice(0, 12)}` : ""}`,
        exception: { values: [{ type: err?.name ?? "Error", value: redactString(String(err?.message ?? e)).slice(0, 1000), stacktrace: { frames: (err?.stack ?? "").split("\n").slice(1, 15).map((l) => ({ function: redactString(l.trim()).slice(0, 200) })).reverse() } }] },
        tags: { ref: String(context.ref ?? ""), category: String(context.category ?? ""), where: String(context.where ?? "") },
        extra: redact(context, "log") as Record<string, unknown>
      };
      const body = `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: d.dsn })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
      void fetchImpl(d.endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${d.key}, sentry_client=dms-os/${b.version}` },
        body,
        signal: AbortSignal.timeout(5000)
      }).catch(() => undefined);
    }
  };
}

export function webhookReporter(url: string, token: string | undefined, fetchImpl: Fetch = fetch): ErrorReporter {
  return {
    name: "webhook",
    configured: true,
    capture(e, context) {
      const err = e as Error;
      const payload = { ts: new Date().toISOString(), environment: appEnv(), version: buildInfo().version, ref: context.ref ?? null, category: context.category ?? null, where: context.where ?? null, error: { name: err?.name, message: redactString(String(err?.message ?? e)).slice(0, 1000) }, context: redact(context, "log") };
      void fetchImpl(url, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) }).catch(() => undefined);
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

/** Called once per process (instrumentation for the web server, the worker / scripts themselves). */
export function configureObservability(env: Record<string, string | undefined> = process.env) {
  if (env.SENTRY_DSN) setErrorReporter(sentryReporter(env.SENTRY_DSN));
  else if (env.ERROR_REPORT_WEBHOOK_URL) setErrorReporter(webhookReporter(env.ERROR_REPORT_WEBHOOK_URL, env.ERROR_REPORT_WEBHOOK_TOKEN));
  if (env.LOG_DIR) setLogSink(fileLogSink(env.LOG_DIR));
}
