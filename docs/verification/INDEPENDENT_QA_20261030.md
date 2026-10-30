# Independent checkpoint QA — 2026-10-30

Review performed against the current `verify/submission-audit` worktree. This is independent review and counterexample testing, not a claim that all code in the repository is correct. The root agent owns full-suite, deployment and browser acceptance evidence.

## Actual independent checks

Used a fresh isolated PostgreSQL database `filspay_cross_final` on local port55439. Migrations were applied before checks. No shared data was reset. Diagnostic scripts executed from `/tmp`; no new regression-test edits were made after the user's test-file restriction.

| Area | Evidence | Verdict |
| --- | --- | --- |
| Provider unknown capture/refund | Independent simulated remote approves then throws, causing local rollback. Before migration0086, another client key produced two distinct remote effects. After fence patch, competing keys reject with `provider_operation_unresolved`; exactly one effect remains. | Fixed and independently exercised. |
| Hold-expired original-key capture recovery | Remote approval/response loss, then expire local hold, retry original identity. Before fence patch409; afterward200 with same provider identity and one effect. | Fixed and independently exercised. |
| Auth/account budget and authorization retry | Existing `app.test.ts` and `providerRetry.test.ts` run independently against isolated PostgreSQL:18/18passed. Includes account budget across login restarts, suspension before OTP and stable authorization identity. | Passed; production OTP delivery remains a stub. |
| DNS transport and HTTP boundaries | Existing transport and inputValidation suites run independently:10/10passed. Actual socket uses pinned address, private/mixed DNS rejected, redirect not followed, response64KiB, stalled DNS bounded. Six HTTP input groups include65equal-time pagination rows. | Passed for these counterexamples. |
| Root configuration/key/display | Independently reviewed fallback32byte key, Compose syntax, scheduled key expiry and current effective-date schedule. Root targeted9tests passed. | No defect found. |
| Root dispatcher | First independent review found stale network handoff and exhausted-lease budget holes. Root corrected; re-review verifies token+unexpired lease+active endpoint immediately before handoff, fenced completion and bounded crash recovery. Root13tests passed. | No remaining defect found in reviewed lease behavior; at-least-once semantics still require receiver dedupe. |
| Root CSV/cache | Reviewed normalized receipt transaction, explicit-key mismatch, single ledger-insert cache authority and removal of duplicate deltas. Append-only ledger migration0083 protects INSERT-only cache assumption. | No defect found in reviewed changes. |
| Reporting/admin | Independent root review caught outbox-only rebuild erasing imported history. Replaced with one statement snapshot of source aggregates, batches and exact outbox receipt IDs after advisory lock. Four actual concurrency/source-history checks pass. Earlier full isolated reporting14/14 and admin/reporting19/19passed. | Root re-review required final combined suite. |

## Concrete remaining blockers at review time

1. **Void during an unresolved capture.** The new provider fence blocked another capture/refund but `voidTransaction` initially ignored it. A local authorized transaction could be voided after remote capture approval/response loss, preventing original-key recovery through the state gate. API owner added the check under its existing transaction lock. Independent temporary sequence now verifies void409 followed by successful original-key recovery; no product state is discarded.
2. **Reconciliation can certify a missing payout journal.** Independent PostgreSQL fixture: capture1000, fee25, valid capture ledger and event, batch marked paid975, but no payout legs. `getReconciliationReport` returned `explained:true`, `gapFils:0`, `periodBatchPayoutFils:975`. Current event-derived arithmetic bridge cannot certify actual payouts. Settlement owner added repeatable-read integrity checks using absolute per-batch differences for payout cash/payable legs, capture/adjustment claims, carry and frozen arithmetic. Independent rerun of the identical fixture now returns explained:false and settlementIntegrityGapFils1950. This counterexample is closed.
3. **Webhook delivery still owns payout instruction creation.** The dispatcher retains its `settlement.paid` pre-delivery business effect. Although advisory dedupe prevents duplicates, a merchant without a webhook endpoint receives no instruction, and notification scheduling incorrectly owns a financial action. Closed in final follow-up: normal and split Go payout transactions now call payouts.EnsureInstruction atomically. Dispatcher only validates existing count and amount, under the shared advisory lock; it does not create an instruction.

## Honest limits and policy distinctions

- The simulator caches provider responses in process memory. Stable keys plus durable local fences prevent the tested local retry hazards; they do not establish a real acquirer's durability or survive a simulator restart as an external rail would.
- There is an unavoidable conservative interval between committed provider intent and network handoff. Such uncertain intents must not expire into a fresh charge automatically; reconciliation or original-key recovery is required.
- Settlement0085 claims real journal adjustments and tracks negative carry, preserving cache-only display adjustments outside payouts. Claim totals currently use int64 addition without explicit checked overflow; that extreme-boundary concern remains separate from ordinary-fils correctness.
- Final principal-only credit approval threshold, cache-only display adjustment (ADR0006), retained partial-capture headroom after refunds and parent-owned split ledger are documented policy decisions. Reference disagreements alone do not justify changing them.
- Full shared-database `npm test` exposed malformed synthetic outbox payloads from `webhooks/archiveReplay.test.ts` helper, causing later reporting rebuild/consumer failures. The worker correctly rejects malformed money events. Run workspaces on independently migrated databases; do not silence production validation to accommodate fixtures. User now forbids regression-file edits.
- An earlier diagnostic draft used unsupported refund actor `system`; it was moved from build-discovered source to `repros/independent-money-safety-draft.ts.txt`. The executed temporary reproduction uses the supported `merchant_api_key` actor. No product type was widened to accommodate the draft.

## Browser and CSS review

Root's browser artifact `evidence/browser-results.json` reports merchant/admin password+OTP, pending-session rejection, navigation, checkout, partial/full refund and logout checks, with no console/server errors or viewport overflow in its measured pages. Screenshots include390pxcheckout, merchant/admin tables and desktop refund detail. CSS changes make checkout grid columns shrinkable and contain mobile table overflow; desktop/mobile browser evidence is root-authored, not independently rerun in this checkpoint. Tables converted to overflow blocks should additionally retain reachable keyboard scrolling if their contents extend beyond the viewport; this is a bounded accessibility follow-up, not evidence of monetary failure.

### Provider-fence final follow-up

The API owner also protects attached checkout recovery from cancellation and permits expiry recovery only where an attached transaction has a durable unknown-operation fence or captured money. Code review confirms fresh expired links still cannot authorize a charge. Fence claims use one serialized short independent PostgreSQL connection, avoiding a second-slot deadlock while the application pool is saturated. This adds one bounded connection beyond the main pool and must be included in database connection sizing.

Root's first combined `npm test` result was not green: API453/454 and reporting13/15. The reporting failures were malformed `{}` captured/voided events from archive fixture helper, not numeric backlog exhaustion. Existing clean-workspace results must be reported separately from that combined invocation; isolated-workspace verification is the safe workaround while regression tests are locked.

Final isolated reporting workspace rerun against the rebuilt PostgreSQL database:15/15passed. Final independent unknown-money counterexamples:3/3passed, including different-key capture/refund rejection, void409 during unknown capture, and original-key recovery after hold expiry. Diagnostic assertions check typed application error codes or returned status according to each helper's actual contract.

## Final payout ownership review

Independent final source review approves the normal/split payout instruction ownership change. EnsureInstruction runs before payout transaction commit, validates historical existing count/amount and creates one positive instruction. Dispatcher has no insertion path and only validates instruction consistency. Both use the same batch advisory key.

Actual independent no-webhook CLI reproduction on filspay_cross_final: created an approved merchant with zero webhook endpoints and posted a balanced1009fils manual correction. `run-batch --date=2026-10-29 --merchant=...` closed and paid net1009; SQL verified status paid, endpoints0, instructions1, instructed1009. Repeating the same CLI command returned alreadyClosed=true/alreadyPaid=true and enqueued0paid events. This closes the instruction-ownership blocker without relying on a webhook delivery.

Root's final source-runtime overload log shows128completed at concurrency64,8.51checkouts/second,p50approximately6.84s,p95approximately7.26s,and no recorded HTTP errors. These are local measurements, API was locally constrained through a systemd cgroup to0.5CPU/512MiB, while this is not evidence of the required hosted full-stack resource constraint or a guaranteed admission-capacity limit. Root reports isolated API454passing and other workspace passes; two old Go assertions remain failing under the locked-test policy and must remain visible in the final handoff. No all-green Go claim is made here.

All concrete independent money-safety blockers discovered in this checkpoint have now received reviewed corrections. Remaining practical limits are production OTP transport, real provider integration/durable remote idempotency, hosted resource-limit/load acceptance, and the explicitly recorded locked-test and historical-data caveats.

## Dependency checkpoint independent review

Reviewed local commit39de897: patched sharp0.35.5 and compatible Fastify/fast-uri/source-map-js updates are lockfile-backed. The sharp legacy declaration is a compile-time alias for the package's exported Sharp instance type; it introduces no runtime shim or decoder bypass. Its global namespace is deliberately narrow but can be removed once frozen consumers adopt named types. Independent existing KYC thumbnail suite:5/5passed, covering JPEG resize, PNG-to-JPEG, no enlargement, PDF no-op and pixel-limit rejection. Root reports full strict typecheck success.

Final npm-audit metadata was read directly:4affected package entries,1high and3moderate,0critical. These are Vite(high), esbuild(moderate), react-router(moderate) and react-router-dom(moderate); package entries are not four independently exploitable paths. Official [esbuild advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99) confirms moderate severity and development-server exposure; [React Router maintainer advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6) confirms moderate untrusted-navigation open redirect and affected6.xversions. The SSR hydration advisory does not by itself establish reachability in these declarative SPAs. Vite's aggregate high severity includes Windows-specific launch-editor issues; Fedora reduces those particular paths but does not eliminate its other development-server advisories. No blanket security-clearance claim is justified. Major tool/router updates are intentionally deferred at this deadline with residual findings explicit.

Final root-reported Go result:104passed,2failed,1skipped; the skip and the two locked historical assertion failures remain visible rather than counted as successful tests. Browser final18checks and both local load runs remain separate runtime evidence.
