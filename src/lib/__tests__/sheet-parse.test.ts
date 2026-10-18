import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseSheet } from "../sheet-import";

/** Build a workbook shaped like the commissioner's sheet. */
function sheetOf(rows: (string | number)[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "week");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** A bye week: two NFL games and the two college fill-ins, as he writes them. */
const BYE_WEEK = sheetOf([
  [],
  ["Week # 6", "SPREAD", "AB", "CD", "Check =", 2],
  ["Seattle (Thur.)", "", "X", ""],
  ["DENVER", "+2.5", "", "X"],
  ["Houston", "+2.5", "", "X"],
  ["JACKSONVILLE", "", "X", ""],
  ["Wake Forest", "", "X", ""],
  ["CAL BERKELEY", "+8.5", "", "X"],
  ["Uni of New Mexico", "", "", "X"],
  ["HAWAII", "+14.5", "X", ""],
  [],
  ["Tie Breaker*", "", 44, 51],
  ["Jackpot Count", "", "", ""],
  ["*MONDAY Night Game", "", "", ""],
  ["Byes: Cincinnati, Detroit, Miami, Minnesota", "", "", ""],
  ["Running Total", "", 6, 6],
]);

test("college games are kept, not silently dropped", () => {
  const p = parseSheet(BYE_WEEK);
  assert.equal(p.games.length, 4, "two NFL plus two college");
  assert.equal(p.games.filter((g) => g.league === "nfl").length, 2);
  assert.equal(p.games.filter((g) => g.league === "ncaaf").length, 2);
});

test("the college rows keep the names exactly as written", () => {
  const p = parseSheet(BYE_WEEK);
  const cfb = p.games.filter((g) => g.league === "ncaaf");
  assert.deepEqual(
    cfb.map((g) => `${g.awayRaw} at ${g.homeRaw}`),
    ["Wake Forest at CAL BERKELEY", "Uni of New Mexico at HAWAII"],
  );
});

test("college spreads convert to the home perspective like any other", () => {
  const p = parseSheet(BYE_WEEK);
  const cal = p.games.find((g) => g.homeRaw === "CAL BERKELEY")!;
  const haw = p.games.find((g) => g.homeRaw === "HAWAII")!;
  assert.equal(cal.homeSpread, 8.5, "Cal getting 8.5");
  assert.equal(haw.homeSpread, 14.5, "Hawaii getting 14.5");
});

test("picks on college games are read the same as NFL ones", () => {
  const p = parseSheet(BYE_WEEK);
  const cal = p.games.find((g) => g.homeRaw === "CAL BERKELEY")!;
  assert.equal(cal.picks.get("AB"), "away", "AB took Wake Forest");
  assert.equal(cal.picks.get("CD"), "home", "CD took Cal");
});

test("the notes under the card are not mistaken for teams", () => {
  const p = parseSheet(BYE_WEEK);
  const raws = p.games.flatMap((g) => [g.awayRaw, g.homeRaw]);
  for (const note of ["Jackpot Count", "Running Total", "*MONDAY Night Game"]) {
    assert.ok(!raws.includes(note), `${note} must not become a team`);
  }
  assert.ok(
    !raws.some((r) => r.startsWith("Byes:")),
    "the byes line must not become a team",
  );
});

test("the tiebreaker row is still read", () => {
  const p = parseSheet(BYE_WEEK);
  assert.equal(p.tiebreakers.get("AB"), 44);
  assert.equal(p.tiebreakers.get("CD"), 51);
});

test("the week number and players come off the header", () => {
  const p = parseSheet(BYE_WEEK);
  assert.equal(p.weekNumber, 6);
  assert.deepEqual(p.initials, ["AB", "CD"], "stops at the Check column");
});

test("an all-NFL sheet still parses as before", () => {
  const p = parseSheet(
    sheetOf([
      [],
      ["Week # 2", "SPREAD", "AB"],
      ["Detroit (Thurs.)", "+3.5", "X"],
      ["BUFFALO", "", ""],
      ["Green Bay", "", "X"],
      ["N.Y. JETS", "+6.5", ""],
      ["Tie Breaker", "", 44],
    ]),
  );
  assert.equal(p.games.length, 2);
  assert.ok(p.games.every((g) => g.league === "nfl"));
  assert.equal(p.games[0].homeSpread, -3.5, "away getting 3.5 means home laying it");
  assert.equal(p.games[1].homeSpread, 6.5);
});
