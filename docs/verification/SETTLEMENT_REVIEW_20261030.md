# Settlement review — 2026-10-30

Compared `origin/main..submission`; references and comments were treated as evidence, not proof. Runtime results are recorded separately after verification.

| BUGS ID | Original issue | Submission review |
|---|---|---|
|18|Real wrong rebuild source|Ledger source corrected; concurrent rebuild and cache lifecycle need fixes.|
|19|Real rounding loss/creation|Largest remainder correct at total weight 10000; invalid totals unchecked.|
|20|Real payout float32 loss|Integer subtraction correct.|
|21|Real int32 overflow|BIGINT/int64 correction correct.|
|22|Real UTC calendar scheduling delay|Bahrain calendar correction correct.|
|23|Real concurrent duplicate notification|Transaction advisory lock correct for all existing callers.|
|24|Real scheme decimal rounding mismatch and missing journal|Truncated numeric amount and balanced residue posting correct.|
|25|Real wrong accounts, period and non-idempotence|Sequential replay corrected; concurrent replay and lifetime-transaction source still wrong.|
|30|Real missing refund netting|Netting/carry-forward correct; reconciliation incorrectly includes payout debits across days.|
|31|Real missing link discount|Adjustment invocation correct; atomic capture integration reviewed separately.|
|32|Real rounding order disagreement|Fee-first discount matches API.|
|33|Real float estimate/wrong MDR|Capture metadata improvement correct; current discount still rewrites historical estimate.|
|46|Real multiplied multi-capture totals|Sum incremental events correct.|
|50|Real mutation of paid batches|Freeze correct, but pre-payout adjustments were counted twice after payout.|
|51|Real CLI printed repair without saving|Writes corrected; missing cache-row locking and rebuild-all races remain.|

## Confirmed follow-up defects

- Recalculate closed fee 250 to 200, pay, recalculate unchanged: old code adds the pre-payout -50 again and posts a wrong +50 correction. Only post-payout corrections belong in paid-baseline adjustment.
- Reconciliation's ledger sum includes payout debits whereas batch sums describe production dates. Multi-day ranges include previous days' payout debits and report false gaps. Payout legs must be excluded from the production attribution query. Existing single-day helper dates payout outside that day and hides this.
- Split weights must total 10000 before marking a batch paid. Individual database checks do not enforce this invariant.
- March residue must come from actual scheme lines and capture windows, not lifetime captured totals and authorization timestamps. Concurrent executions need serialization. Preexisting legacy sweep entries need explicit detection because they used different accounts.
- Rebuild-all needs lock-before-read semantics, including absent cache rows. Batch-driven cache deltas conflict with authoritative ledger snapshots. Durable ledger-driven cache maintenance requires coordination with all API posting paths.

## Policy and limits

The lifetime payout float32 estimate is explicitly monitoring-only and never feeds payouts; #20 concerns actual payout math. MDR recalculation's meaning of "current terms" (fee schedules and platform volume tiers) remains a finance policy decision. Historical capture fees and applied discounts must remain the recorded values for ordinary settlement and reconciliation. Manual display adjustments are expressly permitted by ADR-0006 and should not silently become actual money postings.

## Implemented checkpoint

- Close now consumes immutable `netFeeFils` where present (legacy events fall back to historical implementation); payout/recalculation/split posting rely on migration 0078's journal-driven cache instead of duplicate balance deltas. Close retains only batch provenance metadata.
- Rebuild creates/locks the cache row before its fresh ledger aggregate. Rebuild-all visits rows in deterministic merchant order.
- Invalid split totals fail before any posting or paid transition.
- Scheme export casts the reused fils parameter consistently to BIGINT (real PostgreSQL rejected the original insert with SQLSTATE 42P08). Residue legs now identify their settlement batch.
- Paid MDR corrections have an explicit paid-batch description, so pre-payment adjustments already incorporated in frozen batch fees are excluded. Legacy adjustments retain timestamp-based classification; missing/incorrect historical payment timestamps require explicit reconciliation.
- Reconciliation excludes payout ledger legs from production attribution, uses immutable per-capture net fees when available, and preserves existing response fields.
- March sweep derives residue from capture events associated with actual March export lines, serializes concurrent runs with a transaction advisory lock, skips automatically journaled lines, and fails visibly on conflicting legacy sweeps rather than silently accepting wrong accounts/amounts/periods.
- Migration 0082 rebuilds lifetime monitoring totals from paid batches into BIGINT. Monthly/lifetime Go accumulation uses integer fils; split payouts update monitoring as well. This fixes monitoring accuracy, separately from the already-fixed actual payout error #20.

## Verification evidence

Real PostgreSQL on isolated `filspay_go_review` at local port 55439, never the root agent's test database:

- Go full suite `go test -p 1 ./...` passed all packages after migration 0078 and integer monitoring migration.
- API settlement routes and March helper tests: 17 passed initially, including multi-day reconciliation and changed-discount regression.
- Additional March PostgreSQL integration test: 3/3 script tests passed, including two simultaneous sweeps of a cross-month partial capture; exactly one 9-fil correction group at Bahrain March end.
- Added Go regressions cover invalid split totals without posting, closed-recalculate/pay/recalculate idempotence, immutable capture fee after changed terms, rebuild/close/payout cache consistency, rebuild waiting for uncommitted journal cache delta, and monitoring above float32 precision.

## Explicit remaining work

Ordinary settlement still does not claim manual credits, journaled manual adjustments, or paid-batch MDR ledger corrections into a future payout. Its unbatched capture selection still requires the exact batch business date, so a capture committed after that day's close can remain stranded. These are confirmed preexisting settlement coverage gaps, not corrected by cache maintenance. Including them requires a durable claim contract for journal-only adjustments and a reconciliation attribution rule for carry-forward activity. Root review owns the decision on expanding this checkpoint; no payment/deployment state was changed by this review.

Final targeted checks: Go suite repeated with `-count=1` passed every package; `tsc -p scripts --noEmit` and `tsc -p apps/api --noEmit` passed; `git diff --check` passed. These results precede any further root changes and do not establish deployment or browser acceptance.
