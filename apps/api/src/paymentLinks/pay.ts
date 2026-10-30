import type { Pool } from "pg";
import { toFils } from "@filspay/money";
import { authorizeTransaction } from "../payments/authorize.js";
import { captureTransactionInTx } from "../payments/capture.js";
import { withTransaction } from "../db/withTransaction.js";
import type { AcquirerSimulator, SimulatedCardInput } from "../acquirer/types.js";

export interface PayPaymentLinkInput {
  token: string;
  card: SimulatedCardInput;
  idempotencyKey: string;
  submittedAt?: string;
}

export interface PayPaymentLinkResult {
  statusCode: number;
  body: unknown;
}

/** Returned by the claim UPDATE; merchant_id comes from the link row, never from the request. */
interface ClaimedLinkRow {
  id: string;
  merchant_id: string;
  amount_fils: string | number;
  reference: string | null;
  /** reserved_at as text: microsecond precision survives, so it works as
   *  this request's ownership token for the reservation. */
  reservation: string;
  capture_transaction_id: string | null;
}

interface LinkStatusRow {
  status: string;
  expires_at: Date;
}

/** Expiry is always judged on the server's clock. `submittedAt` comes from
 * the buyer's browser, so trusting it let anyone pay an expired link by
 * back-dating it (FP-187). It is accepted for compatibility and ignored. */
export function expiryReferenceTime(_submittedAt?: string): Date {
  return new Date();
}

/**
 * `POST /v1/payment-links/:token/pay` business logic (public,
 * unauthenticated). Calls `authorizeTransaction`
 * then `captureTransaction` directly, in sequence, never issuing an HTTP
 * request back into the API's own /v1/transactions routes.
 *
 * Concurrency: an owned authorization lease precedes a durable transaction
 * attachment. Capture and link finalization share one row-locked transaction;
 * retries recover that transaction rather than authorize another buyer.
 */
export async function payPaymentLink(
  pool: Pool,
  acquirer: AcquirerSimulator,
  config: { paymentLinkReservationTimeoutSeconds: number },
  input: PayPaymentLinkInput,
): Promise<PayPaymentLinkResult> {
  const expiryCheckTime = expiryReferenceTime(input.submittedAt);

  // Step 1 — claim. A single UPDATE is already atomic; no explicit
  // transaction needed.
  // YA: one conditional UPDATE = atomic claim, no explicit txn needed. correct
  const claimResult = await pool.query<ClaimedLinkRow>(
    `UPDATE payment_links
        SET status = 'reserved', reserved_at = now()
      WHERE token = $1
        AND (
             status = 'active'
             OR (status = 'reserved' AND reserved_at < now() - ($2 || ' seconds')::interval)
            )
        AND (expires_at > $3
          OR EXISTS (SELECT 1 FROM provider_operation_fences f WHERE f.transaction_id = payment_links.capture_transaction_id)
          OR EXISTS (SELECT 1 FROM transactions t WHERE t.id = payment_links.capture_transaction_id AND t.captured_fils > 0))
      RETURNING id, merchant_id, amount_fils, reference, reserved_at::text AS reservation, capture_transaction_id`,
    [input.token, config.paymentLinkReservationTimeoutSeconds, expiryCheckTime],
  );

  const claimedRow = claimResult.rows[0];
  if (!claimedRow) {
    return classifyClaimFailure(pool, input.token, config.paymentLinkReservationTimeoutSeconds, expiryCheckTime);
  }

  const link = {
    id: claimedRow.id,
    merchantId: claimedRow.merchant_id,
    amountFils: toFils(Number(claimedRow.amount_fils)),
    reference: claimedRow.reference,
  };
  const reservation = claimedRow.reservation;

  // A transaction attached by an earlier attempt is durable recovery state.
  // Never authorize another card after a capture might already have succeeded.
  let txnId = claimedRow.capture_transaction_id;
  if (!txnId) {
    const authResult = await authorizeTransaction(pool, acquirer, {
      merchantId: link.merchantId,
      amountFils: link.amountFils,
      card: input.card,
      reference: link.reference ?? undefined,
      idempotencyKey: `paylink:${link.id}:${input.idempotencyKey}:authorize`,
      actor: { type: "system" },
    });
    if (authResult.statusCode !== 201) {
      await releaseReservation(pool, link.id, reservation);
      return { statusCode: authResult.statusCode, body: { stage: "authorize", ...(authResult.body as Record<string, unknown>) } };
    }
    txnId = (authResult.body as { id: string }).id;
    const attached = await pool.query(
      `UPDATE payment_links SET capture_transaction_id = $3
        WHERE id = $1 AND status = 'reserved' AND reserved_at = $2::timestamptz`,
      [link.id, reservation, txnId],
    );
    if (attached.rowCount !== 1) {
      return { statusCode: 409, body: { error: "payment_link_processing", stage: "capture" } };
    }
  }

  return withTransaction(pool, async (client) => {
    // Hold this row through capture and finalization using ONE connection.
    // Even an expired lease cannot be reclaimed while money is moving.
    const owned = await client.query(
      `SELECT id FROM payment_links WHERE id = $1 AND status = 'reserved'
        AND reserved_at = $2::timestamptz AND capture_transaction_id = $3 FOR UPDATE`,
      [link.id, reservation, txnId],
    );
    if (!owned.rows[0]) {
      return { statusCode: 409, body: { error: "payment_link_processing", stage: "capture" } };
    }
    // Legacy pre-finalization crashes may have a committed capture under
    // the original request-derived key. Recover the actual owned transaction
    // rather than invent another capture identity for already-moved money.
    const captured = await client.query(
      `SELECT 1 FROM transactions WHERE id = $1 AND merchant_id = $2 AND captured_fils = $3 FOR UPDATE`,
      [txnId, link.merchantId, link.amountFils],
    );
    const captureResult = captured.rows[0] ? { statusCode: 200, body: {} } : await captureTransactionInTx(client, acquirer, {
      transactionId: txnId,
      merchantId: link.merchantId,
      idempotencyKey: `paylink:${link.id}:${txnId}:capture`,
      actor: { type: "system", id: link.id },
    }, pool);
    if (captureResult.statusCode !== 200) {
      // A transport error may have an uncertain provider result: retain the
      // attached transaction and retry the same stable provider identity.
      await client.query(
        `UPDATE payment_links SET status = 'active', reserved_at = NULL,
           capture_transaction_id = CASE WHEN $2 = 402 THEN NULL ELSE capture_transaction_id END
          WHERE id = $1`, [link.id, captureResult.statusCode],
      );
      return { statusCode: captureResult.statusCode, body: { stage: "capture", ...(captureResult.body as Record<string, unknown>) } };
    }
    const finalized = await client.query<{ paid_at: Date }>(
      `UPDATE payment_links SET status = 'paid', paid_at = now(), reserved_at = NULL, transaction_id = $2, capture_transaction_id = NULL
        WHERE id = $1 RETURNING paid_at`, [link.id, txnId],
    );
    return {
      statusCode: 200,
      body: { status: "paid", transactionId: txnId, amountFils: link.amountFils, paidAt: finalized.rows[0]!.paid_at.toISOString() },
    };
  });
}

/**
 * Used by both decline branches above. Guarded by `status =
 * 'reserved'` for the same reason as the finalize UPDATE: this request
 * only ever releases the reservation it itself holds.
 */
async function releaseReservation(pool: Pool, linkId: string, reservation: string): Promise<void> {
  // Keyed on our own reservation: a stale request must never release a
  // reservation another buyer now holds (that reopened the link to a third).
  await pool.query(
    `UPDATE payment_links SET status = 'active', reserved_at = NULL
      WHERE id = $1 AND status = 'reserved' AND reserved_at = $2::timestamptz`,
    [linkId, reservation],
  );
}

/**
 * The claim UPDATE matched 0 rows. This second read carries no race risk —
 * nothing further is decided from it, it only explains a decision already
 * made by the failed UPDATE.
 */
// FH: "This second read carries no race risk" — Claude disagrees, says we should SELECT
// ... FOR UPDATE here. TODO
// am: its only for the error message. ignore
async function classifyClaimFailure(
  pool: Pool,
  token: string,
  reservationTimeoutSeconds: number,
  expiryCheckTime: Date,
): Promise<PayPaymentLinkResult> {
  const result = await pool.query<LinkStatusRow>(`SELECT status, expires_at FROM payment_links WHERE token = $1`, [
    token,
  ]);
  const row = result.rows[0];

  if (!row) {
    return { statusCode: 404, body: { error: "payment_link_not_found" } };
  }
  if (row.status === "paid") {
    return { statusCode: 409, body: { error: "payment_link_already_paid" } };
  }
  if (row.status === "canceled") {
    return { statusCode: 409, body: { error: "payment_link_canceled" } };
  }
  if (row.status === "active" && row.expires_at.getTime() <= expiryCheckTime.getTime()) {
    return { statusCode: 410, body: { error: "payment_link_expired" } };
  }
  if (row.status === "reserved") {
    // A concurrent claim attempt raced us and won between our own UPDATE's
    // failure and this SELECT. It's still within the timeout (if it
    // weren't, our claim UPDATE would have matched it) — reachable only in
    // a genuine race, not a stale read.
    return { statusCode: 409, body: { error: "payment_link_processing" } };
  }
  // Defensive fallback, should be unreachable given the claim UPDATE's
  // WHERE clause exactly mirrors these cases.
  return { statusCode: 409, body: { error: "payment_link_not_payable", status: row.status } };
}
