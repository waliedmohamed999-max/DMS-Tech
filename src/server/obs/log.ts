import { currentObs } from "./context";
import { redact } from "./redact";

/**
 * Structured JSON logger. One line per entry:
 *   {"ts","level","msg","requestId","correlationId","actorId","organizationId","module","operation","job",...fields}
 * Fields pass through the central redaction (secrets, payroll / bank data, document contents never reach the log).
 * LOG_LEVEL = debug | info | warn | error | silent (default: info; warn under tests).
 */
export type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level | "silent", number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

const threshold = () => ORDER[(process.env.LOG_LEVEL as Level) ?? (process.env.VITEST ? "warn" : "info")] ?? ORDER.info;

/** Test hook: capture lines instead of writing to stdout. */
let sink: ((line: string) => void) | null = null;
let sinkAll = false;
/** `all` = receive every level regardless of LOG_LEVEL (tests); persistent sinks respect LOG_LEVEL. */
export const setLogSink = (fn: ((line: string) => void) | null, all = false) => {
  sink = fn;
  sinkAll = all;
};

export function format(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  const o = currentObs();
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(o ? { requestId: o.requestId, correlationId: o.correlationId, actorId: o.actorId || undefined, organizationId: o.organizationId || undefined, module: o.module, operation: o.operation, job: o.job } : {}),
    ...(redact(fields, "log") as Record<string, unknown>)
  };
  return JSON.stringify(entry);
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (!(sink && sinkAll) && ORDER[level] < threshold()) return;
  const line = format(level, msg, fields);
  if (sink) return sink(line);
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields)
};
