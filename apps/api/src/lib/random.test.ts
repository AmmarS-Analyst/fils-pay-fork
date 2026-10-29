import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { randomDigits, randomFromAlphabet } from "./random.js";

test("randomDigits returns exactly n decimal digits", () => {
  for (let i = 0; i < 200; i++) assert.match(randomDigits(6), /^\d{6}$/);
});

test("randomFromAlphabet only uses the alphabet", () => {
  assert.match(randomFromAlphabet("ab", 64), /^[ab]{64}$/);
});

test("bearer-secret helpers never use Math.random", () => {
  const source = readFileSync(new URL("./random.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source.replace(/\/\/.*$/gm, ""), /Math\.random/);
});
