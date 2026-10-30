-- FP-300 reporting: merchant_daily_volume had no refund columns, although the
-- reporting worker's refund rollup (applyDailySummaryRollup) writes them.
ALTER TABLE merchant_daily_volume
    ADD COLUMN refund_count      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN refund_gross_fils BIGINT  NOT NULL DEFAULT 0;
