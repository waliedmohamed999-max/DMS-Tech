#!/usr/bin/env bash
# LOCAL STAGING REHEARSAL — run inside scripts/staging/session.sh:
#   bash scripts/staging/session.sh bash scripts/staging/perf-and-golive.sh
# 1. HTTPS smoke  2. load baseline + pg_stat_statements review  3. go-live:check --env staging
set -uo pipefail
cd "$(dirname "$0")/../.."
ENVF=.local/staging/staging.env
get() { grep "^$1=" "$ENVF" | head -1 | cut -d= -f2-; }
PSQL=.local/pgtools/pgsql/bin/psql.exe
ADMIN_DB=$(get VERIFY_DATABASE_URL); ADMIN_DB=${ADMIN_DB/\/postgres\?/\/dms_os_staging?}
T=.local/staging/timings
SMOKE_PW=$(grep "Password:" .local/staging/smoke-account.txt | awk '{print $2}')
ADMIN_PW=$(cat .local/staging/admin-pw.txt)
CA="NODE_EXTRA_CA_CERTS=.local/staging/tls/ca.crt"

echo "== 1. smoke over HTTPS"
node scripts/staging/with-env.mjs . $CA BASE_URL=https://staging.127.0.0.1.nip.io:8443 SMOKE_EMAIL=smoke.automation@dmstech.sa "SMOKE_PASSWORD=$SMOKE_PW" npx tsx scripts/smoke.ts | tail -3

echo "== 2. load baseline"
$PSQL "$ADMIN_DB" -qtAc "select pg_stat_statements_reset()" >/dev/null
node scripts/staging/with-env.mjs . $CA "ADMIN_PASSWORD=$ADMIN_PW" npx tsx scripts/staging/load-baseline.ts
echo "== pg_stat_statements (application queries during the baseline, top 15 by total time)"
$PSQL "$ADMIN_DB" -P pager=off -c "select calls, round(total_exec_time::numeric,1) as total_ms, round(mean_exec_time::numeric,2) as mean_ms, round(max_exec_time::numeric,1) as max_ms, rows, round(100.0*shared_blks_hit/nullif(shared_blks_hit+shared_blks_read,0),1) as hit_pct, left(regexp_replace(query, '\s+', ' ', 'g'), 150) as query from pg_stat_statements where dbid = (select oid from pg_database where datname='dms_os_staging') order by total_exec_time desc limit 15" | tee $T/pg-stat-statements.txt
echo "== sequential scans on larger tables"
$PSQL "$ADMIN_DB" -P pager=off -c "select relname, seq_scan, seq_tup_read, idx_scan, n_live_tup from pg_stat_user_tables where n_live_tup > 50 order by seq_tup_read desc limit 10" | tee -a $T/pg-stat-statements.txt

echo "== 3. go-live:check (staging)"
node scripts/staging/with-env.mjs . $CA npm run --silent go-live:check -- --env staging | tee $T/go-live-check-staging.txt
echo "go-live exit: ${PIPESTATUS[0]}"
