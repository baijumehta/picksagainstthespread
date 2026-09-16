import { test } from "node:test";
import assert from "node:assert/strict";
import { hookWholeNumber } from "../odds";
import { coveringSide } from "../scoring";

test("a whole-number line moves half a point onto the favourite", () => {
  assert.equal(hookWholeNumber(-3), -3.5, "home favoured by 3 must now win by 4");
  assert.equal(hookWholeNumber(-7), -7.5);
  assert.equal(hookWholeNumber(3), 3.5, "away favoured by 3 must now win by 4");
  assert.equal(hookWholeNumber(7), 7.5);
});

test("half-point lines are left exactly as the book posted them", () => {
  assert.equal(hookWholeNumber(-3.5), -3.5);
  assert.equal(hookWholeNumber(2.5), 2.5);
  assert.equal(hookWholeNumber(-13.5), -13.5);
});

test("a pick 'em has no favourite to hook toward, so it stays", () => {
  assert.equal(hookWholeNumber(0), 0);
});

test("hooking is idempotent, so re-syncing never walks the line away", () => {
  // The book keeps saying -3; every sync must land on the same -3.5.
  assert.equal(hookWholeNumber(hookWholeNumber(-3)), -3.5);
  assert.equal(hookWholeNumber(hookWholeNumber(3)), 3.5);
});

test("hooking removes the push it was meant to remove", () => {
  // Home favoured by 3 and winning by exactly 3: 24-21.
  assert.equal(coveringSide(-3, 24, 21), "push", "the raw line lands on the number");
  assert.equal(
    coveringSide(hookWholeNumber(-3), 24, 21),
    "away",
    "hooked to -3.5 the favourite falls half a point short, so the dog covers",
  );
});

test("after hooking, the favourite has to win by one more", () => {
  const line = hookWholeNumber(-3); // home favoured, now -3.5
  assert.equal(coveringSide(line, 24, 20), "home", "wins by 4 -> covers");
  assert.equal(coveringSide(line, 23, 20), "away", "wins by 3 -> no longer enough");
  assert.equal(coveringSide(line, 17, 24), "away", "loses outright -> dog covers");
});
