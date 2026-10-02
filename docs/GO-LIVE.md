# Go-live checklist (Phase 9)

Tick every line before real data enters the system. Items marked **BLOCKER** must be done; the others are strongly
recommended. "Verify" means a command or screen that proves it, not an assumption.

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL ≥ 15, TLS to the database, app role without `TRUNCATE` on `AuditLog` |
| `NEXT_PUBLIC_SITE_URL` | yes | `https://…` (used for webhook URLs and checks) |
| `NODE_ENV=production` | yes | set by the platform |
| `DOCUMENT_STORAGE` | yes | `local` (+ `DOCUMENT_STORAGE_DIR` on a persistent, backed-up volume) or `s3` (+ `S3_*`) |
| `INTEGRATION_MASTER_KEY` | if secrets are stored | `openssl rand -base64 32`, in the platform secret manager, backed up separately from database backups |
| `BACKUP_DIR`, `VERIFY_DATABASE_URL` | for backups | off-server, access-controlled; verification server ≠ production |
| `REQUIRE_WORKER=1` | recommended | readiness then requires the worker heartbeat |
| `LOG_LEVEL`, `ERROR_REPORTER` / `SENTRY_DSN` | optional | error tracking is "not configured" until an adapter is installed |
| `ALLOW_DEMO_SEED`, `TEST_DATABASE_URL`, `OS_LOCAL_PROD_TEST` | **must be absent** | critical config error in production |

Verify: `npm run config:check` → `"ok": true` with no critical issue. The server refuses to start otherwise.

## Checklist

- [ ] **BLOCKER** Domain + HTTPS (valid certificate); HSTS header present (`npm run smoke` against the URL).
- [ ] **BLOCKER** Database provisioned, encrypted at rest, automated snapshots / PITR enabled.
- [ ] **BLOCKER** `npm run deploy:preflight` passes; `npm run db:deploy` applied; `npm run deploy:verify` passes.
- [ ] **BLOCKER** First `npm run db:backup` + `npm run db:verify-backup` succeeded; nightly schedule configured; backups stored off-server and encrypted.
- [ ] **BLOCKER** Document storage persistent and backed up (`storage:backup` / S3 versioning); `npm run storage:verify` passes.
- [ ] **BLOCKER** Secrets in the platform secret manager (never in the repository); `INTEGRATION_MASTER_KEY` backed up separately.
- [ ] **BLOCKER** Worker running (`npm run worker -- --loop` as a service, or `npm run worker` every minute); system-health shows the jobs HEALTHY.
- [ ] **BLOCKER** Demo data absent: no `@dms.test` users (readiness fails otherwise), demo seed never run on this database.
- [ ] **BLOCKER** First Super Admin created with `npm run os:bootstrap` (strong, temporary password → changed at first sign-in); no shared accounts; second admin for break-glass.
- [ ] **BLOCKER** Company data in Settings: legal name (AR/EN), VAT number, address, logo, currency, timezone, invoice / quotation numbering, approval thresholds.
- [ ] **BLOCKER** Bank / payment instructions on invoices and quotations verified with finance.
- [ ] **BLOCKER** ZATCA e-invoicing status decided: this build issues VAT invoices with PDF but **is not ZATCA Phase 2 (Fatoora) integrated** — confirm the legal position or the external e-invoicing process before issuing real invoices.
- [ ] Roles reviewed: each person has the minimum roles; privileged roles (CEO, finance / HR manager, super admin) approved.
- [ ] Email / WhatsApp: only if used — official WhatsApp Business account verified, templates approved, webhook URL registered, test message delivered; otherwise leave NOT_CONFIGURED.
- [ ] NOVA: `NOVA_URL` set if the external platform is in use.
- [ ] Monitoring: `/api/health` and `/api/ready` probed by the platform; logs shipped and retained; alert notifications reach an administrator.
- [ ] Restore drill performed on a non-production server (record RTO achieved).
- [ ] Public website smoke: home, services, contact form → lead in CRM.
- [ ] Data protection: privacy notice for website / WhatsApp consent, retention defaults accepted (DATA-CLASSIFICATION.md).

## Not included in this build (decide before go-live)

General ledger, bank reconciliation, ZATCA integration, antivirus scanning, external error tracking adapter, ads-API
spend sync, NOVA data exchange.
