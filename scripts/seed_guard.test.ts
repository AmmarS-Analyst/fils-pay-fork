import assert from "node:assert/strict";
import { test } from "node:test";
import { assertSafeToReseed } from "../db/seed/guard.js";

const dbWith = (merchants: number) => ({ query: async () => ({ rows: [{ n: String(merchants) }] }) });

test("the seed refuses to run over a database that already has merchants", async () => {
  await assert.rejects(() => assertSafeToReseed(dbWith(8), {}), /already has 8 merchant/);
});

test("the seed runs on an empty database, or when a reset is asked for explicitly", async () => {
  await assertSafeToReseed(dbWith(0), {});
  await assertSafeToReseed(dbWith(8), { SEED_RESET: "1" });
});
