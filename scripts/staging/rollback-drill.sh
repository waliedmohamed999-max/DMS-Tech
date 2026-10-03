#!/usr/bin/env bash
# LOCAL STAGING REHEARSAL — application rollback drill (Phase 10). Run inside scripts/staging/session.sh:
#   bash scripts/staging/session.sh bash scripts/staging/rollback-drill.sh
# Starts the PREVIOUS release (.local/releases/phase9) against a COPY of the current (Phase 10 schema) staging database
# and measures what still works. Migrations are forward-only: no schema downgrade is attempted.
set -uo pipefail
cd "$(dirname "$0")/../.."
ENVF=.local/staging/staging.env
get() { grep "^$1=" "$ENVF" | head -1 | cut -d= -f2-; }
DBURL=$(get DATABASE_URL)
RB_URL=${DBURL/\/dms_os_staging\?/\/dms_os_staging_rollback?}
ADMIN_URL=$(get VERIFY_DATABASE_URL)
PSQL=.local/pgtools/pgsql/bin/psql.exe
SMOKE_PW=$(grep "Password:" .local/staging/smoke-account.txt | awk '{print $2}')
ADMIN_PW=$(cat .local/staging/admin-pw.txt)
LOG=.local/staging/timings/rollback-drill.txt
: > "$LOG"
t0=$(date +%s%3N)
mark() { echo "+$(( $(date +%s%3N) - t0 )) ms  $1" | tee -a "$LOG"; }

mark "1. fresh pg_dump of staging"
node scripts/staging/with-env.mjs . npm run --silent db:backup | tail -1 | tee -a "$LOG"
FILE=$(ls -t .local/staging/backups/*.dump | head -1)
mark "2. restore into a copy (dms_os_staging_rollback)"
$PSQL "$ADMIN_URL" -qc "drop database if exists dms_os_staging_rollback with (force)" -c "create database dms_os_staging_rollback owner dms_app"
$PSQL "${ADMIN_URL/\/postgres\?/\/dms_os_staging_rollback?}" -qc "create extension if not exists pg_stat_statements"
node scripts/staging/with-env.mjs . npm run --silent db:restore -- --file "$FILE" --target "$RB_URL" --confirm dms_os_staging_rollback | tail -1 | tee -a "$LOG"

mark "3. start PREVIOUS release (phase9, build $(cat .local/releases/phase9/.next/BUILD_ID)) on :3400 against the copy"
T_START=$(date +%s%3N)
node scripts/staging/with-env.mjs .local/releases/phase9 "DATABASE_URL=$RB_URL" npx next start -p 3400 > .local/staging/logs/rollback-3400.out 2>&1 &
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:3400/api/health && break; sleep 1; done
mark "   previous release serving after $(( $(date +%s%3N) - T_START )) ms"
echo "ready: $(curl -s http://127.0.0.1:3400/api/ready | head -c 400)" | tee -a "$LOG"

mark "4. smoke suite against the previous release"
node scripts/staging/with-env.mjs . BASE_URL=http://127.0.0.1:3400 SMOKE_EMAIL=smoke.automation@dmstech.sa "SMOKE_PASSWORD=$SMOKE_PW" npx tsx scripts/smoke.ts 2>&1 | tail -16 | tee -a "$LOG"

mark "5. Phase 10 data the previous release does not understand (encrypted IBAN rows)"
node scripts/staging/with-env.mjs . "DATABASE_URL=$RB_URL" "ADMIN_PASSWORD=$ADMIN_PW" BASE=http://127.0.0.1:3400 npx tsx scripts/staging/rollback-probe.ts 2>&1 | tail -12 | tee -a "$LOG"
grep -iE "error|invalid|null" .local/staging/logs/rollback-3400.out | grep -v "^\s*at " | head -5 | cut -c1-240 | tee -a "$LOG"

mark "6. clean up (stop previous release, drop the copy) — staging itself was never modified"
powershell -NoProfile -c "Get-NetTCPConnection -LocalPort 3400 -State Listen -ErrorAction SilentlyContinue | % { Stop-Process -Id \$_.OwningProcess -Force }" || true
sleep 1
$PSQL "$ADMIN_URL" -qc "drop database if exists dms_os_staging_rollback with (force)"
mark "done"
