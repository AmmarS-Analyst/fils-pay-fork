import assert from "node:assert/strict";
import { test } from "node:test";
import { validateWebhookUrl } from "./create.js";

const prod = { nodeEnv: "production" as const };

test("production rejects webhook URLs that point inside our network", () => {
  for (const url of [
    "https://localhost/hook",
    "https://127.0.0.1/hook",
    "https://10.0.0.5/hook",
    "https://172.20.1.1/hook",
    "https://192.168.1.10/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/hook",
    "https://[fd00::1]/hook",
    "https://settlement.internal/hook",
  ]) {
    assert.throws(() => validateWebhookUrl(url, prod), /invalid_url|public host/, url);
  }
});

test("production accepts a public https host and still rejects plain http", () => {
  assert.equal(validateWebhookUrl("https://merchant.example.com/hooks", prod).hostname, "merchant.example.com");
  assert.throws(() => validateWebhookUrl("http://merchant.example.com/hooks", prod));
});

test("outside production the local test receiver is still allowed", () => {
  assert.equal(validateWebhookUrl("http://127.0.0.1:9999/hook", { nodeEnv: "test" }).hostname, "127.0.0.1");
});
