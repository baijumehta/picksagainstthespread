import { test } from "node:test";
import assert from "node:assert/strict";
import { describeSpread, isLocked } from "../format";

const kickoff = new Date("2026-09-20T17:00:00Z");
const before = new Date("2026-09-20T16:59:59Z");
const after = new Date("2026-09-20T17:00:01Z");

test("a scheduled game is open right up to kickoff", () => {
  assert.equal(isLocked({ kickoffAt: kickoff, status: "scheduled" }, before), false);
});

test("a scheduled game locks exactly at kickoff", () => {
  assert.equal(isLocked({ kickoffAt: kickoff, status: "scheduled" }, kickoff), true);
  assert.equal(isLocked({ kickoffAt: kickoff, status: "scheduled" }, after), true);
});

test("a game that started early is locked even before its listed kickoff", () => {
  assert.equal(isLocked({ kickoffAt: kickoff, status: "in_progress" }, before), true);
  assert.equal(isLocked({ kickoffAt: kickoff, status: "final" }, before), true);
});

test("games lock independently, so Thursday closing leaves Sunday open", () => {
  const thursday = new Date("2026-09-18T00:15:00Z");
  const sunday = new Date("2026-09-20T17:00:00Z");
  const saturdayNight = new Date("2026-09-19T23:00:00Z");

  assert.equal(isLocked({ kickoffAt: thursday, status: "final" }, saturdayNight), true);
  assert.equal(isLocked({ kickoffAt: sunday, status: "scheduled" }, saturdayNight), false);
});

test("a late Saturday college fill-in locks on its own clock", () => {
  const collegeKick = new Date("2026-09-20T03:30:00Z"); // 11:30pm ET Saturday
  assert.equal(
    isLocked({ kickoffAt: collegeKick, status: "scheduled" }, new Date("2026-09-20T03:00:00Z")),
    false,
  );
  assert.equal(
    isLocked({ kickoffAt: collegeKick, status: "scheduled" }, new Date("2026-09-20T04:00:00Z")),
    true,
  );
});

test("the spread reads from whichever side is laying the points", () => {
  assert.equal(describeSpread("-3.5", "BUF", "DET"), "BUF -3.5");
  assert.equal(describeSpread("4.5", "TEN", "PHI"), "PHI -4.5");
  assert.equal(describeSpread("0", "BUF", "DET"), "pick 'em");
  assert.equal(describeSpread(null, "BUF", "DET"), "line TBD");
});
