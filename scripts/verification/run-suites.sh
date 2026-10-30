#!/usr/bin/env bash
# Real-Postgres suites isolated by workspace. Never reuses or resets user data.
set -u
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-55439}" PGUSER="${PGUSER:-filspay}"
case "$PGHOST" in 127.0.0.1|localhost) ;; *) echo 'Use an isolated local PostgreSQL server' >&2; exit 2;; esac
run_id="filspay_verify_$(date +%s)_$$"
report_dir="${AUDIT_LOG_DIR:-/tmp/filspay-audit/final-suites}"
mkdir -p "$report_dir"
result=0
prepare_db() {
  local suite_name="$1"
  createdb "${run_id}_${suite_name}" || return 1
  export DATABASE_URL="postgres://${PGUSER}@${PGHOST}:${PGPORT}/${run_id}_${suite_name}"
  npm run migrate > "$report_dir/${suite_name}-migrate.log" 2>&1
}
run_suite() {
  local suite_name="$1"
  shift
  if prepare_db "$suite_name" && "$@" > "$report_dir/${suite_name}.log" 2>&1; then
    echo "PASS $suite_name"
  else
    echo "FAIL $suite_name ($report_dir/${suite_name}.log)"
    result=1
  fi
}
run_suite api npm run test --workspace @filspay/api
run_suite reporting npm run test --workspace @filspay/reporting
run_suite money npm run test --workspace @filspay/money
run_suite events npm run test --workspace @filspay/events
run_suite web npm run test --workspace @filspay/web
run_suite scripts node --import tsx --test --test-concurrency=1 scripts/expire_holds.test.ts scripts/reconcile_march.test.ts scripts/reconcile_march.integration.test.ts scripts/seed_guard.test.ts
run_suite seed node --import tsx --test db/seed/selfVerify.integration.test.ts
if command -v go >/dev/null; then
  run_suite go bash -c 'cd apps/settlement && go test -count=1 -p 1 ./...'
else
  echo 'FAIL go: toolchain not on PATH'
  result=1
fi
printf 'Databases retained under %s; logs %s\n' "$run_id" "$report_dir"
exit "$result"
