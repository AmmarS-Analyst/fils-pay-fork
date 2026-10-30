import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { errorHandler } from "./errorHandler.js";

test("a malformed JSON body is the caller's mistake: 400, not 500", async () => {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.post("/x", async () => ({ ok: true }));
  const res = await app.inject({ method: "POST", url: "/x", headers: { "content-type": "application/json" }, payload: "{bad" });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "invalid_request");
});

test("a real server fault still answers 500 without details", async () => {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.get("/boom", async () => {
    throw new Error("db exploded");
  });
  const res = await app.inject({ method: "GET", url: "/boom" });
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.json(), { error: "internal_error" });
});
