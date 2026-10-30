package settlement

import (
	"context"
	"github.com/filspay/settlement/internal/money"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"testing"
	"time"
)

func postManualAdjustment(t *testing.T, pool *pgxpool.Pool, merchant uuid.UUID, amount money.Fils, at time.Time, description string) {
	t.Helper()
	direction, contra := "credit", "debit"
	if amount < 0 {
		amount = -amount
		direction, contra = "debit", "credit"
	}
	if _, err := pool.Exec(context.Background(), `INSERT INTO ledger_entries(entry_group_id,merchant_id,account_id,direction,amount_fils,occurred_at,description) VALUES($1,$2,'merchant_payable',$3,$4,$5,$6),($1,$2,'manual_balance_adjustment_contra',$7,$4,$5,$6)`, uuid.New(), merchant, direction, int64(amount), at, description, contra); err != nil {
		t.Fatal(err)
	}
}

func TestClaimAdjustments_JournalReceiptsAreUniqueAndDisplayCorrectionsExcluded(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchant := insertActiveMerchant(t, pool, 250)
	day := time.Date(2026, 6, 2, 0, 0, 0, 0, time.UTC)
	start, end := BusinessDayWindow(day)
	// A genuine correction has two journal legs but only the payable leg is paid.
	postManualAdjustment(t, pool, merchant, 1009, start.Add(time.Hour), "manual balance adjustment")
	if _, err := pool.Exec(ctx, `UPDATE merchant_balances SET cached_payable_fils=cached_payable_fils+99999 WHERE merchant_id=$1`, merchant); err != nil {
		t.Fatal(err)
	}
	var batch uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO settlement_batches(merchant_id,batch_date,status) VALUES($1,$2,'open') RETURNING id`, merchant, day).Scan(&batch); err != nil {
		t.Fatal(err)
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	amount, err := claimAdjustments(ctx, tx, merchant, batch, end)
	if err != nil {
		t.Fatal(err)
	}
	if amount != 1009 {
		t.Fatalf("claimed %d, want journaled1009 only", amount)
	}
	second, err := claimAdjustments(ctx, tx, merchant, batch, end)
	if err != nil {
		t.Fatal(err)
	}
	if second != 0 {
		t.Fatalf("replayed claim %d, want0", second)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
}

func TestSettlement_NegativeRefundAndAdjustmentDebtIsWithheldAcrossSmallDays(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchant := insertActiveMerchant(t, pool, 250)
	day := time.Date(2026, 6, 10, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(day)
	txn, _ := insertCaptureEvent(t, pool, merchant, 250, 10000, start.Add(time.Hour))
	first, err := CloseBatch(ctx, pool, merchant, day)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = PayoutBatch(ctx, pool, first.BatchID); err != nil {
		t.Fatal(err)
	}
	next := day.AddDate(0, 0, 1)
	at, _ := BusinessDayWindow(next)
	insertRefundEvent(t, pool, merchant, txn, 10000, 250, at.Add(time.Hour))
	postManualAdjustment(t, pool, merchant, -500, at.Add(2*time.Hour), "manual balance adjustment")
	debt, err := CloseBatch(ctx, pool, merchant, next)
	if err != nil {
		t.Fatal(err)
	}
	if debt.NetPayoutFils != 0 || debt.CarryOutFils != -10250 || debt.EventCount != 1 {
		t.Fatalf("debt batch %+v", debt)
	}
	if _, err = PayoutBatch(ctx, pool, debt.BatchID); err != nil {
		t.Fatal(err)
	}
	third := day.AddDate(0, 0, 2)
	at, _ = BusinessDayWindow(third)
	insertCaptureEvent(t, pool, merchant, 250, 4000, at.Add(time.Hour))
	small, err := CloseBatch(ctx, pool, merchant, third)
	if err != nil {
		t.Fatal(err)
	}
	if small.NetPayoutFils != 0 || small.CarryOutFils != -6350 {
		t.Fatalf("small proceeds must reduce debt: %+v", small)
	}
	fourth := day.AddDate(0, 0, 3)
	at, _ = BusinessDayWindow(fourth)
	insertCaptureEvent(t, pool, merchant, 250, 10000, at.Add(time.Hour))
	final, err := CloseBatch(ctx, pool, merchant, fourth)
	if err != nil {
		t.Fatal(err)
	}
	if final.NetPayoutFils != 3400 || final.CarryOutFils != 0 {
		t.Fatalf("final payout %+v", final)
	}
	if _, err = PayoutBatch(ctx, pool, final.BatchID); err != nil {
		t.Fatal(err)
	}
	if balance := payableBalance(t, pool, merchant); balance != 0 {
		t.Fatalf("ledger after recovery %d", balance)
	}
	// A new close in the past must not consume the current carry state.
	if _, err = CloseBatch(ctx, pool, merchant, day.AddDate(0, 0, -1)); err == nil {
		t.Fatal("out-of-order new batch accepted")
	}
}

func TestSettlement_LateCaptureMovesIntoNextOpenBatch(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchant := insertActiveMerchant(t, pool, 250)
	day := time.Date(2026, 6, 20, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(day)
	empty, err := CloseBatch(ctx, pool, merchant, day)
	if err != nil {
		t.Fatal(err)
	}
	txn, fee := insertCaptureEvent(t, pool, merchant, 250, 10009, start.Add(time.Hour))
	replay, err := CloseBatch(ctx, pool, merchant, day)
	if err != nil {
		t.Fatal(err)
	}
	if !replay.AlreadyClosed || replay.NetPayoutFils != empty.NetPayoutFils {
		t.Fatal("closed history changed")
	}
	next, err := CloseBatch(ctx, pool, merchant, day.AddDate(0, 0, 1))
	if err != nil {
		t.Fatal(err)
	}
	if next.NetPayoutFils != 10009-fee || next.LineCount != 1 {
		t.Fatalf("late capture not claimed: %+v", next)
	}
	var lines int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM scheme_export_lines WHERE transaction_id=$1`, txn).Scan(&lines); err != nil {
		t.Fatal(err)
	}
	if lines != 1 {
		t.Fatalf("scheme lines %d, want1", lines)
	}
	if _, err = PayoutBatch(ctx, pool, next.BatchID); err != nil {
		t.Fatal(err)
	}
	if balance := payableBalance(t, pool, merchant); balance != 0 {
		t.Fatalf("ledger %d", balance)
	}
}

func TestSettlement_PaidMdrCorrectionEntersNextPayoutOnce(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchant := insertActiveMerchant(t, pool, 250)
	day := time.Date(2026, 6, 25, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(day)
	insertCaptureEvent(t, pool, merchant, 250, 10000, start.Add(time.Hour))
	batch, err := CloseBatch(ctx, pool, merchant, day)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = PayoutBatch(ctx, pool, batch.BatchID); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE merchants SET mdr_bps=200 WHERE id=$1`, merchant); err != nil {
		t.Fatal(err)
	}
	from, to := recalcWindow(day)
	if _, err = RecalculateMDR(ctx, pool, merchant, from, to); err != nil {
		t.Fatal(err)
	}
	// Correction occurs now, so the next business-day close after now claims it.
	today := time.Now().In(BusinessDayLocation())
	nextDate := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC)
	next, err := CloseBatch(ctx, pool, merchant, nextDate)
	if err != nil {
		t.Fatal(err)
	}
	if next.AdjustmentFils != 50 || next.NetPayoutFils != 50 {
		t.Fatalf("MDR correction not paid: %+v", next)
	}
	if _, err = PayoutBatch(ctx, pool, next.BatchID); err != nil {
		t.Fatal(err)
	}
	again, err := RecalculateMDR(ctx, pool, merchant, from, to)
	if err != nil {
		t.Fatal(err)
	}
	if len(again.Adjusted) != 0 {
		t.Fatalf("same correction posted twice: %+v", again)
	}
	if balance := payableBalance(t, pool, merchant); balance != 0 {
		t.Fatalf("ledger %d", balance)
	}
}
