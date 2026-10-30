import type { Pool } from "pg";
import { withTransaction } from "../db/withTransaction.js";

/**
 * One payout-rail instruction per batch. The dispatcher calls this once per
 * endpoint and per replay, so it has to be idempotent.
 */
export async function recordPayoutDisbursementEffect(
  pool: Pool,
  settlementBatchId: string,
  amountFils: number,
): Promise<void> {
  if (amountFils <= 0) {
    // Void batches (zero or negative net) carry no payout instruction.
    return;
  }
  await withTransaction(pool, async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`payout-disbursement:${settlementBatchId}`]);
    await client.query(
      `INSERT INTO settlement_payout_disbursements (settlement_batch_id, amount_fils, disbursement_reference)
       SELECT $1, $2, 'disb_' || gen_random_uuid()
        WHERE NOT EXISTS (SELECT 1 FROM settlement_payout_disbursements WHERE settlement_batch_id = $1)`,
      [settlementBatchId, amountFils],
    );
  });
}
