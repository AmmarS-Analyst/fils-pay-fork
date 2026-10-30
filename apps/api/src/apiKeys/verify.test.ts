import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { sha256Hex } from "../lib/crypto.js";
import { verifyApiKey } from "./verify.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.after(() => pool.end());
test("scheduled revocation rejects an expired key without a sweep", async () => {
  const merchant = await pool.query<{ id: string }>("INSERT INTO merchants(display_name) VALUES($1) RETURNING id", [randomUUID()]);
  const admin = await pool.query<{ id: string }>("INSERT INTO admin_users(email,password_hash,display_name,role) VALUES($1,'unused','test','super_admin') RETURNING id", [`${randomUUID()}@keys.test`]);
  const raw = randomUUID();
  const key = await pool.query<{ id: string }>(`INSERT INTO api_keys(merchant_id,key_prefix,key_hash,created_by_admin_user_id,revoke_after)
    VALUES($1,'test',$2,$3,now()-interval '1 second') RETURNING id`, [merchant.rows[0]!.id,sha256Hex(raw),admin.rows[0]!.id]);
  assert.equal(await verifyApiKey(pool, raw), null);
  await pool.query("UPDATE api_keys SET revoke_after=now()+interval '1 hour' WHERE id=$1", [key.rows[0]!.id]);
  assert.equal((await verifyApiKey(pool, raw))?.merchantId, merchant.rows[0]!.id);
  await pool.query("UPDATE api_keys SET revoked_at=now() WHERE id=$1", [key.rows[0]!.id]);
  assert.equal(await verifyApiKey(pool, raw), null);
});
