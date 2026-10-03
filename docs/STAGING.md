# Staging rehearsal & go-live evidence (Phase 10)

**What this is:** a staging environment that copies the production topology on one machine (see
`scripts/staging/`). **What it is not:** managed infrastructure. Its results show that the *application* behaves
correctly under a production-like setup. They do **not** prove anything about the future hosting provider: managed
database, encryption at rest, real certificate, S3 bucket or monitoring service. Those remain go-live blockers until
they exist (see [GO-LIVE.md](GO-LIVE.md)).

All numbers below come from 2026-10-03 on a Windows 11 workstation. Treat them as a baseline, not as targets.

## Topology

| Component | Staging rehearsal | Production expectation |
|---|---|---|
| Database | Separate PostgreSQL 18.4 cluster (port 54330). `hostssl` only, so plain TCP connections are rejected. SCRAM authentication. The app runs as a non-superuser role (`dms_app`) and backups use a separate admin role. `pg_stat_statements` is enabled. | Managed PostgreSQL ≥ 15 with TLS, encryption at rest, PITR and a non-superuser app role |
| TLS | Local CA and server certificates. The app connects with `sslmode=verify-full`. | Provider CA, `verify-full` |
| Web | 2 × `next start` from the release directory `.local/releases/rc1`. The release has no `.env`; secrets come only from `.local/staging/staging.env`. | 2+ instances (systemd `dms-os-web@`) behind nginx (`deploy/`) |
| Edge | HTTPS proxy on 8443 (round-robin, `X-Forwarded-*`) plus an 8080 → 301 redirect. Hostname `staging.127.0.0.1.nip.io`. | nginx / load balancer on 443 with a real certificate and 80 → 301 |
| Worker | 2 × `npm run worker -- --loop` (leases ensure a single effective run) | `dms-os-worker.service` |
| Storage | Local driver, `.local/staging/documents` | S3 with versioning (local storage is a BLOCK in go-live:check) |
| Logs | JSONL in `LOG_DIR` plus stdout | Shipped to a log platform |

Runner: `bash scripts/staging/session.sh <command>` starts the whole topology, runs one command and stops
everything. Each test is a script in `scripts/staging/` and refuses to run when `APP_ENV=production`.

## Deployment (measured)

| Step | Duration |
|---|---|
| `deploy:preflight` | 7 s |
| `db:deploy` (14 migrations, as `dms_app`) | 5 s |
| `os:bootstrap` (first Super Admin, temporary password) | 6 s |
| Production build (`next build`) | 241 s |
| Topology start → both instances ready | ~25 s |

## Results

| Area | Script | Result |
|---|---|---|
| End-to-end business flow (lead → quotation → contract → project → invoice → payments → expense → employee with encrypted IBAN → leave → payroll → procurement → asset → ticket) | `e2e.ts` | 38/38 steps. Cross-references verified, 0 failed events |
| Smoke over HTTPS | `scripts/smoke.ts` | 13/13 (HSTS included) |
| First admin login | browser | Forced password change works |
| Session cookie | browser | `__Host-dms_os`: Secure, HttpOnly, SameSite=Lax, host-only |
| CSP on `/app` | browser | `script-src 'self' 'nonce-…' 'strict-dynamic'`. No violations, hydration and navigation work |
| CSRF (server actions) | browser + replay | Same-origin replay → 200. `Origin: https://evil.example` → aborted. `Origin: null` → aborted (Next.js "x-forwarded-host does not match origin") |
| CSRF (uploads) | browser | Cross-origin upload → 403 |
| Logout | browser | Old cookie replayed after logout → login page |
| Password change | browser | The other session is revoked |
| Upload validation | browser | `.html` refused. Fake extension and MZ-as-PDF → `FILE_CONTENT_MISMATCH`. 11 MB → `FILE_TOO_LARGE`. Previous version still downloadable with matching hash. Download headers: sandbox CSP, `nosniff`, `no-store` |
| Multi-instance (2 web + 2 workers) | `multi-instance.ts` | **PASS**. See below |
| Inbound webhooks over HTTPS | `webhook-https.ts` | **16/16 PASS**. See below |
| Correlation trace | `correlation-trace.ts` | **PASS**. One `x-request-id` reaches the response header, DomainEvent, outbox row and worker log line |
| Storage recovery | `storage-recovery.ts` | **12/12 PASS**. See below |
| Worker outage | manual | Workers stopped → `/api/ready` 503 after the stale window. System Health shows "not ready" plus the `worker_down` alert. Restart → ready, 0 lost or failed events |
| Worker first start | manual | Heartbeat 2 h old → no false `worker_down` alert (heartbeat is now written before the first pass) |
| Database backup | `db:backup` + `db:verify-backup` | `pg_dump` over `verify-full` TLS, 0.69–0.79 MB in ≤ 9 s. Verification does a real `pg_restore` into a temp DB, checks migrations and key tables, then the business invariants (paid invoices, allocations, totals, bank rows). 18 s |
| Restore drill | `restore-drill.sh` | Writes stopped → restored + ready + smoke 12/12 in **29.5 s** (this data size). Post-backup change correctly absent |
| Rollback drill (Phase 9 build on the Phase 10 schema) | `rollback-drill.sh` | Serving in 13.6 s. Smoke 12/12. Every main page works **except** HR → employee → Compensation (crash on encrypted IBAN rows). See [DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md#rollback-strategy) |
| go-live:check `--env staging` | `perf-and-golive.sh` | **BLOCK** (3 blockers: encryption-at-rest evidence, durable document storage, ZATCA decision; 5 warnings) |

### Multi-instance

* A session issued by instance A is accepted by instance B (sessions live in the database).
* Login rate limiting across both instances: the shared database counter reached 12 for 12 attempts, so the limit is global.
* 24 concurrent website leads split across both instances:
  * 24 `lead.created` events processed, each in 1 attempt.
  * 24 rule executions, one per event.
  * 48 signed deliveries (24 from the connection subscription and 24 from the rule action).
  * 0 duplicates, 0 bad signatures, drained in 17–19 s.
* All outbox rows carry the correlation id.

### Inbound webhooks (public HTTPS)

| Check | Result |
|---|---|
| Valid signed delivery | 200 |
| HSTS on the response | present |
| Replay of the same delivery id | 200, processed once (`duplicateCount` 1) |
| Wrong secret / tampered body / timestamp 10 min old / no signature | 401 each |
| Signed bad JSON | 400 |
| Signed event that is not allowed | 200, recorded as IGNORED |
| Unknown connection | 404 |
| 300 KB body | 413 |
| Raw payload and secret in the webhook log | neither stored |
| 640 requests in < 60 s | 429 after the 600/min connection budget. A valid delivery inside the window is also 429 (the budget is per connection) |

### Storage recovery

1. `storage:backup` wrote a copy plus manifest.
2. One file was deleted and another corrupted.
3. `storage:verify` reported `MISSING` and `HASH_MISMATCH` and exited 1.
4. The corrupted file was **not served** (409, checksum checked on download). The missing file returned 404.
5. Both files were restored from the backup copy. Verify was clean again, and the download returned 200 with a matching hash.

Access rules checked:
* An employee can open an INTERNAL company document. This is by design: `documents.view`.
* An employee cannot open the same document once it is CONFIDENTIAL (404).
* A user with `documents.manage` can open the CONFIDENTIAL document (200).
* Anonymous requests → 307 to login.

## Performance baseline (measured, not a target)

2 instances behind the HTTPS proxy, all on one workstation. Super Admin session, concurrency 10, 200 requests per
route, 0 errors on every route.

| Route | p50 ms | p95 ms | max ms | req/s |
|---|---|---|---|---|
| Login (form POST, password hash; sequential) | 71 | 191 | 191 | — |
| Dashboard `/app` | 773 | 1291 | 1648 | 13.4 |
| CRM leads list | 220 | 335 | 429 | 45.6 |
| CRM search (`?q=`) | 207 | 347 | 424 | 46.6 |
| Projects list | 183 | 295 | 317 | 53 |
| Finance invoices | 171 | 232 | 278 | 58 |
| Finance receivables | 160 | 231 | 297 | 60.7 |
| HR employees | 164 | 209 | 236 | 61.1 |
| `/api/health` | 14 | 23 | 38 | 712 |

### Database findings (`pg_stat_statements` during the baseline)

* Every application query averages **≤ 0.36 ms**. The slowest single execution was 59 ms, a cold first count.
* Buffer hit rate is 99.5–100 %.
* There are **no sequential scans** on tables with > 50 rows.
* The most frequent query loads role permissions (~0.24 ms, about 180 rows per request).
* The dashboard issues several aggregate queries per render, for example 8 × `PaymentAllocation` sums and 2 × `AuditLog` counts. Together they take a few milliseconds.

**Conclusion:** the dashboard's latency is spent in server rendering on a shared CPU, not in the database. No
database bottleneck is evidenced, so no index or query change was made. Re-measure on the production hardware. If the
dashboard p95 matters there, profile rendering before changing queries.

## Reproduce

```bash
node scripts/staging/staging-db.mjs                         # (inside session.sh) TLS cluster
bash scripts/staging/session.sh bash scripts/staging/perf-and-golive.sh
bash scripts/staging/session.sh bash scripts/staging/rollback-drill.sh
bash scripts/staging/session.sh node scripts/staging/with-env.mjs . SMOKE_PASSWORD=… npx tsx scripts/staging/multi-instance.ts
bash scripts/staging/restore-drill.sh                       # with the topology running
```

Evidence files are in `.local/staging/timings/` (gitignored).
