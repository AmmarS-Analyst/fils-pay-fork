// Closed-loop load test for the checkout path: POST /v1/transactions (authorize),
// optionally followed by a capture. Node 22, no dependencies.
//
//   BASE_URL=https://shop.example.com API_KEY=fp_live_xxx node tools/load/checkout.mjs
//   LEVELS=5,10,20,40,80 SECONDS=20 node tools/load/checkout.mjs        (defaults shown)
//
// Each level runs N workers that fire one request after the other for SECONDS.
// A 503 is counted as "shed" (the API said no on purpose), not as a failure.
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const KEY = process.env.API_KEY;
const LEVELS = (process.env.LEVELS ?? "5,10,20,40,80").split(",").map(Number);
const SECONDS = Number(process.env.SECONDS ?? 20);
const AMOUNT_FILS = Number(process.env.AMOUNT_FILS ?? 12500);
if (!KEY) {
  console.error("set API_KEY (create one in the merchant dashboard)");
  process.exit(1);
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

async function one() {
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE}/v1/transactions`, {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({
        amountFils: AMOUNT_FILS,
        card: { pan: "4242424242424241", expiryMonth: 12, expiryYear: 2030, cvv: "123" },
        reference: "load-test",
      }),
    });
    await res.arrayBuffer();
    return { status: res.status, ms: performance.now() - t0, retryAfter: res.headers.get("retry-after") };
  } catch {
    return { status: 0, ms: performance.now() - t0 };
  }
}

async function level(n) {
  const end = performance.now() + SECONDS * 1000;
  const results = [];
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (performance.now() < end) results.push(await one());
    }),
  );
  const ok = results.filter((r) => r.status === 200 || r.status === 201);
  const shed = results.filter((r) => r.status === 503);
  const declined = results.filter((r) => r.status === 402);
  const bad = results.length - ok.length - shed.length - declined.length;
  const lat = ok.map((r) => r.ms).sort((a, b) => a - b);
  const shedLat = shed.map((r) => r.ms).sort((a, b) => a - b);
  return {
    workers: n,
    reqPerSec: +(results.length / SECONDS).toFixed(1),
    okPerSec: +(ok.length / SECONDS).toFixed(1),
    shedPct: +((100 * shed.length) / Math.max(1, results.length)).toFixed(1),
    errPct: +((100 * bad) / Math.max(1, results.length)).toFixed(1),
    p50: Math.round(pct(lat, 50)),
    p95: Math.round(pct(lat, 95)),
    p99: Math.round(pct(lat, 99)),
    shedP95: Math.round(pct(shedLat, 95)),
  };
}

console.log(`target ${BASE}  ${SECONDS}s per level  amount ${AMOUNT_FILS} fils`);
const rows = [];
for (const n of LEVELS) {
  rows.push(await level(n));
  console.log(JSON.stringify(rows.at(-1)));
}
console.table(rows);
