import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "./config.js";

const BASE = {
  DATABASE_URL: "postgres://x@localhost/x",
  NODE_ENV: "test",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
};

test("trustProxy is off unless asked for (the API may be exposed directly)", () => {
  assert.equal(loadConfig(BASE).trustProxy, false);
  assert.equal(loadConfig({ ...BASE, TRUST_PROXY: "true" }).trustProxy, true);
});

test("CORS origins default to the local dashboards, and an empty value does not switch CORS off", () => {
  assert.deepEqual(loadConfig(BASE).corsOrigins.slice(0, 2), ["http://localhost:5173", "http://localhost:5174"]);
  assert.ok(loadConfig({ ...BASE, CORS_ORIGINS: "" }).corsOrigins.length > 0);
  assert.deepEqual(loadConfig({ ...BASE, CORS_ORIGINS: "https://a.example, https://b.example" }).corsOrigins, [
    "https://a.example",
    "https://b.example",
  ]);
});

test("the in-flight payment cap follows the pool size unless set", () => {
  assert.equal(loadConfig({ ...BASE, PG_POOL_MAX: "10" }).maxInflightPayments, 20);
  assert.equal(loadConfig({ ...BASE, MAX_INFLIGHT_PAYMENTS: "7" }).maxInflightPayments, 7);
});
