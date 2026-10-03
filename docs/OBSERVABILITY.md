# Observability, jobs & reliability (Phase 9, extended in Phase 10)

Code: `src/server/obs/` (logging, redaction, errors, metrics), `src/server/jobs/lease.ts`, `src/server/system/`
(jobs, health, events, alerts, overview, worker). UI: `/app/admin/system-health` (`system.health.view`).

## Structured logging

`log.info|warn|error(msg, fields)` writes one JSON line:

```json
{"ts":"…","level":"error","msg":"job_failed","requestId":"…","correlationId":"…","actorId":"…","organizationId":"…","module":"job","operation":"…","job":"sweep:ops","durationMs":812,"error":"…"}
```

- Context comes from an `AsyncLocalStorage` scope opened by every server action (`runAction`), job run (`withLease`),
  automation execution and worker pass. The request id doubles as the correlation id of the events written in it.
- `LOG_LEVEL` = `debug | info | warn | error | silent` (default `info`; `warn` under tests).
- Ship stdout to the platform log collector. Phase 10: with `LOG_DIR` set, lines are **also** appended to
  `<LOG_DIR>/dms-YYYY-MM-DD.jsonl` (for hosts without a collector; rotate / ship those files).
- **Correlation (Phase 10):**
  - Requests: the proxy assigns `x-request-id` to every `/app` request and the response echoes it. The website-lead and
    webhook routes do the same.
  - Records written: server actions use it as the correlation id of the DomainEvents they write. Outbox items store
    the correlation id of the context that enqueued them (`IntegrationOutbox.correlationId`).
  - Background work: domain-event dispatch (including worker retries) and outbox delivery run under the original
    correlation id, so a failure line such as `outbox_delivery_failed` traces back to the request.
  - Verified end to end on staging: request → event → outbox → worker log line (`scripts/staging/correlation-trace.ts`).

### Redaction

`src/server/obs/redact.ts` is the single redaction utility:

| Class | Keys (case / underscore-insensitive) | In logs | In audit / events |
|---|---|---|---|
| SECRET | password, passwordHash, token, accessToken, refreshToken, secret, signingSecret, appSecret, clientSecret, secretAccessKey, accessKeyId, apiKey, verifyToken, authorization, cookie, set-cookie, signature headers, ciphertext, authTag, masterKey, dsn | `[redacted]` | `[redacted]` |
| PRIVATE | iban, accountNumber, salary, baseSalary, allowances, deductions, grossPay, netPay, compensation, nationalId, passport / iqama number, dateOfBirth | `[private]` | kept (audit is the permission-gated history) |
| CONTENT | data, content, body (> 200 chars), buffers, files | `[binary N bytes]` / `[text N chars]` | — |

Free text is also scanned for bearer tokens, Meta / Google / Stripe / AWS token shapes, `token=` / `password=` pairs,
Saudi IBANs and Postgres URLs.

## Error model

Every failure maps to one category (`src/server/obs/errors.ts`):

| Category | HTTP | Typical source |
|---|---|---|
| `VALIDATION_ERROR` | 400 | zod, `invalid()` |
| `UNAUTHENTICATED` / `FORBIDDEN` | 401 / 403 | session, `requirePermission` |
| `NOT_FOUND` | 404 | missing / invisible record |
| `CONFLICT` | 409 | business rule conflict, unique violation, DB guard triggers |
| `STALE_STATE` | 409 | `*_STALE`, concurrent change, serialization failure |
| `RATE_LIMITED` | 429 | limits |
| `EXTERNAL_PROVIDER_ERROR` | 502 | `IntegrationError` |
| `DEPENDENCY_UNAVAILABLE` | 503 | database unreachable (P1001 …) |
| `INTERNAL_ERROR` | 500 | anything unexpected |

Server actions keep their stable codes (translated in the UI) and now also return `category`; unexpected errors return
`UNKNOWN` (or `DEPENDENCY_UNAVAILABLE`) with a `ref` (request id) shown as "ref xxxxxxxx" — never a stack trace, SQL or
provider body. The diagnostic goes to the structured log under the same request id.

**Error tracking adapters (Phase 10).** `configureObservability()` runs at server start (`instrumentation.ts`) and in
the worker. It installs one of the following:

- `SENTRY_DSN` → `sentryReporter`. It posts to the Sentry envelope API with `fetch` (no SDK dependency), carries the
  error reference as a tag, and sends redacted messages and stack frames only.
- else `ERROR_REPORT_WEBHOOK_URL` (+ optional `ERROR_REPORT_WEBHOOK_TOKEN`) → `webhookReporter`, which posts JSON to
  any collector.
- else no-op. System health shows "Not configured (log only)" and go-live:check gives a WARN for `error_tracking`.

`SENTRY_DSN` is format-checked at startup. Delivery failures of the reporter itself never break the request.
`OTEL_EXPORTER_OTLP_ENDPOINT` still has no adapter and is reported as "requested but missing", never as connected.
**Production boundary (Phase 11).** Every event carries:
* environment, release (version + commit) and Next.js BUILD_ID;
* process (`web` / `worker`);
* request id and correlation id, module and job;
* normalized stack frames: app-relative paths, absolute machine paths stripped, dependency frames marked.

Redaction is central:
* Credentials, cookies, authorization headers and API keys become `[redacted]`.
* HR and financial fields (IBAN, salary, net pay, national ID) become `[private]`.
* Any `…body` or `…content` value becomes a size marker.

Delivery is fire-and-forget and bounded:
* 5 s timeout per attempt.
* One retry on 5xx or network failure; 4xx is dropped.
* 429 `Retry-After` is honoured.
* At most 20 deliveries in flight.
* Counters via `reporterDeliveryStats()`.

`ERROR_REPORT_SAMPLE_RATE` (0–1) samples what is sent; everything is still logged.

A reporter failure cannot affect the request: `reportError` returns the reference immediately, even when the tracker is
down or throws. Expected business errors (validation, conflict, …) are not sent.

`tests/error-tracking.test.ts` checks all of this against a local HTTP receiver. **It has not been checked against a
real Sentry project**; activating Sentry needs only `SENTRY_DSN` and the project. Send one test error and confirm it
arrives with the tags above.

## Metrics

`metrics.count / timing` (`src/server/obs/metrics.ts`) — action errors, job runs / failures / duration, webhook
failures, integration retries, automation executions / failures, domain-event failures. No external backend is
configured, so counters are per instance ("since start") on the system-health page; cluster-wide truths (queue depth,
dead letters, job history) come from the database. A `MetricsSink` (OpenTelemetry / Prometheus) can be plugged in
later. Slow-query tracking is not instrumented in this build (Prisma driver-adapter query events are not wired).

## Jobs

All scheduled work runs under `withLease(key, ttl, fn)` (`JobLease` row, atomic acquire) and is recorded in
`SystemJob`: status, start / end, last success / failure, duration, sanitized last error, run / fail counts,
consecutive failure streak, holder and **heartbeat**.

- Heartbeat: every ttl/3 the running holder renews its lease and writes `heartbeatAt`. A dead process stops beating,
  its lease lapses and another instance takes over (stuck-job recovery). A record existing never implies liveness.
- Timeout (default = ttl): the run is recorded FAILED (`TIMEOUT …`) and stops heart-beating; work is idempotent, so
  an abandoned promise finishing later is harmless.
- Health per job (`jobHealth`): HEALTHY, STALE (no success within 2× the expected interval), STUCK (RUNNING without
  heartbeat), UNHEALTHY (last run failed / ≥ 3 consecutive failures), NEVER_RUN.

| Job | Every | Runner |
|---|---|---|
| `worker:loop` (heartbeat) | 30 s | `npm run worker -- --loop` |
| `sweep:commercial / projects / finance / ops` | 15 min | worker (or the individual `*:sweep` scripts) |
| `sweep:hr` | 1 h | worker / `hr:sweep` |
| `integrations:outbox / campaigns / health` | 1 min / 1 min / 30 min | worker / `integrations:worker` |
| `system:events` | 1–5 min | worker — domain-event recovery |
| `system:automation` | 1–5 min | worker — rule retries |
| `system:alerts` | 5 min | worker |
| `system:retention` | daily | worker |

The unified worker (`npm run worker`) calls the existing sweeps rather than merging their code: each keeps its own
lease, so the individual scripts, the lazy page triggers and the worker can never double-run the same sweep.

## Domain events

- Every handler has a key (`subscribe(type, fn, name)`); all handlers run even if one fails; the keys that succeeded
  are stored (`handlersDone`) and skipped on retry — retries never duplicate notifications or activity.
- FAILED events are retried by `system:events` with backoff (2, 4, 8, 16 min); after 5 attempts → DEAD_LETTER.
- PENDING events older than 2 minutes (process died between commit and dispatch) are re-dispatched.
- Operators (`system.events.retry`) retry or dismiss with a reason (`system.event_retried`, `system.event_dismissed`).
- Correlation: `correlationId` (request / chain), `causationId` (event that caused it), `depth` (automation hops).

## Dead letters (unified view)

`/app/admin/system-health?tab=dead` lists, without merging tables: integration outbox dead letters / failures
(`integrations.manage` to act), automation executions (`automation.executions.retry`), domain events
(`system.events.retry`). Retry and dismiss reuse each module's own audited operation.

## Health & readiness

| Endpoint | Purpose | I/O |
|---|---|---|
| `GET /api/health` | liveness: `{status, time, version, commit, environment, uptimeSeconds}` | none |
| `GET /api/ready` | readiness: 200 / 503 with check names + statuses (details only on the system-health page) | DB, migrations, storage probe (cached 10 s) |

Ready requires: database reachable (3 s timeout); every shipped migration applied and none failed; no critical
configuration issue; document storage write / read / delete (local) or bucket reachable (S3 metadata check;
`STORAGE_HEALTH_WRITE=1` for a write test); no active `@dms.test` demo accounts in production; worker heartbeat
< 5 min **only when** `REQUIRE_WORKER=1`. Optional integrations (WhatsApp, Google, NOVA, …) never affect readiness.

Build metadata (`.build-info.json`, written by `prebuild`): version, commit SHA, build time, migration list.

## Alerts

`system:alerts` evaluates real data and notifies `system.health.view` holders (category SYSTEM, dedupe per kind per
hour): worker down, unhealthy / stuck required jobs, integration queue backlog (`ALERT_QUEUE_BACKLOG`, default 50
items overdue > 15 min), dead letters, domain-event failures in the last hour, repeated webhook rejections
(`ALERT_WEBHOOK_FAILURES`, default 20 / h), stale backup (`BACKUP_MAX_AGE_HOURS`, default 26; in production or once a
backup exists), failed backup / verification, document storage failure. A database outage cannot be written to the
database — it is reported through the structured log and the error reporter.
