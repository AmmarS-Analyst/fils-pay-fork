#!/usr/bin/env bash
# Runs every API and reporting test file ONE AT A TIME against $DATABASE_URL and
# writes a summary, so one hung file does not hide the others.
#   DATABASE_URL=postgres://... bash tools/ai/run-db-tests.sh [outdir]
set -u
: "${DATABASE_URL:?set DATABASE_URL to a migrated Postgres}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:-$ROOT/.test-results}"
mkdir -p "$OUT"; : > "$OUT/summary.txt"
for app in api reporting; do
  cd "$ROOT/apps/$app" || exit 1
  for f in $(find src -name '*.test.ts' | sort); do
    log="$OUT/$(echo "$app/$f" | tr '/\\' '__').log"
    timeout 150 npx tsx --test --test-concurrency=1 "$f" > "$log" 2>&1
    code=$?
    echo "$code pass=$(grep -E '^ℹ pass' "$log" | awk '{print $3}') fail=$(grep -E '^ℹ fail' "$log" | awk '{print $3}') $app/$f" >> "$OUT/summary.txt"
  done
done
echo DONE >> "$OUT/summary.txt"
grep -v '^0 ' "$OUT/summary.txt"   # show only the files that did not pass cleanly
