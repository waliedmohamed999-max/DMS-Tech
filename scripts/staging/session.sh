#!/usr/bin/env bash
# LOCAL STAGING REHEARSAL — bounded session: start the full staging topology, run ONE command against it, stop everything.
#   bash scripts/staging/session.sh <command…>
# Topology: TLS PostgreSQL (54330) · HTTPS proxy (8443 → 3200/3201, 8080 → 301) · 2 web instances (release rc1) · 2 workers.
# Never touches development or production data.
set -uo pipefail
cd "$(dirname "$0")/../.."
L=.local/staging/logs
REL=.local/releases/rc1
mkdir -p "$L"

stop_all() {
  powershell -NoProfile -c "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ? { \$_.CommandLine -like '*worker.ts*' -or \$_.CommandLine -like '*https-proxy.mjs*' -or \$_.CommandLine -like '*next*start*-p 320*' -or \$_.CommandLine -like '*staging-db.mjs*' } | % { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }; Get-NetTCPConnection -LocalPort 3200,3201,8443,8080 -State Listen -ErrorAction SilentlyContinue | % { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1
  # PostgreSQL: fast shutdown so the next session starts cleanly
  .local/pgtools/pgsql/bin/pg_ctl.exe stop -D .local/staging/pg -m fast >/dev/null 2>&1 || true
}
trap stop_all EXIT

stop_all
rm -f .local/staging/pg/postmaster.pid 2>/dev/null || true
node scripts/staging/staging-db.mjs > .local/staging/staging-db.log 2>&1 &
for i in $(seq 1 60); do (echo > /dev/tcp/127.0.0.1/54330) 2>/dev/null && break; sleep 1; done
sleep 2
node scripts/staging/https-proxy.mjs > "$L/proxy.out" 2>&1 &
node scripts/staging/with-env.mjs "$REL" npx next start -p 3200 > "$L/web-3200.out" 2>&1 &
node scripts/staging/with-env.mjs "$REL" npx next start -p 3201 > "$L/web-3201.out" 2>&1 &
node scripts/staging/with-env.mjs "$REL" npm run worker -- --loop > "$L/worker-a.out" 2>&1 &
node scripts/staging/with-env.mjs "$REL" npm run worker -- --loop > "$L/worker-b.out" 2>&1 &
for i in $(seq 1 90); do
  a=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3200/api/ready); b=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3201/api/ready)
  [ "$a" = 200 ] && [ "$b" = 200 ] && break
  sleep 2
done
echo "[session] staging ready: 3200=$a 3201=$b"
"$@"
rc=$?
echo "[session] command exit $rc"
exit $rc
