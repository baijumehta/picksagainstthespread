import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSeasonStandings, buildStandings, withSeasonRanks } from "../scoring";

/** Build one week's rows from a compact spec of who got what right. */
function week(
  weekId: number,
  isComplete: boolean,
  results: Record<string, { wins: number; losses: number }>,
) {
  // One game per point, so the standings come out as specified.
  const maxGames = Math.max(...Object.values(results).map((r) => r.wins + r.losses));
  const games = Array.from({ length: maxGames }, (_, i) => ({
    id: `w${weekId}g${i}`,
    spread: "-3.5",
    homeScore: 30,
    awayScore: 20, // home covers every game
    status: isComplete ? "final" : "final",
  })) as never[];

  const picks: { playerId: string; gameId: string; selection: "home" | "away" }[] = [];
  for (const [initials, r] of Object.entries(results)) {
    for (let i = 0; i < r.wins; i++) {
      picks.push({ playerId: initials, gameId: `w${weekId}g${i}`, selection: "home" });
    }
    for (let i = 0; i < r.losses; i++) {
      picks.push({ playerId: initials, gameId: `w${weekId}g${r.wins + i}`, selection: "away" });
    }
  }

  return {
    weekId,
    isComplete,
    rows: buildStandings({
      players: Object.keys(results).map((i) => ({ id: i, initials: i })),
      games,
      picks,
      entries: [],
    }),
  };
}

test("season score is correct picks added up across weeks", () => {
  const rows = buildSeasonStandings([
    week(1, true, { AB: { wins: 11, losses: 5 }, CD: { wins: 9, losses: 7 } }),
    week(2, true, { AB: { wins: 6, losses: 10 }, CD: { wins: 12, losses: 4 } }),
  ]);

  const ab = rows.find((r) => r.initials === "AB")!;
  const cd = rows.find((r) => r.initials === "CD")!;
  assert.equal(ab.totalWins, 17);
  assert.equal(cd.totalWins, 21);
  assert.equal(rows[0].initials, "CD", "season table is ordered by total score");
});

test("winning weeks and winning the year are tracked separately", () => {
  // AB takes both weeks narrowly; CD has one huge week and wins the year.
  const rows = buildSeasonStandings([
    week(1, true, { AB: { wins: 10, losses: 6 }, CD: { wins: 9, losses: 7 } }),
    week(2, true, { AB: { wins: 10, losses: 6 }, CD: { wins: 9, losses: 7 } }),
    week(3, true, { AB: { wins: 2, losses: 14 }, CD: { wins: 16, losses: 0 } }),
  ]);

  const ab = rows.find((r) => r.initials === "AB")!;
  const cd = rows.find((r) => r.initials === "CD")!;

  assert.equal(ab.weeksWon, 2, "AB took two weeks");
  assert.equal(cd.weeksWon, 1);
  assert.equal(ab.totalWins, 22);
  assert.equal(cd.totalWins, 34);
  assert.equal(rows[0].initials, "CD", "the year goes on total score, not weeks won");
});

test("an unfinished week counts toward the total but crowns nobody", () => {
  const rows = buildSeasonStandings([
    { ...week(1, false, { AB: { wins: 5, losses: 2 }, CD: { wins: 3, losses: 4 } }) },
  ]);
  const ab = rows.find((r) => r.initials === "AB")!;
  assert.equal(ab.totalWins, 5, "banked wins still count");
  assert.equal(ab.weeksWon, 0, "no winner until the week is done");
});

test("a tied week is won by everyone tied", () => {
  const rows = buildSeasonStandings([
    week(1, true, { AB: { wins: 10, losses: 6 }, CD: { wins: 10, losses: 6 } }),
  ]);
  assert.equal(rows.find((r) => r.initials === "AB")!.weeksWon, 1);
  assert.equal(rows.find((r) => r.initials === "CD")!.weeksWon, 1);
});

test("someone who sat a week out is not credited with playing it", () => {
  const rows = buildSeasonStandings([
    week(1, true, { AB: { wins: 10, losses: 6 }, CD: { wins: 0, losses: 0 } }),
    week(2, true, { AB: { wins: 8, losses: 8 }, CD: { wins: 9, losses: 7 } }),
  ]);
  const cd = rows.find((r) => r.initials === "CD")!;
  assert.equal(cd.weeksPlayed, 1, "no picks in week 1 means they did not play it");
  const ab = rows.find((r) => r.initials === "AB")!;
  assert.equal(ab.weeksPlayed, 2);
});

test("weeks won breaks a tie on season score", () => {
  const rows = withSeasonRanks(buildSeasonStandings([
    week(1, true, { AB: { wins: 12, losses: 4 }, CD: { wins: 8, losses: 8 } }),
    week(2, true, { AB: { wins: 8, losses: 8 }, CD: { wins: 12, losses: 4 } }),
  ]));
  // Both on 20. AB and CD each took a week, so they stay genuinely tied.
  assert.equal(rows[0].totalWins, 20);
  assert.equal(rows[1].totalWins, 20);
  assert.deepEqual(rows.map((r) => r.rank), [1, 1]);
});
