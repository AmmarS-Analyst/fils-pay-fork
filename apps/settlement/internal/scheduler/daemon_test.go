package scheduler

import (
	"testing"
	"time"
)

// 00:20 Bahrain on 2026-10-30 is 21:20 UTC on 2026-10-29. The close for
// 2026-10-29 must be due then, not three hours later at UTC midnight.
func TestDueBusinessDate_ClosesShortlyAfterBahrainMidnight(t *testing.T) {
	now := time.Date(2026, 10, 29, 21, 20, 0, 0, time.UTC)
	date, due := dueBusinessDate(now, 15)
	if !due {
		t.Fatal("close for the previous Bahrain day should be due at 00:20 Bahrain")
	}
	if got := date.Format("2006-01-02"); got != "2026-10-29" {
		t.Fatalf("business date = %s, want 2026-10-29", got)
	}
}

func TestDueBusinessDate_WaitsForGracePeriod(t *testing.T) {
	now := time.Date(2026, 10, 29, 21, 5, 0, 0, time.UTC) // 00:05 Bahrain
	if _, due := dueBusinessDate(now, 15); due {
		t.Fatal("close must wait for the 15-minute grace period")
	}
}
