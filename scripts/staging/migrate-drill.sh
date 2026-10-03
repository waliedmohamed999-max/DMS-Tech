#!/usr/bin/env bash
# LOCAL STAGING REHEARSAL — forward migration drill (Phase 11). Database only (no web / workers running):
#   bash scripts/staging/migrate-drill.sh
# 1. pg_dump of the current staging database (pre-migration rollback point)
# 2. restore it into a COPY, apply the new migrations there, compare business row counts + drift
# 3. apply the same migrations to staging itself (as the application role dms_app)
set -uo pipefail
cd "$(dirname "$0")/../.."
ENVF=.local/staging/staging.env
get() { grep "^$1=" "$ENVF" | head -1 | cut -d= -f2-; }
DBURL=$(get DATABASE_URL)
COPY_URL=${DBURL/\/dms_os_staging\?/\/dms_os_staging_migcopy?}
ADMIN_URL=$(get VERIFY_DATABASE_URL)
PSQL=.local/pgtools/pgsql/bin/psql.exe
LOG=.local/staging/timings/migrate-drill.txt
: > "$LOG"
t0=$(date +%s%3N)
mark() { echo "+$(( $(date +%s%3N) - t0 )) ms  $1" | tee -a "$LOG"; }
COUNTS="select 'migrations='||count(*) from \"_prisma_migrations\"; select 'invoices='||count(*)||' total='||coalesce(sum(total),0) from \"Invoice\"; select 'payments='||count(*) from \"Payment\"; select 'employees='||count(*) from \"Employee\"; select 'encryptedIbans='||count(*) from \"EmployeeBankAccount\" where \"ibanCiphertext\" is not null; select 'documents='||count(*) from \"DocumentVersion\"; select 'users='||count(*)||' active='||count(*) filter (where status='ACTIVE') from \"User\"; select 'audit='||count(*) from \"AuditLog\""

node scripts/staging/staging-db.mjs > .local/staging/staging-db.log 2>&1 &
for i in $(seq 1 60); do (echo > /dev/tcp/127.0.0.1/54330) 2>/dev/null && break; sleep 1; done
# the port opens before recovery finishes (57P03 "starting up") — wait until a real query succeeds
for i in $(seq 1 60); do $PSQL "$DBURL" -tAc "select 1" >/dev/null 2>&1 && break; sleep 1; done
trap '.local/pgtools/pgsql/bin/pg_ctl.exe stop -D .local/staging/pg -m fast >/dev/null 2>&1; powershell -NoProfile -c "Get-CimInstance Win32_Process -Filter \"Name=\x27node.exe\x27\" | ? { \$_.CommandLine -like \"*staging-db.mjs*\" } | % { Stop-Process -Id \$_.ProcessId -Force }" >/dev/null 2>&1' EXIT

mark "1. pre-migration pg_dump of staging (rollback point)"
BK=$(node scripts/staging/with-env.mjs . npm run --silent db:backup | tail -1)
echo "$BK" | tee -a "$LOG"
echo "$BK" | grep -q '"ok":true' || { echo "ABORT: no fresh pre-migration backup — nothing migrated" | tee -a "$LOG"; exit 1; }
FILE=$(ls -t .local/staging/backups/*.dump | head -1)
echo "rollback point: $FILE" | tee -a "$LOG"
echo "--- staging BEFORE" | tee -a "$LOG"; $PSQL "$DBURL" -tAc "$COUNTS" | tee -a "$LOG"

mark "2. restore into a copy and migrate the copy"
$PSQL "$ADMIN_URL" -qc "drop database if exists dms_os_staging_migcopy with (force)" -c "create database dms_os_staging_migcopy owner dms_app"
$PSQL "${ADMIN_URL/\/postgres\?/\/dms_os_staging_migcopy?}" -qc "create extension if not exists pg_stat_statements"
node scripts/staging/with-env.mjs . npm run --silent db:restore -- --file "$FILE" --target "$COPY_URL" --confirm dms_os_staging_migcopy | tail -1 | cut -c1-200 | tee -a "$LOG"
T1=$(date +%s%3N)
node scripts/staging/with-env.mjs . "DATABASE_URL=$COPY_URL" npx prisma migrate deploy 2>&1 | grep -E "Applying|applied|Error" | tee -a "$LOG"
mark "   copy migrated in $(( $(date +%s%3N) - T1 )) ms"
node scripts/staging/with-env.mjs . "DATABASE_URL=$COPY_URL" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code > /dev/null 2>&1; echo "copy drift exit: $? (0 = none)" | tee -a "$LOG"
echo "--- copy AFTER" | tee -a "$LOG"; $PSQL "$COPY_URL" -tAc "$COUNTS" | tee -a "$LOG"
$PSQL "$COPY_URL" -tAc "select 'zatcaUnitsAfterRestore='||count(*) from \"ZatcaEgsUnit\"" 2>&1 | tee -a "$LOG"
$PSQL "$ADMIN_URL" -qc "drop database if exists dms_os_staging_migcopy with (force)"

mark "3. migrate staging itself (application role)"
T2=$(date +%s%3N)
node scripts/staging/with-env.mjs . npx prisma migrate deploy 2>&1 | grep -E "Applying|applied|Error" | tee -a "$LOG"
mark "   staging migrated in $(( $(date +%s%3N) - T2 )) ms"
echo "--- staging AFTER" | tee -a "$LOG"; $PSQL "$DBURL" -tAc "$COUNTS" | tee -a "$LOG"
node scripts/staging/with-env.mjs . npx prisma migrate status 2>&1 | tail -1 | tee -a "$LOG"
mark "done"
