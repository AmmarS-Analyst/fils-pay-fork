import test from "node:test";
import assert from "node:assert/strict";
import { displayDateValue, parseDateValue } from "../../shared-ui/date-value.js";

test("date input keeps day/month order and sends an ISO date", () => {
  assert.equal(displayDateValue("2026-11-05", "date"), "05/11/2026");
  assert.equal(parseDateValue("05/11/2026", "date"), "2026-11-05");
  assert.equal(parseDateValue("31/12/2026 23:45", "datetime-local"), "2026-12-31T23:45");
});
test("invalid days and times cannot silently normalize into another date", () => {
  for (const value of ["31/02/2026", "29/02/2026", "05/13/2026", "2026-11-05"]) assert.equal(parseDateValue(value, "date"), null);
  assert.equal(parseDateValue("29/02/2028", "date"), "2028-02-29");
  assert.equal(parseDateValue("30/10/2026 24:00", "datetime-local"), null);
  assert.equal(parseDateValue("30/10/2026 12:60", "datetime-local"), null);
  assert.equal(parseDateValue("", "date"), "");
});
