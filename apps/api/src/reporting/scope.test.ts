/**
 * Report scoping against a real, migrated Postgres (run `npm run migrate` first).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { Pool } from "pg";
import { resolveReportMerchantId } from "./scope.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("scope.test.ts requires DATABASE_URL to point at a real, migrated Postgres");
}
const pool = new Pool({ connectionString: databaseUrl, max: 2 });
after(() => pool.end());

async function createMerchant(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Scope ${randomUUID()}`],
  );
  return result.rows[0]!.id;
}

test("a parent can report on its own split child; any other merchant gets only itself", async () => {
  const parent = await createMerchant();
  const child = await createMerchant();
  const stranger = await createMerchant();
  await pool.query(
    `INSERT INTO merchant_split_children (parent_merchant_id, child_merchant_id, split_weight_bps) VALUES ($1, $2, 10000)`,
    [parent, child],
  );

  assert.equal(await resolveReportMerchantId(pool, parent, child), child);
  assert.equal(await resolveReportMerchantId(pool, stranger, child), stranger, "stranger must not read the child");
  assert.equal(await resolveReportMerchantId(pool, child, parent), child, "a child cannot read its parent");
});
