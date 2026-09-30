import { test } from "node:test";
import assert from "node:assert/strict";
import { DateRange } from "../src/domain/value-objects/DateRange.js";
import { InvalidDateRangeError } from "../src/domain/errors/DomainErrors.js";

const NOW = new Date("2026-10-01T00:00:00Z"); // a Thursday

test("rejects end date before start date", () => {
  assert.throws(
    () => DateRange.create(new Date("2026-10-10"), new Date("2026-10-05"), NOW),
    InvalidDateRangeError
  );
});

test("rejects a start date in the past", () => {
  assert.throws(
    () => DateRange.create(new Date("2020-01-01"), new Date("2020-01-05"), NOW),
    InvalidDateRangeError
  );
});

test("computes business days across a weekend", () => {
  // Monday 2026-10-05 through Friday 2026-10-09: 5 business days
  const range = DateRange.create(new Date("2026-10-05"), new Date("2026-10-09"), NOW);
  assert.equal(range.businessDays(), 5);
});

test("excludes weekend days from the count", () => {
  // Friday 2026-10-09 through Monday 2026-10-12 spans a weekend: 2 business days
  const range = DateRange.create(new Date("2026-10-09"), new Date("2026-10-12"), NOW);
  assert.equal(range.businessDays(), 2);
});

test("detects overlapping ranges", () => {
  const a = DateRange.create(new Date("2026-10-05"), new Date("2026-10-09"), NOW);
  const b = DateRange.create(new Date("2026-10-08"), new Date("2026-10-15"), NOW);
  assert.equal(a.overlaps(b), true);
});

test("does not flag adjacent non-overlapping ranges", () => {
  const a = DateRange.create(new Date("2026-10-05"), new Date("2026-10-09"), NOW);
  const b = DateRange.create(new Date("2026-10-12"), new Date("2026-10-15"), NOW);
  assert.equal(a.overlaps(b), false);
});
