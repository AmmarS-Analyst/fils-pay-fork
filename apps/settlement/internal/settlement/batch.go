package settlement

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/filspay/settlement/internal/money"
	"github.com/filspay/settlement/internal/payouts"
	"github.com/filspay/settlement/internal/splits"
)

// ErrMerchantNotEligible is returned by CloseBatch when the merchant is
// not active/non-test-mode at the time of the call — CloseBatch is not
// meant to be invoked directly for such a merchant; the batching pass
// (RunDailyBatch) already filters merchants before ever calling it.
var ErrMerchantNotEligible = errors.New("settlement: merchant not found or not eligible for settlement")

// BatchResult is CloseBatch's return value.
type BatchResult struct {
	BatchID        uuid.UUID
	MerchantID     uuid.UUID
	BatchDate      time.Time
	AlreadyClosed  bool // true when this call found an existing 'closed'/'paid' batch and made no changes (idempotent no-op)
	GrossFils      money.Fils
	FeeFils        money.Fils
	NetPayoutFils  money.Fils
	AdjustmentFils money.Fils
	CarryInFils    money.Fils
	CarryOutFils   money.Fils
	EventCount     int
	LineCount      int
}

// PayoutResult is PayoutBatch's return value.
type PayoutResult struct {
	BatchID       uuid.UUID
	MerchantID    uuid.UUID
	AlreadyPaid   bool // true when the batch was already 'paid' (idempotent no-op)
	NotClosed     bool // true when the batch is not 'closed' (e.g. still 'open') — also a no-op
	NetPayoutFils money.Fils
}

type eligibleEvent struct {
	id            int64
	transactionID uuid.UUID
	amountFils    money.Fils
	occurredAt    time.Time
	// isRefund marks a refunded/refund_partial event (amountFils negative);
	// feeReversedFils is the MDR the refund handed back, as journaled.
	netFeeFils      *int64
	isRefund        bool
	feeReversedFils money.Fils
}

// CloseBatch computes and freezes settlement figures for one merchant's
// one business day. Idempotent: re-running it against an already-closed
// or already-paid batch for the same (merchant, date) is a safe no-op.
// Every capture-type transaction_events row it selects is marked with this
// batch's id inside the same transaction that freezes the batch's totals,
// so a row can never be picked up by two batches.
func CloseBatch(ctx context.Context, db *pgxpool.Pool, merchantID uuid.UUID, businessDate time.Time) (BatchResult, error) {
	_, end := BusinessDayWindow(businessDate)
	batchDateOnly := time.Date(businessDate.Year(), businessDate.Month(), businessDate.Day(), 0, 0, 0, 0, time.UTC)

	tx, err := db.Begin(ctx)
	if err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Step 2: create the batch row if it doesn't already exist.
	_, err = tx.Exec(ctx, `
		INSERT INTO settlement_batches (merchant_id, batch_date, status)
		VALUES ($1, $2, 'open')
		ON CONFLICT (merchant_id, batch_date) DO NOTHING
	`, merchantID, batchDateOnly)
	if err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: insert batch: %w", err)
	}

	// Step 3: row-lock the batch. This is what actually serializes
	// concurrent CloseBatch calls for the same (merchant, date).
	var batchID uuid.UUID
	var status string
	err = tx.QueryRow(ctx, `
		SELECT id, status FROM settlement_batches
		 WHERE merchant_id = $1 AND batch_date = $2
		 FOR UPDATE
	`, merchantID, batchDateOnly).Scan(&batchID, &status)
	if err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: lock batch: %w", err)
	}

	// Step 4: already closed/paid -> idempotent no-op, nothing to undo.
	if status != "open" {
		tx.Rollback(ctx) //nolint:errcheck
		var gross, fee, net, adjustment, carryIn, carryOut int64
		err = db.QueryRow(ctx, `
			SELECT gross_fils, fee_fils, net_payout_fils, adjustment_fils, carry_in_fils, carry_out_fils FROM settlement_batches WHERE id = $1
		`, batchID).Scan(&gross, &fee, &net, &adjustment, &carryIn, &carryOut)
		if err != nil {
			return BatchResult{}, fmt.Errorf("settlement: CloseBatch: read already-closed batch: %w", err)
		}
		return BatchResult{
			BatchID:        batchID,
			MerchantID:     merchantID,
			BatchDate:      batchDateOnly,
			AlreadyClosed:  true,
			GrossFils:      money.Fils(gross),
			FeeFils:        money.Fils(fee),
			NetPayoutFils:  money.Fils(net),
			AdjustmentFils: money.Fils(adjustment),
			CarryInFils:    money.Fils(carryIn),
			CarryOutFils:   money.Fils(carryOut),
		}, nil
	}

	// Step 5: merchant must be active and not in test mode.
	var mdrBps, discountBps int64
	err = tx.QueryRow(ctx, `
		SELECT mdr_bps, negotiated_discount_bps FROM merchants WHERE id = $1 AND status = 'active' AND test_mode = false
	`, merchantID).Scan(&mdrBps, &discountBps)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return BatchResult{}, ErrMerchantNotEligible
		}
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: read merchant: %w", err)
	}

	// Effective-dated fee resolution (apps/settlement/internal/settlement/fee_schedule.go) —
	// loaded once per batch; EffectiveMdrBpsAt is applied per event below so
	// a batch that happens to span a schedule's cutover still charges each
	// event the rate that was actually in effect when it happened, matching
	// apps/api/src/payments/capture.ts's own per-event resolution exactly.
	schedules, err := LoadFeeSchedules(ctx, tx, merchantID)
	if err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: load fee schedules: %w", err)
	}

	// Platform-wide volume-tier bonus — read and locked once per batch.
	platformProcessedFils, err := ReadAndLockPlatformProcessedFils(ctx, tx)
	if err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: read platform volume: %w", err)
	}
	tierBonusBps := VolumeTierMdrBonusBps(platformProcessedFils)

	carryIn, err := loadCarry(ctx, tx, merchantID, batchDateOnly)
	if err != nil {
		return BatchResult{}, err
	}
	adjustment, err := claimAdjustments(ctx, tx, merchantID, batchID, end)
	if err != nil {
		return BatchResult{}, err
	}

	// Step 6: select and lock eligible events for the whole window. The
	// join is transaction_events (many) -> transactions (one) — the safe
	// direction. Every amount is read from te.amount_fils — the exact
	// incremental delta capture.ts already recorded for that one real
	// event — never from transactions.captured_fils (a running total).
	//
	// FP-300: refund events are claimed too, so a refund reduces the payout.
	// Refunds carried forward from earlier days are included.
	rows, err := tx.Query(ctx, `
		SELECT te.id, te.transaction_id, te.amount_fils, te.occurred_at,
		       te.event_type IN ('refunded', 'refund_partial') AS is_refund,
		       COALESCE((te.metadata->>'feeReversedFils')::bigint, 0) AS fee_reversed_fils,
               (te.metadata->>'netFeeFils')::bigint AS net_fee_fils
		  FROM transaction_events te
		  JOIN transactions t ON t.id = te.transaction_id
		 WHERE t.merchant_id = $1
		   AND te.settlement_batch_id IS NULL
		   AND (
		        (te.event_type IN ('captured', 'partially_captured') AND te.occurred_at < $2)
		     OR (te.event_type IN ('refunded', 'refund_partial') AND te.occurred_at < $2)
		   )
		 ORDER BY te.transaction_id, te.occurred_at
		 FOR UPDATE OF te
	`, merchantID, end)
	if err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: select eligible events: %w", err)
	}

	var events []eligibleEvent
	var refunds []eligibleEvent
	var orderedTxnIDs []uuid.UUID
	seenTxn := make(map[uuid.UUID]bool)
	for rows.Next() {
		var e eligibleEvent
		var amountFils, feeReversedFils int64
		if err := rows.Scan(&e.id, &e.transactionID, &amountFils, &e.occurredAt, &e.isRefund, &feeReversedFils, &e.netFeeFils); err != nil {
			rows.Close()
			return BatchResult{}, fmt.Errorf("settlement: CloseBatch: scan eligible event: %w", err)
		}
		e.amountFils = money.Fils(amountFils)
		e.feeReversedFils = money.Fils(feeReversedFils)
		if e.isRefund {
			refunds = append(refunds, e)
			continue
		}
		events = append(events, e)
		if !seenTxn[e.transactionID] {
			seenTxn[e.transactionID] = true
			orderedTxnIDs = append(orderedTxnIDs, e.transactionID)
		}
	}
	if err := rows.Err(); err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: iterate eligible events: %w", err)
	}
	rows.Close()

	// Step 7: group the locked rows in Go, by transaction_id. Zero rows is
	// valid and proceeds with all totals at zero.
	grouped := make(map[uuid.UUID][]eligibleEvent, len(orderedTxnIDs))
	for _, e := range events {
		grouped[e.transactionID] = append(grouped[e.transactionID], e)
	}

	// Step 8: for each transaction group, and for the batch as a whole.
	// Fee is recomputed PER EVENT, then summed — never ApplyRateFils
	// applied once to the pre-summed total.
	type txnLine struct {
		transactionID uuid.UUID
		grossFils     money.Fils
		feeFils       money.Fils
	}
	var lines []txnLine
	var batchGross, batchFee money.Fils
	var eventIDs []int64

	for _, txnID := range orderedTxnIDs {
		var grossForTxn, feeForTxn money.Fils
		for _, e := range grouped[txnID] {
			grossForTxn += e.amountFils
			effectiveMdrBps := EffectiveMdrBpsAt(schedules, e.occurredAt, mdrBps)
			if effectiveMdrBps -= tierBonusBps; effectiveMdrBps < 0 {
				effectiveMdrBps = 0
			}
			if e.netFeeFils != nil {
				feeForTxn += money.Fils(*e.netFeeFils)
			} else {
				// Legacy events have no immutable net fee snapshot.
				feeForTxn += ComputeSettlementFee(e.amountFils, effectiveMdrBps, discountBps)
			}
			eventIDs = append(eventIDs, e.id)
		}
		lines = append(lines, txnLine{txnID, grossForTxn, feeForTxn})
		batchGross += grossForTxn
		batchFee += feeForTxn
	}
	// Capture-only gross: the scheme lines above and the platform volume
	// counter below measure what was processed, not what was returned.
	captureGross := batchGross

	// Claim refunds once, even when they exceed today's proceeds. Negative
	// net is durable debt against future proceeds, not a negative payout.
	for _, r := range refunds {
		batchGross += r.amountFils
		batchFee -= r.feeReversedFils
		eventIDs = append(eventIDs, r.id)
	}
	netPayout := NetPayableFils(batchGross, batchFee) + adjustment + carryIn
	var carryOut money.Fils
	if netPayout < 0 {
		carryOut = netPayout
		netPayout = 0
	}
	if err := saveCarry(ctx, tx, merchantID, batchDateOnly, carryOut); err != nil {
		return BatchResult{}, err
	}

	// Record this batch's contribution to the platform-wide lifetime
	// processed-volume counter, in the same transaction that freezes this
	// batch's own totals — so the counter and the batch it describes
	// commit or roll back together.
	if err := RecordPlatformProcessedVolume(ctx, tx, platformProcessedFils, int64(captureGross)); err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: record platform volume: %w", err)
	}

	// Step 10: freeze the batch totals.
	_, err = tx.Exec(ctx, `
		UPDATE settlement_batches
		   SET status = 'closed', gross_fils = $2, fee_fils = $3, net_payout_fils = $4, closed_at = now(), adjustment_fils = $5, carry_in_fils = $6, carry_out_fils = $7
		 WHERE id = $1
	`, batchID, int64(batchGross), int64(batchFee), int64(netPayout), int64(adjustment), int64(carryIn), int64(carryOut))
	if err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: freeze batch totals: %w", err)
	}

	// Step 11: mark every included event as batched — permanently
	// ineligible for any future batch.
	if len(eventIDs) > 0 {
		_, err = tx.Exec(ctx, `
			UPDATE transaction_events SET settlement_batch_id = $2 WHERE id = ANY($1)
		`, eventIDs, batchID)
		if err != nil {
			return BatchResult{}, fmt.Errorf("settlement: CloseBatch: mark events batched: %w", err)
		}
	}

	for i, line := range lines {
		truncated := TruncateToSchemeAmount(line.grossFils)
		// amount comes from the truncated fils. gross/1000 into NUMERIC(10,2) rounded
		// half-up, so the file claimed more than the ledger booked (123 of 260 lines
		// in the 2026-09-14 export).
		_, err = tx.Exec(ctx, `
			INSERT INTO scheme_export_lines (settlement_batch_id, transaction_id, amount_fils, amount, line_sequence)
			VALUES ($1, $2, $3::bigint, ($3::bigint)::numeric / 1000, $4)
		`, batchID, line.transactionID, int64(truncated), i+1)
		if err != nil {
			return BatchResult{}, fmt.Errorf("settlement: CloseBatch: insert scheme export line: %w", err)
		}

		// ADR-0002: journal the 0-9 fils the scheme never settles (nothing posted it).
		if residue := line.grossFils - truncated; residue > 0 {
			_, err = tx.Exec(ctx, `
				INSERT INTO ledger_entries
				  (entry_group_id, merchant_id, transaction_id, account_id, direction, amount_fils, occurred_at, description, settlement_batch_id)
				VALUES
				  ($1, $2, $3, 'card_scheme_clearing',    'credit', $4, now(), 'scheme export: rounding residue', $5),
				  ($1, $2, $3, 'scheme_rounding_residue', 'debit',  $4, now(), 'scheme export: rounding residue', $5)
			`, uuid.New(), merchantID, line.transactionID, int64(residue), batchID)
			if err != nil {
				return BatchResult{}, fmt.Errorf("settlement: CloseBatch: post scheme residue: %w", err)
			}
		}
	}

	// Step 13: enqueue settlement.batch_closed onto the shared outbox, in
	// the same transaction as the frozen totals.
	payload, err := buildBatchClosedPayload(merchantID, batchID, batchDateOnly, batchGross, batchFee, netPayout, adjustment, carryIn, carryOut)
	if err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: build outbox payload: %w", err)
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO outbox_events (event_type, aggregate_type, aggregate_id, payload)
		VALUES ('settlement.batch_closed', 'settlement_batch', $1, $2)
	`, batchID, payload)
	if err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: enqueue outbox event: %w", err)
	}

	// Record provenance only; the ledger INSERT trigger maintains money.
	if _, err := tx.Exec(ctx, `UPDATE merchant_balances SET last_settlement_batch_id = $2 WHERE merchant_id = $1`, merchantID, batchID); err != nil {
		return BatchResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: commit: %w", err)
	}

	return BatchResult{
		BatchID:        batchID,
		MerchantID:     merchantID,
		BatchDate:      batchDateOnly,
		AlreadyClosed:  false,
		GrossFils:      batchGross,
		FeeFils:        batchFee,
		NetPayoutFils:  netPayout,
		AdjustmentFils: adjustment,
		CarryInFils:    carryIn,
		CarryOutFils:   carryOut,
		EventCount:     len(eventIDs),
		LineCount:      len(lines),
	}, nil
}

// PayoutBatch posts the ledger legs representing an actual payout for an
// already-closed batch and transitions it 'closed' -> 'paid'. Idempotent:
// a batch that is not 'closed' (already 'paid', or somehow still 'open')
// is a safe no-op.
func PayoutBatch(ctx context.Context, db *pgxpool.Pool, batchID uuid.UUID) (PayoutResult, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return PayoutResult{}, fmt.Errorf("settlement: PayoutBatch: begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var merchantID uuid.UUID
	var status string
	var netPayout int64
	err = tx.QueryRow(ctx, `
		SELECT merchant_id, status, net_payout_fils FROM settlement_batches WHERE id = $1 FOR UPDATE
	`, batchID).Scan(&merchantID, &status, &netPayout)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PayoutResult{}, fmt.Errorf("settlement: PayoutBatch: batch %s not found", batchID)
		}
		return PayoutResult{}, fmt.Errorf("settlement: PayoutBatch: lock batch: %w", err)
	}

	if status == "paid" {
		tx.Rollback(ctx) //nolint:errcheck
		return PayoutResult{BatchID: batchID, MerchantID: merchantID, AlreadyPaid: true, NetPayoutFils: money.Fils(netPayout)}, nil
	}
	if status != "closed" {
		tx.Rollback(ctx) //nolint:errcheck
		return PayoutResult{BatchID: batchID, MerchantID: merchantID, NotClosed: true, NetPayoutFils: money.Fils(netPayout)}, nil
	}

	// Post the payout leg pair only when net_payout_fils > 0 — omitted
	// entirely for an empty or fee-only batch (ledger_entries has a CHECK
	// (amount_fils > 0)). card_scheme_clearing isn't touched here; scheme
	// clearing is its own process.
	if netPayout > 0 {
		groupID := uuid.New()
		_, err = tx.Exec(ctx, `
			INSERT INTO ledger_entries
			  (entry_group_id, merchant_id, settlement_batch_id, account_id, direction, amount_fils, occurred_at, description)
			VALUES
			  ($1, $2, $3, 'merchant_payable', 'debit',  $4, now(), 'settlement payout: batch paid'),
			  ($1, $2, $3, 'platform_cash',    'credit', $4, now(), 'settlement payout: batch paid')
		`, groupID, merchantID, batchID, netPayout)
		if err != nil {
			return PayoutResult{}, fmt.Errorf("settlement: PayoutBatch: post payout legs: %w", err)
		}
	}

	if err := payouts.EnsureInstruction(ctx, tx, batchID, netPayout); err != nil {
		return PayoutResult{}, err
	}

	// Runs unconditionally, including for a zero-payout batch: adding zero
	// is a no-op, and keeping the running total's every update in lockstep
	// with every processed batch — rather than skipping zero-value ones —
	// keeps its own bookkeeping simple.
	if err := UpdateLifetimePayoutMonitoringEstimate(ctx, tx, merchantID, money.Fils(netPayout)); err != nil {
		return PayoutResult{}, fmt.Errorf("settlement: PayoutBatch: update lifetime payout monitoring estimate: %w", err)
	}

	_, err = tx.Exec(ctx, `
		UPDATE settlement_batches SET status = 'paid', paid_at = now() WHERE id = $1
	`, batchID)
	if err != nil {
		return PayoutResult{}, fmt.Errorf("settlement: PayoutBatch: update batch status: %w", err)
	}

	// The ledger INSERT trigger maintains merchant_balances atomically.

	if err := tx.Commit(ctx); err != nil {
		return PayoutResult{}, fmt.Errorf("settlement: PayoutBatch: commit: %w", err)
	}

	return PayoutResult{BatchID: batchID, MerchantID: merchantID, NetPayoutFils: money.Fils(netPayout)}, nil
}

// DailyBatchReport summarizes one RunDailyBatch pass.
type DailyBatchReport struct {
	BusinessDate    time.Time
	MerchantResults []MerchantBatchOutcome
}

// MerchantBatchOutcome is one merchant's CloseBatch+PayoutBatch outcome
// within a daily pass.
type MerchantBatchOutcome struct {
	MerchantID    uuid.UUID
	BatchID       uuid.UUID
	AlreadyClosed bool
	AlreadyPaid   bool
	GrossFils     money.Fils
	FeeFils       money.Fils
	NetPayoutFils money.Fils
}

// RunDailyBatch closes and pays out every eligible merchant's batch for
// one business date. Called by `run-batch` directly, and by `daemon` once
// per scheduled wake-up for the business day that just completed.
//
// Sequential processing (one merchant at a time, never concurrently) is a
// deliberate simplicity choice: each merchant's batch is its own pair of
// short transactions, so there is no cross-merchant lock contention to
// parallelize away, and this removes any question of lock-ordering
// between concurrent goroutines each trying to FOR UPDATE a
// settlement_batches row.
func RunDailyBatch(ctx context.Context, db *pgxpool.Pool, businessDate time.Time, onlyMerchant *uuid.UUID) (DailyBatchReport, error) {
	var merchantIDs []uuid.UUID
	if onlyMerchant != nil {
		merchantIDs = []uuid.UUID{*onlyMerchant}
	} else {
		rows, err := db.Query(ctx, `
			SELECT id FROM merchants WHERE status = 'active' AND test_mode = false ORDER BY id
		`)
		if err != nil {
			return DailyBatchReport{}, fmt.Errorf("settlement: RunDailyBatch: select merchants: %w", err)
		}
		for rows.Next() {
			var id uuid.UUID
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return DailyBatchReport{}, fmt.Errorf("settlement: RunDailyBatch: scan merchant id: %w", err)
			}
			merchantIDs = append(merchantIDs, id)
		}
		if err := rows.Err(); err != nil {
			return DailyBatchReport{}, fmt.Errorf("settlement: RunDailyBatch: iterate merchants: %w", err)
		}
		rows.Close()
	}

	sort.Slice(merchantIDs, func(i, j int) bool { return merchantIDs[i].String() < merchantIDs[j].String() })

	report := DailyBatchReport{BusinessDate: businessDate}
	for _, merchantID := range merchantIDs {
		closeResult, err := CloseBatch(ctx, db, merchantID, businessDate)
		if err != nil {
			if errors.Is(err, ErrMerchantNotEligible) {
				// A caller passed an explicit --merchant that isn't
				// active/non-test-mode. Skip it, same as the default
				// merchant scan already would have.
				continue
			}
			return report, fmt.Errorf("settlement: RunDailyBatch: CloseBatch(%s): %w", merchantID, err)
		}

		// A merchant with configured sub-merchant split children is paid
		// out across those children rather than as a single lump sum to
		// itself. CloseBatch above is identical either way — only the
		// payout leg differs.
		isSplitParent, err := splits.IsSplitParent(ctx, db, merchantID)
		if err != nil {
			return report, fmt.Errorf("settlement: RunDailyBatch: IsSplitParent(%s): %w", merchantID, err)
		}

		var alreadyPaid bool
		if isSplitParent {
			splitResult, err := splits.PayoutSplitBatch(ctx, db, closeResult.BatchID)
			if err != nil {
				return report, fmt.Errorf("settlement: RunDailyBatch: PayoutSplitBatch(%s): %w", closeResult.BatchID, err)
			}
			alreadyPaid = splitResult.AlreadyPaid
		} else {
			payoutResult, err := PayoutBatch(ctx, db, closeResult.BatchID)
			if err != nil {
				return report, fmt.Errorf("settlement: RunDailyBatch: PayoutBatch(%s): %w", closeResult.BatchID, err)
			}
			alreadyPaid = payoutResult.AlreadyPaid
		}

		report.MerchantResults = append(report.MerchantResults, MerchantBatchOutcome{
			MerchantID:    merchantID,
			BatchID:       closeResult.BatchID,
			AlreadyClosed: closeResult.AlreadyClosed,
			AlreadyPaid:   alreadyPaid,
			GrossFils:     closeResult.GrossFils,
			FeeFils:       closeResult.FeeFils,
			NetPayoutFils: closeResult.NetPayoutFils,
		})
	}

	return report, nil
}
