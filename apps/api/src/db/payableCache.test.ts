import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
test.after(() => pool.end());

test("concurrent journal postings maintain an exact payable cache and rollback together", async () => {
  const merchant = await pool.query<{id: string}>("INSERT INTO merchants(display_name) VALUES($1) RETURNING id", [randomUUID()]);
  const id = merchant.rows[0]!.id;
  async function post(amount: number, rollback = false): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO ledger_entries(entry_group_id,merchant_id,account_id,direction,amount_fils,occurred_at,description)
        VALUES($1,$2,'merchant_payable',$3,$4,now(),'cache regression'),
              ($1,$2,'card_scheme_clearing',$5,$4,now(),'cache regression')`,
        [randomUUID(), id, amount > 0 ? 'credit' : 'debit', Math.abs(amount), amount > 0 ? 'debit' : 'credit']);
      await client.query(rollback ? "ROLLBACK" : "COMMIT");
    } finally { client.release(); }
  }
  await Promise.all([post(1000), post(2000), post(-25), post(9999, true)]);
  const balance = await pool.query<{cached_payable_fils: string}>("SELECT cached_payable_fils FROM merchant_balances WHERE merchant_id=$1", [id]);
  assert.equal(Number(balance.rows[0]!.cached_payable_fils), 2975);
});

test("balanced updates and deletes cannot rewrite journal history or bypass the cache", async () => {
  const merchant = await pool.query<{id: string}>("INSERT INTO merchants(display_name) VALUES($1) RETURNING id", [randomUUID()]);
  const id = merchant.rows[0]!.id;
  const group = randomUUID();
  await pool.query(`INSERT INTO ledger_entries(entry_group_id,merchant_id,account_id,direction,amount_fils,occurred_at)
    VALUES($1,$2,'merchant_payable','credit',100,now()),($1,$2,'card_scheme_clearing','debit',100,now())`,[group,id]);
  await assert.rejects(pool.query("UPDATE ledger_entries SET amount_fils=200 WHERE entry_group_id=$1",[group]),/append-only/);
  await assert.rejects(pool.query("DELETE FROM ledger_entries WHERE entry_group_id=$1",[group]),/append-only/);
  const balance=await pool.query("SELECT cached_payable_fils FROM merchant_balances WHERE merchant_id=$1",[id]);
  assert.equal(Number(balance.rows[0].cached_payable_fils),100);
});
