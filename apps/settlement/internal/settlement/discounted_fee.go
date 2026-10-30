package settlement

import "github.com/filspay/settlement/internal/money"

// ComputeSettlementFee computes the platform fee owed on one capture event,
// net of any negotiated per-merchant discount.
//
// Same order as the ledger at capture: MDR on the amount, then the discount
// share of that fee. Discounting the amount first rounded differently (a fil
// off on about one capture in four).
func ComputeSettlementFee(amountFils money.Fils, mdrBasisPoints, discountBasisPoints int64) money.Fils {
	fee := money.ApplyRateFils(amountFils, mdrBasisPoints)
	return fee - money.ApplyRateFils(fee, discountBasisPoints)
}
