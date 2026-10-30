// Overload + crash test that checks nothing is lost or doubled.
// Each simulated user does a checkout: authorize, then capture, each with its
// own Idempotency-Key. Run it past the limit, kill the API part-way (from the
// server: kill -9 on the container PID), then this script retries every request
// whose outcome was unknown with the SAME key. Afterwards compare the printed
// counts with the database (queries in docs/CAPACITY.md).
//
//   BASE_URL=http://host API_KEY=fp_... WORKERS=60 SECONDS=25 node tools/load/overload-integrity.mjs
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const KEY = process.env.API_KEY;
const WORKERS = Number(process.env.WORKERS ?? 60);
const SECONDS = Number(process.env.SECONDS ?? 25);
const RUN = process.env.RUN ?? `IT${Date.now().toString(36)}`;
if (!KEY) throw new Error("set API_KEY");

const card = { pan: "4242424242424241", expiryMonth: 12, expiryYear: 2030, cvv: "123" };
const AMOUNT = 1001; // 1.001 BD, odd fils on purpose

async function call(path, body, key) {
  try {
    const r = await fetch(BASE + path, {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  } catch {
    return { status: 0, body: null }; // connection dropped or timed out: outcome unknown
  }
}

const unknown = (s) => s === 0 || s >= 500 && s !== 503;
const counts = {};
const bump = (k) => (counts[k] = (counts[k] ?? 0) + 1);
const pending = []; // requests to retry with the same key after the run
const authorized = new Map(); // ref -> txn id
const captured = new Set();

async function captureTxn(ref, id, key) {
  const c = await call(`/v1/transactions/${id}/capture`, {}, key);
  bump(`capture ${c.status}`);
  if (c.status === 200) captured.add(ref);
  else if (unknown(c.status)) pending.push({ kind: "capture", ref, id, key });
}

let seq = 0;
const end = Date.now() + SECONDS * 1000;
await Promise.all(Array.from({ length: WORKERS }, async () => {
  while (Date.now() < end) {
    const ref = `${RUN}-${++seq}`;
    const key = `${ref}-auth`;
    const a = await call("/v1/transactions", { amountFils: AMOUNT, card, reference: ref }, key);
    bump(`authorize ${a.status}`);
    if (a.status === 201) {
      authorized.set(ref, a.body.id);
      await captureTxn(ref, a.body.id, `${ref}-cap`);
    } else if (unknown(a.status)) pending.push({ kind: "authorize", ref, key });
    else if (a.status === 503) await new Promise((r) => setTimeout(r, 1000)); // honour Retry-After
  }
}));

// Recovery: retry every unknown outcome with the same key until it settles.
let retried = 0;
for (const p of pending) {
  for (let i = 0; i < 30; i++) {
    const r = p.kind === "authorize"
      ? await call("/v1/transactions", { amountFils: AMOUNT, card, reference: p.ref }, p.key)
      : await call(`/v1/transactions/${p.id}/capture`, {}, p.key);
    if (unknown(r.status) || r.status === 503) { await new Promise((s) => setTimeout(s, 1000)); continue; }
    retried++;
    bump(`retry ${p.kind} ${r.status}`);
    if (p.kind === "authorize" && r.status === 201) {
      authorized.set(p.ref, r.body.id);
      await captureTxn(p.ref, r.body.id, `${p.ref}-cap`);
    }
    if (p.kind === "capture" && r.status === 200) captured.add(p.ref);
    break;
  }
}

console.log(JSON.stringify({
  run: RUN, workers: WORKERS, seconds: SECONDS, counts,
  unknownOutcomes: pending.length, settledOnRetry: retried,
  clientAuthorized: authorized.size, clientCaptured: captured.size,
  expectedCapturedFils: captured.size * AMOUNT,
}, null, 1));
