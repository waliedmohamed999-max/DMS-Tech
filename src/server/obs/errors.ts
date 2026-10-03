import { ZodError } from "zod";
import { isAppError } from "../errors";
import { log } from "./log";
import { metrics, METRIC } from "./metrics";
import { currentObs } from "./context";
import { redactString } from "./redact";

/**
 * Standard error model (docs/OBSERVABILITY.md#errors). Every failure maps to ONE category; only the category, a stable
 * code and a request reference reach the UI — never stack traces, SQL, Prisma messages or provider bodies.
 */
export type ErrorCategory =
  | "VALIDATION_ERROR" | "FORBIDDEN" | "UNAUTHENTICATED" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "STALE_STATE"
  | "EXTERNAL_PROVIDER_ERROR" | "DEPENDENCY_UNAVAILABLE" | "INTERNAL_ERROR";

export const HTTP_STATUS: Record<ErrorCategory, number> = {
  VALIDATION_ERROR: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, STALE_STATE: 409, RATE_LIMITED: 429,
  EXTERNAL_PROVIDER_ERROR: 502, DEPENDENCY_UNAVAILABLE: 503, INTERNAL_ERROR: 500
};

/** Prisma / pg error codes that mean "the database is not reachable" vs "your data conflicts". */
const DB_DOWN = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "57P01", "57P03", "08006", "08001", "53300"]);
const STALE = /(STALE|_CHANGED|VERSION_CONFLICT|ALREADY_DECIDED|CONCURRENT)/;

export type Classified = { category: ErrorCategory; code: string; expected: boolean };

function codeOf(e: unknown): string | undefined {
  const x = e as { code?: unknown; cause?: { code?: unknown; originalCode?: unknown }; errorCode?: unknown };
  return [x?.code, x?.cause?.code, x?.cause?.originalCode, x?.errorCode].find((c): c is string => typeof c === "string");
}

export function classifyError(e: unknown): Classified {
  if (e instanceof ZodError) return { category: "VALIDATION_ERROR", code: "VALIDATION", expected: true };
  if (isAppError(e)) {
    const m = /^([A-Z][A-Z0-9_]+)/.exec(e.message)?.[1] ?? e.code;
    const category: ErrorCategory =
      e.code === "VALIDATION" ? "VALIDATION_ERROR" : e.code === "CONFLICT" ? (STALE.test(m) ? "STALE_STATE" : "CONFLICT") : (e.code as ErrorCategory);
    return { category, code: m, expected: true };
  }
  const name = (e as Error)?.name ?? "";
  if (name === "IntegrationError") return { category: "EXTERNAL_PROVIDER_ERROR", code: String((e as { code?: string }).code ?? "PROVIDER_ERROR"), expected: true };
  const c = codeOf(e);
  if (c && DB_DOWN.has(c)) return { category: "DEPENDENCY_UNAVAILABLE", code: "DATABASE_UNAVAILABLE", expected: false };
  if (/Can't reach database|connect ECONNREFUSED|Connection terminated|timeout exceeded when trying to connect/i.test(String((e as Error)?.message ?? ""))) return { category: "DEPENDENCY_UNAVAILABLE", code: "DATABASE_UNAVAILABLE", expected: false };
  if (c === "P2002") return { category: "CONFLICT", code: "DUPLICATE", expected: true };
  if (c === "P2025") return { category: "NOT_FOUND", code: "NOT_FOUND", expected: true };
  if (c === "P2034" || c === "40001" || c === "40P01") return { category: "STALE_STATE", code: "RETRY_CONFLICT", expected: true };
  return { category: "INTERNAL_ERROR", code: "UNKNOWN", expected: false };
}

// --- error tracking adapter ------------------------------------------------------------------

export interface ErrorReporter {
  readonly name: string;
  /** true only when a real provider is wired; the UI shows NOT CONFIGURED otherwise */
  readonly configured: boolean;
  capture(e: unknown, context: Record<string, unknown>): void;
}

/** Default: nothing is sent anywhere (no provider configured). Errors are still written to the structured log. */
const noop: ErrorReporter = { name: "none", configured: false, capture() {} };

let reporter: ErrorReporter = noop;
export const setErrorReporter = (r: ErrorReporter | null) => (reporter = r ?? noop);
export const errorReporterStatus = () => ({
  name: reporter.name,
  configured: reporter.configured,
  // SENTRY_DSN / OTEL endpoint set without an installed adapter is reported honestly, never as "connected"
  requestedButMissing: !reporter.configured && Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT)
});

/** Log + report an unexpected failure; returns the reference shown to the user. */
export function reportError(e: unknown, where: string, extra: Record<string, unknown> = {}) {
  const c = classifyError(e);
  const ref = currentObs()?.requestId ?? null;
  const err = e as Error;
  log.error("unhandled_error", { where, category: c.category, code: c.code, error: { name: err?.name, message: redactString(String(err?.message ?? e)).slice(0, 1000), stack: err?.stack?.split("\n").slice(0, 8).map(redactString) }, ...extra });
  try {
    reporter.capture(e, { where, category: c.category, ref, ...extra });
  } catch {
    /* a broken reporter must never break the request */
  }
  metrics.count(METRIC.actionError, { category: c.category });
  return ref;
}

/** JSON body for route handlers: category + code + reference only. */
export function apiErrorBody(e: unknown, where: string) {
  const c = classifyError(e);
  const ref = c.expected ? currentObs()?.requestId ?? null : reportError(e, where);
  return { status: HTTP_STATUS[c.category], body: { error: c.category, code: c.expected ? c.code : c.category, ref } };
}
