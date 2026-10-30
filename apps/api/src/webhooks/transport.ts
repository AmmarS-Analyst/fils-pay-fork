import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { isInternalHost, validateWebhookUrl } from "./create.js";

export interface WebhookTransportRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  /** Bounds DNS lookup, connection, and response reading together. */
  timeoutMs: number;
}
export interface WebhookTransportResponse {
  statusCode: number | null;
  body: string;
  errorMessage?: string;
}
export type WebhookTransport = (req: WebhookTransportRequest) => Promise<WebhookTransportResponse>;

interface TransportOptions {
  /** Explicit development/test opt-in; production wiring never enables it. */
  allowPrivateHosts?: boolean;
  lookup?: (hostname: string) => Promise<LookupAddress[]>;
}
const MAX_RESPONSE_BYTES = 64 * 1024;

/** Resolve once per delivery and pin that validated address to the socket.
 * A separate preflight DNS check followed by fetch would allow DNS rebinding.
 * The original hostname remains the TLS SNI/certificate name and Host header.
 */
export function createFetchTransport(options: TransportOptions = {}): WebhookTransport {
  const resolve = options.lookup ?? ((hostname: string) => dnsLookup(hostname, { all: true, verbatim: true }));
  return async (req) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("webhook request timed out")), req.timeoutMs);
    try {
      const url = validateWebhookUrl(req.url, { nodeEnv: options.allowPrivateHosts ? "test" : "production" });
      const hostname = url.hostname.replace(/^\[|\]$/g, "");
      const addresses = isIP(hostname)
        ? [{ address: hostname, family: isIP(hostname) }]
        : await Promise.race([
            resolve(hostname),
            new Promise<never>((_resolve, reject) => {
              controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
            }),
          ]);
      if (addresses.length === 0 || addresses.some((a) => !isIP(a.address) || (!options.allowPrivateHosts && isInternalHost(a.address)))) {
        throw new Error("webhook DNS must resolve only to public addresses");
      }
      const address = addresses[0]!;
      return await new Promise<WebhookTransportResponse>((resolveResponse, reject) => {
        const send = url.protocol === "https:" ? httpsRequest : httpRequest;
        const outgoing = send(url, {
          method: "POST",
          headers: req.headers,
          signal: controller.signal,
          // Connection cannot re-resolve to a private IP after validation.
          lookup: (_hostname, lookupOptions, callback) => {
            if (lookupOptions.all) callback(null, [address]);
            else callback(null, address.address, address.family);
          },
        }, (response) => {
          const chunks: Buffer[] = [];
          let size = 0;
          const finish = () => resolveResponse({ statusCode: response.statusCode ?? 0, body: Buffer.concat(chunks, size).toString("utf8") });
          response.on("data", (chunk: Buffer) => {
            const remaining = MAX_RESPONSE_BYTES - size;
            const bounded = chunk.subarray(0, remaining);
            chunks.push(bounded);
            size += bounded.length;
            if (size >= MAX_RESPONSE_BYTES) {
              finish();
              response.destroy();
            }
          });
          response.on("end", finish);
          response.on("error", reject);
        });
        outgoing.on("error", reject);
        outgoing.end(req.body);
      });
    } catch (err) {
      return { statusCode: null, body: "", errorMessage: err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timeout);
    }
  };
}
