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

test("outside production the API boots without WEBHOOK_SECRET_ENCRYPTION_KEY (dev fallback is a valid 32-byte key)", () => {
  const { WEBHOOK_SECRET_ENCRYPTION_KEY: _unused, ...noKey } = BASE;
  const config = loadConfig({ ...noKey, NODE_ENV: "development" });
  assert.equal(Buffer.from(config.webhookSecretEncryptionKey, "base64").length, 32);
});

test("production refuses the development encryption fallback", () => {
  assert.throws(() => loadConfig({ DATABASE_URL: "postgres://unused/local", NODE_ENV: "production",
    SETTLEMENT_INTERNAL_TOKEN: "test-only", ACQUIRER_CALLBACK_SIGNING_SECRET: "test-only" }),
    /WEBHOOK_SECRET_ENCRYPTION_KEY/);
});

test("production cannot expose OTP codes or disable acquirer authentication through env flags", () => {
  const config = loadConfig({ DATABASE_URL: "postgres://unused/local", NODE_ENV: "production",
    SETTLEMENT_INTERNAL_TOKEN: "test-only", ACQUIRER_CALLBACK_SIGNING_SECRET: "test-only",
    WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
    OTP_DEV_EXPOSE: "true", ACQUIRER_CALLBACK_REQUIRE_SIGNATURE: "false" });
  assert.equal(config.otpDevExpose, false);
  assert.equal(config.acquirerCallbackRequireSignature, true);
});
