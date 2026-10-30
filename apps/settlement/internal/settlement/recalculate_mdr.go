package settlement

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/filspay/settlement/internal/money"
)

// BatchAdjustment is one batch's before/after fee, as changed by a
// recalculation pass.
//
// DiffFils is NewFeeFils - OldFeeFils. A positive diff means the merchant was
// undercharged at close; the correcting ledger group lands in the current
// period's batch, so the original batch's figures stay as they were paid.
type BatchAdjustment struct {
	BatchID    uuid.UUID
	BatchDate  time.Time
	Status     string
	OldFeeFils money.Fils
	NewFeeFils money.Fils
	DiffFils   money.Fils
}

// RecalcResult summarizes one RecalculateMDR pass.
type RecalcResult struct {
	BatchesConsidered int
	Adjusted          []BatchAdjustment
}

// batchRow is one settlement_batches row as read by the recalculation scan.
type batchRow struct {
	id             uuid.UUID
	batchDate      time.Time
	status         string
	grossFils      money.Fils
	feeFils        money.Fils
	netPayoutFils  money.Fils
	adjustmentFils money.Fils
	carryInFils    money.Fils
	carryOutFils   money.Fils
}

// RecalculateMDR re-derives the fee on a merchant's closed and paid batches in
// [from, to) at the merchant's current terms and posts the difference.
//
// A closed batch has not been paid yet, so its fee and net payout are updated and
// the payout follows. A paid batch is frozen history (the bank instruction has
// gone out): its row is left alone and only the correcting ledger entry is posted,
// once; running this twice must not post the same difference twice.
func RecalculateMDR(ctx context.Context, db *pgxpool.Pool, merchantID uuid.UUID, from, to time.Time) (RecalcResult, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return RecalcResult{}, fmt.Errorf("settlement: RecalculateMDR: begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var mdrBps, discountBps int64
	err = tx.QueryRow(ctx, `SELECT mdr_bps, negotiated_discount_bps FROM merchants WHERE id = $1`, merchantID).
		Scan(&mdrBps, &discountBps)
	if err != nil {
		return RecalcResult{}, fmt.Errorf("settlement: RecalculateMDR: load merchant: %w", err)
	}

	rows, err := tx.Query(ctx, `
		SELECT id, batch_date, status, gross_fils, fee_fils, net_payout_fils, adjustment_fils, carry_in_fils, carry_out_fils
		  FROM settlement_batches
		 WHERE merchant_id = $1 AND batch_date >= $2 AND batch_date < $3
		   AND status <> 'open'
		 ORDER BY batch_date
		 FOR UPDATE
	`, merchantID, from, to)
	if err != nil {
		return RecalcResult{}, fmt.Errorf("settlement: RecalculateMDR: select batches: %w", err)
	}
	var batches []batchRow
	for rows.Next() {
		var b batchRow
		var gross, fee, net int64
		if err := rows.Scan(&b.id, &b.batchDate, &b.status, &gross, &fee, &net, &b.adjustmentFils, &b.carryInFils, &b.carryOutFils); err != nil {
			rows.Close()
			return RecalcResult{}, fmt.Errorf("settlement: RecalculateMDR: scan batch: %w", err)
		}
		b.grossFils = money.Fils(gross)
		b.feeFils = money.Fils(fee)
		b.netPayoutFils = money.Fils(net)
		batches = append(batches, b)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return RecalcResult{}, fmt.Errorf("settlement: RecalculateMDR: iterate batches: %w", err)
	}
	rows.Close()

	var adjusted []BatchAdjustment
	for _, b := range batches {
		newFee, err := recomputeBatchFee(ctx, tx, b.id, mdrBps, discountBps)
		if err != nil {
			return RecalcResult{}, err
		}
		// Explicit deferred corrections remain outside the frozen fee even
		// when a later terms change would make this batch positive again.
		prior, err := priorMdrAdjustment(ctx, tx, b.id)
		if err != nil {
			return RecalcResult{}, err
		}
		currentFee := b.feeFils + prior
		diff := newFee - currentFee
		if diff == 0 {
			continue
		}
		newNetPayout := b.grossFils - newFee + b.adjustmentFils + b.carryInFils - b.carryOutFils
		deferToNextBatch := prior != 0 || b.status == "paid" || b.carryInFils != 0 || b.carryOutFils != 0 || newNetPayout < 0
		if err := postMdrAdjustment(ctx, tx, merchantID, b.id, diff, deferToNextBatch); err != nil {
			return RecalcResult{}, err
		}
		if !deferToNextBatch {
			if _, err := tx.Exec(ctx, `
				UPDATE settlement_batches SET fee_fils = $2, net_payout_fils = $3 WHERE id = $1
			`, b.id, int64(newFee), int64(newNetPayout)); err != nil {
				return RecalcResult{}, fmt.Errorf("settlement: RecalculateMDR: update batch %s: %w", b.id, err)
			}
		}
		// Ledger insertion maintains the payable cache atomically.
		adjusted = append(adjusted, BatchAdjustment{
			BatchID:    b.id,
			BatchDate:  b.batchDate,
			Status:     b.status,
			OldFeeFils: currentFee,
			NewFeeFils: newFee,
			DiffFils:   diff,
		})
	}

	if err := tx.Commit(ctx); err != nil {
		return RecalcResult{}, fmt.Errorf("settlement: RecalculateMDR: commit: %w", err)
	}
	return RecalcResult{BatchesConsidered: len(batches), Adjusted: adjusted}, nil
}

// priorMdrAdjustment is the net fee change earlier recalculations have already
// posted against a paid batch (a fee increase is positive).
func priorMdrAdjustment(ctx context.Context, tx pgx.Tx, batchID uuid.UUID) (money.Fils, error) {
	var net int64
	err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_fils ELSE -amount_fils END), 0)
		  FROM ledger_entries
		 WHERE settlement_batch_id = $1
		   AND account_id = 'platform_fee_revenue'
		   AND (description IN ('MDR recalculation adjustment: paid batch', 'MDR recalculation adjustment: deferred batch')
                OR (description = 'MDR recalculation adjustment'
                    AND occurred_at >= (SELECT paid_at FROM settlement_batches WHERE id = $1)))
	`, batchID).Scan(&net)
	if err != nil {
		return 0, fmt.Errorf("settlement: RecalculateMDR: prior adjustments for %s: %w", batchID, err)
	}
	return money.Fils(net), nil
}

// recomputeBatchFee sums ComputeSettlementFee over every transaction_events
// row carrying this batch's id — the same per-event-then-sum discipline
// CloseBatch step 8 uses, never ApplyRateFils applied once to a pre-summed
// total, so this recomputation can never itself diverge from what a fresh
// CloseBatch would have produced at today's rate.
func recomputeBatchFee(ctx context.Context, tx pgx.Tx, batchID uuid.UUID, mdrBps, discountBps int64) (money.Fils, error) {
	rows, err := tx.Query(ctx, `
		SELECT amount_fils,
		       event_type IN ('refunded', 'refund_partial') AS is_refund,
		       COALESCE((metadata->>'feeReversedFils')::bigint, 0) AS fee_reversed_fils
		  FROM transaction_events WHERE settlement_batch_id = $1 ORDER BY id
	`, batchID)
	if err != nil {
		return 0, fmt.Errorf("settlement: RecalculateMDR: select batch events for %s: %w", batchID, err)
	}
	defer rows.Close()

	var fee money.Fils
	for rows.Next() {
		var amountFils, feeReversedFils int64
		var isRefund bool
		if err := rows.Scan(&amountFils, &isRefund, &feeReversedFils); err != nil {
			return 0, fmt.Errorf("settlement: RecalculateMDR: scan batch event for %s: %w", batchID, err)
		}
		// FP-300: refund events are batched too (CloseBatch nets them). Their
		// fee is what the refund actually reversed, not a new rate applied to
		// a negative amount.
		if isRefund {
			fee -= money.Fils(feeReversedFils)
			continue
		}
		fee += ComputeSettlementFee(money.Fils(amountFils), mdrBps, discountBps)
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("settlement: RecalculateMDR: iterate batch events for %s: %w", batchID, err)
	}
	return fee, nil
}

// postMdrAdjustment posts the two-leg, entry_group_id-balanced pair for one
// batch's fee difference. A fee increase moves money from the merchant to
// platform fee revenue; a decrease reverses both legs. ledger_entries has a
// CHECK (amount_fils > 0), so the magnitude is always posted positive and
// the sign is carried by which account is debited.
//
// Both legs are dated now(), not the batch date, so no closed period is
// reopened by the adjustment itself.
func postMdrAdjustment(ctx context.Context, tx pgx.Tx, merchantID, batchID uuid.UUID, diff money.Fils, paid bool) error {
	if diff == 0 {
		return nil
	}
	magnitude := diff
	if magnitude < 0 {
		magnitude = -magnitude
	}

	debitAccount, creditAccount := "merchant_payable", "platform_fee_revenue"
	if diff < 0 {
		debitAccount, creditAccount = "platform_fee_revenue", "merchant_payable"
	}

	description := "MDR recalculation adjustment"
	if paid {
		description += ": deferred batch"
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO ledger_entries
		  (entry_group_id, merchant_id, settlement_batch_id, account_id, direction, amount_fils, occurred_at, description)
		VALUES
		  ($1, $2, $3, $4, 'debit',  $6, now(), $7),
		  ($1, $2, $3, $5, 'credit', $6, now(), $7)
	`, uuid.New(), merchantID, batchID, debitAccount, creditAccount, int64(magnitude), description)
	if err != nil {
		return fmt.Errorf("settlement: RecalculateMDR: post adjustment for batch %s: %w", batchID, err)
	}
	return nil
}
