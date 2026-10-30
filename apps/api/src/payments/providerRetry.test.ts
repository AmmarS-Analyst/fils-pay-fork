import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { toFils } from "@filspay/money";
import { loadConfig } from "../config.js";
import { createAcquirerSimulator } from "../acquirer/simulator.js";
import { recordKycReview } from "../onboarding/review.js";
import { authorizeTransaction } from "./authorize.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("providerRetry.test.ts requires migrated DATABASE_URL");
const pool = new Pool({ connectionString: databaseUrl });
test.after(() => pool.end());
const config = loadConfig({ DATABASE_URL: databaseUrl, NODE_ENV: "test", ACQUIRER_FAILURE_RATE: "0", ACQUIRER_LATENCY_MIN_MS: "0", ACQUIRER_LATENCY_MAX_MS: "1" });

test("authorization retries preserve provider identity after its response is lost", async () => {
  const merchant = await pool.query<{ id: string }>(`INSERT INTO merchants (display_name, mdr_bps) VALUES ('Provider recovery test', 250) RETURNING id`);
  const merchantId = merchant.rows[0]!.id;
  await recordKycReview(pool, { merchantId, outcome: "approved", reviewerIdentifier: "test" });
  const real = createAcquirerSimulator(config);
  const keys: string[] = [];
  const acquirer = { ...real, async authorize(req: Parameters<typeof real.authorize>[0]) {
    keys.push(req.idempotencyKey);
    const result = await real.authorize(req);
    if (keys.length === 1) throw new Error("lost authorization response");
    return result;
  } };
  const input = { merchantId, amountFils: toFils(1_000), card: { pan: "4242424242424242", expiryMonth: 12, expiryYear: 2030, cvv: "123" }, idempotencyKey: randomUUID(), actor: { type: "system" as const } };
  await assert.rejects(authorizeTransaction(pool, acquirer, input), /lost authorization response/);
  const result = await authorizeTransaction(pool, acquirer, input);
  assert.equal(result.statusCode, 201);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal((await pool.query(`SELECT 1 FROM transactions WHERE merchant_id = $1`, [merchantId])).rowCount, 1);
});
