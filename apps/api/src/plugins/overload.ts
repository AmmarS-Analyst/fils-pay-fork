import type { FastifyInstance } from "fastify";

// Payment writes hold a pg connection for the whole acquirer call (100-400 ms).
// Past the pool size, extra requests just sit in the pool queue until they time
// out, which makes everything slower for everybody. So we cap how many are in
// flight and answer the rest straight away with 503 + Retry-After.
const GUARDED = /^\/v1\/(transactions|refunds|merchants\/[^/]+\/refunds|payment-links\/[^/]+\/pay)(\/|$)/;

export function registerOverloadGuard(app: FastifyInstance, maxInflight: number): void {
  if (maxInflight <= 0) return;
  let inflight = 0;

  app.addHook("onRequest", async (request, reply) => {
    // match on the path only: a query string must not let a request skip the guard
    const path = request.url.split("?", 1)[0] ?? request.url;
    if (request.method !== "POST" || !GUARDED.test(path)) return;

    if (inflight >= maxInflight) {
      reply.header("Retry-After", "1").code(503).send({ error: "overloaded", message: "too many payments in flight, retry shortly" });
      return reply;
    }

    inflight++;
    // 'close' fires on normal finish and on a client that hung up, so the slot always comes back
    reply.raw.once("close", () => {
      inflight--;
    });
  });
}
