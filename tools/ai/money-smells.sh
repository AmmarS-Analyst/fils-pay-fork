#!/usr/bin/env bash
# Greps for the patterns behind most of the money and security bugs in this repo.
# A hit is a lead, not a verdict: read it before believing it.
cd "$(dirname "$0")/../.."
G() { grep -rnE "$1" "${@:2}" --include='*.ts' --include='*.tsx' --include='*.go' --include='*.sql' \
        --exclude='*.test.ts' --exclude='*_test.go' --exclude-dir=node_modules --exclude-dir=dist 2>/dev/null | head -${LIMIT:-40}; }
section() { echo; echo "== $1"; }

section "floats on money (TS)";            G 'parseFloat|toFixed\(|Math\.round\(.*(fils|amount)' apps packages scripts
section "floats on money (Go)";            G 'float32|float64' apps/settlement
section "cents assumptions";               G '\* ?100\b|/ ?100\b|decimals = 2' apps/api/src apps/settlement scripts
section "UTC used for a business day";     G 'time\.Now\(\)\.UTC|getUTCDate|toISOString\(\)\.slice\(0, ?10\)' apps scripts
section "INTEGER money columns / int32";   G '(fils|amount)[a-z_]* +(INTEGER|INT4|SMALLINT)\b|int32\(' db apps/settlement
section "Math.random near secrets";        G 'Math\.random' apps scripts
section "lookups by id alone (is it scoped to the merchant?)"; G 'WHERE id = \$1(`|"|'"'"')' apps/api/src
