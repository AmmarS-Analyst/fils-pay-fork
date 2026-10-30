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
