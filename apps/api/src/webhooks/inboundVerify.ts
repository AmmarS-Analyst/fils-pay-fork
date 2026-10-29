import { createHmac } from "node:crypto";
import { timingSafeEqualHex } from "../lib/crypto.js";

/** Verifies the signature on an inbound acquirer callback. */

interface ParsedAcquirerSignatureHeader {
  timestamp: number;
  signature: string;
}

function parseAcquirerSignatureHeader(header: string): ParsedAcquirerSignatureHeader | null {
  let timestampStr: string | null = null;
  let signature: string | null = null;

  for (const part of header.split(",")) {
    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();
    if (key === "t") timestampStr = value;
    else if (key === "v1") signature = value;
  }

  if (!timestampStr || !signature) return null;
  if (!/^\d+$/.test(timestampStr)) return null;

  const timestamp = Number.parseInt(timestampStr, 10);
  if (!Number.isFinite(timestamp)) return null;

  return { timestamp, signature };
}

export type VerifyAcquirerCallbackFailureReason =
  | "missing_signature"
  | "malformed_header"
  | "signature_mismatch"
  | "timestamp_out_of_tolerance";

export interface VerifyAcquirerCallbackResult {
  valid: boolean;
  reason?: VerifyAcquirerCallbackFailureReason;
}

/** A signed callback older or newer than this is a replay, not a delivery. */
export const ACQUIRER_CALLBACK_TOLERANCE_SECONDS = 300;

/**
 * Verifies `t=<unix>,v1=<hex hmac-sha256 of "t.rawBody">`. The signature is
 * required by default, must be fresh (5 min) and is compared in constant time.
 */
export function verifyAcquirerCallbackSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  requireSignature = true,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): VerifyAcquirerCallbackResult {
  if (!header) {
    return requireSignature ? { valid: false, reason: "missing_signature" } : { valid: true };
  }

  const parsed = parseAcquirerSignatureHeader(header);
  if (!parsed) return { valid: false, reason: "malformed_header" };

  const expected = createHmac("sha256", secret).update(`${parsed.timestamp}.${rawBody}`).digest("hex");
  if (!timingSafeEqualHex(expected, parsed.signature)) {
    return { valid: false, reason: "signature_mismatch" };
  }

  if (Math.abs(nowSeconds - parsed.timestamp) > ACQUIRER_CALLBACK_TOLERANCE_SECONDS) {
    return { valid: false, reason: "timestamp_out_of_tolerance" };
  }

  return { valid: true };
}
