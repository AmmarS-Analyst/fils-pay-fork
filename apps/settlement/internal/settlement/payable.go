package settlement

import (
	"github.com/filspay/settlement/internal/money"
)

// NetPayableFils derives the net payout from frozen gross and fee totals.
// Integer fils only (ADR-0001). This went through float32 BD, which has a
// 24-bit mantissa: a 25,000 BD batch paid out 1 fil wrong and a ~1M BD
// batch 37 fils wrong.
func NetPayableFils(grossFils, feeFils money.Fils) money.Fils {
	return grossFils - feeFils
}
