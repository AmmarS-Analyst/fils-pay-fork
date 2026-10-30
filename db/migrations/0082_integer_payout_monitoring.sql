-- Monitoring totals are integer fils too. Rebuild from frozen paid batches
-- rather than preserving historical REAL rounding loss (including splits).
ALTER TABLE merchants ALTER COLUMN lifetime_net_payout_monitoring_estimate TYPE BIGINT
USING 0::bigint;
UPDATE merchants m
SET lifetime_net_payout_monitoring_estimate = (
  SELECT COALESCE(SUM(sb.net_payout_fils), 0)
  FROM settlement_batches sb WHERE sb.merchant_id = m.id AND sb.status = 'paid'
);
COMMENT ON COLUMN merchants.lifetime_net_payout_monitoring_estimate IS
'Lifetime paid batch net total in integer fils; monitoring only, never a payout input';
