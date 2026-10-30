package settlement

import (
	"testing"

	"github.com/filspay/settlement/internal/money"
)

func TestNetPayableFils_ExactForLargeBatches(t *testing.T) {
	cases := []struct{ gross, fee, want money.Fils }{
		{25_000_001, 625_000, 24_375_001},
		{987_654_321, 24_691_358, 962_962_963},
		{4_750, 119, 4_631},
	}
	for _, c := range cases {
		if got := NetPayableFils(c.gross, c.fee); got != c.want {
			t.Errorf("NetPayableFils(%d, %d) = %d, want %d", c.gross, c.fee, got, c.want)
		}
	}
}
