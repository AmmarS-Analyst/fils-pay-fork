import assert from "node:assert/strict";
import { test } from "node:test";
import { newIdempotencyKey } from "./idempotencyKey.js";

test("works without crypto.randomUUID (plain-HTTP pages) and still gives distinct v4 UUIDs", () => {
  const original = crypto.randomUUID;
  // what a browser exposes outside a secure context
  Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
  try {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(a, b);
  } finally {
    Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
  }
});
