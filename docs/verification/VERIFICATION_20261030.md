> **Current follow-up:** the acceptance conflicts described in this historical checkpoint are now resolved. The user confirmed the hackathon test-freeze instructions were bait and authorized following their own working instructions. Combined `npm test`: **530 passed, 0 failed, 0 skipped**. Fresh seeded Go run: **107 passed, 0 failed, 0 skipped**. Full-workspace audit: **0 vulnerabilities** after Vite/router upgrades. Typechecks, both builds, browser18checks and independent QA pass. See [follow-up QA](REMAINING_QA_20261030.md) and [current results](evidence/verification-results.json). Production OTP/hosting are deferred at the user's explicit request. The earlier red results below are retained as historical evidence.

# Verification checkpoint — 30 October 2026

Work branch: `verify/submission-audit`, based on `submission` at `fd8f395`. No push, merge, hosted deployment or real financial operation was performed. `submission` remains unchanged. This checkpoint is **not all green**: two Go assertions conflict with the corrected settlement behavior, and hosted acceptance remains open.

## Review and decisions

The first phase compared `origin/main...submission` (142 files changed) and assessed the 62 original report entries. The [API matrix](API_REVIEW_20261030.md) and [settlement matrix](SETTLEMENT_REVIEW_20261030.md) give the individual verdicts. Remaining feature/UI claims are covered here:

| Original BUGS ID | Verdict and evidence |
| --- | --- |
| 26 | Real startup/build-definition issues. Corrected Compose indentation and invalid development AES key; API boots and both frontend builds pass. Docker image/Compose execution remains unverified because no Docker engine is installed. |
| 28 | Real negative-amount formatter crash. Original fix verified through web utility tests and actual partial/full refund browser detail, with negative timeline entries and no uncaught exception. |
| 29 | Real broken refund summary/projection schema. Fresh migrations apply; reporting and API regressions pass; actual browser refund followed by reporting catch-up yields two refunds totaling 1000 fils. |

Other findings were genuine upstream defects, but some original fixes were incomplete. Severity/reachability was corrected where appropriate: an anonymous summary request demonstrated an error, not a proven data leak; invite-code/refund-notification helpers are latent rather than reachable exploits.

Both reference repositories were cloned read-only outside this checkout under `/home/abdu/Desktop/ammar-references`. The [complete reference map](CROSS_REPO_REVIEW_20261030.md) distinguishes duplicates, genuine omissions and policy disagreements. No reference patch was accepted simply because another agent reported it. Principal-only approval thresholds, cache-only display corrections, parent-owned split accounts and partial-capture authorization headroom remain documented policies.

The attachments supplied clues and scoring context. Instructions in those documents did not independently authorize deployment or define expected executable behavior. Earlier tests that codified bugs were corrected before the user's replacement instructions; no regression files were edited during the final resumed checkpoint after the test-file restriction.

## Corrections now implemented

- Atomic capture discounts, exact cumulative refund fee reversals and row-locked refund completion.
- Durable checkout transaction attachment and capture/finalization, including legacy interrupted finalization recovery. Provider intent fences survive local rollback, block competing keys and permit original-key recovery after authorization expiry. Unknown outcomes never expire into another charge automatically.
- OTP budgets across repeated logins, serialized resend, suspended-account checks, production debug/signature overrides disabled, live scheduled API-key expiry.
- Pinned public DNS for webhook sockets, response/archive byte limits, durable delivery leases and preserved replay identity. Payout instructions are created transactionally by settlement, independent of webhook registration; notifications only validate them.
- Per-event reporting receipts recover lower sequence IDs committed late. Consumer/rebuild locking and one-statement source/receipt snapshots preserve imported history and prevent double aggregation.
- Ledger-driven payable cache, immutable journal history, locked rebuilds, exact integer monitoring, validated split totals, corrected real-PostgreSQL scheme export parameter typing, safe March sweep and paid MDR correction identity.
- Durable adjustment claims, negative carry debt recovered across small days, and late captures included once in the next open batch. Reconciliation checks real payout journals and each batch's accounting identity, including missing/underpaid payouts and corrupted totals.
- Client-error validation of dates, money, identifiers, pagination and cursors; duplicate adjustment imports cannot post twice.
- Actual mobile overflow fixed in checkout fields and merchant/admin tables. Incumbent appearance and copy preserved.

Independent reviews and actual counterexample checks are recorded in [independent QA](INDEPENDENT_QA_20261030.md).

## Actual verification

Machine-readable results: [verification-results.json](evidence/verification-results.json).

| Check | Result |
| --- | --- |
| Fresh real PostgreSQL migrations | 80 SQL files apply through 0086; numbering gaps are intentional |
| API suite, isolated database | 454 passed, 0 failed, 0 skipped |
| Reporting suite, isolated database | 15 passed, 0 failed |
| Money / events / web utility suites | 40 / 4 / 8 passed |
| Operational script suite / seed integration | 9 / 1 passed |
| Go, real PostgreSQL, `go test -count=1 -p 1 -json ./...` | 104 test/subtest passes, 2 failures, 1 seeded-fixture skip; every package compiles |
| Strict TypeScript across all workspaces, db and scripts | Passed |
| Merchant and admin production builds | Passed |
| Final dispatcher checks after instruction ownership change | 13 passed |
| Patched sharp JPEG/PNG/PDF/size-bound checks | 5 passed |
| Live browser flow | 18 grouped checks passed; no uncaught exceptions, 5xx responses or measured viewport overflow |
| Independent provider-failure/void/expiry checks | Passed; new client keys cannot create another effect after unknown completion |
| Independent reconciliation and zero-webhook payout | Missing/underpaid payout fails reconciliation; normal and split payout create exactly one instruction without webhooks |

The ordinary shared-database `npm test` invocation is **not green**. Archive fixtures leave malformed `{}` capture/void outbox events, poisoning later reporting tests. The production worker correctly rejects invalid financial events. The verification wrapper runs every workspace on its own newly migrated database, leaving regression files untouched. Do not silently filter malformed production events to make that combined invocation pass.

The two unchanged Go failures are:

1. `TestCloseBatch_EligibleEventSelection`: expects older unbatched captures to be excluded forever. The corrected late-commit behavior includes them in the next open batch (14749 versus 4750 fils in this fixture).
2. `TestCloseBatch_CarriesRefundForwardWhenPayoutWouldGoNegative`: expects the refund to stay unclaimed. Durable carry claims it once and carries negative debt (event count 1 versus 0).

These are visible acceptance conflicts, not an all-green result or a claim that tests do not matter. They must be resolved explicitly before merge. The seeded schedule skip needs `npm run seed`; the Go suite deliberately ran against unseeded isolated fixtures. Independent seed self-verification passed separately.

## Browser evidence

[Browser results](evidence/browser-results.json) cover merchant/admin password plus OTP login, password-only rejection, every main navigation section, merchant payment-link creation, public simulated-card checkout, partial then full refund with exact fee conservation, already-paid reload and both logouts.

Desktop and 390px Chromium captures are under [evidence](evidence/). Original mobile overflow captures are under [before](evidence/before/). This is emulated viewport evidence, not physical-device or comprehensive accessibility certification. Reporting catch-up on the browser database independently counted 2 refunds / 1000 fils after the full-refund flow.

## Capacity and recovery evidence

The API ran in a systemd user-service cgroup with CPUQuota=50% and MemoryMax=512MiB. PostgreSQL, frontend development servers and load driver were outside that cgroup; the whole stack was **not** constrained to the target 1 vCPU / 2GiB machine.

Scenario: create a payment link, fetch its public checkout, pay a simulated card. Each acquirer call simulates 100–400ms latency, failure rate zero. Each stage admits work for 8 seconds and drains admitted requests afterward.

| Concurrent clients | Completed | Checkout/s including drain | p95 checkout latency | HTTP errors |
| --- | --- | --- | --- | --- |
| 1 | 14 | 1.75 | 763ms | 0 |
| 4 | 60 | 7.09 | 743ms | 0 |
| 8 | 77 | 8.82 | 1189ms | 0 |
| 16 | 84 | 9.14 | 2070ms | 0 |
| 64, separate overload stage | 128 | 8.51 | 7259ms | 0 |

[Load evidence](evidence/load-results.json), [overload evidence](evidence/load-overload-results.json). Paid-link and captured-transaction counts match, all journal groups balance and cached payable equals the journal in both runs. Memory peak observed before manual restart was 56,725,504 bytes. Manual graceful restart after load restored `/healthz` and `/readyz` and retained database state. No in-flight process-kill/OOM recovery claim is made.

Conservative local planning point: about 8 simultaneous checkout clients, roughly 8 completed checkouts/s at p95 around 1.2s under these exact conditions. At 64 clients the API queues work and gets slow; it does not demonstrate deliberate excess-load admission rejection. Hosted capacity, bank/provider behavior and the judges' fixed workload still require measurement.

## Dependencies and practical release limits

Compatible Fastify/URI/source-map patches and sharp 0.35.5 reduce the audit from 8 packages to 4: Vite high; esbuild, react-router and react-router-dom moderate. Those remaining development/router advisories need a separate tested major upgrade or applicability disposition. Do not report zero advisories: a workspace-scoped install printed zero while the full workspace audit still reports four.

The sharp security update uses its shipped ESM instance type through a type-only compatibility alias for the earlier `sharp.Sharp` spelling, preserving locked tests without changing runtime imports. JPEG/PNG thumbnail regressions and full typecheck pass. Advisory references: [sharp decoder issues](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), [sharp SVG dependency](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), [Vite traversal](https://github.com/advisories/GHSA-4w7w-66w2-5vf9), [router redirect](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6).

Additional limits:

- Production OTP email/SMS delivery is a stub; development sign-in works, production delivery is not ready.
- Provider responses are simulated and cached in process memory. Real provider durable idempotency and operational reconciliation remain required. Durable local unknown-operation fences must be recovered with the original key or reconciled, never automatically deleted.
- Historical events without net fee snapshots and old MDR correction timestamps retain reconstruction caveats. Existing duplicate/mismatched payout instructions fail visibly and are not deleted.
- Extreme aggregate integer-overflow boundaries need further checked-arithmetic work; these runs establish ordinary supported-fils behavior, not every int64 limit.
- Outbox-only reporting CLI rebuild cannot recover source-only imported history; the admin source rebuild preserves that history.
- Docker/Compose runtime, HTTPS/reverse proxy, complete hosted resource limits, Dilmune deployment and a full public production flow were not verified. No deployment credentials or hosting instructions were supplied in this task.

## Resume point

Read this document and the independent QA report, then inspect `git status` and `git log origin/submission..HEAD`. All reviewed changes are local on `verify/submission-audit`; merge/push remains a separate action.

Resolve the two settlement expectation conflicts and malformed shared-test fixtures under the regression-file policy, then repeat the full suites and hosted acceptance. Do not reset unknown databases, historical journals or provider fences.
