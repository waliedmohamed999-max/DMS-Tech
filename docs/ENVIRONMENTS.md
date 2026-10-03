# Environments (Phase 10)

| | development | test | staging | production |
|---|---|---|---|---|
| `NODE_ENV` | development | test | production | production |
| `APP_ENV` | (unset) | (unset → test) | **staging** | **production** |
| Database | local embedded Postgres | `dms_os_test` (reset by tests) | own managed instance / database, TLS | own managed instance, TLS, PITR, encryption at rest |
| Secrets | local `.env` (dev keys) | fixed test-only keys | own keys (never production's) | secret manager |
| Storage | `.local/storage` | temp dirs | own bucket / volume | private, versioned, encrypted bucket |
| Integrations | SANDBOX / local test doubles | in-process fakes | **SANDBOX connections only** | PRODUCTION connections |
| Demo seed | allowed (`ALLOW_DEMO_SEED=1`) | — | **refused** | **refused** |

A production build without `APP_ENV` is a configuration error (the server refuses to start).

## Cross-wiring protection

1. **Database marker** — `DeploymentMarker` (one immutable row, written by `os:bootstrap` with the current `APP_ENV`).
   `/api/ready` fails with `ENVIRONMENT_MISMATCH` if the app's `APP_ENV` differs → a staging app pointed at the
   production database (or the reverse) never becomes ready.
2. **Storage marker** — `.dms-environment` in the local storage root, created on first use, compared afterwards.
   (S3: use separate buckets per environment; bucket policies are the boundary.)
3. **Outbound providers** — outside production, the outbox refuses deliveries through PRODUCTION integration
   connections (`ENVIRONMENT_BLOCKED`, dead letter, nothing sent): staging cannot message real WhatsApp customers or call
   production webhooks. `SANDBOX` connections are refused in production. (`ALLOW_NON_PRODUCTION_OUTBOUND=1` exists
   only for an explicitly approved test; it is reported by the config check.)
4. **Separate keys** — `HR_FIELD_KEY` and `INTEGRATION_MASTER_KEY` differ per environment, so a production backup
   restored into staging cannot decrypt production IBANs / provider secrets.

## Restoring production data into staging

Not allowed as routine (real personal data). If a defect needs production data, restore into an isolated, access-
controlled environment under a written approval, with the production keys kept out of it; IBANs and integration
secrets remain unreadable there by design.
