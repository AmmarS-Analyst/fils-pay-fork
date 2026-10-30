import type { Pool } from "pg";
import type { EventType } from "@filspay/events";
import { withTransaction } from "../db/withTransaction.js";
import type { ReportingConfig } from "../config.js";
import { readCursor, advanceCursor } from "./cursor.js";
import { applyEvent, type OutboxEventRow } from "./applyEvent.js";

export const REPORTING_EVENT_TYPES: readonly EventType[] = [
  "transaction.captured",
  "transaction.voided",
  "settlement.batch_closed",
  "settlement.paid",
  "refund.succeeded",
];

/**
 * Keys this worker's row in reporting_outbox_cursor. Two processes using the
 * same name serialize on that row, so a catch-up run beside a live worker
 * cannot apply an event twice.
 */
export const CONSUMER_NAME = "reporting";

/**
 * Lock the reporting consumer, apply a bounded batch and write one receipt
 * per event in the same transaction. A failure rolls back projections,
 * receipts and the informational watermark together. Receipt lookup also
 * recovers events whose sequence IDs were allocated before a later commit.
 */
export async function runConsumerPass(
  pool: Pool,
  config: Pick<ReportingConfig, "consumerBatchLimit">,
): Promise<{ processedCount: number }> {
  return withTransaction(pool, async (client) => {
    const cursor = await readCursor(client, CONSUMER_NAME);

    // Sequence allocation is not commit order. Receipts, rather than the
    // informational high-water mark, decide whether a committed event ran.
    const eventsResult = await client.query<OutboxEventRow>(
      `SELECT id, event_type, aggregate_id, payload, created_at
         FROM outbox_events
        WHERE event_type = ANY($2::text[])
          AND NOT EXISTS (
            SELECT 1 FROM reporting_processed_events receipt
             WHERE receipt.consumer_name = $1 AND receipt.outbox_event_id = outbox_events.id
          )
        ORDER BY id ASC
        LIMIT $3`,
      [CONSUMER_NAME, REPORTING_EVENT_TYPES, config.consumerBatchLimit],
    );

    // FH: redundant with ORDER BY id ASC (last row is max). harmless
    let maxId = cursor.lastProcessedId;
    for (const row of eventsResult.rows) {
      await applyEvent(client, row);
      await client.query(
        `INSERT INTO reporting_processed_events (consumer_name, outbox_event_id) VALUES ($1, $2)`,
        [CONSUMER_NAME, row.id.toString()],
      );
      const rowId = BigInt(row.id);
      if (rowId > maxId) maxId = rowId;
    }

    if (eventsResult.rows.length > 0) {
      await advanceCursor(client, CONSUMER_NAME, maxId);
    }

    return { processedCount: eventsResult.rows.length };
  });
}
