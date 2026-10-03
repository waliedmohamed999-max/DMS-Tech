# Deployment runbook (Phase 9)

Hosting-provider neutral: any Node 20+ host (container, VM, PaaS) with PostgreSQL. Every step is a command; none
resets data.

## Standard deploy

```bash
npm ci                                   # install (postinstall runs prisma generate)
npm run build                            # prebuild writes .build-info.json (version, commit, migrations)
npm run db:backup && npm run db:verify-backup   # fresh, verified backup BEFORE migrating
npm run deploy:preflight                 # config, migration status, drift, recent backup — exit 1 blocks the deploy
npm run db:deploy                        # prisma migrate deploy (non-interactive, additive)
npm run os:bootstrap                     # idempotent: org, system roles / permission re-sync, defaults — no demo data
npm start                                # or the platform's process manager (instrumentation validates config at start)
npm run deploy:verify                    # no pending migrations, no drift, /api/health, /api/ready, smoke suite
```

Restart the worker after the new version is live (`npm run worker -- --loop` service, or the minute cron).

## Smoke suite

`BASE_URL=https://… npm run smoke` — read-only: health, ready, public site, security headers (+ HSTS on https),
login page, authentication redirect, upload requires a session. With `SMOKE_EMAIL` / `SMOKE_PASSWORD` of a
**low-privilege** account it also signs in (one session row + audit entry, like a person), opens the dashboard, checks
that system health is denied, that an unknown document download is 404, and that the worker check is reported.

## Migration safety

- `deploy:preflight`: refuses when a migration FAILED; reports pending migrations; drift = differences between the
  database and `schema.prisma` that are not explained by pending migrations (a manual change) → blocks.
- `deploy:verify`: after `db:deploy` there must be no pending migration and no drift.
- Hand-written SQL in migrations (CHECKs, triggers, partial indexes) is not modelled by Prisma and is not reported as
  drift; it is part of the migration history.
- **Prisma migrations are not automatically reversible.** There is no down migration.

## Rollback strategy

| Situation | Action |
|---|---|
| New code broken, no migration in the release | Redeploy the previous build. |
| New code broken, release contained **additive** migrations (the norm here) | Redeploy the previous build — additive columns / tables are ignored by older code. Then fix forward. |
| Migration failed half-way | `prisma migrate status` shows it; fix the cause, `prisma migrate resolve --rolled-back <name>` only if the SQL did not apply, redeploy. Never edit an applied migration. |
| Migration damaged data | Restore runbook ([DISASTER-RECOVERY.md](DISASTER-RECOVERY.md#restore-runbook-production)) to the pre-deploy backup. |

Forward-fix policy: correct problems with a new migration and a new release. Restoring a backup is the last resort
because it loses everything written since.

### Phase 10 release (1.0.0-rc.1) — rollback drill result

On 2026-10-03 the Phase 9 build was started against a copy of the Phase 10 schema
(`scripts/staging/rollback-drill.sh`). Result:
* Serving in 13.6 s. Smoke 12/12.
* Dashboard, CRM, finance, projects, HR list and System Health all work.
* **HR → employee → Compensation crashes.** After `hr:encrypt-iban` the plaintext `iban` column is null, and the Phase 9 code assumes it is not.

Phase 10 is therefore **not purely additive**. Rolling back the code alone is acceptable as an emergency measure, but
only with that page broken. Rules:

* Take and verify a `db:backup` **before** `db:deploy` and before `hr:encrypt-iban`. That backup is the only way back
  to a fully working Phase 9.
* Never downgrade the schema by hand and never decrypt IBANs back into plaintext. Fix forward.
* `hr:encrypt-iban` is a separate, deliberate step after the deploy is verified. Until it has run, Phase 9 code still
  reads every row.

## Scheduling

| Command | Schedule |
|---|---|
| `npm run worker -- --loop` | always-on service (preferred) — or `npm run worker` every 1 min |
| `npm run db:backup` then `npm run db:verify-backup` | nightly |
| `npm run storage:backup` (local driver) | nightly, same window as the database |
| `npm run storage:verify` | weekly |

The individual `*:sweep` and `integrations:worker` scripts remain available; running them together with the worker is
safe (shared leases).

## Phase 11 notes

* **Build with `npm run build`**, not `next build`: `postbuild` writes `.next/csp-public.json`. Without it the public
  pages lose their scripts; `release:verify` and `go-live:check` block on it.
* **nginx**: `proxy_buffer_size 16k` (hash-based CSP headers up to ~5 KB).
* **Migrations** (additive): `phase11_offboarding` (Employee.accessRevokedAt), `phase11_document_scan`
  (DocumentVersionScan + guard), `phase11_zatca` (+ `IntegrationProvider.ZATCA`), `phase11_zatca_live_document`.
  * Staging rehearsal: 9.1 s on a copy, 2.8 s on staging, business row counts unchanged, no drift.
  * Take and verify a `db:backup` first (`scripts/staging/migrate-drill.sh` aborts if it cannot).
* **First worker pass after deploy**: the HR sweep revokes access for employees who were already terminated (date
  passed) but kept an active account. This is intended; review the `employee.access_revoked` audit entries afterwards.
* **Rollback to 1.0.0-rc.1 (Phase 10)**: the schema change is additive. The rc1 build runs on the Phase 11 schema;
  every page works, including Compensation (drill: STAGING.md). A rollback **gives up** the Phase 11 protections while it
  is in place:
  * public pages go back to `'unsafe-inline'` scripts;
  * offboarding is manual again;
  * malware verdicts found later by the worker (`DocumentVersionScan`) are ignored, so a file flagged INFECTED after
    upload could be served;
  * ZATCA guards are gone: an uncleared standard invoice can be marked sent, a cleared one voided.

  Do not roll back while ZATCA is live in production or while the scanner policy is relied on. Fix forward instead.

## Phase 12 notes (hosted foundation)

* Hosted target, roles, schedule and the provisioning commands: [PRODUCTION-ARCHITECTURE.md](PRODUCTION-ARCHITECTURE.md).
* Container image: `Dockerfile` (web = default CMD, worker = `node node_modules/tsx/dist/cli.mjs scripts/worker.ts --loop`).
* `package-lock.json` was regenerated on Linux (8 missing optional wasm entries) — `npm ci` failed on every Linux host
  before. Regenerate the lock on Linux (or in the container) after dependency changes made on Windows.
* Run web / worker with the **runtime** role (`scripts/hosted/runtime-role.sql`), migrations with the owner role.
* Verify a managed database with `npx tsx scripts/hosted/verify-db.ts`; storage / scanner with `tests/live-s3.test.ts`
  and `tests/live-clamav.test.ts` (skipped unless their LIVE_* variables are set).
