import { test } from "node:test";
import assert from "node:assert/strict";
import { autoTiebreakerTotal, favoriteSide, planAutoPicks } from "../autopick";

const T0 = new Date("2026-09-20T12:00:00Z"); // opted in here
const KICKED = new Date("2026-09-20T17:00:00Z"); // locked, after opt-in
const EARLIER = new Date("2026-09-20T00:15:00Z"); // locked, before opt-in
const LATER = new Date("2026-09-21T23:00:00Z"); // not started
const NOW = new Date("2026-09-20T18:00:00Z");

const game = (over: Partial<{ id: string; kickoffAt: Date; status: string; spread: string | null; overUnder: string | null }> = {}) => ({
  id: "g1", kickoffAt: KICKED, status: "in_progress", spread: "-3.5", overUnder: "44.5", ...over,
});

const optedIn = [{ id: "p1", initials: "AB", autoPickOptedInAt: T0 }];
const optedOut = [{ id: "p2", initials: "CD", autoPickOptedInAt: null }];

test("the favourite is whichever side is laying the points", () => {
  assert.equal(favoriteSide("-3.5"), "home", "home laying 3.5");
  assert.equal(favoriteSide("6.5"), "away", "home getting 6.5, so away is favoured");
  assert.equal(favoriteSide(-7), "home");
});

test("a pick 'em or a missing line has no favourite", () => {
  assert.equal(favoriteSide("0"), null);
  assert.equal(favoriteSide(null), null);
  assert.equal(favoriteSide(""), null);
});

test("the tiebreaker guess is the over/under, to a whole number", () => {
  assert.equal(autoTiebreakerTotal("44.5"), 45);
  assert.equal(autoTiebreakerTotal("41.5"), 42);
  assert.equal(autoTiebreakerTotal("47"), 47);
  assert.equal(autoTiebreakerTotal(null), null);
  assert.equal(autoTiebreakerTotal("0"), null);
});

test("a locked game with no pick is filled with the favourite", () => {
  const plan = planAutoPicks({
    players: optedIn,
    games: [game()],
    existingPicks: [],
    existingEntries: [],
    tiebreakerGame: null,
    now: NOW,
  });
  assert.deepEqual(plan.picks, [{ playerId: "p1", gameId: "g1", selection: "home" }]);
});

test("nobody who has not opted in is touched", () => {
  const plan = planAutoPicks({
    players: optedOut,
    games: [game()],
    existingPicks: [],
    existingEntries: [],
    tiebreakerGame: null,
    now: NOW,
  });
  assert.equal(plan.picks.length, 0);
});

test("a pick they actually made is never overwritten", () => {
  const plan = planAutoPicks({
    players: optedIn,
    games: [game()],
    existingPicks: [{ playerId: "p1", gameId: "g1" }],
    existingEntries: [],
    tiebreakerGame: null,
    now: NOW,
  });
  assert.equal(plan.picks.length, 0);
});

test("a game still to kick off is left alone -- they can still pick it", () => {
  const plan = planAutoPicks({
    players: optedIn,
    games: [game({ kickoffAt: LATER, status: "scheduled" })],
    existingPicks: [],
    existingEntries: [],
    tiebreakerGame: null,
    now: NOW,
  });
  assert.equal(plan.picks.length, 0);
});

test("opting in does not reach back into a game that already kicked off", () => {
  // The Thursday nighter started before they opted in on Sunday.
  const plan = planAutoPicks({
    players: optedIn,
    games: [game({ id: "thu", kickoffAt: EARLIER, status: "final" })],
    existingPicks: [],
    existingEntries: [],
    tiebreakerGame: null,
    now: NOW,
  });
  assert.equal(plan.picks.length, 0, "history is not rewritten");
});

test("a locked pick 'em is reported as skipped, not guessed", () => {
  const plan = planAutoPicks({
    players: optedIn,
    games: [game({ spread: "0" })],
    existingPicks: [],
    existingEntries: [],
    tiebreakerGame: null,
    now: NOW,
  });
  assert.equal(plan.picks.length, 0);
  assert.deepEqual(plan.skipped, ["g1"]);
});

test("the tiebreaker is filled from the over/under once that game locks", () => {
  const tb = game({ id: "tb", overUnder: "44.5" });
  const plan = planAutoPicks({
    players: optedIn,
    games: [tb],
    existingPicks: [],
    existingEntries: [],
    tiebreakerGame: tb,
    now: NOW,
  });
  assert.deepEqual(plan.tiebreakers, [{ playerId: "p1", total: 45 }]);
});

test("a tiebreaker they entered themselves is kept", () => {
  const tb = game({ id: "tb", overUnder: "44.5" });
  const plan = planAutoPicks({
    players: optedIn,
    games: [tb],
    existingPicks: [],
    existingEntries: [{ playerId: "p1", tiebreakerTotal: 38 }],
    tiebreakerGame: tb,
    now: NOW,
  });
  assert.equal(plan.tiebreakers.length, 0);
});

test("no over/under means no tiebreaker rather than a made-up one", () => {
  const tb = game({ id: "tb", overUnder: null });
  const plan = planAutoPicks({
    players: optedIn,
    games: [tb],
    existingPicks: [],
    existingEntries: [],
    tiebreakerGame: tb,
    now: NOW,
  });
  assert.equal(plan.tiebreakers.length, 0);
});

test("planning twice produces nothing the second time", () => {
  const g = game();
  const first = planAutoPicks({
    players: optedIn, games: [g], existingPicks: [], existingEntries: [],
    tiebreakerGame: null, now: NOW,
  });
  const second = planAutoPicks({
    players: optedIn,
    games: [g],
    existingPicks: first.picks.map((p) => ({ playerId: p.playerId, gameId: p.gameId })),
    existingEntries: [],
    tiebreakerGame: null,
    now: NOW,
  });
  assert.equal(second.picks.length, 0, "filling in is not repeated on every page view");
});
