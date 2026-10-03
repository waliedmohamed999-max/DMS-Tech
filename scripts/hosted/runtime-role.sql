-- Phase 12 — separate RUNTIME role for web + worker (docs/PRODUCTION-ARCHITECTURE.md#database-roles).
--   migration owner (e.g. dms_app)   → runs `npm run db:deploy` only; owns the schema
--   runtime role   (dms_runtime)     → DATABASE_URL of web / worker: DML only — no DDL, no TRUNCATE, no ownership,
--                                      so the append-only audit trail cannot be truncated by the application
-- Run as the migration owner (or an admin) on the application database, after db:deploy:
--   psql "$OWNER_URL" -v runtime_role=dms_runtime -f scripts/hosted/runtime-role.sql
-- The role itself (LOGIN + password) is created by the provider console / an admin; this script only grants.
\set ON_ERROR_STOP on

REVOKE ALL ON SCHEMA public FROM :"runtime_role";
GRANT USAGE ON SCHEMA public TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"runtime_role";
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM :"runtime_role";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO :"runtime_role";
-- (functions: EXECUTE is granted to PUBLIC by default; trigger functions need no grant to fire)
-- tables / sequences created by later migrations (run by the owner) get the same grants automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"runtime_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"runtime_role";
-- the migration history is read by readiness checks, never written by the runtime
REVOKE INSERT, UPDATE, DELETE ON "_prisma_migrations" FROM :"runtime_role";
