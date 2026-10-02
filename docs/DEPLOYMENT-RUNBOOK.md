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

Forward-fix policy: correct problems with a new migration and a new release; restoring a backup is the last resort
because it loses everything written since.

## Scheduling

| Command | Schedule |
|---|---|
| `npm run worker -- --loop` | always-on service (preferred) — or `npm run worker` every 1 min |
| `npm run db:backup` then `npm run db:verify-backup` | nightly |
| `npm run storage:backup` (local driver) | nightly, same window as the database |
| `npm run storage:verify` | weekly |

The individual `*:sweep` and `integrations:worker` scripts remain available; running them together with the worker is
safe (shared leases).
