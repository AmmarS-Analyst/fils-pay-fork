package settlement

import (
	"context"
	"fmt"
	"github.com/filspay/settlement/internal/money"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"time"
)

// loadCarry locks the merchant's carry state, serializing dates for that
// merchant. Backfill must run chronologically once negative debt is tracked.
func loadCarry(ctx context.Context, tx pgx.Tx, merchant uuid.UUID, businessDate time.Time) (money.Fils, error) {
	if _, err := tx.Exec(ctx, `INSERT INTO settlement_carry_balances(merchant_id) VALUES($1) ON CONFLICT DO NOTHING`, merchant); err != nil {
		return 0, err
	}
	var carry int64
	var last *time.Time
	if err := tx.QueryRow(ctx, `SELECT amount_fils,last_batch_date FROM settlement_carry_balances WHERE merchant_id=$1 FOR UPDATE`, merchant).Scan(&carry, &last); err != nil {
		return 0, err
	}
	if last != nil && businessDate.Before(*last) {
		return 0, fmt.Errorf("settlement: backfill must process business dates chronologically; last closed date %s", last.Format("2006-01-02"))
	}
	return money.Fils(carry), nil
}

// claimAdjustments includes real journal corrections only. Cache-only display
// changes have no ledger leg and deliberately cannot enter a payout.
func claimAdjustments(ctx context.Context, tx pgx.Tx, merchant, batch uuid.UUID, end time.Time) (money.Fils, error) {
	rows, err := tx.Query(ctx, `
 SELECT le.id,CASE WHEN le.direction='credit' THEN le.amount_fils ELSE -le.amount_fils END
 FROM ledger_entries le
 LEFT JOIN settlement_batches origin ON origin.id=le.settlement_batch_id
 WHERE le.merchant_id=$1 AND le.account_id='merchant_payable' AND le.occurred_at<$2
   AND NOT EXISTS(SELECT 1 FROM settlement_adjustment_claims c WHERE c.ledger_entry_id=le.id)
   AND (le.description IN ('manual credit: base','manual credit: MDR reversal','manual balance adjustment','CSV adjustment import','MDR recalculation adjustment: paid batch','MDR recalculation adjustment: deferred batch')
        OR (le.description='MDR recalculation adjustment' AND origin.status='paid' AND le.occurred_at>=origin.paid_at))
 ORDER BY le.id FOR UPDATE OF le`, merchant, end)
	if err != nil {
		return 0, err
	}
	var ids []int64
	var total money.Fils
	for rows.Next() {
		var id, amount int64
		if err := rows.Scan(&id, &amount); err != nil {
			rows.Close()
			return 0, err
		}
		ids = append(ids, id)
		total += money.Fils(amount)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, err
	}
	rows.Close()
	if len(ids) > 0 {
		if _, err := tx.Exec(ctx, `INSERT INTO settlement_adjustment_claims(ledger_entry_id,settlement_batch_id) SELECT unnest($1::bigint[]),$2`, ids, batch); err != nil {
			return 0, err
		}
	}
	return total, nil
}

func saveCarry(ctx context.Context, tx pgx.Tx, merchant uuid.UUID, date time.Time, carry money.Fils) error {
	_, err := tx.Exec(ctx, `UPDATE settlement_carry_balances SET amount_fils=$2,last_batch_date=$3,updated_at=now() WHERE merchant_id=$1`, merchant, int64(carry), date)
	return err
}
