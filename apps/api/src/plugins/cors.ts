import type { FastifyInstance } from "fastify";

const ALLOWED_HEADERS = "content-type,idempotency-key,authorization";
const ALLOWED_METHODS = "GET,POST,PATCH,DELETE,OPTIONS";

/**
 * CORS for the browser dashboards, which run on their own origins and send the
 * session cookie. Only origins listed in config.corsOrigins get headers, and
 * the origin is echoed back (never "*", which browsers refuse with cookies).
 */
export function registerCors(app: FastifyInstance, allowedOrigins: readonly string[]): void {
  const allowed = new Set(allowedOrigins);

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    const originAllowed = origin !== undefined && allowed.has(origin);

    if (originAllowed) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Credentials", "true");
      reply.header("Vary", "Origin");
    }
    if (request.method === "OPTIONS" && originAllowed) {
      reply
        .header("Access-Control-Allow-Methods", ALLOWED_METHODS)
        .header("Access-Control-Allow-Headers", ALLOWED_HEADERS)
        .header("Access-Control-Max-Age", "600")
        .code(204)
        .send();
    }
  });
}
