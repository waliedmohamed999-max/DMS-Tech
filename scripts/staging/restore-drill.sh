#!/usr/bin/env bash
# LOCAL STAGING REHEARSAL — disaster-restore drill (Phase 10, docs/DISASTER-RECOVERY.md). Never touches production.
#   bash scripts/staging/restore-drill.sh
# Prereqs: staging DB running (scripts/staging/staging-db.mjs), release in STAGING_RELEASE (default .local/releases/rc1), pg tools in .local/pgtools.
set -euo pipefail
cd "$(dirname "$0")/../.."
ENVF=.local/staging/staging.env
get() { grep "^$1=" "$ENVF" | head -1 | cut -d= -f2-; }
DBURL=$(get DATABASE_URL)
RESTORE_URL=${DBURL/\/dms_os_staging\?/\/dms_os_staging_restore?}
PSQL=.local/pgtools/pgsql/bin/psql.exe
ADMIN_URL=$(get VERIFY_DATABASE_URL)
SMOKE_PW=$(grep "Password:" .local/staging/smoke-account.txt | awk '{print $2}')
LOG=.local/staging/timings/drill.txt
now() { date +%s%3N; }
t0=$(now)
mark() { echo "$(date -u +%FT%T.%3NZ)  +$(( $(now) - t0 )) ms  $1" | tee -a "$LOG"; }
: > "$LOG"

mark "1. backup (pg_dump)"
node scripts/staging/with-env.mjs . npm run --silent db:backup | tail -1 | tee -a "$LOG"
FILE=$(ls -t .local/staging/backups/*.dump | head -1)

mark "2. modify safe test data AFTER the backup (organization phone)"
BEFORE=$($PSQL "$DBURL" -tAc "select phone from \"Organization\" limit 1")
$PSQL "$DBURL" -qc "update \"Organization\" set phone = '+966119999999'"

mark "3. stop application writes (web instances + workers)"
powershell -NoProfile -c "Get-NetTCPConnection -LocalPort 3200,3201 -State Listen -ErrorAction SilentlyContinue | % { Stop-Process -Id \$_.OwningProcess -Force }; Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ? { \$_.CommandLine -like '*worker.ts*' } | % { Stop-Process -Id \$_.ProcessId -Force }" || true
STOPPED=$(now)

mark "4. restore into a clean database (dms_os_staging_restore)"
$PSQL "$ADMIN_URL" -qc "drop database if exists dms_os_staging_restore with (force)" -c "create database dms_os_staging_restore owner dms_app"
$PSQL "${ADMIN_URL/\/postgres\?/\/dms_os_staging_restore?}" -qc "create extension if not exists pg_stat_statements"
node scripts/staging/with-env.mjs . npm run --silent db:restore -- --file "$FILE" --target "$RESTORE_URL" --confirm dms_os_staging_restore | tee -a "$LOG"

mark "5. temporary app instance on the restored database (port 3300)"
node scripts/staging/with-env.mjs "${STAGING_RELEASE:-.local/releases/rc1}" "DATABASE_URL=$RESTORE_URL" npx next start -p 3300 > .local/staging/logs/drill-3300.out 2>&1 &
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:3300/api/health && break; sleep 1; done

mark "6. readiness"
curl -s http://127.0.0.1:3300/api/ready | tee -a "$LOG"; echo | tee -a "$LOG"

mark "7. smoke suite against the restored instance"
node scripts/staging/with-env.mjs . BASE_URL=http://127.0.0.1:3300 SMOKE_EMAIL=smoke.automation@dmstech.sa "SMOKE_PASSWORD=$SMOKE_PW" npx tsx scripts/smoke.ts | tail -1 | tee -a "$LOG"
RESTORED_OK=$(now)

mark "8. verify critical records on the restored database"
$PSQL "$RESTORE_URL" -tAc "select 'phone='||phone from \"Organization\"; select 'invoices='||count(*)||' paid='||count(*) filter (where status='PAID') from \"Invoice\"; select 'clients='||count(*) from \"Client\"; select 'employees='||count(*) from \"Employee\"; select 'encryptedIbans='||count(*) from \"EmployeeBankAccount\" where \"ibanCiphertext\" is not null; select 'marker='||environment from \"DeploymentMarker\"; select 'audit='||count(*) from \"AuditLog\"" | tee -a "$LOG"
echo "phone before drill change: $BEFORE (restored value must equal it; +966119999999 must be absent)" | tee -a "$LOG"

mark "9. return staging to its correct state"
powershell -NoProfile -c "Get-NetTCPConnection -LocalPort 3300 -State Listen -ErrorAction SilentlyContinue | % { Stop-Process -Id \$_.OwningProcess -Force }" || true
$PSQL "$ADMIN_URL" -qc "drop database if exists dms_os_staging_restore with (force)"
$PSQL "$DBURL" -qc "update \"Organization\" set phone = '$BEFORE'"
mark "done — writes stopped → restored + ready + smoke passed: $(( RESTORED_OK - STOPPED )) ms (measured RTO for this data size)"
