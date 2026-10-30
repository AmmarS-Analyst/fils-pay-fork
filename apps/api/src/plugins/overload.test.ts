import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { registerOverloadGuard } from "./overload.js";

function slowApp(max: number) {
  const app = Fastify();
  registerOverloadGuard(app, max);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  app.post("/v1/transactions", async () => {
    await gate;
    return { ok: true };
  });
  app.get("/v1/transactions", async () => ({ ok: true }));
  app.get("/healthz", async () => ({ ok: true }));
  return { app, release };
}

test("past the cap a payment write gets 503 + Retry-After instead of queueing", async () => {
  const { app, release } = slowApp(2);
  const first = app.inject({ method: "POST", url: "/v1/transactions" });
  const second = app.inject({ method: "POST", url: "/v1/transactions" });
  await new Promise((r) => setTimeout(r, 20));

  const shed = await app.inject({ method: "POST", url: "/v1/transactions" });
  assert.equal(shed.statusCode, 503);
  assert.equal(shed.headers["retry-after"], "1");
  assert.equal(shed.json().error, "overloaded");

  // reads and health stay up while writes are being shed
  assert.equal((await app.inject({ method: "GET", url: "/v1/transactions" })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/healthz" })).statusCode, 200);

  release();
  assert.equal((await first).statusCode, 200);
  assert.equal((await second).statusCode, 200);

  // slots come back once the work is done, so the API recovers by itself
  assert.equal((await app.inject({ method: "POST", url: "/v1/transactions" })).statusCode, 200);
});

test("a cap of 0 leaves the guard off", async () => {
  const { app, release } = slowApp(0);
  release();
  const all = await Promise.all([1, 2, 3, 4].map(() => app.inject({ method: "POST", url: "/v1/transactions" })));
  assert.deepEqual(all.map((r) => r.statusCode), [200, 200, 200, 200]);
});

test("a query string or the public payment-link pay route cannot skip the guard", async () => {
  const app = Fastify();
  registerOverloadGuard(app, 1);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  app.post("/v1/transactions", async () => {
    await gate;
    return { ok: true };
  });
  app.post("/v1/payment-links/:token/pay", async () => ({ ok: true }));

  const first = app.inject({ method: "POST", url: "/v1/transactions" });
  await new Promise((r) => setTimeout(r, 20));

  assert.equal((await app.inject({ method: "POST", url: "/v1/transactions?x=1" })).statusCode, 503);
  assert.equal((await app.inject({ method: "POST", url: "/v1/payment-links/abc/pay" })).statusCode, 503);

  release();
  assert.equal((await first).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: "/v1/payment-links/abc/pay" })).statusCode, 200);
});
