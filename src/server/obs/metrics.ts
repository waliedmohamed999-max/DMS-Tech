/**
 * Operational metrics abstraction (docs/OBSERVABILITY.md#metrics).
 * No external backend is configured in this build, so values are kept in-process ("this instance since start")
 * and shown on /app/admin/system-health next to the DB-derived figures (queue depth, dead letters, job runs),
 * which are the cluster-wide source of truth. A future exporter (OpenTelemetry / Prometheus) implements MetricsSink.
 */
export interface MetricsSink {
  count(name: string, labels?: Record<string, string>, n?: number): void;
  timing(name: string, ms: number, labels?: Record<string, string>): void;
}

type Series = { count: number; sum: number; max: number; last: number };
const counters = new Map<string, number>();
const timings = new Map<string, Series>();
const startedAt = new Date();
const key = (name: string, labels?: Record<string, string>) => (labels && Object.keys(labels).length ? `${name}{${Object.entries(labels).sort().map(([k, v]) => `${k}=${v}`).join(",")}}` : name);

const memory: MetricsSink = {
  count(name, labels, n = 1) {
    const k = key(name, labels);
    counters.set(k, (counters.get(k) ?? 0) + n);
  },
  timing(name, ms, labels) {
    const k = key(name, labels);
    const s = timings.get(k) ?? { count: 0, sum: 0, max: 0, last: 0 };
    s.count++;
    s.sum += ms;
    s.max = Math.max(s.max, ms);
    s.last = ms;
    timings.set(k, s);
  }
};

let external: MetricsSink | null = null;
export const setMetricsSink = (s: MetricsSink | null) => (external = s);

export const metrics = {
  count: (name: string, labels?: Record<string, string>, n?: number) => {
    memory.count(name, labels, n);
    external?.count(name, labels, n);
  },
  timing: (name: string, ms: number, labels?: Record<string, string>) => {
    memory.timing(name, ms, labels);
    external?.timing(name, ms, labels);
  }
};

/** Names used across the codebase (one place, so the dashboard can list them). */
export const METRIC = {
  actionError: "http_action_errors",
  routeError: "http_route_errors",
  jobRun: "job_runs",
  jobFailure: "job_failures",
  jobDuration: "job_duration_ms",
  webhookFailure: "webhook_failures",
  integrationRetry: "integration_retries",
  automationFailure: "automation_failures",
  automationRun: "automation_executions",
  eventFailure: "domain_event_failures",
  slowQuery: "db_slow_queries"
} as const;

export function metricsSnapshot() {
  return {
    since: startedAt,
    counters: [...counters.entries()].map(([k, v]) => ({ key: k, value: v })).sort((a, b) => a.key.localeCompare(b.key)),
    timings: [...timings.entries()].map(([k, s]) => ({ key: k, count: s.count, avg: Math.round(s.sum / s.count), max: Math.round(s.max), last: Math.round(s.last) })).sort((a, b) => a.key.localeCompare(b.key)),
    external: Boolean(external)
  };
}
