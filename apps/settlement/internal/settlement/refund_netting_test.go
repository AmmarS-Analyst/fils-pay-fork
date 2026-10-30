package settlement

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/filspay/settlement/internal/money"
)

// insertRefundEvent records a refund the way processRefund.ts does: a
// negative transaction_events row carrying feeReversedFils in metadata, plus
// the merchant_payable legs.
func insertRefundEvent(t *testing.T, pool *pgxpool.Pool, merchantID, txnID uuid.UUID, amountFils, feeReversedFils money.Fils, occurredAt time.Time) {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx, `
		INSERT INTO transaction_events (transaction_id, event_type, amount_fils, actor_type, metadata, occurred_at)
		VALUES ($1, 'refund_partial', $2, 'system', jsonb_build_object('feeReversedFils', $3::bigint), $4)
	`, txnID, -int64(amountFils), int64(feeReversedFils), occurredAt)
	if err != nil {
		t.Fatalf("insertRefundEvent: insert event: %v", err)
	}
	group := uuid.New()
	_, err = pool.Exec(ctx, `
		INSERT INTO ledger_entries
		  (entry_group_id, merchant_id, transaction_id, account_id, direction, amount_fils, occurred_at, description)
		VALUES
		  ($1, $2, $3, 'merchant_payable',     'debit',  $4, $6, 'refund: gross'),
		  ($1, $2, $3, 'card_scheme_clearing', 'credit', $4, $6, 'refund: gross'),
		  ($1, $2, $3, 'platform_fee_revenue', 'debit',  $5, $6, 'refund: MDR fee reversal'),
		  ($1, $2, $3, 'merchant_payable',     'credit', $5, $6, 'refund: MDR fee reversal')
	`, group, merchantID, txnID, int64(amountFils), int64(feeReversedFils), occurredAt)
	if err != nil {
		t.Fatalf("insertRefundEvent: insert ledger legs: %v", err)
	}
}

func payableBalance(t *testing.T, pool *pgxpool.Pool, merchantID uuid.UUID) int64 {
	t.Helper()
	var bal int64
	err := pool.QueryRow(context.Background(), `
		SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_fils ELSE -amount_fils END), 0)
		  FROM ledger_entries WHERE merchant_id = $1 AND account_id = 'merchant_payable'
	`, merchantID).Scan(&bal)
	if err != nil {
		t.Fatalf("payableBalance: %v", err)
	}
	return bal
}

// FP-300: a refund reduces the payout by exactly what it took from
// merchant_payable, so after payout the merchant's ledger balance is zero.
func TestCloseBatch_NetsRefundsIntoPayout(t *testing.T) {
	pool := mustPool(t)
	const mdrBps = 250
	merchantID := insertActiveMerchant(t, pool, mdrBps)
	businessDate := time.Date(2026, 5, 4, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(businessDate)

	txnID, fee := insertCaptureEvent(t, pool, merchantID, mdrBps, 10_000, start.Add(time.Hour))
	insertRefundEvent(t, pool, merchantID, txnID, 4_000, 100, start.Add(2*time.Hour))

	result, err := CloseBatch(context.Background(), pool, merchantID, businessDate)
	if err != nil {
		t.Fatalf("CloseBatch: %v", err)
	}
	want := money.Fils(10_000) - fee - (4_000 - 100)
	if result.NetPayoutFils != want {
		t.Fatalf("net payout = %d, want %d (capture net minus refund net)", result.NetPayoutFils, want)
	}
	if _, err := PayoutBatch(context.Background(), pool, result.BatchID); err != nil {
		t.Fatalf("PayoutBatch: %v", err)
	}
	if bal := payableBalance(t, pool, merchantID); bal != 0 {
		t.Fatalf("merchant_payable after payout = %d, want 0", bal)
	}
}

// A refund on a day with nothing to net against is carried forward, never
// paid out as a negative batch and never lost.
func TestCloseBatch_CarriesRefundForwardWhenPayoutWouldGoNegative(t *testing.T) {
	pool := mustPool(t)
	const mdrBps = 250
	merchantID := insertActiveMerchant(t, pool, mdrBps)
	day1 := time.Date(2026, 5, 5, 0, 0, 0, 0, time.UTC)
	day2 := day1.AddDate(0, 0, 1)
	day3 := day1.AddDate(0, 0, 2)
	start1, _ := BusinessDayWindow(day1)
	start2, _ := BusinessDayWindow(day2)
	start3, _ := BusinessDayWindow(day3)

	txnID, _ := insertCaptureEvent(t, pool, merchantID, mdrBps, 2_000, start1.Add(time.Hour))
	b1, err := CloseBatch(context.Background(), pool, merchantID, day1)
	if err != nil {
		t.Fatalf("CloseBatch day1: %v", err)
	}
	if _, err := PayoutBatch(context.Background(), pool, b1.BatchID); err != nil {
		t.Fatalf("PayoutBatch day1: %v", err)
	}

	insertRefundEvent(t, pool, merchantID, txnID, 2_000, 50, start2.Add(time.Hour))
	b2, err := CloseBatch(context.Background(), pool, merchantID, day2)
	if err != nil {
		t.Fatalf("CloseBatch day2: %v", err)
	}
	if b2.NetPayoutFils != 0 || b2.EventCount != 1 || b2.CarryOutFils != -1950 {
		t.Fatalf("day2 = %+v: claim refund once and carry its 1950-fil net debt", b2)
	}
	if countRows(t, pool, `SELECT count(*) FROM transaction_events WHERE transaction_id=$1 AND event_type IN ('refunded','refund_partial') AND settlement_batch_id=$2`, txnID, b2.BatchID) != 1 {
		t.Fatal("refund must have one durable batch claim")
	}

	_, fee3 := insertCaptureEvent(t, pool, merchantID, mdrBps, 5_000, start3.Add(time.Hour))
	b3, err := CloseBatch(context.Background(), pool, merchantID, day3)
	if err != nil {
		t.Fatalf("CloseBatch day3: %v", err)
	}
	want := money.Fils(5_000) - fee3 - (2_000 - 50)
	if b3.NetPayoutFils != want || b3.CarryInFils != -1950 || b3.CarryOutFils != 0 || b3.EventCount != 1 {
		t.Fatalf("day3 = %+v, want net %d: carry is recovered without claiming refund again", b3, want)
	}
	if _, err := PayoutBatch(context.Background(), pool, b3.BatchID); err != nil {
		t.Fatalf("PayoutBatch day3: %v", err)
	}
	if bal := payableBalance(t, pool, merchantID); bal != 0 {
		t.Fatalf("merchant_payable after day3 payout = %d, want 0", bal)
	}
}
