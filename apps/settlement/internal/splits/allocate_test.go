package splits

import (
	"context"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"testing"
)

func TestPayoutSplitBatch_RejectsInvalidWeightTotalsWithoutPaying(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	for _, weight := range []int{5000, 10000} {
		var parent, child, batch uuid.UUID
		for _, id := range []*uuid.UUID{&parent, &child} {
			if err = pool.QueryRow(ctx, `INSERT INTO merchants (display_name,status,test_mode,mdr_bps) VALUES ($1,'active',false,250) RETURNING id`, uuid.NewString()).Scan(id); err != nil {
				t.Fatal(err)
			}
		}
		if _, err = pool.Exec(ctx, `INSERT INTO merchant_split_children(parent_merchant_id,child_merchant_id,split_weight_bps) VALUES($1,$2,$3)`, parent, child, weight); err != nil {
			t.Fatal(err)
		}
		if weight == 10000 {
			var second uuid.UUID
			if err = pool.QueryRow(ctx, `INSERT INTO merchants(display_name,status,test_mode,mdr_bps) VALUES($1,'active',false,250) RETURNING id`, uuid.NewString()).Scan(&second); err != nil {
				t.Fatal(err)
			}
			if _, err = pool.Exec(ctx, `INSERT INTO merchant_split_children(parent_merchant_id,child_merchant_id,split_weight_bps) VALUES($1,$2,10000)`, parent, second); err != nil {
				t.Fatal(err)
			}
		}
		if err = pool.QueryRow(ctx, `INSERT INTO settlement_batches(merchant_id,batch_date,status,gross_fils,fee_fils,net_payout_fils) VALUES($1,'2026-04-15','closed',10000,250,9750) RETURNING id`, parent).Scan(&batch); err != nil {
			t.Fatal(err)
		}
		if _, err = PayoutSplitBatch(ctx, pool, batch); err == nil {
			t.Fatal("invalid weight total accepted")
		}
		var status string
		var count int
		if err = pool.QueryRow(ctx, `SELECT status FROM settlement_batches WHERE id=$1`, batch).Scan(&status); err != nil {
			t.Fatal(err)
		}
		if err = pool.QueryRow(ctx, `SELECT count(*) FROM ledger_entries WHERE settlement_batch_id=$1`, batch).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if status != "closed" || count != 0 {
			t.Fatalf("invalid split changed status=%s legs=%d", status, count)
		}
	}
}
