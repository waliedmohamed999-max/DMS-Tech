#!/usr/bin/env bash
# LOCAL STAGING REHEARSAL — Phase 11 regression, run INSIDE a session on the new release:
#   STAGING_RELEASE=<release dir> [FROM=<first step>] bash scripts/staging/session.sh bash scripts/staging/p11-regression.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
T=.local/staging/timings
SMOKE_PW=$(grep "Password:" .local/staging/smoke-account.txt | awk '{print $2}')
ADMIN_PW=$(cat .local/staging/admin-pw.txt)
CA="NODE_EXTRA_CA_CERTS=.local/staging/tls/ca.crt"
W="node scripts/staging/with-env.mjs ."
FROM=${FROM:-1}
step() { echo; echo "===== $1"; }

if [ 1 -ge "$FROM" ]; then
  step "1. smoke over HTTPS (incl. Phase 11 CSP checks)"
  $W $CA BASE_URL=https://staging.127.0.0.1.nip.io:8443 SMOKE_EMAIL=smoke.automation@dmstech.sa "SMOKE_PASSWORD=$SMOKE_PW" npx tsx scripts/smoke.ts 2>&1 | tail -18 | tee $T/p11-smoke.txt
fi
if [ 2 -ge "$FROM" ]; then
  step "2. end-to-end business flow (lead → … → invoice → payments → HR/payroll → procurement → assets → tickets)"
  $W $CA npx tsx scripts/staging/e2e.ts > $T/p11-e2e.txt 2>&1; echo "e2e exit $?"; grep -cE "^✔" $T/p11-e2e.txt; grep -E "^✖" $T/p11-e2e.txt | head -3
fi
if [ 3 -ge "$FROM" ]; then
  step "3. multi-instance (2 web + 2 workers: sessions, rate limits, events, rules, outbox — no duplicates)"
  $W "SMOKE_PASSWORD=$SMOKE_PW" npx tsx scripts/staging/multi-instance.ts > $T/p11-multi.txt 2>&1; grep -E '"(dashboardOn3201|counterInDb|leads|processed|uniqueEvents|deliveriesReceived|duplicateDeliveries|badSignatures)"|MULTI' $T/p11-multi.txt
fi
if [ 4 -ge "$FROM" ]; then
  step "4. inbound webhooks over HTTPS (signature, replay, idempotency, rate limit)"
  $W $CA npx tsx scripts/staging/webhook-https.ts > $T/p11-webhook.txt 2>&1; tail -1 $T/p11-webhook.txt
fi
if [ 5 -ge "$FROM" ]; then
  step "5. correlation trace"
  $W $CA npx tsx scripts/staging/correlation-trace.ts > $T/p11-correlation.txt 2>&1; tail -1 $T/p11-correlation.txt
fi
if [ 6 -ge "$FROM" ]; then
  step "6. document storage recovery + authorization"
  $W "SMOKE_PASSWORD=$SMOKE_PW" "ADMIN_PASSWORD=$ADMIN_PW" npx tsx scripts/staging/storage-recovery.ts > $T/p11-storage.txt 2>&1; tail -1 $T/p11-storage.txt
fi
if [ 7 -ge "$FROM" ]; then
  step "7. go-live:check (staging) — includes HTTP→HTTPS via HTTP_BASE_URL"
  $W $CA npm run --silent go-live:check -- --env staging > $T/p11-go-live.txt 2>&1; cat $T/p11-go-live.txt
fi
if [ 8 -ge "$FROM" ]; then
  step "8. release:verify (deployment context: environment checks; code checks run in the build context)"
  $W $CA npx tsx scripts/release-verify.ts --no-build --out .local/staging/timings/p11-release-verify-staging.json > $T/p11-release-verify-staging.txt 2>&1; tail -45 $T/p11-release-verify-staging.txt
fi
