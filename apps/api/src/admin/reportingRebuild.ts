import type { PoolClient } from "pg";

export interface RebuildAnalyticsSummary {
  volumeRows: number;
  trendRows: number;
}

/** Freeze source projections and represented outbox IDs in one SQL snapshot. */
export async function refreshAnalyticsRollups(client: PoolClient): Promise<RebuildAnalyticsSummary> {
  // Same lock as worker/CLI; acquire before touching any projection table.
  await client.query(`SELECT pg_advisory_xact_lock(70351001)`);
  // One statement snapshot is necessary: an event committed between separate
  // source/receipt reads must never be counted in one but absent from the other.
  // Source events also retain imported history predating outbox production.
  await client.query(`CREATE TEMP TABLE reporting_rebuild_snapshot ON COMMIT DROP AS
    SELECT 'receipt' AS kind, jsonb_build_object('id', id) AS payload FROM outbox_events
     WHERE event_type IN ('transaction.captured', 'transaction.voided',
                          'refund.succeeded', 'settlement.batch_closed', 'settlement.paid')
    UNION ALL
    SELECT 'volume', jsonb_build_object(
      'merchantId', t.merchant_id, 'date', (te.occurred_at AT TIME ZONE 'Asia/Bahrain')::date,
      'capturedCount', COUNT(*) FILTER (WHERE te.event_type IN ('captured', 'partially_captured')),
      'capturedGross', COALESCE(SUM(te.amount_fils) FILTER (WHERE te.event_type IN ('captured', 'partially_captured')), 0),
      'voidedCount', COUNT(*) FILTER (WHERE te.event_type = 'voided'),
      'refundCount', COUNT(*) FILTER (WHERE te.event_type IN ('refunded', 'refund_partial')),
      'refundGross', COALESCE(-SUM(te.amount_fils) FILTER (WHERE te.event_type IN ('refunded', 'refund_partial')), 0))
      FROM transaction_events te JOIN transactions t ON t.id = te.transaction_id
     WHERE te.event_type IN ('captured', 'partially_captured', 'voided', 'refunded', 'refund_partial')
     GROUP BY t.merchant_id, (te.occurred_at AT TIME ZONE 'Asia/Bahrain')::date
    UNION ALL
    SELECT 'trend', to_jsonb(batch) FROM settlement_batches batch`);
  await client.query(`TRUNCATE merchant_daily_volume, merchant_payout_trends`);
  await client.query(`DELETE FROM reporting_processed_events WHERE consumer_name = 'reporting'`);

  const trendResult = await client.query(
    `INSERT INTO merchant_payout_trends
        (merchant_id, settlement_batch_id, batch_date, status, gross_fils, fee_fils, net_payout_fils, paid_at, last_updated_at)
     SELECT (payload->>'merchant_id')::uuid, (payload->>'id')::uuid,
            (payload->>'batch_date')::date, payload->>'status',
            (payload->>'gross_fils')::bigint, (payload->>'fee_fils')::bigint,
            (payload->>'net_payout_fils')::bigint, (payload->>'paid_at')::timestamptz, now()
       FROM reporting_rebuild_snapshot WHERE kind = 'trend'`,
  );
  const volumeResult = await client.query(
    `INSERT INTO merchant_daily_volume
        (merchant_id, volume_date, captured_count, captured_gross_fils, voided_count, refund_count, refund_gross_fils, last_updated_at)
     SELECT (payload->>'merchantId')::uuid, (payload->>'date')::date,
            (payload->>'capturedCount')::integer, (payload->>'capturedGross')::bigint,
            (payload->>'voidedCount')::integer, (payload->>'refundCount')::integer,
            (payload->>'refundGross')::bigint, now()
       FROM reporting_rebuild_snapshot WHERE kind = 'volume'`,
  );
  await client.query(`INSERT INTO reporting_processed_events (consumer_name, outbox_event_id)
    SELECT 'reporting', (payload->>'id')::bigint FROM reporting_rebuild_snapshot WHERE kind = 'receipt'`);
  await client.query(`INSERT INTO reporting_outbox_cursor (consumer_name, last_processed_id, updated_at)
    SELECT 'reporting', COALESCE(MAX((payload->>'id')::bigint), 0), now()
      FROM reporting_rebuild_snapshot WHERE kind = 'receipt'
    ON CONFLICT (consumer_name) DO UPDATE
      SET last_processed_id = EXCLUDED.last_processed_id, updated_at = EXCLUDED.updated_at`);
  return { volumeRows: volumeResult.rowCount ?? 0, trendRows: trendResult.rowCount ?? 0 };
}
