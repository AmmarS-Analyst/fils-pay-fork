import assert from "node:assert/strict";
import { test } from "node:test";
import { EXPIRE_HOLDS_SQL } from "./expire_holds.js";
import { buildDelete } from "./lib/sqlFilter.js";

test("expiring holds is one scoped UPDATE, never a DELETE", () => {
  assert.match(EXPIRE_HOLDS_SQL, /^UPDATE holds SET status = 'expired' WHERE status = 'active' AND expires_at < now\(\)$/);
});

test("buildDelete refuses to run without a WHERE clause (an empty id list used to delete every hold)", () => {
  assert.throws(() => buildDelete("holds", { id: [] }), /without a WHERE clause/);
  assert.throws(() => buildDelete("holds", { id: undefined }), /without a WHERE clause/);
});

test("buildDelete still scopes to the ids it was handed", () => {
  const ids = ["11111111-1111-1111-1111-111111111111"];
  const { text, values } = buildDelete("holds", { id: ids });
  assert.equal(text, "DELETE FROM holds WHERE id = ANY($1::uuid[])");
  assert.deepEqual(values, [ids]);
});
