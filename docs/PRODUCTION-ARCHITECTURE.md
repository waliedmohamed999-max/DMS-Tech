# Production & hosted-staging architecture (Phase 12)

**Status: designed, not yet provisioned.** No hosting account, managed database, object storage, domain, error
tracker or secret manager was available to this project during Phase 12 (inventory below). Every hosted check
therefore remains `BLOCKED_EXTERNAL` until the accounts exist. The commands that verify the real environment are
ready and listed under *Provisioning runbook*.

## Inventory (2026-10-03)

| Item | Status | Evidence |
|---|---|---|
| Node hosting | CREDENTIALS_MISSING | No provider CLI or credentials. The Vercel CLI data folder is empty. Platform connectors (Vercel) are not authorized. |
| Managed PostgreSQL | NOT_PROVISIONED | Only local databases (development embedded PostgreSQL; staging rehearsal cluster) |
| Object storage (S3-compatible) | NOT_PROVISIONED | No `S3_*` credentials |
| Worker service | NOT_PROVISIONED | Depends on hosting |
| Scheduler / cron | NOT_PROVISIONED | Depends on hosting; systemd units exist in `deploy/` |
| DNS / domain | CREDENTIALS_MISSING | No registrar or DNS access |
| TLS (public certificate) | NOT_PROVISIONED | Depends on domain + hosting |
| Log persistence | NOT_PROVISIONED | Local JSONL only |
| Error tracking | CREDENTIALS_MISSING | No Sentry DSN or webhook |
| Secrets manager | NOT_PROVISIONED | Local `.env` / `.local` files only |
| Container runtime (local) | AVAILABLE | Docker Desktop 29.1.5. The image build was stopped because the **C: drive ran out of space** (see Phase 12 report) |
| Source hosting | AVAILABLE | GitHub `waliedmohamed999-max/DMS-Tech` (pushed by the owner; `gh` CLI not logged in) |

## Target topology

```text
Internet
  ↓  HTTPS only (HTTP → 301 HTTPS), HSTS
TLS / reverse proxy / hosting platform edge
  ↓  private network (X-Forwarded-*, X-Request-Id)
Web instance(s)   ── same container image ──   Worker service (1, optionally 2)
  │  next start, PORT                            │  node …/tsx scripts/worker.ts --loop
  │  DATABASE_URL = runtime role                 │  DATABASE_URL = runtime role
  └───────────────┬──────────────────────────────┘
                  ↓  TLS verify-full, private networking where offered
          Managed PostgreSQL ≥ 15
          (encryption at rest, automated backups, PITR, non-superuser roles)

Web + Worker ──→ private S3-compatible bucket (versioning, SSE, no public access)
Web + Worker ──→ stdout JSON logs ──→ platform log store (searchable, retained)
Web + Worker ──→ error tracker (Sentry / webhook) — DSN from the secret manager
Scheduler    ──→ backups (db:backup + db:verify-backup), storage:verify — see the schedule below
```

No database or worker port is exposed to the Internet; only the web instances receive traffic from the edge.

## Choice of platform (decision pending: account, region, data residency)

The simplest architecture that meets the requirements is a **container PaaS**: one image, a web service plus a
background-worker service, and the platform's managed PostgreSQL. Add an S3-compatible bucket and the platform's (or
an external) log store and secret store. No Kubernetes and no microservices.

Each candidate must offer all of the following. Verify at sign-up; nothing here is assumed about a specific vendor:

| Requirement | Why |
|---|---|
| Long-running background worker process (not only request-scoped functions) | `worker --loop`: outbox, events, automation, sweeps, offboarding, scanning |
| Managed PostgreSQL ≥ 15, TLS with a CA for `verify-full`, encryption at rest, automated backups + PITR, separate roles | P12-03 / P12-13 / P12-14 |
| S3-compatible object storage with versioning, server-side encryption and blocked public access | P12-05 |
| Secret injection as environment variables (no secrets in the image) | Config is env-only |
| Health checks, automatic restart, rolling deploys, SIGTERM before kill | P12-07 |
| Persistent, searchable logs (or a log drain) | P12-11 |
| Scheduled jobs (cron) or a second always-on process | P12-09 |
| Custom domain + managed TLS certificates | P12-10 |
| **Region / data residency acceptable for the company** | Saudi PDPL / customer contracts: a BUSINESS / LEGAL decision before any real data |

**Fallback** if no PaaS fits the region requirement: a single VM per environment (Ubuntu) with the supplied units:
* nginx (`deploy/nginx/dms-os.conf`), with `proxy_buffer_size 16k`
* `dms-os-web@` × 2 and `dms-os-worker`
* the backup and storage-verify timers

It uses the same managed PostgreSQL and bucket. This needs more maintenance, so it's second choice.

## Container image

`Dockerfile` (multi-stage, `node:24-bookworm-slim`):
* `npm ci` from the lockfile, then `npm run build`, which includes the CSP hash manifest.
* Runs as the non-root user `node`, with a healthcheck on `/api/health`.
* Web CMD: `node node_modules/next/dist/bin/next start`.
* Worker command: `node node_modules/tsx/dist/cli.mjs scripts/worker.ts --loop`.

`.dockerignore` keeps `.env*`, `.local`, `node_modules` and build output out of the image.

**Phase 12 defect found and fixed:** `npm ci` failed on Linux because `package-lock.json`, written on Windows, lacked
8 optional WebAssembly fallback entries (`@emnapi/*`, tailwind oxide wasm32). The lock was regenerated with
`--package-lock-only` on Linux: entries were added only, no versions changed. Every Linux host would otherwise fail to
install.

## Database roles

| Role | Used by | Rights |
|---|---|---|
| owner (e.g. `dms_app`) | `npm run db:deploy` only (release step) | Owns the schema (DDL) |
| runtime (e.g. `dms_runtime`) | `DATABASE_URL` of web + worker | DML only, via `scripts/hosted/runtime-role.sql`: no TRUNCATE (so the append-only AuditLog cannot be truncated), no DDL, no writes to `_prisma_migrations` |
| verify / admin | `VERIFY_DATABASE_URL` for backup verification (temporary databases) | CREATE DATABASE, on a non-production server |

Rehearsed on the local TLS staging cluster:
* `TRUNCATE "AuditLog"` → permission denied.
* `CREATE TABLE` → permission denied.
* `INSERT INTO _prisma_migrations` → permission denied.
* DML works.
* `scripts/hosted/verify-db.ts` gives `app_role` PASS and `audit_protection` PASS.

## Schedule (canonical)

The **worker loop** (`WORKER_INTERVAL_MS`, default 30 s) is the canonical scheduler for in-application jobs. Every job
runs under a database lease, so a second worker or a manual run can never double-execute. Pages never trigger jobs in
production.

| Job | Mechanism | Frequency | Lease | Failure alert |
|---|---|---|---|---|
| Domain-event retry / dead-letter | worker loop | every pass (30 s) | `system:events` 5 min | `event_failures`, `dead_letters` |
| Business rules (automation) | worker loop | every pass | `system:automation` 5 min | `dead_letters` + rule-failure notification |
| Integration outbox (webhooks, WhatsApp, ZATCA submission) | worker loop | every pass | `integrations:outbox:*` 5 min | `queue_backlog`, `dead_letters` |
| Campaign sends | worker loop | every pass | `integrations:campaigns:*` 2 min | `dead_letters` |
| Integration health | worker loop | every pass (lease-throttled) | `integrations:health:*` 10 min | connection status + `job:*` |
| Commercial / projects / finance / ops sweeps | worker loop, per organization | every pass | `sweep:<module>:<org>` 10 min | `job:*` (STUCK / FAILED) |
| HR sweep, including **future-dated offboarding** | worker loop | every pass | `sweep:hr:<org>` 10 min | `offboarding_blocked` log + go-live `offboarding_accounts` |
| Document malware scan | worker loop (only with `DOCUMENT_SCANNER`) | every pass | `documents:scan` 15 min | `document.scan_failed` audit |
| System alerts | worker loop | every pass | `system:alerts` 5 min | (raises the alerts) |
| Retention purge | worker loop | at most every 24 h (registry) | `system:retention` 30 min | `job:system:retention` |
| Worker heartbeat | worker loop | every pass, written before the pass | — | `worker_down`; readiness fails with `REQUIRE_WORKER=1` |
| Database backup + verification | platform cron, or `dms-os-backup.timer` | daily 02:30 | file lock per run | `backup_stale` (> `BACKUP_MAX_AGE_HOURS`), `backup_failed` |
| Backup pruning | after the backup (same unit) | daily | — | logged |
| Document storage verify | platform cron, or `dms-os-storage-verify.timer` | weekly Sun 04:00 | — | `storage_failure` |
| Provider snapshots / PITR | managed database | provider schedule | — | provider alerts |

Nothing runs twice by two mechanisms: in-application jobs run only in the worker. Backups and storage verification
run only on the scheduler, because they are external processes (pg_dump).

## Logs

Web and worker write one JSON line per event to stdout, carrying requestId, correlationId, environment and release.
The platform collector is the persistent store; `LOG_DIR` is only for hosts without one. Requirements for the log
store:
* searchable by requestId / correlationId;
* retention ≥ 30 days;
* access restricted to operators.

## Provisioning runbook (run when the accounts exist)

```bash
# 0. release artefact
docker build -t <registry>/dms-os:<sha> . && docker push <registry>/dms-os:<sha>
# 1. database: owner role runs migrations; runtime role gets DML grants; verify
DATABASE_URL=$OWNER_URL npx prisma migrate deploy
psql "$OWNER_URL" -v runtime_role=dms_runtime -f scripts/hosted/runtime-role.sql
DATABASE_URL=$RUNTIME_URL APP_ENV=staging DB_ENCRYPTION_AT_REST="<provider evidence>" DB_PITR_EVIDENCE="<provider evidence>" npx tsx scripts/hosted/verify-db.ts --json verify-db.json
APP_ENV=staging OS_ADMIN_EMAIL=… OS_ADMIN_PASSWORD=… npm run os:bootstrap   # then admin:provision for the named admins
# 2. storage (bucket created private + versioned + encrypted in the provider console)
LIVE_S3_ENDPOINT=… LIVE_S3_REGION=… LIVE_S3_BUCKET=… LIVE_S3_ACCESS_KEY_ID=… LIVE_S3_SECRET_ACCESS_KEY=… npx vitest run tests/live-s3.test.ts
# 3. scanner (if contracted)
LIVE_CLAMD_HOST=… npx vitest run tests/live-clamav.test.ts
# 4. services up (web ×2, worker ×1–2), then from the release:
npm run deploy:verify && npm run smoke && npm run go-live:check -- --env staging && npm run release:verify -- --strict
# 5. drills: backup + restore into a separate database, PITR into a new instance, worker stop/start, hosted E2E
```
