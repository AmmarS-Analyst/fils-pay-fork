import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "./config.js";

test("development boots with a valid 32-byte fallback encryption key", () => {
  const config = loadConfig({ DATABASE_URL: "postgres://unused/local", NODE_ENV: "development" });
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
