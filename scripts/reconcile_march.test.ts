import assert from "node:assert/strict";
import { test } from "node:test";
import { computeResidueFils, monthBounds } from "./reconcile_march.js";

test("computeResidueFils returns the amount lost to 2dp quantization", () => {
  assert.equal(computeResidueFils(4750), 0);
  assert.equal(computeResidueFils(4759), 9);
  assert.equal(computeResidueFils(10), 0);
  assert.equal(computeResidueFils(1), 1);
  assert.equal(computeResidueFils(0), 0);
});

test("monthBounds for March 2026 spans 31 days", () => {
  const { start, end } = monthBounds(2026, 3);
  const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  assert.equal(days, 31);
  // Bahrain month (UTC+3): starts 21:00Z on the last day of February.
  assert.equal(start.toISOString(), "2026-02-28T21:00:00.000Z");
  assert.equal(end.toISOString(), "2026-03-31T21:00:00.000Z");
});

test("March sweep uses exported capture lines and concurrent replay posts once", { skip: !process.env.DATABASE_URL }, async () => {
  const { Client } = await import("pg");
  const { randomUUID } = await import("node:crypto");
  const { reconcileMarch } = await import("./reconcile_march.js");
  const clients = [new Client({ connectionString: process.env.DATABASE_URL }), new Client({ connectionString: process.env.DATABASE_URL })];
  await Promise.all(clients.map((client) => client.connect()));
  const client = clients[0]!;
  const merchant = randomUUID(), transaction = randomUUID(), batch = randomUUID();
  try {
    await client.query(`INSERT INTO merchants(id,display_name,status,test_mode,mdr_bps) VALUES($1,$2,'active',false,250)`, [merchant, `march-${merchant}`]);
    // Authorization happened in February and the running captured total
    // includes April: neither is the March scheme line's amount.
    await client.query(`INSERT INTO transactions(id,merchant_id,status,amount_fils,captured_fils,acquirer_reference,occurred_at) VALUES($1,$2,'captured',12019,12019,'march-test','2026-02-27T12:00:00Z')`, [transaction, merchant]);
    await client.query(`INSERT INTO settlement_batches(id,merchant_id,batch_date,status) VALUES($1,$2,'2026-03-01','closed')`, [batch, merchant]);
    await client.query(`INSERT INTO transaction_events(transaction_id,event_type,amount_fils,actor_type,occurred_at,settlement_batch_id) VALUES($1,'captured',10009,'system','2026-02-28T22:00:00Z',$2),($1,'partially_captured',2010,'system','2026-04-02T12:00:00Z',NULL)`, [transaction, batch]);
    await client.query(`INSERT INTO scheme_export_lines(settlement_batch_id,transaction_id,amount_fils,amount,line_sequence) VALUES($1,$2,10000,10.00,1)`, [batch, transaction]);
    await Promise.all(clients.map((connection) => reconcileMarch(connection)));
    const result = await client.query(`SELECT account_id,direction,amount_fils,occurred_at FROM ledger_entries WHERE merchant_id=$1 ORDER BY account_id`, [merchant]);
    assert.equal(result.rows.length, 2);
    assert.deepEqual(result.rows.map((r) => [r.account_id, r.direction, Number(r.amount_fils)]), [["card_scheme_clearing", "credit", 9], ["scheme_rounding_residue", "debit", 9]]);
    assert.equal(result.rows[0].occurred_at.toISOString(), "2026-03-31T20:59:59.999Z");
  } finally { await Promise.all(clients.map((connection) => connection.end())); }
});
