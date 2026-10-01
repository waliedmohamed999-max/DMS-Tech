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

Demo accounts (all `DmsDemo2026!`): `admin@`, `ceo@`, `gm@`, `sales.manager@`, `sales@`, `pm@`, `dev@`, `design@`, `marketing@`, `accountant@`, `hr@`, `employee@`, `it@` (delegated admin), `finance@` — all `@dms.test`.

## Production

1. Provision PostgreSQL (Supabase/Neon/RDS) — UTF-8. Create an application role **without** `TRUNCATE` on `"AuditLog"`.
2. Environment: `DATABASE_URL`, `NODE_ENV=production`, `NEXT_PUBLIC_SITE_URL`. Never set `ALLOW_DEMO_SEED`.
3. Migrate: `npm run db:deploy` (non-interactive, never resets data).
4. Bootstrap (idempotent, no demo data):
   `OS_ADMIN_EMAIL=… OS_ADMIN_NAME=… OS_ADMIN_PASSWORD=… npm run os:bootstrap`
5. Build & start: `npm run build && npm start` (or Vercel). `postinstall` runs `prisma generate`.
6. Serve over HTTPS (session cookie is `__Host-` + `Secure` in production).
7. Schedule the sweeps (e.g. every 15 min): `npm run commercial:sweep` and `npm run projects:sweep`. Both take a DB lease (`JobLease`), so running them on several instances is safe; pages also run them lazily.
8. Bootstrap also migrates renamed permissions on custom roles (`rbac.permissions_migrated` in the audit log) and ensures default services and project templates — no manual step after `db:deploy`.

## Data safety

- Migrations are additive; no Phase 1 table is planned to be dropped or reshaped destructively.
- Back up before every `db:deploy` in production (`pg_dump`).
- The demo seed refuses to run when `NODE_ENV=production` or without `ALLOW_DEMO_SEED=1`; demo users use the reserved `.test` domain.
