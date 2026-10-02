# Business OS — Local development & deployment

## Local development

```bash
npm install
npm run db:local          # terminal 1: real PostgreSQL 18 on :54329 (data in .local/pg, UTF-8)
npx prisma migrate deploy # apply migrations to dms_os
DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy   # and to the test DB
npm run db:seed           # demo data (requires ALLOW_DEMO_SEED=1; refused in production)
npm run dev               # http://localhost:3000/app  ·  demo login: admin@dms.test / DmsDemo2026!
npm test                  # Vitest — runs against TEST_DATABASE_URL only
```

Demo accounts (all `DmsDemo2026!`): `admin@`, `ceo@`, `gm@`, `sales.manager@`, `sales@`, `pm@`, `dev@`, `design@`, `marketing@`, `accountant@`, `hr@`, `employee@`, `it@` (delegated admin), `finance@`, `ops@` (operations manager), `support@` (support agent) — all `@dms.test`.

## Production

> Phase 9: the complete, provider-neutral flow (backup → preflight → migrate → bootstrap → start → verify → smoke),
> rollback strategy and scheduling are in [DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md); the go-live checklist is
> [GO-LIVE.md](GO-LIVE.md); backups / restore in [DISASTER-RECOVERY.md](DISASTER-RECOVERY.md).

1. Provision PostgreSQL (Supabase/Neon/RDS) — UTF-8. Create an application role **without** `TRUNCATE` on `"AuditLog"`.
2. Environment: `DATABASE_URL`, `NODE_ENV=production`, `NEXT_PUBLIC_SITE_URL`. Never set `ALLOW_DEMO_SEED`.
3. Migrate: `npm run db:deploy` (non-interactive, never resets data).
4. Bootstrap (idempotent, no demo data):
   `OS_ADMIN_EMAIL=… OS_ADMIN_NAME=… OS_ADMIN_PASSWORD=… npm run os:bootstrap`
5. Build & start: `npm run build && npm start` (or Vercel). `postinstall` runs `prisma generate`.
6. Serve over HTTPS (session cookie is `__Host-` + `Secure` in production).
7. Schedule the sweeps (e.g. every 15 min): `npm run commercial:sweep`, `npm run projects:sweep`, `npm run finance:sweep`, `npm run hr:sweep` (hourly is enough for HR) and `npm run operations:sweep` (every 15 min — SLA warnings / breaches). Each takes a DB lease (`JobLease`), so running them on several instances is safe; pages also run them lazily.
   Phase 8: run `npm run integrations:worker` **every minute** (or once as a long-running process with `-- --loop`). It queues campaign batches, delivers the outbox (retry / dead letter) and re-checks connection health. It is lease-guarded and idempotent.
8. Bootstrap also migrates renamed permissions on custom roles (`rbac.permissions_migrated` in the audit log) and ensures default services, project templates, expense categories, leave types, payroll components, the attendance policy, procurement approval rules, asset categories, SLA policies and knowledge categories, plus the integration registry (one NOT_CONFIGURED row per provider). No manual step is needed after `db:deploy`.

## Integrations (Phase 8)

Environment variables (all optional — without them every provider honestly stays NOT_CONFIGURED):

| Variable | Purpose |
|---|---|
| `INTEGRATION_MASTER_KEY` | base64 of 32 random bytes (`openssl rand -base64 32`). It encrypts the provider secrets entered in `/app/integrations` (AES-256-GCM). Keep it in the platform secret manager. **Losing it makes stored secrets unreadable**: re-enter them. Without it, only `env:NAME` secret references can be used. |
| any `NAME` referenced as `env:NAME` | A secret kept in the environment instead of the database (the OS stores only the reference) |
| `NEXT_PUBLIC_SITE_URL` | Used to show the public webhook URL (`/api/integrations/webhooks/{connectionId}`) |
| `DOCUMENT_STORAGE=s3` + `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | S3-compatible document storage for **new** uploads |

- **WhatsApp:**
  1. Create a Meta app with the WhatsApp product.
  2. Enter the Business Account ID, Phone number ID, a **system-user access token**, the app secret and a verify token of your choice.
  3. Register the webhook URL shown on the card, subscribing the `messages` and `message_template_status_update` fields.
  4. Press **Test connection**. The status becomes CONNECTED only if Meta answers.
- Sandbox connections (a local test endpoint) are refused when `NODE_ENV=production`.
- The webhook route `/api/integrations/webhooks/*` must be reachable publicly over HTTPS. It does not use the session cookie (`proxy.ts` skips `/api`).

## Document storage (Phase 7)

- Uploaded files are stored by the local adapter in `.local/storage/documents` (override with `DOCUMENT_STORAGE_DIR`) — **outside `public/`**, git-ignored, served only through `/app/documents/[id]/download` after authorisation. Back this directory up together with the database (rows hold the sha256 of every file; a restored mismatch is reported as `HASH_MISMATCH`).
- Multi-server deployments need shared storage. Set `DOCUMENT_STORAGE=s3` and the `S3_*` variables (Phase 8 `S3StorageAdapter`: SigV4, never overwrites, sha256 kept as object metadata).
  - Each version records its own `storageDriver`, so **existing local files stay where they are and remain downloadable**. Nothing is migrated destructively.
  - To move old files, copy them to the bucket under the same key and then update `storageDriver` per version. This is a manual, scripted step, never automatic.
  - The storage adapter only stores bytes. Permission is decided by the document access resolver before any read.
- Size limit `DOCUMENT_MAX_BYTES` (default 10 MB). No antivirus is installed — versions are recorded as `NOT_SCANNED` until a `DocumentScanner` is configured.

## Data safety

- Migrations are additive; no Phase 1 table is planned to be dropped or reshaped destructively.
- Back up before every `db:deploy` in production (`pg_dump`).
- The demo seed refuses to run when `NODE_ENV=production` or without `ALLOW_DEMO_SEED=1`; demo users use the reserved `.test` domain.
