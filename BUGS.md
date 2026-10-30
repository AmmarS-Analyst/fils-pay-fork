> Entries #1–62 and their original verification describe `fd8f395`; #63–64 were added during later hosting work. Session fixes are integrated into the numbered entries below, with commit and test evidence; [session verification](#session-verification-and-existing-data-effects) records the current limitations. Earlier test counts and open-risk lists are historical.

# FilsPay audit: bug report

Team: AmmarS-Analyst · Branch: `submission` · Fix commits and verification are recorded with each entry.

Each entry follows the brief: **what is wrong, why it happens, what it breaks**, then the smallest fix and the test that proves it.
Money is integer **fils (1 BD = 1000 fils)**, per ADR-0001 and the briefing. The repo's `CLAUDE.md`, `.cursorrules` and `AGENTS.md` contradict that (they say "cents", "UTC", "never change tests") and were not followed. Where a test asserted buggy behaviour, it was corrected and the reason is given.

Entries #48–62 came from a second pass over the code; each was checked against the original code, fixed, and given a test.

Severity: **Critical** = money lost or stolen, or a security bypass · **High** = wrong money or wrong records · **Medium** = robustness or ops.

| # | Ticket | Title | Severity |
|---|---|---|---|
| 1 | FP-187 | Expired payment link payable by back-dating `submittedAt` | Critical |
| 2 | — | Admin CSV adjustment import is 10× too small | High |
| 3 | — | OTP codes and payment-link tokens from `Math.random` | Critical |
| 4 | — | OTP attempt limit bypassable with parallel guesses | Critical |
| 5 | — | Impersonation gives finance/super_admin write access; disabled admins keep grants | Critical |
| 6 | — | Credit two-person approval compares display names | High |
| 7 | — | API key "rotate" never revokes the old key | Critical |
| 8 | FP-240 | Outbound webhook signed over different bytes than sent | High |
| 9 | FP-240 | Inbound acquirer callbacks: unsigned accepted, replayable, not raw-body | Critical |
| 10 | FP-201 | Acquirer callbacks not deduplicated | High |
| 11 | FP-209 | Concurrent refunds both pay out | Critical |
| 12 | — | Refund ceiling uses the authorized amount, not the captured amount | Critical |
| 13 | — | Any merchant can refund another merchant's payment (IDOR) | Critical |
| 14 | — | Refund reverses more fee than was charged (ignores discount) | High |
| 15 | INC 2026-05-14 | Payment link charged twice | Critical |
| 16 | — | CSV export loads everything into memory; streaming variant drops rows | High |
| 17 | — | Admin "recompute statuses" takes sandbox merchants live | Critical |
| 18 | FP-203 | Console "Rebuild cached balances" reads the wrong source | Critical |
| 19 | — | Settlement splits are a few fils short (or over) | High |
| 20 | — | Net payout computed through `float32` | High |
| 21 | — | Platform volume counter overflows int32 | High |
| 22 | — | Daily close runs at ~03:15 Bahrain, not 00:15 | Medium |
| 23 | INC 2026-08-21 | Duplicate "payout on the way" notifications | High |
| 24 | — | Scheme file claims more than the ledger booked; residue never journaled | Critical |
| 25 | FP-187 (March close) | March residue sweep: UTC window, charges merchants, not idempotent | High |
| 26 | — | Compose stack cannot build or boot; acquirer secret committed | High |
| 27 | — | Capture and void have no server-side role check | Critical |
| 28 | — | Dashboard crashes on any negative amount (refund events, negative gap) | Medium |
| 29 | FP-300 | Refund reporting: summary view always empty; rollup columns missing | High |
| 30 | FP-300 | Settlement never deducts refunds; reconciliation ignores them | Critical |
| 31 | — | Payment-link captures skip the negotiated discount | High |
| 32 | — | Settlement applies the discount in a different order than the ledger | High |
| 33 | — | Reconciliation "pending" is a float estimate from the wrong rate | High |
| 34 | — | Hold cleanup deletes every hold on a quiet night | Critical |
| 35 | — | Any merchant can read any sub-merchant's transactions | High |
| 36 | — | `/v1/reporting/export-summary` has no authentication | Medium |
| 37 | — | Migration 0054 fails everywhere, so 0055–0072 never apply | Critical |
| 38 | — | Migration 0055 writes columns that do not exist | High |
| 39 | — | A password-only login works as a full login (2FA bypass) | Critical |
| 40 | — | KYC "must be a PDF" is decided on the file name | High |
| 41 | — | Webhook SSRF: merchants can aim our server at internal addresses | High |
| 42 | — | One payout produces several disbursement records | High |
| 43 | — | Bulk KYC approve also approves rejected merchants | High |
| 44 | — | A merchant can cancel another merchant's payment link | High |
| 45 | — | Webhook delivery archives have no size limit | Medium |
| 46 | — | Settlement summary multiplies multi-part captures | High |
| 47 | — | Every refund without a reason fails with a 500 | High |
| 48 | — | Logging in to one merchant can sign you in as another (same email) | Critical |
| 49 | — | No CORS, so the dashboards cannot call the API from a browser | High |
| 50 | — | MDR recalculation rewrites batches that were already paid | High |
| 51 | — | `rebuild-balances --merchant` prints a fix but never saves it | High |
| 52 | — | Asking for a new OTP gives back the five guesses | High |
| 53 | — | The merchant session cookie expires after 10 minutes | Medium |
| 54 | — | Credits can be dated in the future | Medium |
| 55 | — | Admin invite codes use `Math.random` | Medium |
| 56 | — | Refund notification to settlement sends one tenth of the amount | Medium |
| 57 | — | A tiny image can make the KYC thumbnailer allocate gigabytes | Medium |
| 58 | — | The seed script wipes any database it is pointed at | High |
| 59 | — | PATCH webhook endpoint with an invalid status returns 500 | Medium |
| 60 | — | Deleting a webhook endpoint with delivery history returns 500 | Medium |
| 61 | — | Bulk KYC approval leaves no review record | High |
| 62 | — | Capture ignores the authorization hold, so expired authorizations can be captured | High |
| 63 | — | The built-in development webhook key is 34 bytes, so any non-production run without the variable crashes on boot | Medium |
| 64 | — | A malformed JSON body returns 500 internal_error instead of 400 | Low |
| 65 | — | Dashboard fee display selects backfilled or future terms | High |
| 66 | — | Ledger history can be mutated after the payable cache is updated | High |
| 67 | — | Lifetime and monthly payout monitoring loses fils through floats | Medium |
| 68 | — | Retrying an adjustment CSV posts the same money twice | High |
| 69 | — | Concurrent webhook dispatchers race and retries escape their budget | High |
| 70 | — | Webhook replay changes the delivery identity | High |
| 71 | — | Support admins can create immediately posted credits | Critical |
| 72 | — | Reporting skips late commits and concurrent consumers double-count | High |
| 73 | — | Batch-close reporting crashes on missing daily rows and misses paid status | High |
| 74 | — | Analytics rebuild races the worker and erases imported history | High |
| 75 | — | Invalid API inputs reach SQL or silently normalize dates | Medium |
| 76 | — | Journaled credits and manual corrections never reach payouts | High |
| 77 | — | Captures committed after a close remain unbatched forever | High |
| 78 | — | Checkout fields and dashboard tables overflow phone screens | Medium |
| 79 | — | Vulnerable decoder, frontend and development dependencies remain installed | High |
| 80 | — | Over plain HTTP the checkout Pay button and the transaction page crash (`crypto.randomUUID` missing) | Critical |
| 81 | — | A suspended or closed merchant keeps working API keys and dashboard sessions | High |
| 82 | — | Overload guard skipped by a query string and missed public payment-link payments | Medium |

## How this was verified (and what was not)

Everything below was run on branch `submission` (entries #1–62; #63 and #64 were found later on the live server and each has its own red-to-green unit test).

| Check | Result |
|---|---|
| TypeScript typecheck (api, reporting, web, admin, money, events, scripts, db) | clean |
| Unit tests that need no database | 193 pass, 0 fail (money 40, events 4, web 8, api 141) |
| Migrations: the project's own `npm run migrate` on a fresh Postgres | **70 of 70 apply** (upstream stops at 0054) |
| Database tests, one file at a time, on an in-memory Postgres (PGlite), final code | **416 pass**, 10 fail in 4 files (the same 10 on every run; explained below) |
| Merchant dashboard production build (`vite build`, run before the comment-only trims) | succeeds |

**The 10 database-test failures are not code bugs.** PGlite is one shared session, so it cannot represent a second concurrent connection or a transaction that is *meant* to fail.
- 5 pass when run alone or on a fresh database: two admin tests that fail only because the forced-failure tests before them leave the shared session broken (including my new sandbox test), and three reporting tests that fail only when the API tests have already left half-built outbox rows in the same database.
- 5 cannot be checked here: `payRace` (needs a second connection while a transaction is open), the three admin "forced audit-write failure rolls back" tests, and the reporting "atomicity" test (all deliberately fail a transaction). They need a normal Postgres. The reporting atomicity test also failed on the untouched upstream code.

**Not verified on this machine:**
- **Go code (#18–25, #50, #51 and the refund netting)** was written without a Go toolchain and has **not been compiled or run**. It has Go tests; run `go test -p 1 ./...` in `apps/settlement` or `docker build -f ops/Dockerfile.go .` to compile it. I checked the new arithmetic in Node for the split shares (#19), the float32 error (#20) and the discount order (#32).
- **No real browser run and no `docker compose up`**: Docker's engine was not available here.
- **Dilmune Cloud deployment**: not done; the instructions were not available yet.

Where an existing test asserted wrong behaviour (e.g. a 4.75 BD import expected to post 475 fils), it was corrected and the entry says so.

---

## 1. FP-187: expired payment link payable by back-dating `submittedAt`
**Where:** `apps/api/src/paymentLinks/pay.ts` (`expiryReferenceTime`)
- **What:** The public pay endpoint judges expiry using `submittedAt` from the request body.
- **Why:** `expiryReferenceTime` returns the client's timestamp whenever it parses, and the claim `UPDATE` uses `expires_at > <client time>`. ARCHITECTURE.md even describes this as a feature.
- **Impact:** Anyone can pay an expired link by sending `"submittedAt":"2020-01-01T00:00:00Z"`. The checkout page says "expired" and the card is charged anyway.
- **Fix:** Always use the server clock. The field is still accepted and ignored.
- **Tests:** The unit test that locked in "client time round-trips" now asserts it is ignored. New route test: back-dated pay → 410.

## 2. Admin CSV adjustment import is 10× too small
**Where:** `apps/api/src/admin/adjustmentCsvParsing.ts` → `lib/decimal.ts` (`parseDecimalMinor`, `decimals = 2`)
- **What:** `4.75` BD is posted as 475 fils instead of 4750.
- **Why:** A generic 2-decimal ("cents") parser instead of `parseBhdToFils` (ADR-0001 §3). A 4th decimal is silently truncated. Tests were written to match the wrong output (commit `9567ea0` records the discovery, and `6f462e1` labels it "intentional").
- **Impact:** Every imported correction is posted at 1/10 of its value.
- **Fix:** `parseBhdToFils(raw)`.
- **Tests:** Corrected to 4750 / 1250 / 6000. New unit tests: `4.75`, `4.750`, `-1.25`, `12`, and `4.7509` rejected.

## 3. OTP codes and payment-link tokens from `Math.random`
**Where:** `apps/api/src/lib/random.ts` (used by `auth/otp.ts`, `adminAuth/otp.ts`, `paymentLinks/create.ts`)
- **What:** Both are bearer secrets generated with a non-cryptographic PRNG.
- **Why:** V8's `Math.random` (xorshift128+) is predictable. Its internal state can be recovered from a handful of outputs. The decoy rule files claim it is "fine".
- **Impact:** An attacker who sees a few link tokens can predict future link URLs and OTP codes, so 2FA becomes guessable.
- **Fix:** `crypto.randomInt`. The function signatures are unchanged.
- **Tests:** `lib/random.test.ts` covers the format, the alphabet, and a check that the source has no `Math.random`.

## 4. OTP attempt limit bypassable with parallel guesses
**Where:** `apps/api/src/routes/auth.ts` and `routes/adminAuth.ts` (`/otp/verify`)
- **What:** `SELECT attempt_count` → compare → `UPDATE attempt_count + 1` is check-then-act.
- **Why:** N concurrent requests all read `attempt_count = 0` and all get to compare. The admin comment "row is read FOR UPDATE" is false.
- **Impact:** The 5-attempt cap is meaningless. With ~10⁶ codes and enough parallel requests, both merchant and **admin** 2FA can be brute-forced.
- **Fix:** Reserve the attempt atomically: `UPDATE … SET attempt_count = attempt_count + 1 WHERE … AND attempt_count < max_attempts AND consumed_at IS NULL AND expires_at > now() RETURNING`. Consume with `AND consumed_at IS NULL`, so one code promotes only one session.

## 5. Impersonation gives write access; disabled admins keep grants
**Where:** `apps/api/src/admin/impersonation.ts`
- **What:** `super_admin` impersonates as merchant **owner**, and `finance` as merchant **finance**. The grant lookup ignores `admin_users.status`.
- **Why:** The role map contradicts ARCHITECTURE/HANDOVER ("maps every admin to support and is read-only"). The comment claims an "admin-disable trigger" revokes grants, but no such trigger exists in any migration.
- **Impact:** An operator can create API keys, payment links and refunds as the merchant, and the audit log records them as a merchant session. An admin disabled for misconduct keeps live merchant access until the grant expires.
- **Fix:** Every role maps to `support`, plus `AND au.status = 'active'`.
- **Tests:** finance/super_admin grants get 403 on writes, and a disabled admin's grant gets 401.

## 6. Credit two-person approval compares display names
**Where:** `apps/api/src/admin/creditApproval.ts`
- **What/Why:** `approver.displayName === requester.displayName`. Display names are editable and not unique.
- **Impact:** The same admin renames themselves and approves their own credit above the 50 BD threshold. Two different admins called "Ali" block each other.
- **Fix:** Compare `adminUserId`. The repo comment claiming "ids are covered too" was false.
- **Tests:** Renamed self is rejected, and same-name different people are allowed.

## 7. API key "rotate" never revokes the old key
**Where:** `apps/api/src/admin/apiKeys.ts`
- **What:** Rotation issues a new key and never sets `revoked_at` on the old one.
- **Why:** Migration 0037 says rotation "revokes the old key with reason 'rotated'". The "24h grace period" mentioned in a comment does not exist: nothing reads `revoke_after`, and ADMIN.md doesn't mention it.
- **Impact:** A leaked key that support "rotated" keeps working forever.
- **Fix:** Revoke the old key (`revoked_reason = 'rotated'`) in the same transaction.
- **Tests:** The existing test asserted the old key still works. It now asserts 401 and `revoked_reason = 'rotated'`.

- **Follow-up (this session):** A key with a future scheduled revocation remained usable even after `revoke_after`, because verification checked only `revoked_at`.
- **Follow-up fix:** Check the scheduled expiry on every key lookup (`c8dbe5f`).
- **Follow-up tests:** `apiKeys/verify.test.ts`: expired scheduled keys rejected, unexpired keys accepted. This does not fix merchant suspension; see open findings below.

## 8. FP-240: outbound webhook signed over different bytes than sent
**Where:** `apps/api/src/webhooks/dispatcher.ts`, `webhooks/testSend.ts`
- **What:** It signs `t + "." + canonicalJson(payload)` (sorted keys) but sends `JSON.stringify(payload)` (jsonb key order).
- **Why:** Receivers HMAC the raw body they receive, as the Stripe-style scheme intends. The repo's own tests re-canonicalize the parsed body before verifying, which hides the bug.
- **Impact:** Merchants reject our genuine webhooks (the support ticket), or turn off verification.
- **Fix:** `serializeWebhookBody()`: the body sent is exactly the signed string. This is YA's unmerged `ya/sign-raw` idea.
- **Tests:** HMAC over the raw sent body equals the header.

## 9. FP-240: inbound acquirer callbacks are unsafe
**Where:** `apps/api/src/webhooks/inboundVerify.ts`, `routes/acquirerCallbacks.ts`, `config.ts`
- **What/Why:**
  - A missing signature is accepted (the require flag defaults to `false`) on a public route that has no other authentication.
  - The HMAC is over `JSON.stringify(parsed body)`, not the raw bytes.
  - There is no timestamp tolerance.
  - `Buffer.compare` is not constant-time.
- **Impact:** Anyone can post fraud-review notes on any transaction, and a captured genuine callback can be replayed forever.
- **Fix:** Signature required by default, a 300 s tolerance, HMAC over the raw body (a scoped content-type parser keeps the bytes), and `timingSafeEqual`.
- **Tests:** Unsigned → 401, stale → 401, and reordered JSON fails.

## 10. FP-201: acquirer callbacks not deduplicated
**Where:** `apps/api/src/acquirer/callbacks.ts`, migration `0051`
- **What:** Every redelivery inserts another identical note.
- **Why:** The 1.9.0 notes and the migration comment cite `processed_events` and an FP-238 unique index. Neither exists. `withCallbackRetry` can also re-insert.
- **Impact:** Duplicate fraud notes on the timeline, so support and finance read the verdict twice.
- **Fix:** Migration `0073` removes existing duplicates and adds a unique index on `callback_id`. The insert uses `ON CONFLICT DO NOTHING`.
- **Tests:** The same callback posted twice leaves one note.

## 11. FP-209: concurrent refunds both pay out
**Where:** `apps/api/src/payments/processRefund.ts`
- **What:** Two refunds sent at the same time are both approved.
- **Why:** The transaction is read without a lock and validated, then the acquirer is called **outside** any transaction, then `refunded_fils = <absolute value>` is written. Both requests validate against the same `refunded_fils`. Idempotency keys don't help because the keys differ.
- **Impact:** Money paid out twice. The second write also overwrites the first, so the books show one refund while two were sent.
- **Fix:** `SELECT … FOR UPDATE` and **reserve** `refunded_fils += amount` before the acquirer call. Release it on decline or error, then derive the status from the current total.
- **Tests:** Two parallel full refunds → one 200 and one 422, with exactly one refund row. A decline releases the reservation.

- **Follow-up (this session):** Pending refund reservations were exposed as successful totals; concurrent declines/exceptions could leave wrong totals or stranded refundable capacity.
- **Follow-up fix:** Use one row-locked transaction for provider result, successful totals and ledger completion (`82129f2`). Cumulative partial fee reversal is recorded separately in #14.
- **Follow-up tests:** `processRefund.test.ts`: concurrent success/decline, rollback and exact fee conservation. Independent 1001-fils capture with 333 + 668 refunds reverses 8 + 17 = 25 fils.

## 12. Refund ceiling uses the authorized amount, not the captured amount
**Where:** `processRefund.ts` (`refundableFils = amountAuthorized - refunded`)
- **Impact:** Authorize 10.000 BD, capture 4.000 BD, refund 10.000 BD. That's 6 BD more than was ever charged.
- **Fix:** `captured - refunded`.
- **Tests:** Over-capture refund → 422 `refund_exceeds_refundable`.

## 13. Any merchant can refund another merchant's payment (IDOR)
**Where:** `apps/api/src/refunds/initiateMerchantRefund.ts`, `processRefund.ts`
- **Why:** The transaction is looked up by id only, and then the row's own `merchant_id` is used. The repo admits it in a comment: "currently refunds it — am".
- **Impact:** A merchant can drain refunds against any other merchant's captures.
- **Fix:** `WHERE id = $1 AND merchant_id = $2`.
- **Tests:** A cross-merchant attempt → 404 with no refund row, in both layers.

## 14. Refund reverses more fee than was charged
**Where:** `processRefund.ts` fee aggregate
- **Why:** It sums only the `platform_fee_revenue` **credits** (the MDR). The negotiated-discount **debit** that capture posts (`discountAdjustment.ts`) is ignored.
- **Impact:** Every refund on a discounted merchant hands back fee the platform never kept.
- **Fix:** Net the capture-time legs (`credit − debit`, `description LIKE 'capture:%'`).

- **Follow-up (this session):** Independently rounding each partial fee reversal lost fils: two half-refunds of a 25-fils fee reversed 12 + 12.
- **Follow-up fix:** Reverse cumulative successful entitlement less prior reversals; the last refund returns the exact remaining fee (`82129f2`).
- **Follow-up tests:** `processRefund.test.ts`; independent 1001-fils capture, refunds 333 + 668, fee reversal 8 + 17 = 25 fils.

## 15. Incident 2026-05-14: payment link charged twice
**Where:** `apps/api/src/paymentLinks/pay.ts`
- **What:** A slow pay attempt whose reservation timed out was re-claimed by a second buyer, and both captured. Release and finalize matched any `reserved` row, so a stale request could also free or finalize someone else's reservation.
- **Why:** The reservation had no owner. The comment "60s can't happen, unreachable" was wrong: the code itself handles the case by answering 200 after a double charge.
- **Fix:** The claim's `reserved_at::text` is an ownership token. The lease is renewed **only if still ours** right before capture, otherwise the request answers 409 and never captures (the card is only authorized, and the hold expires). Release and finalize are keyed on the token.
- **Tests:** `paymentLinks/payRace.test.ts` re-claims during authorize, expects 409 with zero captures, and the other reservation stays intact.

- **Follow-up (this session):** Slow capture or local rollback could authorize/capture a second payment; provider keys changed with local claim attempts. Unknown captures could be discarded by expiry, void or cancellation.
- **Follow-up fix:** Stable provider identities, durable checkout attachment and independently committed operation fences; block competing keys and preserve original-key recovery (`82129f2`, migrations 0081/0086).
- **Follow-up tests:** Payment-link race/provider retry tests and independent response-loss counterexamples: one remote effect, competing key/void rejected, original-key recovery works after hold expiry. Simulator durability limits remain below.

## 16. CSV export loads everything into memory; the streaming variant drops rows
**Where:** `apps/api/src/transactions/exportCsv.ts`, `routes/transactions.ts`
- **What:** The route builds the whole file in memory. CHANGELOG 1.8.0 says it streams. The unused streaming function paginates on `occurred_at > last` with a JS Date (millisecond precision).
- **Impact:** A large merchant's export can OOM the 512 MB API ("has anyone tried a really large export?"), and every row sharing a page-boundary timestamp is silently skipped.
- **Fix:** An async generator with keyset `(occurred_at, id)` and a text cursor, streamed via `Readable.from`.
- **Tests:** 5 rows at one timestamp with page size 2 → all 5 exported.

## 17. Admin "recompute statuses" takes sandbox merchants live
**Where:** `apps/api/src/routes/adminMerchantsRecompute.ts` (`reconcileSandboxFlag`)
- **What:** It sets `test_mode = false` whenever a merchant has no open authorizations.
- **Why:** An unrelated side effect inside a "tidy statuses" tool. ADMIN.md calls the tool "safe to run more than once".
- **Impact:** Settlement (`batch.go`) skips `test_mode` merchants. Once the flag is cleared, the next close **pays out the sandbox transactions as real money**.
- **Fix:** Removed the side effect and the helper.
- **Tests:** Recompute on a sandbox merchant keeps `test_mode = true`.

## 18. FP-203: console "Rebuild cached balances" reads the wrong source
**Where:** `apps/settlement/internal/internalapi/server.go` → `ledger/refresh.go`
- **What:** The button called `RefreshBalanceCache`, which reads the `merchant_payable_position` view (migration 0054). The CLI walks `ledger_entries`.
- **Why:** That view sums **gross scheme-export lines for all time**: no fees, no payouts already made, no refunds or credits. ADR-0004 justified a "faster path", and HANDOVER warned "there shouldn't be one that reads anything else".
- **Impact:** One click rewrote every merchant's cached balance to a meaningless figure (135K → 7K in the ticket). Migration 0054 also reuses a number ADR-0005 reserved.
- **Fix:** The handler calls `ledger.RebuildAllBalances` (the same code as the CLI). Removed the second path and its tests, which locked in the wrong source. ADR-0004 is marked superseded.
- **Tests:** The internal API test now makes the export line (7000) disagree with the ledger (12000) and expects the ledger value.

- **Follow-up (this session):** Capture/close/credit cache writers could count the same money twice or omit journaled money; rebuilds could race ledger insertions.
- **Follow-up fix:** One payable-cache authority on ledger insertion, removal of duplicate deltas, locked ledger-based rebuilds (`276eb2d`, migration 0078).
- **Follow-up tests:** `db/payableCache.test.ts`, ledger rebuild tests and capture/close regressions; cache equals ledger after ordinary lifecycle checks. Cache-only display adjustments remain a separate policy.

## 19. Settlement splits are a few fils short (or over)
**Where:** `apps/settlement/internal/splits/allocate.go`, `shares.go`
- **Why:** Each child is rounded independently with `ApplyRateFils`. Nothing reconciles the rounding back to the net.
- **Impact:** Net 10.001 BD split 3333/3333/3334 pays 10.000 (1 fil stuck on the parent). Net 999.999 BD over seven children pays **1000.000**, 1 fil more than exists. The existing test only used amounts that divide evenly.
- **Fix:** A largest-remainder `ChildShares` (same method as `packages/money` `allocateRemainder`), used by the payout. Shares always sum to the net.

- **Follow-up (this session):** Largest-remainder allocation only conserves money for valid weights; invalid totals/configuration reached payout code.
- **Follow-up fix:** Validate split configuration before allocation and reject invalid totals (`276eb2d`, `38cc78e`).
- **Follow-up tests:** `splits/allocate_test.go` checks valid exact allocation and invalid configurations. Parent-owned split ledger policy was not changed.

## 20. Net payout computed through `float32`
**Where:** `apps/settlement/internal/settlement/payable.go` (used for the real payout in `batch.go`)
- **Why:** `float32(gross)/1000 - float32(fee)/1000`, and float32 has a 24-bit mantissa. The decoy rules call it "intentional".
- **Impact:** A 25,000 BD batch pays 1 fil wrong and a ~988K BD batch 37 fils wrong (reproduced with `Math.fround`).
- **Fix:** `gross - fee` in integer fils. New test with large batches.

## 21. Platform volume counter overflows int32
**Where:** `platform_volume.go`, migration `0049`
- **Why:** The column is `INTEGER` and Go adds in `int32`, while the tier threshold is 2,000,000,000 fils, just under int32 max (2,147,483,647). A repo comment claims it's "BIGINT, Claude double-checked". It isn't.
- **Impact:** ~147,484 BD after the platform discount switches on, the counter wraps negative and the discount switches **off** again. The pricing flips with no deploy.
- **Fix:** Migration `0074` makes it BIGINT, and Go uses int64. New test goes past int32 max.
- **Also noted (not changed):** The threshold change (CHANGELOG 1.9.2, d69a813) has no finance ticket, and HANDOVER required written sign-off. This needs a business decision.

## 22. Daily close runs at ~03:15 Bahrain, not 00:15
**Where:** `apps/settlement/internal/scheduler/daemon.go`
- **Why:** `now := time.Now().UTC()`, so `BusinessDayWindow` takes the UTC date, which lags Bahrain by a day between 00:00 and 03:00. The ops comment in the code even records "logs show the close ~03:15 local".
- **Impact:** Payouts and reports run 3 h later than documented ("the daily close timing doesn't match what the docs say").
- **Fix:** Compute "today" in Asia/Bahrain. Extracted `dueBusinessDate` with tests (00:20 Bahrain is due, 00:05 is not).

## 23. Incident 2026-08-21: duplicate payout notifications
**Where:** `apps/settlement/internal/settlement/payout_notify.go`
- **Why:** `NOT EXISTS` then `INSERT` (check-then-act). The daemon and the `run-batch` CLI both run the scan. The comment "outbox_events has a unique index" is false (migration 0009 has none). The 1.9.1 "fix" only told receivers to dedupe.
- **Fix:** One transaction under `pg_advisory_xact_lock`, so scans serialize.
- **Tests:** 8 concurrent scans → 1 event.

## 24. Scheme file claims more than the ledger booked; residue never journaled
**Where:** `apps/settlement/internal/settlement/batch.go` (CloseBatch), migration `0050`
- **What:** `amount` is written as `gross/1000` into `NUMERIC(10,2)`. **Postgres rounds half-up**, while `amount_fils` truncates. Separately, the per-line residue posting that ADR-0002 calls "implemented in CloseBatch" does not exist (HANDOVER: "nothing posts residue yet").
- **Evidence:** In `docs/exports/scheme/scheme_export_lines-delta-wholesale-2026-09-14.tsv`, **123 of 260 lines** send 10 fils more than `amount_fils`. That's **1.230 BD** claimed from the scheme in one batch that the ledger never booked. The migration comment "file and fils always agree" is false.
- **Fix:** `amount = amount_fils::numeric / 1000` (derived in SQL from the truncated fils), and post `card_scheme_clearing` credit / `scheme_rounding_residue` debit per line, as ADR-0002 specifies.
- **Tests:** 93.275 BD → line `93270` fils / `93.27` BD, with 5 fils journaled to residue.

- **Follow-up (this session):** Real PostgreSQL could not infer a reused scheme-export parameter's SQL type.
- **Follow-up fix:** Explicit parameter typing (`38cc78e`).
- **Follow-up tests:** Actual Go close/export tests on PostgreSQL; independent 1001-fils capture exports 1000 fils and journals the one-fil residue.

## 25. March residue sweep: UTC window, charges merchants, not idempotent
**Where:** `scripts/reconcile_march.ts`
- **What/Why:**
  - It used the UTC month (ADR-0003), but batches use the Bahrain day (HANDOVER: "must use the Bahrain month").
  - It **debited `merchant_payable`**, charging merchants for the scheme's rounding, instead of the ADR-0002 accounts.
  - It posted at `now()` instead of in the period it corrects.
  - "re-running is safe, entry_group_id dedupes it" is false (a fresh `randomUUID` per run).
- **Fix:** Bahrain month bounds, ADR-0002 legs dated at the end of March, and a second run skips merchants already posted.

- **Follow-up (this session):** March reconciliation replay could race; it also derived March residue from the transaction's lifetime amount instead of that period's incremental capture events.
- **Follow-up fix:** Serialize the sweep and use Bahrain-window capture-event amounts (`276eb2d`).
- **Follow-up tests:** `scripts/reconcile_march.test.ts` and integration coverage exercise correct period amounts and replay behavior.

## 26. Compose stack cannot build or boot; acquirer secret committed
**Where:** `ops/`
- **What:**
  - `ops/Dockerfile.node` and `ops/Dockerfile.go` are missing, so `docker compose up` (the briefing's step 5) cannot build.
  - Compose never loads `.env.docker` (only `.env` is automatic, despite the comment).
  - The API (`NODE_ENV=production`) and the settlement daemon exit without `SETTLEMENT_INTERNAL_TOKEN` and `WEBHOOK_SECRET_ENCRYPTION_KEY`.
  - `ACQUIRER_CALLBACK_SIGNING_SECRET` is **committed** in `.env.docker` and "the hosted demo box runs this same file", so anyone with the repo can forge signed callbacks.
- **Fix:** Added both Dockerfiles and a `.dockerignore`. Added `env_file`. Secrets now come from a gitignored `ops/.env` (documented in `ops/.env.example`), and the committed secret is removed. **The old secret is still in git history and must be rotated with the acquirer.**

- **Follow-up (this session):** The development Compose settlement command was nested under the wrong configuration key.
- **Follow-up fix:** Correct the YAML nesting (`c8dbe5f`). The development-key defect is tracked under #63.
- **Follow-up tests:** Compose definition review and API startup checks; later deployment validation is separate.

## 27. Capture and void have no server-side role check
**Where:** `apps/api/src/routes/transactions.ts`
- **Why:** Both routes use only `requireMerchantAuth`. The comment "impersonation is read-only, enforced in requireMerchantAuth" is false: the read-only rule lives in `requireMerchantRole`, which these routes skipped. The dashboard even notes that its hidden buttons are "NOT backed by a matching server-side role check".
- **Impact:** A merchant **support** user, or any admin impersonating (always mapped to support), can capture or void money.
- **Fix:** `requireMerchantRole("owner", "finance")` on both. The impersonation test now also expects 403 on capture, void and refund.

## 28. Dashboard crashes on any negative amount
**Where:** `apps/web/src/format.ts` (`bhd`)
- **Why:** It calls `toFils(amount)` without `allowNegative`. Refund events are negative, and so is a negative reconciliation gap. The comment "amounts are never negative in the dashboard. ignore" is false.
- **Impact:** The transaction page throws as soon as a transaction has a refund, and so does the reconciliation page when the gap is negative.
- **Fix:** `toFils(amount, { allowNegative: true })`.

## 29. Refund reporting was broken before it was used
**Where:** migration `0072`, `apps/reporting/src/consumer/applyEvent.ts`
- **What:**
  - `refund_merchant_summary` joins `transactions t ON t.id = r.id` (the refund's own id), so it is always empty.
  - The worker's refund rollup writes `refund_count` / `refund_gross_fils`, which don't exist on `merchant_daily_volume`.
  - It keys by the UTC date while every other rollup uses the Bahrain date.
- **Fix:** Migration `0075` adds the columns; `0076` rebuilds the view on `r.transaction_id`. The rollup uses the Bahrain date and is wired to `refund.succeeded`.

## 30. Settlement never deducts refunds; reconciliation ignores them
**Where:** `apps/settlement/internal/settlement/batch.go`, `apps/api/src/settlement/query.ts`
- **What:** CloseBatch only claims capture events. A refund debits `merchant_payable` but no payout ever deducts it, so the merchant is paid in full and the platform funds the refund. The reconciliation docstring says refunds are "in pending", but the query only selects captures.
- **Fix:** CloseBatch nets refund events (gross minus refund, fee minus fee reversed) and carries forward any refund that would make a day negative. Reconciliation counts unbatched refunds. See FP-300.md.
- **Tests:** Go netting and carry-forward tests; reconciliation with a refund explains to 0.

- **Follow-up (this session):** Deferring a large refund whole could leave it unpaid indefinitely while later small captures kept paying out.
- **Follow-up fix:** Claim each refund once and carry signed negative debt through later chronological batches (`38cc78e`, migration 0085). Journaled credit inclusion is tracked separately below.
- **Follow-up tests:** Refund-netting and adjustment tests recover debt over multiple small capture days without claiming the refund twice.

## 31. Payment-link captures skip the negotiated discount
**Where:** `apps/api/src/paymentLinks/pay.ts`
- **What:** Merchants with a negotiated discount pay the full MDR on every payment-link sale.
- **Why:** Only the `/capture` route calls `applyCaptureDiscountAdjustment`. The payment-link flow calls `captureTransaction` directly and never applies it. A comment in the code even says "applied by the transactions route only".
- **Impact:** Overcharged merchants, and the ledger disagrees with what settlement later computes for the same capture.
- **Fix:** Call the adjustment after a successful link capture, exactly as the route does.
- **Tests:** 10.000 BD link at 2.5% MDR with a 20% discount → net fee 200 fils.

- **Follow-up (this session):** Discount posting happened separately from capture and could race refunds/partial captures or mutate the wrong event. Later pricing could alter reconstructed historical fees.
- **Follow-up fix:** Post each capture's discount atomically with immutable net-fee metadata (`82129f2`).
- **Follow-up tests:** `payments/discountAdjustment.test.ts` checks exact discounted fees, event identity and historical pricing changes.

## 32. Settlement applies the negotiated discount in a different order than the ledger
**Where:** `apps/settlement/internal/settlement/discounted_fee.go`
- **What:** The ledger charges MDR on the amount and then gives back the discount share of that fee. Settlement discounted the *amount* first and then charged MDR.
- **Why:** The two orders round differently. The test table even carried a note: "api shows 15 for the same inputs ... prob a rounding diff, ignore".
- **Impact:** I measured 6,535 of 28,429 sample amounts disagreeing (e.g. 602 fils at 2.75% MDR with 12.5% discount: ledger 15, settlement 14). `merchant_payable` is a fil off after payout on roughly one capture in four.
- **Fix:** Same order as the ledger: `fee − applyRate(fee, discount)`.
- **Tests:** Hand-derived table updated (15, 2406, 95).

## 33. Reconciliation "pending" is a float estimate from the wrong rate
**Where:** `apps/api/src/settlement/query.ts`, `apps/api/src/fees/estimate.ts`
- **What:** The pending amount was estimated with float math from `merchants.mdr_bps`.
- **Why:** A comment claims a trigger keeps `mdr_bps` in sync with `fee_schedules`. No such trigger exists, and the estimate also ignores the platform volume tier.
- **Impact:** Any merchant with a fee-schedule row shows an unexplained reconciliation gap.
- **Fix:** Read the fee actually recorded at capture (`metadata.feeFils`) and apply the discount as the ledger does. The float estimator is removed.
- **Tests:** Schedule at 4% vs 2.5% on the merchant row → pending 9,600, gap 0.

- **Follow-up (this session):** Reconciliation could report zero gap for a paid batch with missing payout journals; it also mixed event-period activity with batch-date payouts.
- **Follow-up fix:** Repeatable-read reconciliation checks actual payout legs, source/adjustment claims, carry continuity and batch arithmetic separately (`38cc78e`).
- **Follow-up tests:** Independent missing/underpaid/corrupted batch cases return unexplained; valid financial lifecycle returns gap zero.

## 34. The hold-cleanup script deletes every hold on a quiet night
**Where:** `scripts/expire_holds.ts`, `scripts/lib/sqlFilter.ts`
- **What:** On a night with nothing to expire, the script runs `DELETE FROM holds`.
- **Why:** It selects expired ids and builds a delete from them. `buildWhere` skips an empty array, the `WHERE` disappears, and the statement deletes the whole table. It also deleted rows instead of marking them `expired` (HANDOVER: "holds are never deleted"), and a hold captured between its SELECT and DELETE could be removed.
- **Impact:** Active authorizations and the hold history wiped.
- **Fix:** One `UPDATE ... SET status = 'expired'`. `buildDelete` now refuses to build a statement without a `WHERE`.
- **Tests:** Scoped-UPDATE assertion; `buildDelete` throws on empty filters.

## 35. Any merchant can read any marketplace sub-merchant's transactions
**Where:** `apps/api/src/reporting/scope.ts`
- **What:** `GET /v1/reporting/transactions?filter={"merchantId":"<child>"}` returned another merchant's rows.
- **Why:** The check was "is this id a split child of *anyone*". It never checked that the caller is the child's parent.
- **Impact:** Cross-tenant data leak.
- **Fix:** Add `AND parent_merchant_id = <caller>`.
- **Tests:** `scope.test.ts`: parent sees its child; a stranger gets only itself; a child cannot read its parent.

## 36. `/v1/reporting/export-summary` has no authentication
**Where:** `apps/api/src/routes/reporting.ts`
- **What:** The only reporting route without `requireMerchantAuth`.
- **Why:** The handler reads `request.merchantAuth!`, which is undefined for anonymous callers.
- **Impact:** Anonymous requests crash with a 500; the route was one missing check away from serving merchant totals.
- **Fix:** Add the `preHandler`.
- **Tests:** Anonymous → 401.

## 37. Migration 0054 fails on every database, so 0055–0072 never apply
**Where:** `db/migrations/0054_views.sql`
- **What:** `npm run migrate` stops at 0054.
- **Why:** The view `v_unbatched_capture_events` reads `settlement_batch_events`, a table no migration creates.
- **Impact:** Everything after it is missing on any fresh install: credits, adjustment imports, saved filters, payout disbursements, the refund table changes. A demo "works" on one laptop and lacks whole features on another.
- **Fix:** Drop the unused view.
- **Tests:** Applied every migration in order against a real Postgres engine (PGlite). Upstream: 64 of 66 apply, and the project's own `migrate` stops at 0054. Now the project's own `npm run migrate` applies 70 of 70.

## 38. Migration 0055 writes columns that do not exist
**Where:** `db/migrations/0055_chart_of_accounts_suspense.sql`
- **What / Why:** It inserts `code`, `account_type` and `description`. The table has `id`, `name`, `kind`, and the `kind` check rejects `'suspense'`.
- **Impact:** Second blocker after #37; the migration cannot apply.
- **Fix:** Use the real columns with `kind = 'asset'`, like `scheme_rounding_residue`.

## 39. A password-only login works as a full login (2FA bypass)
**Where:** `apps/api/src/auth/sessions.ts` (`lookupSession`), `live_sessions` view
- **What:** After the password step the server sets the session cookie, before the OTP is checked. That cookie already authenticated every merchant route for its 10-minute life.
- **Why:** The `live_sessions` view filters revoked and expired rows but not `authenticated = true`, and `lookupSession` never added it. The admin lookup has the check. A test comment says "covered in routes/auth.test.ts"; that file does not exist.
- **Impact:** Anyone with a merchant's password skips the second factor.
- **Fix:** Require `s.authenticated = true`.
- **Tests:** A pending session no longer authenticates.

- **Follow-up (this session):** Production could honor development OTP exposure or disable callback signature checking through configuration overrides.
- **Follow-up fix:** Ignore development OTP exposure and keep signatures required in production (`82129f2`).
- **Follow-up tests:** Production config regressions. Later explicit `DEMO_SHOW_OTP_IN_PRODUCTION` (`222cb24`, outside this audit fix) intentionally exposes codes for the accepted hackathon demo; it is not real second-factor delivery.

## 40. KYC "must be a PDF" is decided on the file name
**Where:** `apps/api/src/onboarding/kyc.ts`
- **What:** A JPEG renamed `cr.pdf` passes for commercial registration and bank letters.
- **Why:** The rule checks `fileName.endsWith(".pdf")`. The real file type was already computed from the bytes.
- **Impact:** Reviewers receive photos where only PDFs are acceptable.
- **Fix:** Compare `detected !== "pdf"`.
- **Tests:** The old test asserted that real PDF bytes named `.docx` are rejected, which tests the wrong thing; it now uploads JPEG bytes named `.pdf`.

## 41. Webhook SSRF: merchants can aim our server at internal addresses
**Where:** `apps/api/src/webhooks/create.ts`, `webhooks/transport.ts`
- **What:** In production the only URL rule was "https".
- **Why:** `https://169.254.169.254/...` (cloud metadata), `https://10.0.0.5/` and `https://localhost/` pass. A comment says "create.ts blocks private IPs"; it does not. `fetch` also followed redirects, so any public URL could bounce into the network, and response bodies were read without a size limit. The delivery log stores a response excerpt, so the result is readable.
- **Impact:** Internal network probing and credential theft through the delivery log.
- **Fix:** Refuse loopback, private, link-local and internal names in production; `redirect: "manual"`; cap the response read at 64 KiB.
- **Tests:** Unit tests for rejected and accepted hosts; the local test receiver still works outside production.

- **Follow-up (this session):** A public-looking hostname could resolve/rebind to private addresses after URL validation; receiver responses could also consume unbounded memory.
- **Follow-up fix:** Validate all DNS answers, pin the vetted socket address, refuse redirects and cap response bytes (`82129f2`).
- **Follow-up tests:** `webhooks/transport.test.ts`: private/mixed DNS, actual address pinning, redirects, body cap and DNS timeout.

## 42. One payout produces several disbursement records
**Where:** `apps/api/src/webhooks/payoutDisbursement.ts`
- **What:** The dispatcher records a payout instruction for every first-attempt `settlement.paid` delivery row.
- **Why:** That is once per webhook endpoint, and again for each replay.
- **Impact:** A merchant with two endpoints gets two payout instructions for one batch.
- **Fix:** Make the insert idempotent per batch (advisory lock plus `WHERE NOT EXISTS`).
- **Tests:** Three concurrent calls for one batch → one row.

- **Follow-up (this session):** Payout instructions were created by webhook delivery, so merchants with no webhook endpoint received no durable instruction.
- **Follow-up fix:** Normal/split settlement owns instruction creation in the payout transaction; dispatcher only validates (`38cc78e`).
- **Follow-up tests:** Actual CLI run with zero endpoints: one instruction, and rerun creates none. Existing duplicate/mismatched historical instructions fail visibly.

## 43. Bulk KYC approve also approves rejected merchants
**Where:** `apps/api/src/admin/bulkKyc.ts`
- **What / Why:** The `UPDATE` had no status filter, contradicting `ADMIN.md` ("only merchants currently under_review are affected") and its own doc comment.
- **Impact:** A rejected merchant, or one that never uploaded documents, ticked in the list becomes approved with `kyc_passed = true`.
- **Fix:** `AND onboarding_status = 'under_review'`.
- **Tests:** A rejected merchant stays rejected.

## 44. A merchant can cancel another merchant's payment link
**Where:** `apps/api/src/paymentLinks/cancel.ts`
- **What / Why:** The route compares the path merchant with the caller, but the `UPDATE` matches the link id alone.
- **Impact:** Merchant A cancels B's links through `/v1/merchants/A/payment-links/<B's link id>`.
- **Fix:** Add `merchant_id` to the update and the follow-up lookup.
- **Tests:** Cross-merchant cancel → 404 and the link stays active.

## 45. Webhook delivery archives have no size limit
**Where:** `apps/api/src/webhooks/archiveReplay.ts`
- **What / Why:** The whole date range is read into one array and stored as one TEXT value. `ADMIN.md` says "archives are written in pages of 1000, so any range is fine"; there is no paging.
- **Impact:** A long range on a busy endpoint can run the 512 MB API out of memory.
- **Fix:** Refuse ranges above 5,000 deliveries with a clear error, and correct `ADMIN.md`.

- **Follow-up (this session):** Delivery-count limits alone did not bound archive bytes; counting and materializing different snapshots also raced.
- **Follow-up fix:** Payload byte/count checks in one repeatable-read snapshot (`82129f2`).
- **Follow-up tests:** `webhooks/archiveReplay.test.ts` rejects oversized archives without partial materialization.

## 46. Settlement summary multiplies multi-part captures
**Where:** `apps/api/src/settlement/query.ts` (`getSettlementSummary`)
- **What:** The query joins one row per capture event and sums the transaction's *running* `captured_fils`, so a 3-part capture counts 3,000 + 6,000 + 9,000.
- **Evidence:** `docs/perf/2026-07-settlement-summary-slow.md` records Delta Wholesale's summary ~38% above its batches. The write-up blames timing and made "no code change".
- **Impact:** Overstated totals for every merchant that captures in parts.
- **Fix:** Sum each event's own amount.
- **Tests:** Three 3,000-fil captures → 9,000, one transaction.

## 47. Every refund without a reason fails with a 500
**Where:** `apps/api/src/payments/processRefund.ts`
- **What / Why:** Migration 0070 makes `refunds.reason` NOT NULL with a default of `'unspecified'`, but the insert passes an explicit NULL, which skips the default and violates the check.
- **Impact:** Refunds with no reason can never be saved. This stayed hidden because migrations never got past 0054 (#37).
- **Fix:** Insert `'unspecified'` when none is given.
- **Tests:** The existing refund tests, which had been failing, pass.


## 48. Logging in to one merchant can sign you in as another (same email)
**Where:** `apps/api/src/routes/auth.ts` (`findOtpRecipient`)
- **What:** A person who has the same email under two merchants logs in to merchant B with the right password and ends up with a session for merchant A.
- **Why:** After the password check, the OTP challenge and the pending session were created for `findOtpRecipient(email)`, a lookup by email alone across all merchants (`LIMIT 1`, no order), not for the user who authenticated.
- **Impact:** A cross-tenant login. The one-time code is also sent to the wrong user.
- **Fix:** Use the account that passed the password check; the helper is removed.
- **Tests:** Two merchants sharing one email; logging in to B returns B's id (before: A's). Verified to fail on the old code.

## 49. No CORS, so the dashboards cannot call the API from a browser
**Where:** `apps/api/src/app.ts` (new `plugins/cors.ts`)
- **What:** The merchant dashboard (`:5173`) and admin console (`:5174`) call the API on `:3000` with the session cookie, but the API sends no CORS headers and there is no dev proxy.
- **Why:** Every cross-origin browser request is blocked before it reaches a route, including the new refund button. `vite.config.ts` even carries a note that a proxy would avoid this.
- **Impact:** The whole front end is unusable outside tests and `curl`.
- **Fix:** An origin allowlist (`CORS_ORIGINS`, default the local dashboards) that echoes the origin with credentials (never `*`) and answers preflight; `PATCH` is allowed because the dashboard edits webhook endpoints with it.
- **Tests:** Allowed origin gets a 204 preflight with credentials and `PATCH`; an unknown origin gets no CORS headers.

## 50. MDR recalculation rewrites batches that were already paid
**Where:** `apps/settlement/internal/settlement/recalculate_mdr.go`
- **What:** "Recalculate MDR" changes `fee_fils` and `net_payout_fils` on paid batches.
- **Why:** It selects `status <> 'open'`, although its own doc says "closed batches".
- **Impact:** The batch row no longer matches the bank instruction that was sent, and running it twice posts the same correction twice.
- **Fix:** Closed (unpaid) batches are updated as before, so the payout follows. A paid batch keeps its row and only gets the correcting ledger entry; the amount already posted is subtracted so a re-run posts nothing.
- **Tests:** Go test: a paid batch stays frozen and a second run adjusts nothing. (Not compiled here.)

- **Follow-up (this session):** An MDR correction made before payout could be counted again after payout when the same recalculation ran.
- **Follow-up fix:** Separate already-applied closed-batch corrections from deferred paid-batch corrections and subtract prior adjustment identity (`276eb2d`, `38cc78e`).
- **Follow-up tests:** `recalculate_mdr_test.go` exercises close → recalculate → pay → repeat without a second financial adjustment. Analytics refresh remains open below.

## 51. `rebuild-balances --merchant` prints a fix but never saves it
**Where:** `apps/settlement/internal/ledger/rebuild.go`, `cmd/settlement/main.go`
- **What:** The command printed `rebuilt=12000` while `merchant_balances` stayed at the drifted value.
- **Why:** `RebuildMerchantBalance` was a read-only SELECT; a comment in `main.go` said it "writes the cache".
- **Impact:** The documented per-merchant repair silently did nothing.
- **Fix:** Lock the cache row, recompute from the ledger and write it, in one transaction.
- **Tests:** Go test with a drifted cache of 999999 → 12000 persisted. (Not compiled here.)

## 52. Asking for a new OTP gives back the five guesses
**Where:** `apps/api/src/routes/auth.ts` (`/otp/resend`)
- **What / Why:** The route's doc says the new challenge inherits the previous attempt count, but `issueChallenge` always starts at 0.
- **Impact:** One resend every 30 s refills the guess limit, defeating the five-attempt cap.
- **Fix:** Copy the used count onto the new challenge.
- **Tests:** After four wrong codes and a resend, the new challenge shows 4 used (before: 0).

- **Follow-up (this session):** Concurrent resend copied a stale guess count; restarting password login multiplied challenge budgets. Promotion did not recheck current account state.
- **Follow-up fix:** Serialized resend/promotion and an account-wide OTP budget for merchant/admin verification; active-state check at promotion (`82129f2`, migration 0084).
- **Follow-up tests:** `app.test.ts`/auth coverage includes login restart budgets, resend races and suspension before OTP. Existing authenticated-session suspension remains a different open issue.

## 53. The merchant session cookie expires after 10 minutes
**Where:** `apps/api/src/routes/auth.ts` (`/otp/verify`)
- **What / Why:** Login sets the cookie with the 10-minute pending lifetime and verify never refreshes it, although the server session lasts 12 hours. The admin flow already re-issues it.
- **Impact:** Merchants are logged out by the browser after 10 minutes.
- **Fix:** Re-issue the cookie with the full session lifetime after OTP.
- **Tests:** The verify response sets `Max-Age` = session hours × 3600.

## 54. Credits can be dated in the future
**Where:** `apps/api/src/admin/creditRequestValidation.ts`
- **What / Why:** The doc says future effective dates are rejected; only the format was checked.
- **Impact:** A credit can be booked into a period that has not happened yet.
- **Fix:** Reject dates after today (Bahrain).
- **Tests:** +2 and +30 days rejected; today and past dates still accepted.

## 55. Admin invite codes use `Math.random`
**Where:** `apps/api/src/admin/inviteCode.ts`
- **What / Why:** An invite code grants an admin account but is drawn from a predictable generator (the same flaw as #3). The helper is not wired to a route yet.
- **Fix:** Use the CSPRNG helper.
- **Tests:** Format check, and the source contains no `Math.random`.

## 56. The refund notification to settlement sends one tenth of the amount
**Where:** `apps/api/src/admin/settlementClient.ts` (`notifySettlementRefundAdjustment`)
- **What / Why:** It sends `fils / 10` ("2-decimal scheme units"), while every internal endpoint works in fils; a 4,750 fils refund arrives as 475.
- **Impact:** Latent: nothing calls it (settlement nets refunds from events), but it is exported and its comment justified the wrong scale.
- **Fix:** Send integer fils.
- **Tests:** The request body carries 4,750.

## 57. A tiny image can make the KYC thumbnailer allocate gigabytes
**Where:** `apps/api/src/onboarding/kycThumbnail.ts`
- **What / Why:** The 8 MiB upload cap limits the file, not the decoded size. A small PNG can claim enormous dimensions, and sharp's default limit is about 268 megapixels (the code carried a comment saying so).
- **Impact:** One upload can exhaust the 512 MB API.
- **Fix:** `limitInputPixels` of 50 MP, and a clean 422 `image_too_large`.
- **Tests:** A header claiming 10000×10000 is refused; the test fails on the old code.

## 58. The seed script wipes any database it is pointed at
**Where:** `db/seed/index.ts`, `ops/docker-compose.yml`
- **What / Why:** It truncates merchants, ledger, transactions and more with no check. The compose file says that is fine on a shared database, and `docs/RUNBOOK.md` records "staging-2 got reset this way".
- **Impact:** One wrong `DATABASE_URL` destroys real data.
- **Fix:** Refuse when merchants already exist unless `SEED_RESET=1`.
- **Tests:** Refuses with 8 merchants, runs on an empty database or with the flag.

## 59. PATCH on a webhook endpoint with an invalid status returns 500
**Where:** `apps/api/src/webhooks/update.ts`
- **What / Why:** The status goes straight into the `UPDATE` and hits the column's `CHECK (active, disabled)`, which surfaces as a server error.
- **Fix:** Validate it and answer 400 `invalid_status`.
- **Tests:** `status: "paused"` → 400 (before: 500).

## 60. Deleting a webhook endpoint that has delivery history returns 500
**Where:** `apps/api/src/webhooks/cancel.ts`
- **What:** The doc comment says deliveries are kept when an endpoint is deleted, and a code comment claims "FK is ON DELETE SET NULL (0029)".
- **Why:** Migration 0022 makes `webhook_deliveries.endpoint_id` `NOT NULL` with no `ON DELETE` rule (0029 is an unrelated migration), so the delete fails as soon as an endpoint has any delivery.
- **Impact:** Merchants cannot delete a used endpoint and get an opaque 500.
- **Fix:** Answer 409 `endpoint_has_deliveries` and point to disabling the endpoint, which keeps the audit trail. Loosening the foreign key would have meant making the delivery log nullable.
- **Tests:** Delete with a delivery → 409 (before: 500).

## 61. Bulk KYC approval leaves no review record
**Where:** `apps/api/src/admin/bulkKyc.ts`
- **What / Why:** `recordKycReviewInTx` is documented as the one function allowed to approve a merchant (it writes `merchant_kyc_reviews` and the merchant row together). Bulk approve updated `merchants` directly; a test comment even claims the per-merchant reviews are written.
- **Impact:** Merchants approved in bulk have no review record, so the compliance trail is missing exactly where approvals are cheapest.
- **Fix:** Call `recordKycReviewInTx` for each eligible merchant, with the admin as reviewer.
- **Tests:** Each bulk-approved merchant has an `approved` review row naming the admin (before: none).

## 62. Capture ignores the authorization hold
**Where:** `apps/api/src/payments/capture.ts`
- **What / Why:** Authorize creates a hold that lasts 7 days (the card-not-present scheme rule, per a code comment) and `expire_holds` marks old holds `expired`. Capture only checked the transaction status, never the hold.
- **Impact:** An authorization can be captured after it has expired or been released, against the scheme rule.
- **Fix:** Require an active, unexpired hold; otherwise 409 `authorization_expired`.
- **Tests:** Expired hold → 409 and nothing captured (before: captured).

---

## 63. The development webhook key is the wrong length
**Where:** `apps/api/src/config.ts`
- **What / Why:** Outside production, a missing `WEBHOOK_SECRET_ENCRYPTION_KEY` falls back to a built-in dev key. That key base64-decodes to 34 bytes, but the same file requires exactly 32, so `loadConfig` throws. Found when the seed job on the live server (which did not get the variable) died with "must base64-decode to exactly 32 bytes, got 34".
- **Impact:** Local development, the seed script and any test run without the variable cannot start at all; the README promise of "a dev key is used otherwise" was never true.
- **Fix:** Replace the fallback with a key that decodes to 32 bytes. Production still refuses to start without a real key.
- **Tests:** `loadConfig` with `NODE_ENV=development` and no key → boots with a 32-byte key (before: throws "got 34").

- **Follow-up (this session):** The same invalid development key was independently found during this audit; it is the startup defect already recorded here, not an additional bug.
- **Follow-up fix:** The audit corrected the fallback in `c8dbe5f`; subsequent hosting work also corrected its copy. Do not count the two commits as two defects.
- **Follow-up tests:** `config.test.ts` checks development startup and production key requirements; API boot and configuration review passed.

## 64. A malformed JSON body returns 500
**Where:** `apps/api/src/plugins/errorHandler.ts`
- **What / Why:** Fastify rejects a body that is not valid JSON with a 4xx error, but the error handler only knew `AppError`, schema validation and upload limits; everything else became `500 internal_error` and was logged as an unhandled server error. Found on the live server while testing the API by hand.
- **Impact:** A client typo looks like a server outage (wrong status, misleading alerts, error-rate dashboards inflated by caller mistakes).
- **Fix:** Any Fastify error that already carries a 4xx status answers `400 invalid_request` with its message; real faults still answer a bare 500.
- **Tests:** `{bad` with `content-type: application/json` → 400 (before: 500); a thrown error → still 500 with no details.

---

## 65. Dashboard fee display selects backfilled or future terms
**Where:** `apps/api/src/fees/currentFeeScheduleDisplay.ts`
- **What / Why:** Dashboard fee selection used entry/backfill order and could choose a future schedule, displaying terms different from the effective agreement.
- **Impact:** Merchants see a fee different from the agreement currently in force.
- **Fix:** Resolve display terms by effective date, excluding future schedules (`c8dbe5f`).
- **Tests:** `fees/currentFeeScheduleDisplay.test.ts` covers backfills and future schedules.


## 66. Ledger history can be mutated after the payable cache is updated
**Where:** `db/migrations/0083_ledger_append_only.sql`
- **What / Why:** An insert-maintained cache could drift if existing ledger rows were edited or deleted.
- **Impact:** UPDATE/DELETE can invalidate the journal audit trail and drift an insert-maintained cache.
- **Fix:** Enforce append-only journal history (`276eb2d`, migration 0083).
- **Tests:** Migration guards UPDATE/DELETE; supported corrections are new balanced postings. This is an invariant safeguard, not a historical repair.


## 67. Lifetime and monthly payout monitoring loses fils through floats
**Where:** `apps/settlement/internal/settlement/payout_estimate.go`, `db/migrations/0082_integer_payout_monitoring.sql`
- **What / Why:** Lifetime/monthly payout estimates still used float32/REAL despite integer payout fixes, losing fils at higher volume.
- **Impact:** High-volume monitoring estimates disagree with exact financial amounts.
- **Fix:** Integer monitoring and database view arithmetic (`276eb2d`, migration 0082).
- **Tests:** `payout_estimate_test.go` includes large exact amounts.


## 68. Retrying an adjustment CSV posts the same money twice
**Where:** `apps/api/src/admin/adjustmentImport.ts`, migration 0080
- **What / Why:** Uploading identical CSV content created another import and posted the same adjustment twice. Direct cache deltas also conflicted with the ledger cache authority.
- **Impact:** A network retry or repeated upload duplicates financial adjustments.
- **Fix:** Durable normalized content/request-key receipt, mismatch rejection and journal-driven cache update (`881ccfb`, migration 0080).
- **Tests:** `admin/adjustmentImport.test.ts`: retry does not repost; differing content under the same key rejects.


## 69. Concurrent webhook dispatchers race and retries escape their budget
**Where:** `apps/api/src/webhooks/dispatcher.ts`, migration 0079
- **What / Why:** Dispatchers could send the same pending row concurrently. Preparation failures or crashed attempts could evade the retry budget; stale leases could complete newer work.
- **Impact:** Concurrent sends, stale completions and unbounded failed attempts undermine delivery reliability.
- **Fix:** Durable claim leases, bounded attempts, lease/endpoint recheck before handoff and fenced completion (`ebe826f`, `38cc78e`, migration 0079).
- **Tests:** `webhooks/dispatcher.test.ts` and independent lease/crash-budget checks. Delivery remains at-least-once; receivers still deduplicate.


## 70. Webhook replay changes the delivery identity
**Where:** `apps/api/src/webhooks/replay.ts`
- **What / Why:** Replay allocated a new receiver delivery identity, defeating merchant deduplication.
- **Impact:** A receiver deduplicating by delivery ID can process the same event twice.
- **Fix:** Reset retry state on the original delivery identity (`ebe826f`).
- **Tests:** Replay/dispatcher tests verify stable `Webhook-Delivery-Id` across replay.


## 71. Support admins can create immediately posted credits
**Where:** `apps/api/src/routes/adminCredits.ts`
- **What / Why:** Credit creation required an admin session but no finance role, allowing support to post below-threshold financial credits.
- **Impact:** A role without finance authority can move money through below-threshold credits.
- **Fix:** Finance/super-admin role gate (`6128786`).
- **Tests:** `routes/adminCredits.test.ts`: actual support login/OTP returns 403 and creates no journal. Principal-only second-approval threshold policy is unchanged.


## 72. Reporting skips late commits and concurrent consumers double-count
**Where:** `apps/reporting/src/consumer/cursor.ts`, `runConsumerPass.ts`, migration 0077
- **What / Why:** Sequence order is not commit order: a lower event ID committed late was skipped forever. Concurrent consumers could also double-aggregate.
- **Impact:** Merchant financial projections permanently omit or duplicate committed events.
- **Fix:** Per-event durable receipts and consumer serialization (`6128786`, migration 0077).
- **Tests:** `consumer/concurrency.test.ts`: late lower IDs recovered and concurrent passes apply once.


## 73. Batch-close reporting crashes on missing daily rows and misses paid status
**Where:** `apps/reporting/src/consumer/applyEvent.ts`
- **What / Why:** Batch-close projection could dereference a nonexistent daily rollup row, including refund-only/no-capture days; paid payout events were not reflected in normal reporting.
- **Impact:** Normal event consumption can roll back or leave payout reports marked closed.
- **Fix:** Treat absent diagnostic history as zero and consume paid-status projection updates (`6128786`).
- **Tests:** Reporting apply/consumer tests; malformed financial payloads still fail and roll back rather than being silently skipped.


## 74. Analytics rebuild races the worker and erases imported history
**Where:** `apps/api/src/admin/reportingRebuild.ts`, `apps/reporting/src/cli/rebuild.ts`
- **What / Why:** Rebuild could race incremental consumption or erase imported source history lacking outbox events; independently read source/receipt sets could disagree.
- **Impact:** Rebuild can lose source-only financial history or double-count incremental events.
- **Fix:** Shared lock plus one-statement source/batch/eligible-event snapshot and atomic receipt rebuild (`6128786`).
- **Tests:** Concurrency tests cover rebuild versus consumer and source-only imported history.


## 75. Invalid API inputs reach SQL or silently normalize dates
**Where:** `apps/api/src/lib/requestValidation.ts`, registered transaction, analytics, reporting and settlement routes
- **What / Why:** Invalid dates, UUIDs, pagination/cursors and money input reached SQL casts or normalized nonexistent dates, producing errors or incorrect ranges.
- **Impact:** Caller errors become server faults or incorrect report windows and pagination.
- **Fix:** Typed validation at the registered API boundaries (`6128786`, `82129f2`).
- **Tests:** `routes/inputValidation.test.ts` and settlement route regressions include invalid calendar dates and equal-time pagination. This is not a claim that every unused helper was rewritten.


## 76. Journaled credits and manual corrections never reach payouts
**Where:** `apps/settlement/internal/settlement/adjustments.go`, `batch.go`, migration 0085
- **What / Why:** Settlement selected only capture/refund events, so real journaled credits and manual corrections were not included in a batch.
- **Impact:** A genuine journaled correction changes payable but is omitted from event-only payouts.
- **Fix:** Claim eligible journal adjustments once and include them in batch accounting (`38cc78e`, migration 0085). Cache-only display corrections remain excluded by policy; refund carry is tracked under #30.
- **Tests:** `adjustments_test.go` and refund-netting tests check claim-once behavior, credits and debt recovery over multiple small days. Cache-only display corrections are intentionally excluded.


## 77. Captures committed after a close remain unbatched forever
**Where:** `apps/settlement/internal/settlement/batch.go`
- **What / Why:** A capture committed after its business day closed could be left unbatched permanently.
- **Impact:** A valid capture can be omitted from all future payouts.
- **Fix:** Claim eligible older unbatched events once in the next chronological close, preserving closed history (`38cc78e`).
- **Tests:** Batch tests assert late inclusion, future-event exclusion, durable receipt and no duplicate on rerun.


## 78. Checkout fields and dashboard tables overflow phone screens
**Where:** `apps/web/src/pages/checkout/CheckoutPage.css`, `apps/web/src/dashboard.css`, `apps/admin/src/admin.css`
- **What / Why:** Checkout numeric fields and merchant/admin tables overflowed narrow viewports.
- **Impact:** Narrow screens clip controls or require document-level horizontal scrolling.
- **Fix:** Shrinkable form grid, wrapping and contained table scrolling (`dba052c`).
- **Tests:** Desktop/390px browser evidence and independent CSS review. Later restyles were separate work; this does not certify comprehensive accessibility.


## 79. Vulnerable decoder, frontend and development dependencies remain installed
**Where:** `apps/api/package.json`, `apps/web/package.json`, `apps/admin/package.json`, `package-lock.json`
- **What / Why:** Vulnerable decoder and development/router dependencies remained in the full workspace despite a misleading workspace-scoped audit result.
- **Impact:** Known affected dependency versions remain in the complete workspace despite a narrower audit appearing clean.
- **Fix:** Compatible patches/sharp update (`39de897`), then tested Vite/plugin/router upgrades (`ba21deb`).
- **Tests:** Full-workspace `npm audit` zero findings at verification; typecheck, both builds, decoder tests and browser regressions pass. Zero dependency findings does not certify application security.


---

## 80. Over plain HTTP, paying and opening a transaction crash
**Where:** `apps/web/src/pages/checkout/CheckoutPage.tsx`, `transactions/RefundDrawer.tsx`, `transactions/TransactionDetailPage.tsx`
- **What / Why:** The pages make their Idempotency-Key with `crypto.randomUUID()`. Browsers only provide that function in a secure context (HTTPS or localhost). Found on the live server (plain HTTP, no domain): opening any transaction showed "Unexpected Application Error: crypto.randomUUID is not a function".
- **Impact:** On any non-HTTPS deployment the hosted checkout cannot take a payment (the Pay handler throws) and merchants cannot open a transaction, capture or refund from the dashboard. Local development on localhost hides it.
- **Fix:** One helper, `newIdempotencyKey()`, that uses `randomUUID` when present and otherwise builds a v4 UUID from `crypto.getRandomValues` (available everywhere).
- **Tests:** With `randomUUID` removed, the helper still returns distinct valid v4 UUIDs; verified on the live site that the transaction page opens again.


---

## 81. Suspending a merchant does not stop its existing keys and sessions
**Where:** `apps/api/src/apiKeys/verify.ts`, `apps/api/src/auth/sessions.ts`
- **What / Why:** Login checks `merchants.status = 'active'`, but the API-key and session lookups that run on every request never looked at the merchant. Reported by the captain's review and reproduced on the live server: after suspending a merchant, its existing API key still authorized a payment (201).
- **Impact:** Suspending or closing a merchant (fraud, offboarding) does not stop it taking or capturing payments until every key is revoked by hand.
- **Fix:** Both lookups join `merchants` and require `status = 'active'`, so suspension takes effect on the next request; reactivating restores access.
- **Tests:** Suspended and closed → 401, reactivated → 201 (before: 201 while suspended). Re-checked on the live server.


---

## 82. The overload guard could be skipped
**Where:** `apps/api/src/plugins/overload.ts`
- **What / Why:** The guard matched the raw URL, so `POST /v1/transactions?x=1` did not match and went straight to the database pool. The public checkout route `POST /v1/payment-links/:token/pay`, which also holds a connection across the acquirer call, was not in the list. Reported by the captain's review.
- **Impact:** Under load, checkout traffic (and anyone adding a query string) queued in the pool instead of getting a fast 503, the exact failure the guard exists to prevent.
- **Fix:** Match on the path without the query string and include the payment-link pay route.
- **Tests:** With the cap full, `?x=1` and the pay route both get 503, then 200 once a slot frees (before: the `?x=1` request bypassed the guard and blocked on the pool).


---

## Session verification and existing-data effects

The follow-up notes in existing entries and new entries #65–79 come from this audit session, based on `fd8f395` and merged through `9dfa6f5`. Their commit IDs, tests and independent checks are recorded above and in [API review](docs/verification/API_REVIEW_20261030.md), [settlement review](docs/verification/SETTLEMENT_REVIEW_20261030.md), [cross-repository review](docs/verification/CROSS_REPO_REVIEW_20261030.md) and [independent QA](docs/verification/INDEPENDENT_QA_20261030.md). They do not re-count the original fixes as newly found bugs.

### Test corrections, not additional product bugs

Commit `e89295f` strengthened the two outdated Go expectations to cover late-event selection and claim-once refund debt. It also changed synthetic archive fixtures to inert outbox event types, preventing malformed financial events from contaminating shared reporting tests. Production event validation was not relaxed. These are test/fixture corrections supporting the fixes above, not extra scored vulnerabilities. Independent full Go and archive checks passed.

### Existing-data effects and limitations

- These fixes do **not** automatically reverse historical duplicate charges/imports, repair old payout instructions, recover already-skipped reporting rows or recreate missing fee metadata. Reconcile historical financial state explicitly; use the reviewed source analytics rebuild for projections. Never delete uncertain provider fences or rewrite financial history to make a report green.
- Migrations add receipts, leases, cache maintenance, append-only guards, monitoring types, claims and provider fences. Existing malformed/duplicate records may require investigation. Monitoring integer conversion cannot recover precision already lost historically.
- New late-capture and adjustment claims preserve closed/paid batch history and flow eligible unclaimed value into a later chronological batch. March sweep changes prevent future replay errors; previously posted historical corrections are not automatically undone.
- The acquirer is an in-process simulator. Stable keys/fences cover the tested local response-loss hazards, not a real provider's persistence across simulator restarts. Unknown results require original-key recovery or reconciliation, never timed deletion of intent.

### Latest verification of this session's fixes

The major review at `de870d2` ran fresh PostgreSQL suites: API 462, reporting 15, money 40, events 4, web 9, scripts 9 and seed 1: **540 passing TypeScript/seed tests**, plus all Go packages passing with `-count=1`. Strict TypeScript, both frontend builds and full dependency audit passed. Independent financial lifecycle checked exact fils, refund fee conservation, scheme residue, payout reruns, journal balance, cache and reconciliation. Current local browser flow passed 18 grouped checks using a temporary runner adjusted for renamed Month/Year labels; the tracked runner still has the old labels. Live merchant/admin login, pending-session rejection, navigation and logout passed separately.

These later results supersede older red snapshots in the linked checkpoint documents; they do not prove that every possible bug is fixed. The detailed later review logs are local `/tmp` artifacts, not automatically part of the public submission. Original committed evidence remains under `docs/verification/evidence/`.

## Reported but not fixed by this session

- **Merchant suspension/closure:** fixed after this review as #81 (existing keys and sessions now require an active merchant; reproduced and re-checked on the live server).
- **Overload coverage:** fixed after this review as #82 (guard matches the path without the query and covers public payment-link payments).
- **MDR reporting:** batch fee/net recalculation leaves payout analytics at the old amounts until admin source rebuild. The financial batch correction and stale projection are distinct.
- **HTTP browser UUID crash:** fixed as #80 (`3c4f4d3`), deployed and re-verified on the live page.
- **Deployment:** live on plain HTTP because no domain was provided (Caddy switches to HTTPS automatically once one is set). Docker logs are now capped per container (10 MB × 3 files).

---

## Other decisions and open risks

- **OTP is shown on screen in the hosted demo.** The second factor works end to end (code generated, hashed, attempt-limited, expiring), but delivery is the demo flag `DEMO_SHOW_OTP_IN_PRODUCTION`, not an SMS/email provider. Reason: a provider such as Brevo, Twilio or AWS SES needs an account, a verified sender domain and secrets the organisers would have to hold, and judges would not receive codes for seeded addresses like `owner@alpharetail.example`, so the demo would be unusable for them. Turning 2FA off instead would have reopened the bypass fixed in #39. Safeguard: implement `apps/api/src/auth/notifier.ts` against a provider and set the flag to false; nothing else changes.
- **Payout analytics lag an MDR recalculation** (see above): batch money is correct; the trend rollup needs the admin rebuild. Proposed: refresh it in the same transaction.

- **Cache-only display adjustments:** ADR-0006 deliberately changes the dashboard cache without a journal. A rebuild removes them; they are not money owed through settlement. The earlier admin guide describing them as journaled is misleading.
- **MDR terms:** recalculation uses merchant MDR, while original capture terms may come from schedules and volume tiers. Defining “current terms” remains a finance decision; see #50 and the stale reporting finding above.
- **Historical metadata:** old events without immutable net-fee snapshots still need reconstruction and reconciliation; a new-code fix does not establish the correctness of every historical amount.
- **Unused upstream helpers:** `apps/api/src/v1/*`, `parsePromotionalDiscountFils` and `recordCaptureMetric` are not registered in the live paths reviewed. Latent defects are not counted as reachable exploits.
- **Previously committed acquirer secret:** removed from working files under #26, but retained in Git history. Real credentials must be rotated; the demo provider is simulated.
