import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { generateInviteCode } from "./inviteCode.js";

test("invite codes are 8 characters from the unambiguous alphabet", () => {
  for (let i = 0; i < 100; i++) assert.match(generateInviteCode(), /^[A-HJ-NP-Z2-9]{8}$/);
});

test("invite codes do not use Math.random", () => {
  const source = readFileSync(new URL("./inviteCode.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source.replace(/\/\/.*$/gm, ""), /Math\.random/);
});
