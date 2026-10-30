/**
 * Incident 2026-05-14 regression: a slow pay attempt whose reservation timed
 * out and was re-claimed by another buyer must not capture. Real Postgres;
 * requires DATABASE_URL (run `npm run migrate` first).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { loadConfig } from "../config.js";
import { createAcquirerSimulator } from "../acquirer/simulator.js";
import type { AcquirerSimulator } from "../acquirer/types.js";
import { recordKycReview } from "../onboarding/review.js";
import { payPaymentLink } from "./pay.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("payRace.test.ts requires DATABASE_URL to point at a real, migrated Postgres");
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  INTERNAL_API_TOKEN: "test-internal-token",
  ACQUIRER_FAILURE_RATE: "0",
  ACQUIRER_LATENCY_MIN_MS: "0",
  ACQUIRER_LATENCY_MAX_MS: "1",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
});
const pool = new Pool({ connectionString: databaseUrl, max: 5 });
test.after(() => pool.end());

const CARD = { pan: "4242424242424242", expiryMonth: 12, expiryYear: 2030, cvv: "123" };

async function activeLink(): Promise<{ id: string; token: string }> {
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Race Merchant ${randomUUID()}`],
  );
  const merchantId = merchant.rows[0]!.id;
  await recordKycReview(pool, { merchantId, outcome: "approved", reviewerIdentifier: "test" });
  const token = `plink_race_${randomUUID()}`;
  const link = await pool.query<{ id: string }>(
    `INSERT INTO payment_links (merchant_id, token, amount_fils, expires_at, created_by_type, created_by_id)
     VALUES ($1, $2, 4750, now() + interval '1 hour', 'merchant_api_key', $3) RETURNING id`,
    [merchantId, token, randomUUID()],
  );
  return { id: link.rows[0]!.id, token };
}

test("a pay attempt whose reservation was re-claimed during authorize does not capture", async () => {
  const link = await activeLink();
  const real = createAcquirerSimulator(config);
  let captures = 0;
  // While this buyer's authorize is "slow", the reservation times out and a
  // second buyer re-claims the link (simulated by moving reserved_at on).
  const racingAcquirer: AcquirerSimulator = {
    async authorize(req) {
      const result = await real.authorize(req);
      await pool.query(`UPDATE payment_links SET reserved_at = now() + interval '1 second' WHERE id = $1`, [link.id]);
      return result;
    },
    capture(req) {
      captures += 1;
      return real.capture(req);
    },
    refund: (req) => real.refund(req),
  };

  const result = await payPaymentLink(pool, racingAcquirer, config, {
    token: link.token,
    card: CARD,
    idempotencyKey: randomUUID(),
  });

  assert.equal(result.statusCode, 409, JSON.stringify(result.body));
  assert.equal(captures, 0, "the losing request must not capture");
  const row = await pool.query<{ status: string }>(`SELECT status FROM payment_links WHERE id = $1`, [link.id]);
  assert.equal(row.rows[0]!.status, "reserved", "the other buyer's reservation is left intact");
});
