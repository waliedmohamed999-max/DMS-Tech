# Backup, restore & disaster recovery (Phase 9)

## Targets (company targets — NOT guarantees)

| | Target | Depends on |
|---|---|---|
| RPO (max data loss) | **24 h** with nightly `db:backup`; **≤ 5 min** if the managed provider's point-in-time recovery (PITR) is enabled | backup schedule / provider plan |
| RTO (time to restore service) | **4 h** for a full database restore + redeploy; **1 h** for an application-only rollback | backup size, operator availability, runbook practice |

These numbers are only true once backups run on schedule, verification passes and a restore drill has been
performed. Record each drill (date, duration, result) in the operations log.

## Database backups

```
npm run db:backup             # pg_dump -Fc (production) → BACKUP_DIR/dms-<db>-<UTC timestamp>.dump
npm run db:verify-backup      # newest backup (or pass a file): size, sha256, structure, REAL restore into a temp DB, checks, drop
```

- Engines: `pg_dump` (required in production; install the PostgreSQL **client** tools matching the server major
  version, or set `PG_DUMP_PATH` / `PG_RESTORE_PATH`). `logical` (JSON-lines snapshot in one REPEATABLE READ
  transaction) is the fallback used in development where client tools are absent; in production only with an explicit
  `BACKUP_ENGINE=logical`.
- Output: backup file + `.sha256` + `.json` metadata (database name, server version, migrations, key row counts —
  never host, user or password). A `BackupRecord` row and audit entries (`backup.started / completed / failed`,
  `backup.verified / verify_failed`) are written; the system-health page shows the last backup and verification.
- Safety: `BACKUP_DIR` is required in production and may not be inside `public/`, `src/`, `.next/` or `prisma/`;
  the database password is passed through the environment, never the command line; failures exit with code 1.
- **Backups contain all business and personal data.** Store them encrypted (storage-level encryption or
  `age` / `gpg`), off the application server, with restricted access; keep at least 7 daily + 4 weekly + 12 monthly.
- Managed providers (RDS, Supabase, Neon …): enable automated snapshots + PITR **and** keep the `pg_dump` exports
  (provider-independent copies).

### Verification

A file existing is not a backup. `db:verify-backup` restores into `dms_verify_<random>` on `VERIFY_DATABASE_URL`
(required in production — a separate, non-production server; default in development: the local server), checks that
every migration of the backup is present and that key-table row counts match the metadata, then drops the temporary
database. It refuses to target the application database. Run it after every backup (cron) — the alert
`backup_failed` fires on any failure.

## Restore runbook (production)

There is no restore button. Restoring production is an operator procedure:

1. **Decide & announce.** Incident lead decides which backup / PITR point; announce downtime.
2. **Stop writes.** Scale the app to zero or put it in maintenance; stop the worker and every cron job.
3. **Capture current state.** `npm run db:backup` of the damaged database (evidence + fallback), even if broken.
4. **Restore into a NEW database** (never over the live one):
   - pg_dump backups: `createdb dms_restore_<date>` then
     `pg_restore --no-owner --no-acl -d dms_restore_<date> <file>.dump`
   - or `npm run db:restore -- --file <file> --target <url of the new db> --confirm <new db name>`
     (refuses the configured `DATABASE_URL` database and non-empty targets)
   - managed PITR: create the restored instance from the provider console.
5. **Migration compatibility.** The restored database must be at or below the code's migration level:
   `DATABASE_URL=<restored> npx prisma migrate status` → if migrations are pending, run `npm run db:deploy` against it.
   Never deploy code older than the restored schema.
6. **Verify.** `DATABASE_URL=<restored> npm run deploy:preflight` (drift must be none), spot-check key records,
   `npm run storage:verify` against the document storage.
7. **Switch.** Point `DATABASE_URL` to the restored database, run `npm run os:bootstrap` (idempotent: re-syncs roles,
   creates no data), start the app, then `npm run deploy:verify` (health, ready, smoke).
8. **Restart the worker** (`npm run worker -- --loop`). Outbox rows queued after the backup time are lost; tell
   integration owners to check external systems for gaps.
9. **Rollback** if verification fails: switch `DATABASE_URL` back to the previous database (step 3 copy).
10. **Post-incident:** record RPO / RTO achieved, root cause, actions.

## Document storage

The database stores document metadata and sha256 hashes; the files live in the storage driver.

| Driver | Backup | Restore |
|---|---|---|
| local (`DOCUMENT_STORAGE_DIR`) | `npm run storage:backup` (copy + manifest) **plus** host / volume snapshots; same schedule and retention as the database | copy the directory back to `DOCUMENT_STORAGE_DIR`, then `npm run storage:verify` |
| S3 | enable **bucket versioning**, lifecycle rules (keep non-current versions ≥ 90 days), server-side encryption, ideally cross-region replication; object lock for compliance if required | restore objects / previous versions with provider tools, then `npm run storage:verify` |

`npm run storage:verify` checks every `DocumentVersion` (file present + sha256 matches) and exits 1 on any problem.
Restore the database and the storage to the **same point in time** where possible; versions whose file is missing
are reported (`HASH_MISMATCH` / missing) instead of silently served.

## Scenarios

| Scenario | Response |
|---|---|
| Database lost / corrupted | Restore runbook (PITR or latest verified backup). RPO per targets. |
| Bad migration | Stop deploy; migrations are **not automatically reversible**. Prefer a forward fix (new migration). If data was damaged: restore runbook to the pre-deploy backup (`deploy:preflight` requires a recent one). |
| Deployment broke the app (no schema change) | Redeploy the previous build (application rollback); database untouched. |
| Document storage lost | Restore storage backup / S3 versions; `storage:verify`; affected versions listed. |
| Integration master key lost | Secrets cannot be decrypted (by design). Generate a new key, deploy it, re-enter every provider secret in `/app/integrations` (or move them to `env:` references). Connections show NOT_CONFIGURED until then — nothing breaks silently. |
| Worker outage | Alerts `worker_down` / stale jobs. Restart `npm run worker -- --loop`; leases expire on their own, outbox / automation / events resume where they stopped (idempotent). |
| Provider outage (WhatsApp, Google…) | Outbox retries with backoff, then dead letters; retry from the system-health page after recovery. App stays ready. |
| Leaked credential | Rotate per [SECURITY.md](SECURITY.md#secret-rotation); revoke all sessions if a user credential leaked. |
