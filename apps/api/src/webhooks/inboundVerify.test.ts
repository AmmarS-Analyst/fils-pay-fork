/**
 * Unit tests for the inbound acquirer-callback signature verifier. Pure
 * function, no database — the route-level behavior it drives is covered in
 * routes/acquirerCallbacks.test.ts.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { verifyAcquirerCallbackSignature } from "./inboundVerify.js";

const SECRET = "acqsec_test_secret";
const NOW = 1_757_930_000;

/** Builds the header the acquirer would send for the raw body bytes. */
function acquirerHeader(rawBody: string, secret: string, timestamp = NOW): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

const BODY = JSON.stringify({ callbackId: "acqcb_1", outcome: "cleared" });

test("a correctly-signed callback verifies", () => {
  const result = verifyAcquirerCallbackSignature(BODY, acquirerHeader(BODY, SECRET), SECRET, true, NOW);
  assert.deepEqual(result, { valid: true });
});

test("a tampered payload is rejected (signature_mismatch)", () => {
  const tampered = JSON.stringify({ callbackId: "acqcb_1", outcome: "confirmed_fraud" });
  const result = verifyAcquirerCallbackSignature(tampered, acquirerHeader(BODY, SECRET), SECRET, true, NOW);
  assert.equal(result.reason, "signature_mismatch");
});

test("the wrong secret is rejected (signature_mismatch)", () => {
  const header = acquirerHeader(BODY, "acqsec_someone_elses_secret");
  assert.equal(verifyAcquirerCallbackSignature(BODY, header, SECRET, true, NOW).reason, "signature_mismatch");
});

test("a malformed header is rejected (malformed_header)", () => {
  for (const header of ["not-a-real-header", "t=abc,v1=deadbeef", "v1=deadbeef"]) {
    assert.equal(verifyAcquirerCallbackSignature(BODY, header, SECRET, true, NOW).reason, "malformed_header");
  }
});

test("an unsigned callback is rejected by default", () => {
  assert.equal(verifyAcquirerCallbackSignature(BODY, undefined, SECRET).reason, "missing_signature");
});

test("a correctly signed but stale callback is a replay and is rejected", () => {
  const header = acquirerHeader(BODY, SECRET, NOW - 3_600);
  assert.equal(verifyAcquirerCallbackSignature(BODY, header, SECRET, true, NOW).reason, "timestamp_out_of_tolerance");
});

test("the signature covers the raw bytes, so re-ordered JSON with the same values does not verify", () => {
  const reordered = JSON.stringify({ outcome: "cleared", callbackId: "acqcb_1" });
  const header = acquirerHeader(BODY, SECRET);
  assert.equal(verifyAcquirerCallbackSignature(reordered, header, SECRET, true, NOW).reason, "signature_mismatch");
});
