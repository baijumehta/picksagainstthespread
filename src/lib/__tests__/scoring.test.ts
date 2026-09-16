import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coveringSide, pickOutcome, buildStandings, withRanks,
} from "../scoring";

const g = (o: Partial<{ spread: string | null; homeScore: number | null; awayScore: number | null; status: string }> = {}) =>
  ({ spread: "-3.5", homeScore: null, awayScore: null, status: "scheduled", ...o }) as never;

test("home laying the points must win by more than the number", () => {
  // Home -3.5, wins by 4 -> home covers.
  assert.equal(coveringSide(-3.5, 24, 20), "home");
  // Wins by 3 -> away covers.
  assert.equal(coveringSide(-3.5, 23, 20), "away");
});

test("home getting the points covers on a narrow loss", () => {
  // Detroit +3.5 at Buffalo, from the sheet. Home = Buffalo -3.5.
  assert.equal(coveringSide(-3.5, 27, 24), "away"); // Buffalo by 3, Detroit covers
  assert.equal(coveringSide(-3.5, 31, 24), "home"); // Buffalo by 7, Buffalo covers
});

test("a whole-number line can push", () => {
  assert.equal(coveringSide(-3, 24, 21), "push");
  assert.equal(coveringSide(0, 20, 20), "push");
});

test("no line or no score is pending", () => {
  assert.equal(coveringSide(null, 10, 7), "pending");
  assert.equal(coveringSide(-3.5, null, null), "pending");
});

test("a push is neither a win nor a loss for either side", () => {
  const game = g({ spread: "-3", homeScore: 24, awayScore: 21, status: "final" });
  assert.equal(pickOutcome(game, "home"), "push");
  assert.equal(pickOutcome(game, "away"), "push");
});

test("in-progress games report live-ahead / live-behind, not win / loss", () => {
  const game = g({ spread: "-3.5", homeScore: 14, awayScore: 3, status: "in_progress" });
  assert.equal(pickOutcome(game, "home"), "live-ahead");
  assert.equal(pickOutcome(game, "away"), "live-behind");
});

test("a missing pick is never scored", () => {
  const game = g({ spread: "-3.5", homeScore: 30, awayScore: 0, status: "final" });
  assert.equal(pickOutcome(game, null), "pending");
});

test("standings bank finals and project live games separately", () => {
  const games = [
    { id: "g1", spread: "-3.5", homeScore: 30, awayScore: 20, status: "final" },
    { id: "g2", spread: "-7", homeScore: 10, awayScore: 0, status: "in_progress" },
    { id: "g3", spread: "-1.5", homeScore: null, awayScore: null, status: "scheduled" },
  ] as never[];

  const rows = buildStandings({
    players: [{ id: "p1", initials: "AB" }, { id: "p2", initials: "CD" }],
    games,
    picks: [
      { playerId: "p1", gameId: "g1", selection: "home" }, // win
      { playerId: "p1", gameId: "g2", selection: "home" }, // live, covering
      { playerId: "p1", gameId: "g3", selection: "away" }, // not started
      { playerId: "p2", gameId: "g1", selection: "away" }, // loss
      { playerId: "p2", gameId: "g2", selection: "away" }, // live, behind
    ],
    entries: [],
  });

  const ab = rows.find((r) => r.initials === "AB")!;
  const cd = rows.find((r) => r.initials === "CD")!;

  assert.equal(ab.wins, 1);
  assert.equal(ab.liveAhead, 1);
  assert.equal(ab.projected, 2, "projected = banked wins + live covers");
  assert.equal(ab.remaining, 2, "live game and unstarted game both still open");
  assert.equal(cd.wins, 0);
  assert.equal(cd.losses, 1);
  assert.equal(cd.projected, 0);
  assert.equal(rows[0].initials, "AB", "AB leads on banked wins");
});

test("the tiebreaker separates equal records by closest total", () => {
  const games = [{ id: "tb", spread: "-3.5", homeScore: 24, awayScore: 20, status: "final" }] as never[];
  const rows = buildStandings({
    players: [{ id: "p1", initials: "AB" }, { id: "p2", initials: "CD" }],
    games,
    picks: [
      { playerId: "p1", gameId: "tb", selection: "home" },
      { playerId: "p2", gameId: "tb", selection: "home" },
    ],
    entries: [
      { playerId: "p1", tiebreakerTotal: 50 }, // actual 44 -> off by 6
      { playerId: "p2", tiebreakerTotal: 45 }, // off by 1
    ],
    tiebreakerGame: games[0],
  });

  assert.equal(rows[0].initials, "CD", "closest tiebreaker guess wins the tie");
  assert.equal(rows[0].tiebreakerDiff, 1);
  assert.equal(rows[1].tiebreakerDiff, 6);
});

test("a player with no tiebreaker guess loses the tie", () => {
  const games = [{ id: "tb", spread: "-3.5", homeScore: 24, awayScore: 20, status: "final" }] as never[];
  const rows = buildStandings({
    players: [{ id: "p1", initials: "AB" }, { id: "p2", initials: "CD" }],
    games,
    picks: [
      { playerId: "p1", gameId: "tb", selection: "home" },
      { playerId: "p2", gameId: "tb", selection: "home" },
    ],
    entries: [{ playerId: "p2", tiebreakerTotal: 99 }],
    tiebreakerGame: games[0],
  });
  assert.equal(rows[0].initials, "CD");
});

test("ranks share a number only on a genuine tie", () => {
  const games = [{ id: "g1", spread: "-3.5", homeScore: 30, awayScore: 20, status: "final" }] as never[];
  const ranked = withRanks(buildStandings({
    players: [
      { id: "p1", initials: "AB" }, { id: "p2", initials: "CD" }, { id: "p3", initials: "EF" },
    ],
    games,
    picks: [
      { playerId: "p1", gameId: "g1", selection: "home" },
      { playerId: "p2", gameId: "g1", selection: "home" },
      { playerId: "p3", gameId: "g1", selection: "away" },
    ],
    entries: [],
  }));
  assert.deepEqual(ranked.map((r) => r.rank), [1, 1, 3]);
});
