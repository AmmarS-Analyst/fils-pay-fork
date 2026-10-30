import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { issueApiKey } from "../apiKeys/issue.js";
import { recordKycReview } from "../onboarding/review.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const config = loadConfig({ DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" });
const app = buildApp(config, pool);
let headers: Record<string, string>;
let merchantId: string;
test.before(async () => {
  const merchant = (await pool.query<{ id: string }>(`INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`, [randomUUID()])).rows[0]!.id;
  merchantId = merchant;
  const user = (await pool.query<{ id: string }>(`INSERT INTO merchant_users (merchant_id,email,role,password_hash) VALUES ($1,$2,'owner','unused') RETURNING id`, [merchant, `${randomUUID()}@test.invalid`])).rows[0]!.id;
  await recordKycReview(pool, { merchantId: merchant, outcome: "approved", reviewerIdentifier: "test" });
  const key = await issueApiKey(pool, config, { merchantId: merchant, createdBy: user, label: "boundary" });
  headers = { authorization: `Bearer ${key.rawKey}`, "idempotency-key": randomUUID() };
});
test.after(async () => { await app.close(); await pool.end(); });

test("analytics and settlement reject impossible, malformed and reversed business windows", async () => {
  for (const path of ["analytics/volumes", "analytics/payout-trends", "settlement/reconciliation", "settlement/summary", "settlement/batches"]) {
    for (const range of ["from=2026-02-30&to=2026-03-02", "from=garbage&to=2026-03-02", "from=2026-03-02&to=2026-03-01"]) {
      const res = await app.inject({ method: "GET", url: `/v1/${path}?${range}`, headers });
      assert.equal(res.statusCode, 400, `${path} ${range}: ${res.body}`);
    }
  }
});

test("transaction list/export validate dates before opening queries or streams", async () => {
  for (const path of ["/v1/transactions", "/v1/transactions/export"]) {
    for (const range of ["from=2026-02-30T00:00:00Z", "from=nonsense", "from=2026-03-03T00:00:00Z&to=2026-03-01T00:00:00Z"]) {
      const res = await app.inject({ method: "GET", url: `${path}?${range}`, headers });
      assert.equal(res.statusCode, 400, `${path}: ${res.body}`);
    }
  }
});

test("bad limits, tampered cursors and UUIDs return client errors", async () => {
  for (const path of ["/v1/transactions", "/v1/settlement/batches"]) {
    for (const query of ["limit=NaN", "limit=2garbage", `cursor=${Buffer.from("bogus|not-a-uuid").toString("base64url")}`]) {
      const res = await app.inject({ method: "GET", url: `${path}?${query}`, headers });
      assert.equal(res.statusCode, 400, `${path}?${query}: ${res.body}`);
    }
  }
  for (const path of ["/v1/transactions/not-a-uuid", "/v1/transactions/not-a-uuid/events", "/v1/settlement/batches/not-a-uuid"]) {
    assert.equal((await app.inject({ method: "GET", url: path, headers })).statusCode, 404);
  }
});

test("authorize/capture reject negative, fractional, unsafe and nonnumeric money before provider calls", async () => {
  for (const amountFils of [-1, 1.25, Number.MAX_SAFE_INTEGER + 1, "1"]) {
    const authorized = await app.inject({ method: "POST", url: "/v1/transactions", headers, payload: { amountFils, card: { number: "4111111111111111", expiryMonth: 12, expiryYear: 2030, cvv: "123" } } });
    assert.equal(authorized.statusCode, 400, authorized.body);
    const captured = await app.inject({ method: "POST", url: `/v1/transactions/${randomUUID()}/capture`, headers, payload: { amountFils } });
    assert.equal(captured.statusCode, 400, captured.body);
  }
});

test("report JSON primitives and invalid scoped dates/UUIDs return400", async () => {
  for (const filter of [null, [], { merchantId: "bad" }, { from: "2026-02-30" }, { from: "2026-03-02", to: "2026-03-01" }]) {
    const res = await app.inject({ method: "GET", url: `/v1/reporting/transactions?filter=${encodeURIComponent(JSON.stringify(filter))}`, headers });
    assert.equal(res.statusCode, 400, res.body);
  }
});


test("valid PostgreSQL microsecond cursors retain every equal-time transaction", async () => {
  await pool.query(`INSERT INTO transactions (merchant_id,status,amount_fils,captured_fils,acquirer_reference,occurred_at)
    SELECT $1,'captured',1000,1000,'microsecond_' || gen_random_uuid(),'2026-02-01T12:34:56.123456Z'::timestamptz
    FROM generate_series(1,65)`, [merchantId]);
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 5; page++) {
    const url: string = `/v1/transactions?limit=17${cursor ? `&cursor=${cursor}` : ""}`;
    const res = await app.inject({ method: "GET", url, headers });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json() as { transactions: Array<{ id: string }>; nextCursor: string | null };
    for (const row of body.transactions) { assert.ok(!seen.has(row.id)); seen.add(row.id); }
    cursor = body.nextCursor;
    if (!cursor) break;
  }
  assert.equal(seen.size, 65);
});
