import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collegeSimilarity, matchCollegeGame, normalizeCollege,
} from "../college-teams";

/** The real Week 6 pairing, with ESPN's actual names. */
const WEEK6 = [
  {
    espnId: "1",
    awayTeam: "Wake Forest Demon Deacons",
    homeTeam: "California Golden Bears",
    kickoffAt: new Date("2026-10-18T02:30:00Z"),
  },
  {
    espnId: "2",
    awayTeam: "New Mexico Lobos",
    homeTeam: "Hawai'i Rainbow Warriors",
    kickoffAt: new Date("2026-10-18T02:30:00Z"),
  },
  {
    espnId: "3",
    awayTeam: "Auburn Tigers",
    homeTeam: "Georgia Bulldogs",
    kickoffAt: new Date("2026-10-17T20:00:00Z"),
  },
];

test("the shorthand actually used on the sheet resolves", () => {
  assert.equal(normalizeCollege("CAL BERKELEY"), "california");
  assert.equal(normalizeCollege("Uni of New Mexico"), "new mexico");
  assert.equal(normalizeCollege("Wake Forest"), "wake forest");
  assert.equal(normalizeCollege("HAWAII"), "hawaii");
});

test("a sheet name matches the ESPN name despite the mascot", () => {
  assert.ok(collegeSimilarity("Wake Forest", "Wake Forest Demon Deacons") >= 0.9);
  assert.ok(collegeSimilarity("CAL BERKELEY", "California Golden Bears") >= 0.9);
  assert.ok(collegeSimilarity("Uni of New Mexico", "New Mexico Lobos") >= 0.9);
});

test("the okina in Hawai'i does not defeat it", () => {
  assert.ok(
    collegeSimilarity("HAWAII", "Hawai'i Rainbow Warriors") >= 0.9,
    "Hawai'i normalises to hawai i, which must still match hawaii",
  );
});

test("both real Week 6 games match the right fixture", () => {
  const a = matchCollegeGame("Wake Forest", "CAL BERKELEY", WEEK6);
  assert.equal(a?.game.espnId, "1");

  const b = matchCollegeGame("Uni of New Mexico", "HAWAII", WEEK6);
  assert.equal(b?.game.espnId, "2");
});

test("a game that is not on the board matches nothing", () => {
  assert.equal(matchCollegeGame("Boise State", "Fresno State", WEEK6), null);
});

test("one strong side cannot drag in the wrong fixture", () => {
  // Wake Forest is on the board, but not against Georgia.
  assert.equal(matchCollegeGame("Wake Forest", "GEORGIA", WEEK6), null);
});

test("home and away are not interchangeable", () => {
  // The real game is Wake Forest AT California; reversed should not match.
  assert.equal(matchCollegeGame("CAL BERKELEY", "WAKE FOREST", WEEK6), null);
});

test("common abbreviations expand", () => {
  assert.equal(normalizeCollege("Ole Miss"), "mississippi");
  assert.equal(normalizeCollege("LSU"), "louisiana state");
  assert.equal(normalizeCollege("UCF"), "central florida");
});
