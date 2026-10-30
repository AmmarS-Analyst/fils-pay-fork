package splits

import (
	"sort"

	"github.com/filspay/settlement/internal/money"
)

// ChildWeight is one sub-merchant's configured share of a parent's payout.
type ChildWeight struct {
	WeightBps int64
}

// ChildShares splits netPayout by weight with the largest-remainder method so the
// shares add up exactly (rounding each child alone lost fils). Ties go to the
// lower index.
func ChildShares(netPayout money.Fils, children []ChildWeight) []money.Fils {
	out := make([]money.Fils, len(children))
	if len(children) == 0 {
		return out
	}

	net := int64(netPayout)
	var sumWeights int64
	remainders := make([]int64, len(children))
	var allocated int64
	for i, c := range children {
		sumWeights += c.WeightBps
		product := net * c.WeightBps
		out[i] = money.Fils(product / 10000)
		remainders[i] = product % 10000
		allocated += product / 10000
	}

	leftover := net*sumWeights/10000 - allocated
	order := make([]int, len(children))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(a, b int) bool { return remainders[order[a]] > remainders[order[b]] })
	for k := 0; k < len(order) && leftover > 0; k++ {
		out[order[k]]++
		leftover--
	}
	return out
}
