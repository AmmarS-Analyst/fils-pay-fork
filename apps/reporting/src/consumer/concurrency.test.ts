import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { enqueueEvent } from "@filspay/events";
import { runConsumerPass } from "./runConsumerPass.js";
import { refreshAnalyticsRollups } from "../../../api/src/admin/reportingRebuild.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
const config = { consumerBatchLimit: 500 };
test.after(() => pool.end());
async function merchant(): Promise<string> {
  const result = await pool.query<{ id: string }>(`INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`, [randomUUID()]);
  return result.rows[0]!.id;
}
async function capture(client: Pick<Pool, "query">, merchantId: string, amount: number) {
  const id = randomUUID();
  await client.query(`INSERT INTO transactions (id, merchant_id, status, amount_fils, captured_fils, acquirer_reference) VALUES ($1::uuid, $2, 'captured', $3, $3, 'test_' || $1::text)`, [id, merchantId, amount]);
  await client.query(`INSERT INTO transaction_events (transaction_id, event_type, amount_fils, actor_type) VALUES ($1, 'captured', $2, 'system')`, [id, amount]);
  return enqueueEvent(client, { eventType: "transaction.captured", aggregateType: "transaction", aggregateId: id, payload: { merchantId, amountCapturedFils: amount } });
}
async function gross(id: string): Promise<number> {
  return Number((await pool.query(`SELECT COALESCE(SUM(captured_gross_fils), 0) AS gross FROM merchant_daily_volume WHERE merchant_id = $1`, [id])).rows[0].gross);
}

test("late lower sequence commit is consumed after the higher committed event, exactly once", async () => {
  const id = await merchant();
  const held = await pool.connect();
  try {
    await held.query("BEGIN");
    const low = await capture(held as unknown as Pick<Pool, "query">, id, 123);
    const high = await capture(pool, id, 456);
    assert.ok(low.id < high.id);
    await runConsumerPass(pool, config);
    assert.equal(await gross(id), 456);
    await held.query("COMMIT");
    await Promise.all([runConsumerPass(pool, config), runConsumerPass(pool, config)]);
    assert.equal(await gross(id), 579);
    await runConsumerPass(pool, config);
    assert.equal(await gross(id), 579);
  } finally { await held.query("ROLLBACK"); held.release(); }
});

test("admin rebuild and live consumers share exact receipts, including late commits", async () => {
  const id = await merchant();
  const held = await pool.connect();
  const admin = await pool.connect();
  try {
    await capture(pool, id, 100);
    await held.query("BEGIN");
    await capture(held as unknown as Pick<Pool, "query">, id, 200);
    await admin.query("BEGIN");
    await refreshAnalyticsRollups(admin);
    await admin.query("COMMIT");
    assert.equal(await gross(id), 100);
    await held.query("COMMIT");
    await Promise.all([runConsumerPass(pool, config), runConsumerPass(pool, config)]);
    assert.equal(await gross(id), 300);
  } finally {
    await held.query("ROLLBACK"); held.release();
    await admin.query("ROLLBACK"); admin.release();
  }
});

test("paid event updates a previously closed payout projection", async () => {
  const id = await merchant();
  const batch = (await pool.query<{ id: string }>(`INSERT INTO settlement_batches (merchant_id, batch_date, status, gross_fils, fee_fils, net_payout_fils) VALUES ($1, '2026-01-01', 'closed', 1000, 25, 975) RETURNING id`, [id])).rows[0]!.id;
  await enqueueEvent(pool, { eventType: "settlement.batch_closed", aggregateType: "settlement_batch", aggregateId: batch, payload: { merchantId: id, batchId: batch, batchDate: "2026-01-01", grossFils: 1000, feeFils: 25, netPayoutFils: 975 } });
  await runConsumerPass(pool, config);
  await pool.query(`UPDATE settlement_batches SET status = 'paid', paid_at = now() WHERE id = $1`, [batch]);
  await enqueueEvent(pool, { eventType: "settlement.paid", aggregateType: "settlement_batch", aggregateId: batch, payload: { merchantId: id, settlementBatchId: batch } });
  await runConsumerPass(pool, config);
  const row = (await pool.query(`SELECT status, paid_at, net_payout_fils FROM merchant_payout_trends WHERE settlement_batch_id = $1`, [batch])).rows[0];
  assert.equal(row.status, "paid"); assert.ok(row.paid_at); assert.equal(Number(row.net_payout_fils), 975);
});


test("admin rebuild preserves imported source history without an outbox row", async () => {
  const id = await merchant();
  const txn = randomUUID();
  await pool.query(`INSERT INTO transactions (id, merchant_id, status, amount_fils, captured_fils, acquirer_reference) VALUES ($1::uuid, $2, 'captured', 789, 789, 'test_' || $1::text)`, [txn, id]);
  await pool.query(`INSERT INTO transaction_events (transaction_id, event_type, amount_fils, actor_type) VALUES ($1, 'captured', 789, 'system')`, [txn]);
  const admin = await pool.connect();
  try {
    await admin.query("BEGIN"); await refreshAnalyticsRollups(admin); await admin.query("COMMIT");
    assert.equal(await gross(id), 789);
    await capture(pool, id, 111);
    await runConsumerPass(pool, config);
    assert.equal(await gross(id), 900);
  } finally { await admin.query("ROLLBACK"); admin.release(); }
});
