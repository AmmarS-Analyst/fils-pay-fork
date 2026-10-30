# API verification checkpoint — 2026-10-30

Scope: independent read of `origin/main..submission` and the API-related
`BUGS.md` claims, followed by concrete regression fixes on
`verify/submission-audit`. The final repository is authoritative; hackathon
handover and agent instruction claims were checked against executable code.
No remote publication or account usage claim is part of this checkpoint.

## Original submission claim matrix

“Fixed” below describes the original submission implementation at review time.
“Incomplete” identifies additional work implemented in this checkpoint.

| BUGS ID | Main branch claim and original submission verdict |
|---|---|
| 1 | Genuine; expiry now uses the server clock. Fixed. |
| 2 | Genuine; CSV uses the exact three-decimal parser. Fixed. |
| 3 | Genuine; OTP and link tokens now use CSPRNG. Fixed. |
| 4 | Genuine; atomic verification reservation fixes parallel guesses on one challenge. Resend interaction remained incomplete. |
| 5 | Genuine; support role mapping and active-admin predicate fix money-write impersonation and disabled grants. |
| 6 | Genuine; immutable admin IDs fix approval identity. |
| 7 | Genuine; old key revoked atomically with replacement and audit. |
| 8 | Genuine; transmitted serialization now matches signed bytes. |
| 9 | Genuine; required signatures, raw body, freshness and constant-time check added. Production override remained unsafe. |
| 10 | Genuine; unique callback ID plus conflict-ignore fixes duplicates. |
| 11 | Genuine; reservation fixes over-refund ceiling but publishes pending amounts as completed and strands totals on exceptions. Incomplete. |
| 12 | Genuine; captured amount is now the refund ceiling. |
| 13 | Genuine; both refund layers enforce merchant ownership. |
| 14 | Genuine; net capture fee includes discount debit. Independent partial rounding still loses or creates fils. Incomplete. |
| 15 | Genuine; reservation owner protects slow authorization, but a slow capture still permits a second charge. Incomplete. |
| 16 | Genuine; route streams with exact timestamp/ID keyset. Fixed. |
| 17 | Genuine; status recompute no longer changes sandbox flag. |
| 27 | Genuine; capture and void now enforce owner/finance role. |
| 34 | Genuine; hold expiration is one scoped UPDATE; unscoped DELETE refused. |
| 35 | Genuine; marketplace relationship checked against caller. |
| 36 | Genuine; anonymous request caused 500, not a demonstrated data leak. Authentication added. |
| 37 | Genuine missing-table reference; unused failing view removed. |
| 38 | Genuine nonexistent account columns and invalid kind; corrected. |
| 39 | Genuine OTP bypass; session lookup now requires completed authentication. |
| 40 | Genuine; detected bytes determine PDF type. |
| 41 | Genuine; literal-host and redirect protection added but DNS SSRF remained. Incomplete. |
| 42 | Genuine; advisory transaction lock serializes disbursement insertion. |
| 43 | Genuine; only under-review merchants selected under lock. |
| 44 | Genuine; cancel update and lookup now merchant-scoped. |
| 45 | Genuine; delivery-count cap helps but bytes and count/read race remained unbounded. Incomplete. |
| 47 | Genuine; omitted reason now receives a non-null default. |
| 48 | Genuine; challenge/session now belong to password-authenticated tenant account. |
| 49 | Genuine browser blocker; credentialed CORS allowlist/preflight implemented. Browser QA is separate. |
| 52 | Genuine; sequential resends preserve count but concurrent verify can make copied count stale. Incomplete. |
| 53 | Genuine; OTP success now reissues full-life session cookie. |
| 54 | Genuine relative to documented validation; future Bahrain effective dates rejected. |
| 55 | Genuine insecure randomness in an unused helper; fixed, latent rather than a deployed bypass. |
| 56 | Genuine tenfold scale error in unused helper; fixed, latent. |
| 57 | Genuine decoded-image allocation exposure; pixel limit and explicit error added. |
| 58 | Genuine accidental reset risk; nonempty seed requires explicit reset flag. |
| 59 | Genuine invalid-status database failure; now explicit 400. |
| 60 | Genuine history foreign-key failure; now explicit 409. |
| 61 | Genuine missing per-merchant KYC record; shared review function used atomically. |
| 62 | Genuine missing authorization hold check; active, unexpired hold required. |

Go IDs 18–25, 50–51, settlement reporting and UI are reviewed separately.

## Confirmed additional defects and checkpoint changes

1. **Slow capture can double-charge one payment link.** A one-time lease
   renewal still expires during an awaited capture. The link now holds its
   row lock through capture and finalization in the same transaction and
   connection. Migration 0081 adds `capture_transaction_id`, preserving the
   existing invariant that the final `transaction_id` exists iff paid.
   Interrupted attempts recover the attached authorization and stable capture
   identity rather than authorize a new buyer's card.
2. **Refund reservations were published as completed refunds.** A successful
   partial counted another pending partial; if that second request declined,
   status and webhook totals remained wrong. Refund validation, provider call,
   successful totals and ledger now share one row-locked transaction. Declines
   do not increment successful totals; exceptions roll back without stranded
   reserved capacity.
3. **Partial refund fee conservation failed.** A 1,000-fils capture with a
   25-fils fee, refunded as two halves, returned fees 12 + 12. Refunds now
   reverse cumulative successful entitlement less fees already reversed:
   12 + 13. Final refund reverses the exact remaining charged fee.
4. **Capture discount was separate and count-based.** Refunds could race the
   discount transaction, and concurrent partial captures could adjust the
   newest event more than once. Capture now posts each event's actual discount
   before its own event/outbox commit and records immutable `netFeeFils`.
   Later merchant pricing changes cannot change that historical charge.
5. **Provider identity changed after local rollback.** Authorize, capture and
   refund now derive the provider key from merchant, operation, client key and
   request hash, rather than random local claim ID/attempt. A lost response
   followed by a DB rollback therefore reuses the same provider identity.
   Migration 0086 adds a durable per-transaction provider fence, committed on
   a separate short connection before capture/refund. A different client key
   receives 409 until the original operation is reconciled. Only the original
   exact identity can recover an unknown outcome, including capture recovery
   after its authorization hold expires. The fence clears atomically with a
   successful journal or definitive decline; void and link cancellation cannot
   discard unresolved capture recovery. Legacy committed captures finalize
   without a second provider call. Link expiry cannot strand an already-issued
   unknown capture. Timeouts, exceptions and process
   failure do not clear it. One extra short PostgreSQL connection at a time
   commits fences independently without exhausting the held main pool slots.
   There is intentionally no transaction FK on this table, since its key-share
   check would deadlock the separate commit against the held financial row.
6. **Webhook DNS bypass.** Literal checks accepted a public-looking hostname
   pointing to 127.0.0.1. Every production delivery now validates all DNS
   addresses and pins a validated address to the actual HTTP(S) socket while
   preserving hostname/SNI verification. Redirects are not followed, and the
   response excerpt is capped at 64 KiB. Private-host delivery requires an
   explicit development/test opt-in at wiring.
7. **OTP resend race and repeated-login reset.** Resend now locks the pending
   session and its current challenge, reads the latest count under lock and
   enforces the replacement challenge's throttle. Promotion uses the same lock
   order. Migration 0084 adds an atomic account-wide budget, shared across
   challenges and password-step restarts: configured maximum attempts per ten
   minutes, cleared after successful OTP. Both merchant and admin verification
   use the budget. Merchant/admin active state is rechecked before promotion.
8. **Production flags weakened authentication.** Production configuration
   cannot expose OTP codes through `OTP_DEV_EXPOSE=true` or disable acquirer
   callback signatures through its false override.
9. **Archive memory limit was incomplete.** Archives check both delivery count
   and total payload bytes (8 MiB) before materializing records, within one
   repeatable-read snapshot. Oversized ranges fail explicitly, with no partial
   archive.

## Verification and practical limits

Targeted checks use a separate migrated real PostgreSQL database,
`filspay_api_review` on the isolated local server, avoiding interference with
the root agent's full suite. Evidence logs live under `/tmp` and are not
submission artifacts:

- `/tmp/filspay-api-review-tests.log`: 24/24 money/payment-link/discount tests.
- `/tmp/filspay-api-review-auth-tests.log`: 24/24 auth/config/DNS tests.
- `/tmp/filspay-api-review-checkpoint.log`: 55/55 consolidated checkpoint tests.
- API strict TypeScript typecheck is run after the final test additions.

Regression coverage includes a lease expiring during capture; provider
response loss and retry with the same identity; successful/declined concurrent
partials; exact cumulative refund fees; immutable discounted fee metadata;
parallel OTP resends; resend concurrent with blocked verification; account
budget across repeated login; suspension between password and OTP; production
flag overrides; private/mixed DNS records; actual pinned socket use; redirect
non-following; response caps; stalled DNS timeout; oversized archive rejection.

The simulator also caches `error` outcomes under a stable provider key. Such
an unresolved operation conservatively stays fenced for reconciliation;
changing the key to force a new random outcome would sacrifice money safety.

The provider is an in-process simulator: its cache is not durable across
process restarts. Stable outbound keys enable a real provider's durable
idempotency contract; this local simulator alone cannot prove that contract.
The final fence checkpoint uses a fresh isolated database `filspay_api_final`;
`/tmp/filspay-api-final-checkpoint.log` contains 55/55 passing targeted tests.
`/tmp/filspay-api-final-money.log` adds 47/47 passing existing payment-link, transaction and
money checks, including legacy pre-finalize recovery.
`/tmp/filspay-decline-retry.mts` separately verifies a definitive capture decline
returns 402 and clears the attached authorization, allowing a new buyer/key to
authorize and capture successfully. Uncertain outcomes retain the attachment.

Database locks are held during provider calls, matching existing capture
architecture, so pool capacity bounds concurrent payment work. Production
provider timeouts and external reconciliation remain necessary for ambiguous
provider outcomes. An unknown capture/refund outcome blocks new client keys until reconciliation;
retry the original key. Fences deliberately have no automatic expiry because
elapsed time cannot prove the provider did not move money.

Production OTP delivery is still a stub. Preventing debug exposure is a
security correction; production email/SMS delivery requires a real provider
integration before production sign-in can be operated.
