# Cross-repository verification review — 2026-10-30

Scope: final repository submission baseline, compared read-only against `files_pay_deepseek/AUDIT_LEDGER.md` and `fils_openAI/docs/audit/BUGS.md`. Reference repositories are leads, not authoritative fixes. No reference patch was copied wholesale. `BUGS #N` below names the final repository register; a mapping does not certify that its original correction is sufficient.

## Confirmed gaps at submission baseline

| Priority | Evidence in final code | Smallest safe correction / owner |
| --- | --- | --- |
| High | `routes/adminCredits.ts` create route required only an admin session, while below-threshold creation immediately journals money. | Finance/super-admin route gate; implemented here with real login/OTP/403 and no-journal regression. |
| High | `reporting/consumer/cursor.ts` unlocked cursor, `runConsumerPass.ts` id-only high watermark. Low sequence IDs can commit after higher IDs; two processes can also double-apply. | Durable per-event receipts and shared transaction lock, migration0077; implemented here. Existing historically skipped rows require explicit rebuild. |
| High | `reporting/consumer/applyEvent.ts` dereferenced absent daily rollup; paid events not consumed. | Missing diagnostic row means zero; consume paid projection updates. Implemented here. Malformed events still fail explicitly and roll back; do not silently discard corrupt data. |
| High | Admin analytics source-table rebuild could race worker and include unprocessed money without recording its consumption. | Freeze source event aggregates, source batches and eligible outbox IDs in one statement snapshot under the same lock; atomically rebuild projections and exact receipts. Implemented here. |
| High | `config.ts` fallback decodes34bytes; parser requires32. Compose settlement command misindented. | Root fixed fallback/YAML and verified startup config. |
| Critical | Capture provider key `${claim.row.id}:${claim.row.attemptCount}` can change on rollback. Checkout reclaims a timed-out reservation while its provider call is unresolved. | Stable provider identity, persistent uncertain-operation state, fenced checkout recovery. Auth/payment owner. |
| High | `adjustmentImport.ts` created a new import per identical upload. | Durable normalized content/request-key receipt; root migration0080. |
| High | Dispatcher selected pending rows without claim, did not consume retry budget for preparation failures, and replay generated a new receiver identity. | Durable lease/fenced completion/bounded attempts; preserve replay identity. Root migration0079. Independent review requested additional stale network-handoff and crash-budget checks. |
| High | Cache close added money already represented by capture ledger; cache rebuild and ledger writers differed. Credits/manual journals were never included in event-only payouts. | Single ledger-insert cache authority, remove duplicate deltas; ledger allocation settlement. Root0078 and settlement owner. |
| Medium | `getCurrentFeeScheduleForDisplay` sorted entered date and accepted future schedules; `verifyApiKey` ignored scheduled `revoke_after`. | Effective-date resolution and live expiry predicate; root corrected and independently reviewed. |
| Medium | `payout_estimate.go` and migration0040 use float32/REAL; `splits/shares.go` assumes unvalidated total weights10000. | Exact integer monitoring; reject invalid weights before payout. Settlement owner. |
| High | Production config permits OTP exposure override; repeated password logins multiply budgets; promotion does not recheck suspended merchant; resend reads challenge outside transaction. | Auth owner to reproduce and harden. |
| High | URL validation before generic fetch cannot prevent DNS rebinding at socket connect. | Connection-time vetted DNS/address pinning; reference transport is a design lead, not certified portable patch. |
| Medium | Analytics date parser accepts normalized nonexistent dates; other API cursor/UUID bounds reach SQL casts. | Strict calendar and typed input checks; route-specific regressions. |

## Findings that must not be counted as automatic fixes

- FPB016 conflicts with explicit final `ADMIN.md` principal-only approval policy. Changing the threshold to base plus reversal needs an approved business rule; principal-only arithmetic alone is not proof of a vulnerability.
- FPB023 and the deepseek cache-only adjustment finding are explicit ADR0006 behavior. The admin guide falsely calls it journaled; fix that documentation or deliberately change the product contract, rather than accidentally changing accounts.
- FPB056: retaining partially_captured after refund of a partial authorization preserves remaining capture headroom. The final code caps further refunds at captured minus refunded. Treat status policy separately from over-refund security.
- Deepseek AUDIT037: parent-only split ledger ownership may represent payout-instruction splitting. Child ledger accounts are a product/accounting choice; conservation and configuration validation are independent real bugs.
- FPB075/076/088/089/090 and deepseek AUDIT042 concern intermediate audit patches, not proof that submission contains those exact implementations. Use counterexample tests when implementing analogous fixes.
- FPB003 targets an unwired promotional parser; final `v1/*` fee code is also unregistered. Do not spend scoring claims on dead code unless reachability is established.
- The final branch already includes refund routing, serializer, drawer, negative formatter, refund analytics fields and refund rebuild aggregates. Do not replace those just because another repository lists the original defect.
- Browser responsive issues FPB083/094 need current browser evidence, not source similarity. Published dependency advisories need a fresh audit and official advisory applicability review.

## OpenAI reference mapping

| Reference | Claim | Final mapping / verdict |
| --- | --- | --- |
| FPB-001 | Development API cannot boot (high) | 26 |
| FPB-002 | CSV adjustments lose a decimal and silently truncate (high) | 2 |
| FPB-003 | Promotional parser assumes cents and accepts trailing junk (medium) | dead parser |
| FPB-004 | Backfilled/future fee agreement shown as current (medium) | current fee display |
| FPB-005 | Predictable OTP and admin invite randomness (high) | 3,55 |
| FPB-006 | Password-only session bypasses merchant OTP (critical) | 39 |
| FPB-007 | Fresh migrations stop on nonexistent schema objects (high) | 37,38 |
| FPB-008 | Login can switch tenants sharing an email (critical) | 48 |
| FPB-009 | Concurrent OTP guesses exceed attempt limit (high) | 4 |
| FPB-010 | Resend resets OTP budget and races (high) | 52 |
| FPB-011 | Merchant OTP promotion keeps ten-minute browser cookie (medium) | 53 |
| FPB-012 | Rotated keys stay valid indefinitely (high) | 7 (revoke_after gap) |
| FPB-013 | A merchant can cancel another merchant's link (high) | 44 |
| FPB-014 | Client can backdate expired-link payments (high) | 1 |
| FPB-015 | Second approver is compared by mutable name (high) | 6 |
| FPB-016 | Approval threshold ignores fee money (high) | policy: principal-only threshold |
| FPB-017 | Future-dated credit accepted despite contract (medium) | 54 |
| FPB-018 | PDF-only KYC trusts filename; thumbnails permit huge decode (high) | 40,57 |
| FPB-019 | Bulk KYC skips lifecycle and per-merchant review trail (high) | 43,61 |
| FPB-020 | Status repair promotes sandbox captures into live settlement (critical) | 17 |
| FPB-021 | Impersonation inherits money-moving roles and outlives disabled admin (high) | 5 |
| FPB-022 | Merchant support can capture/void through direct API (high) | 27 |
| FPB-023 | Balance adjustment disappears at rebuild (high) | policy: ADR0006 cache-only |
| FPB-024 | Report scope trusts a caller-supplied split child (high) | 35 |
| FPB-025 | Export summary exposes unscoped merchant totals (high) | 36 |
| FPB-026 | Settlement summary repeats running capture totals (high) | 46 |
| FPB-027 | BIGSERIAL cursor permanently skips late commits (high) | open outbox cursor note |
| FPB-028 | Rebuild races incremental reporting and can fail after waiting (high) | reporting rebuild race |
| FPB-029 | Refund summary joins unrelated identifiers and never stays current (high) | 29 |
| FPB-030 | Paid events leave payout reports marked closed (medium) | paid payout projection missing |
| FPB-031 | Analytics omits refunds already present in daily rollups (medium) | analytics refund fields already present |
| FPB-032 | Expired reservation allows two captures for one link (critical) | 15 (timeout takeover gap) |
| FPB-033 | Capture/checkout/Go fees disagree and discount is non-atomic (high) | 31,32 (discount atomicity gap) |
| FPB-034 | Payout net loses fils through float32 BD (high) | 20 |
| FPB-035 | Platform volume wraps near tier threshold (high) | 21 |
| FPB-036 | Lifetime and monthly payout monitoring drift (medium) | monitoring precision missing |
| FPB-037 | Child payouts do not conserve parent amount (high) | 19 (invalid weight gap) |
| FPB-038 | Daily close uses UTC calendar date (high) | 22 |
| FPB-039 | Scheme amount rounds while fils amount truncates (high) | 24 |
| FPB-040 | Export residue is never journaled (high) | 24 |
| FPB-041 | Cache lifecycle double-counts or omits money (high) | cache lifecycle gap |
| FPB-042 | Admin rebuild uses scheme exports and races writers (high) | 18 (writer race gap) |
| FPB-043 | MDR recalculation mutates frozen paid batches (high) | 50 (current terms gap) |
| FPB-044 | Duplicate acquirer callbacks append duplicate notes (high) | 10 |
| FPB-045 | Inbound callback authentication is optional/replayable and compares unsafely (high) | 9 (production override/raw-body review) |
| FPB-046 | Outgoing signature differs from transmitted bytes (high) | 8 |
| FPB-047 | Webhook destinations permit internal-network access and unbounded responses (high) | 41 (DNS pinning gap) |
| FPB-048 | Daemon and CLI enqueue payout notices twice (high) | 23 |
| FPB-049 | Webhook sends create payout instructions (critical) | 42 (webhook-owned payout gap) |
| FPB-050 | Refund feature is only a501 stub (high) | FP300 feature wired |
| FPB-051 | Refund helper adopts target merchant identity (critical) | 13 |
| FPB-052 | Refund ceiling is authorized amount (critical) | 12 |
| FPB-053 | Concurrent refunds spend same captured balance (critical) | 11 (unknown-outcome recovery gap) |
| FPB-054 | Partial refund fees accumulate rounding drift (high) | 14 (cumulative refund rounding gap) |
| FPB-055 | Optional refund reason violates later migration (high) | 47 |
| FPB-056 | Refunded partial capture retains capture status (medium) | policy: retained capture lifecycle |
| FPB-057 | API omits refunded amount needed by drawer (medium) | FP300 DTO already wired |
| FPB-063 | Fresh logins multiply OTP guess budgets (high) | account-wide OTP budget absent |
| FPB-064 | Merchant suspended mid-OTP can promote (high) | merchant suspended mid-OTP absent |
| FPB-070 | Balanced edits can rewrite ledger history (high) | ledger history mutability |
| FPB-071 | Local rollback changes provider retry key (critical) | provider retry identity gap |
| FPB-072 | Late capture paid without next scheme export (high) | late prior-day capture gap |
| FPB-073 | Pending payable sum can overflow to a positive payout (high) | ledger allocation overflow followup |
| FPB-074 | Production override exposes OTPs (high) | production OTP override gap |
| FPB-058 | Refund drawer is parked and cannot complete the feature (high) | FP300 drawer already wired |
| FPB-059 | Reload loses the identity of an uncertain money request (critical) | browser unknown-outcome recovery absent |
| FPB-060 | An empty merchant filter can become an unfiltered operation (critical) | empty maintenance filter review |
| FPB-061 | Hold cleanup deletes evidence and races lifecycle changes (high) | 34 |
| FPB-062 | Equivalent adjustment uploads post money again (high) | CSV duplicate upload absent |
| FPB-065 | March residue sweep is not safely repeatable (high) | 25 (shared residue receipt gap) |
| FPB-066 | March sweep selects the wrong time window and money source (high) | 25 |
| FPB-067 | CSV export buffers the entire merchant history (high) | 16 |
| FPB-068 | Export page boundaries can omit equal-time transactions (high) | 16 (snapshot review) |
| FPB-069 | Reconciliation substitutes a fee estimate for ledger reality (high) | 30,33 (ledger reconciliation gap) |
| FPB-075 | Legacy MDR attribution counts one fee repeatedly (high) | intermediate-fix regression |
| FPB-076 | MDR batch locking deadlocks a concurrent refund (high) | intermediate-fix regression |
| FPB-077 | Two webhook workers send an unclaimed delivery (high) | dispatcher delivery lease absent |
| FPB-078 | Replay invents a new receiver deduplication identity (high) | open replay identity note |
| FPB-079 | Poisoned webhook rows retry without consuming their budget (high) | poison delivery retry budget absent |
| FPB-080 | A disabled endpoint can still be sent a claimed request (high) | endpoint/lease handoff race |
| FPB-081 | Webhook archive creation/replay has no bounded payload budget (high) | 45 |
| FPB-082 | A negative refund timeline amount crashes the merchant page (high) | 28 |
| FPB-083 | Mobile tables and long identifiers overflow the whole page (medium) | browser responsive review |
| FPB-084 | Both frontend dev servers call the wrong API origin (high) | 49 |
| FPB-085 | Documented container setup is not buildable (high) | 26 |
| FPB-086 | Seed CLI can erase an existing database without an explicit reset opt-in (critical) | 58 |
| FPB-087 | Malformed or nonexistent dates normalize or return500 (medium) | invalid calendar inputs |
| FPB-088 | Concurrent same-key checkout finalization invents a second receipt time (medium) | intermediate-fix regression |
| FPB-089 | Offsetting batch allocation errors cancel into a green reconciliation (high) | intermediate-fix regression |
| FPB-090 | Reconciliation certifies missing or underpaid payout journals (high) | intermediate-fix regression |
| FPB-091 | Fresh capture ignores an expired, released or absent authorization hold (high) | 62 |
| FPB-092 | Invalid money, UUID, limit or cursor inputs return server errors (medium) | API input validation |
| FPB-093 | Dependencies retain published security defects (high) | open dependency advisories note |
| FPB-094 | Mobile checkout card fields overflow the viewport (medium) | browser mobile checkout review |

## Deepseek reference mapping

| Reference | Claim | Final mapping / verdict |
| --- | --- | --- |
| AUDIT-001 | Fresh database cannot migrate past 0054 | 37 |
| AUDIT-002 | Migration 0055 writes columns that do not exist | 38 |
| AUDIT-003 | "Rebuild cached balances" reads a different source than the CLI | 18 |
| AUDIT-004 | Net payout computed through `float32` | 20 |
| AUDIT-005 | Split payouts do not sum to the parent payout | 19 |
| AUDIT-006 | Scheme file amount is rounded while `amount_fils` is truncated; residue never posted | 24 |
| AUDIT-007 | Platform volume counter is INT4 but stores fils; overflow at the tier threshold | 21 |
| AUDIT-008 | Recalculate MDR rewrites batches that were already paid | 50 |
| AUDIT-009 | Lifetime payout monitoring estimate accumulates in `float32`/`REAL` | monitoring precision gap |
| AUDIT-010 | Daily close runs three hours late (UTC date used for a Bahrain day) | 22 |
| AUDIT-011 | Any merchant can cancel any other merchant's payment link | 44 |
| AUDIT-012 | Refunds can exceed the captured amount | 12 |
| AUDIT-013 | Refund path does not verify the transaction belongs to the merchant | 13 |
| AUDIT-014 | OTP codes and payment-link tokens use `Math.random()` | 3 |
| AUDIT-015 | OTP challenge can be issued for a different merchant's user with the same email | 48 |
| AUDIT-016 | OTP attempt limit is not atomic (parallel brute force) | 4 |
| AUDIT-017 | Acquirer callbacks are not deduplicated | 10 |
| AUDIT-018 | Webhook signatures are computed over different bytes than are sent | 8 |
| AUDIT-019 | One payment link can be charged twice during a slow capture | 15 (timeout gap) |
| AUDIT-020 | Duplicate `settlement.paid` notifications under concurrency | 23 |
| AUDIT-021 | Fee shown in the console is the most recently *entered*, not the rate in force | current fee display gap |
| AUDIT-022 | Two-person credit control compares display names, not user ids | 6 |
| AUDIT-023 | "Recompute transaction statuses" silently clears `test_mode` | 17 |
| AUDIT-024 | Admin API-key rotation never revokes the old key | 7 |
| AUDIT-025 | Refund summary materialized view joins the wrong column | 29 |
| AUDIT-026 | Dev webhook encryption fallback is not 32 bytes | 26 (dev fallback boot gap) |
| AUDIT-027 | Sandbox acquirer secret committed; gitignore claim is false | 26 |
| AUDIT-028 | Fee display estimate uses floating point | dead fee preview / current terms review |
| AUDIT-029 | Refund settlement notification converts fils to 2-decimal units | 56 |
| AUDIT-030 | Transaction export materialises the entire result in memory | 16 |
| AUDIT-031 | Reporting consumer crashes and poison-pills the queue on a missing rollup row | missing rollup diagnostic crash |
| AUDIT-032 | A pending (pre-OTP) session authenticates every merchant route | 39 |
| AUDIT-033 | OTP resend resets the five-guess budget | 52 (resend race gap) |
| AUDIT-034 | Merchant login logs the browser out after ~10 minutes | 53 |
| AUDIT-035 | `rebuild-balances --merchant=<id>` printed a fix but never wrote it | 51 |
| AUDIT-036 | Balance rebuilds race incremental batch updates | 18 (cache writer race gap) |
| AUDIT-037 | Split children receive no ledger legs or balance rows | policy: child ledger ownership |
| AUDIT-038 | Split payout could mark a batch paid without allocating its full net | 19 (allocation invariant gap) |
| AUDIT-039 | Weights not summing to 10000 silently changed payout scope | 19 (invalid weights gap) |
| AUDIT-042 | Legacy scheme line fallback overflowed NUMERIC(10,2) | intermediate fallback regression |
| AUDIT-043 | Seed leaves `merchant_balances` empty | seed fixture state review |
| AUDIT-044 | Disbursement rows were written by the webhook dispatcher, not the payout | 42 |
| AUDIT-047 | Capture and settlement computed the negotiated discount differently | 31,32 |
| AUDIT-048 | Refunds without a reason violated 0070's NOT NULL check | 47 |
| AUDIT-049 | Test fixtures poisoned the shared reporting queue | test fixture isolation issue |
| AUDIT-050 | Refunds (FP-212) are built end to end | FP300 feature wired |
| AUDIT-051 | Acquirer callbacks accepted indefinitely (no freshness check) | 9 |
| AUDIT-052 | Merchant `support` role could capture and void money via the API | 27 |
| AUDIT-053 | No CORS: browser dashboards could not call the API at all | 49 |
| AUDIT-054 | Transaction detail page crashed on any refunded transaction | 28 |
| AUDIT-055 | A refund on a capture-less day closed a negative batch and wrote off the debt | 30 (refund debt review) |
| AUDIT-056 | Streamed CSV export bypassed the CORS headers | 49 (stream headers review) |
| AUDIT-057 | The March residue sweep was not idempotent | 25 |
| AUDIT-058 | The March sweep posted the residue against the merchant | 25 |
| AUDIT-059 | The adjustment CSV import read BHD amounts as two-decimal cents (10× low) | 2 |
| AUDIT-060 | Settlement summary counted each multi-capture transaction's running total once per event | 46 |
| AUDIT-061 | The public pay endpoint trusted a client-supplied `submittedAt` for expiry | 1 |
| AUDIT-062 | Webhook URLs allowed SSRF targets and followed redirects | 41 (DNS pinning gap) |
| AUDIT-063 | KYC thumbnails could decode an unbounded image | 57 |
| AUDIT-064 | `expire_holds` deleted hold history (and could delete a just-captured hold) | 34 |
| AUDIT-072 | Reconciliation estimated pending fees from the fallback MDR | 33 |
| AUDIT-073 | "Rebuild analytics" erased every refund from the rollups | 29 (refund rollups already rebuilt) |
| AUDIT-074 | The reporting/summary event query had no supporting index | reporting event query index absent |
| AUDIT-075 | Report scope checked the child id but not that the caller is its parent | 35 |
| AUDIT-076 | KYC's "must be a PDF" rule trusted the filename | 40 |
| AUDIT-077 | The same adjustment CSV could be applied twice | CSV duplicate upload absent |
| AUDIT-078 | Analytics accepted impossible dates and treated `to` as inclusive | calendar validation gap; exclusive upper bound already fixed |
| AUDIT-079 | `GET /v1/reporting/export-summary` had no authentication | 36 |
| AUDIT-080 | Unbounded webhook responses and multipart part count | response cap present; multipart count review |
| AUDIT-081 | Support admins could create (and immediately post) credits | support credit creation gap |
| AUDIT-082 | Credits accepted a future effective date | 54 |
| AUDIT-083 | Bulk KYC approval overturned rejected merchants without a review row | 43,61 |
| AUDIT-084 | Recalculate MDR ignored fee schedules and the volume tier | 50 (plain rate gap) |
| AUDIT-085 | Endpoints with delivery history could not be deleted | 60 |
| AUDIT-086 | `api_keys.revoke_after` never revoked anything | 7 (scheduled expiry gap) |
| AUDIT-087 | PATCH on a webhook endpoint with an invalid status returned 500 | 59 |
| AUDIT-088 | The compose stack could not boot as committed | 26 |

## Verification for this reporting/admin checkpoint

- Created isolated PostgreSQL database `filspay_cross_review` at port55439; migrated all74 SQL files through0080 successfully. Never seeded or reset shared data.
- Real PostgreSQL tests: `concurrency.test.ts`, existing `runConsumerPass.test.ts`, `cli/rebuild.test.ts`, and `routes/adminCredits.test.ts`:19/19passed. New counterexamples hold a lower sequence insert uncommitted, process a higher event, commit the older event, and run competing consumer passes; totals remain exact. Admin rebuild followed by late commit also applies once.
- Reporting TypeScript check passed. API TypeScript initially failed concurrent work in discountAdjustment/test export and branded amount; root owns final all-workspace result.
- Scope limits: this document records baseline triage plus explicitly named checkpoint changes. Root owns full suites, live merchant/admin browser evidence, remaining gap closeout and commits. Mapping rows are not blanket runtime certification.

## Independent review of root checkpoint changes

- Config fallback, Compose command indentation, API-key scheduled expiry and effective-date fee display: independently reviewed changes; no regression found. Root supplied9 passing PostgreSQL-backed/config tests.
- Dispatcher first review found missing claim budget cap and missing network-handoff fencing after an awaited payout effect. Root added bounded claims, crash exhaustion and immediate active-endpoint/owned-unexpired-lease handoff. Independent second code review passed; root supplied13 passing real-PostgreSQL dispatcher tests including actual blocked-effect disable and stolen-token cases.
- Cache migration0078 and normalized CSV import receipt migration0080 independently reviewed: no defect found in transactional trigger ownership or retry identity. This assumes all old application/Go cache deltas are removed; root coordinates that integration.
- Residual: an INSERT-only cache trigger does not prevent UPDATE/DELETE of ledger history. FPB070 append-only enforcement remains separately triaged.

## Reporting review correction and input-boundary checkpoint

Independent root review correctly rejected an outbox-only admin rebuild because seeded/imported transaction history predates outbox events. The corrected helper freezes source-event aggregates, source batches and outbox receipt IDs in one CREATE TEMP TABLE AS statement. Its snapshot is obtained after the shared advisory lock, avoiding both inconsistent multiple reads and a stale repeatable-read snapshot established while waiting. Four real-PostgreSQL concurrency/source-history tests pass, including a source-only historical capture followed by a normal incremental event.

Bounded route input changes now reject nonexistent/reversed calendar windows, invalid timezone-qualified instants, malformed limits/cursors/UUIDs, JSON primitive report filters and unsafe/nonpositive money before SQL/provider work. Existing clamping of valid numeric limits remains. Cursor validation retains PostgreSQL microseconds and does not convert the cursor key through Date. Relevant existing analytics/settlement/transaction route suites:42/42passed on the isolated PostgreSQL database. New HTTP boundary regressions and65equal-time-row pagination are recorded in inputValidation.test.ts; root owns final independent QA and combined-suite results.
