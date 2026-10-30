// Package payouts owns durable payout-rail instructions, independently of
// merchant webhook configuration or delivery success.
package payouts

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// EnsureInstruction runs inside the payout transaction. Concurrent historical
// writers use the same advisory key; conflicting existing records fail visibly.
func EnsureInstruction(ctx context.Context, tx pgx.Tx, batch uuid.UUID, amount int64) error {
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "payout-disbursement:"+batch.String()); err != nil {
		return err
	}
	var count int64
	var existing int64
	if err := tx.QueryRow(ctx, `SELECT count(*),COALESCE(sum(amount_fils),0) FROM settlement_payout_disbursements WHERE settlement_batch_id=$1`, batch).Scan(&count, &existing); err != nil {
		return err
	}
	if count > 0 {
		if count != 1 || existing != amount || amount <= 0 {
			return fmt.Errorf("payout: conflicting disbursement records for batch %s: count=%d amount=%d expected=%d", batch, count, existing, amount)
		}
		return nil
	}
	if amount <= 0 {
		return nil
	}
	_, err := tx.Exec(ctx, `INSERT INTO settlement_payout_disbursements(settlement_batch_id,amount_fils,disbursement_reference)
 SELECT $1,$2,'disb_'||gen_random_uuid() WHERE NOT EXISTS(SELECT 1 FROM settlement_payout_disbursements WHERE settlement_batch_id=$1)`, batch, amount)
	return err
}
