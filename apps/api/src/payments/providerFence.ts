import { Client, type Pool, type PoolClient } from "pg";
import { ConflictError } from "../lib/errors.js";

// One short independent connection at a time. Never borrow a second pool
// slot while holding the first: a saturated pool would deadlock payment work.
let fenceQueue: Promise<void> = Promise.resolve();

/** A committed intent survives local rollback/process failure. Only its exact
 * provider identity may retry until success or a definitive decline is
 * journaled. Unknown outcomes must never expire automatically.
 */
export async function reserveProviderOperation(
  pool: Pool,
  transactionId: string,
  operation: "capture" | "refund",
  providerKey: string,
): Promise<void> {
  const previous = fenceQueue;
  let release!: () => void;
  fenceQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const connection = new Client({ ...pool.options, connectionTimeoutMillis: 5_000 });
  try {
    await connection.connect();
    await connection.query(
      `INSERT INTO provider_operation_fences (transaction_id, operation, provider_key)
       VALUES ($1, $2, $3) ON CONFLICT (transaction_id) DO NOTHING`,
      [transactionId, operation, providerKey],
    );
    const current = await connection.query<{ operation: string; provider_key: string }>(
      `SELECT operation, provider_key FROM provider_operation_fences WHERE transaction_id = $1`, [transactionId],
    );
    if (current.rows[0]?.operation !== operation || current.rows[0]?.provider_key !== providerKey) {
      throw new ConflictError("provider_operation_unresolved", "retry the original request with its original Idempotency-Key");
    }
  } finally {
    await connection.end().catch(() => {});
    release();
  }
}

/** Commit this removal only together with the definitive financial outcome. */
export async function resolveProviderOperation(client: PoolClient, transactionId: string, providerKey: string): Promise<void> {
  await client.query(`DELETE FROM provider_operation_fences WHERE transaction_id = $1 AND provider_key = $2`, [transactionId, providerKey]);
}
