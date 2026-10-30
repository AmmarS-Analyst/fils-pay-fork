import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { createFetchTransport } from "./transport.js";

const request = { headers: { "content-type": "application/json" }, body: "{}", timeoutMs: 500 };

test("production transport rejects private DNS answers and mixed public/private records", async () => {
  for (const addresses of [
    [{ address: "127.0.0.1", family: 4 }],
    [{ address: "93.184.216.34", family: 4 }, { address: "10.1.2.3", family: 4 }],
    [{ address: "::ffff:127.0.0.1", family: 6 }],
  ]) {
    const send = createFetchTransport({ lookup: async () => addresses });
    const result = await send({ ...request, url: "https://public.example.test/callback" });
    assert.equal(result.statusCode, null);
    assert.match(result.errorMessage!, /only to public addresses/);
  }
});

test("resolved address is pinned to the socket and redirects are never followed", async () => {
  let requests = 0;
  const server = createServer((_req, res) => { requests++; res.writeHead(302, { location: "http://127.0.0.1/private" }); res.end("redirect"); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    let lookups = 0;
    const send = createFetchTransport({ allowPrivateHosts: true, lookup: async () => {
      lookups++;
      assert.equal(lookups, 1, "socket must not resolve again after validation");
      return [{ address: "127.0.0.1", family: 4 }];
    } });
    const result = await send({ ...request, url: `http://unresolvable.example.test:${port}/callback` });
    assert.equal(result.statusCode, 302);
    assert.equal(result.body, "redirect");
    assert.equal(lookups, 1);
    assert.equal(requests, 1);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("response buffering is capped even when a receiver sends a large body", async () => {
  const server = createServer((_req, res) => { res.end(Buffer.alloc(1024 * 1024, "x")); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const result = await createFetchTransport({ allowPrivateHosts: true })({ ...request, url: `http://127.0.0.1:${port}` });
    assert.equal(result.statusCode, 200);
    assert.equal(Buffer.byteLength(result.body), 64 * 1024);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("timeout also bounds stalled DNS resolution", async () => {
  const send = createFetchTransport({ lookup: () => new Promise(() => {}) });
  const result = await send({ ...request, timeoutMs: 20, url: "https://public.example.test" });
  assert.equal(result.statusCode, null);
  assert.match(result.errorMessage!, /timed out/);
});
