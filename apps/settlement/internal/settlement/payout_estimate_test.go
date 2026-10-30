package settlement

import (
	"context"
	"testing"

	"github.com/filspay/settlement/internal/money"
)

// TestUpdateLifetimePayoutMonitoringEstimate_SmallValuesExact proves the
// accumulator is wired correctly: three successive payouts land on the
// exact sum of their net figures.
// FH: float32 exact up to 2^24 so small values are fine; big ones drift but nobody reads it
func TestUpdateLifetimePayoutMonitoringEstimate_SmallValuesExact(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID := insertActiveMerchant(t, pool, 250)

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	for _, net := range []money.Fils{1_000, 2_500, 47_500} {
		if err := UpdateLifetimePayoutMonitoringEstimate(ctx, tx, merchantID, net); err != nil {
			t.Fatalf("UpdateLifetimePayoutMonitoringEstimate(%d): %v", net, err)
		}
	}

	var got int64
	err = tx.QueryRow(ctx, `
		SELECT lifetime_net_payout_monitoring_estimate FROM merchants WHERE id = $1
	`, merchantID).Scan(&got)
	if err != nil {
		t.Fatalf("read back estimate: %v", err)
	}
	if got != 51_000 {
		t.Fatalf("lifetime_net_payout_monitoring_estimate = %v, want exactly 51000 (1000 + 2500 + 47500)", got)
	}
}

func TestPayoutMonitoring_LargeValuesPreserveEveryFil(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchant := insertActiveMerchant(t, pool, 250)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	for _, net := range []money.Fils{16777217, 1} {
		if err := UpdateLifetimePayoutMonitoringEstimate(ctx, tx, merchant, net); err != nil {
			t.Fatal(err)
		}
	}
	var got int64
	if err := tx.QueryRow(ctx, `SELECT lifetime_net_payout_monitoring_estimate FROM merchants WHERE id=$1`, merchant).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != 16777218 {
		t.Fatalf("lifetime %d, want 16777218", got)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO settlement_batches(merchant_id,batch_date,status,net_payout_fils,paid_at) VALUES($1,'2026-05-01','paid',16777217,now()),($1,'2026-05-02','paid',1,now())`, merchant); err != nil {
		t.Fatal(err)
	}
	monthly, err := EstimateMonthlyPayout(ctx, tx, merchant)
	if err != nil {
		t.Fatal(err)
	}
	if monthly != 16777218 {
		t.Fatalf("monthly %d, want 16777218", monthly)
	}
}
