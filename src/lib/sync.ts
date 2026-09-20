import { eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { games, weeks, type League } from "@/db/schema";
import { fetchNflWeek, fetchScoresForDates, type EspnGame } from "./espn";
import { fetchSpreads, findLineFor, hookWholeNumber, OddsNotConfiguredError } from "./odds";

/* ------------------------------------------------------------------ */
/* Importing a slate                                                   */
/* ------------------------------------------------------------------ */

/** Pull the whole NFL slate for a week from ESPN. Existing rows are updated. */
export async function importNflSlate(weekId: number, year: number, weekNumber: number) {
  const slate = await fetchNflWeek(year, weekNumber);
  let added = 0;
  for (const [i, game] of slate.entries()) {
    added += await upsertGame(weekId, game, i);
  }
  return { found: slate.length, added };
}

/**
 * Add one specific college game. Used during byes, when the cousin fills the
 * card out with late Saturday kickoffs rather than importing 60 games.
 */
export async function addCollegeGame(weekId: number, game: EspnGame) {
  const existingCount = await db.select({ id: games.id }).from(games).where(eq(games.weekId, weekId));
  return upsertGame(weekId, game, existingCount.length);
}

/** Returns 1 if a new row was created, 0 if an existing one was refreshed. */
async function upsertGame(weekId: number, g: EspnGame, sortOrder: number): Promise<number> {
  const existing = await db.query.games.findFirst({
    where: (t, { and, eq: e }) => and(e(t.weekId, weekId), e(t.espnId, g.espnId)),
  });

  if (existing) {
    await db.update(games).set({
      homeTeam: g.homeTeam, homeAbbr: g.homeAbbr,
      awayTeam: g.awayTeam, awayAbbr: g.awayAbbr,
      kickoffAt: g.kickoffAt,
      homeScore: g.homeScore, awayScore: g.awayScore,
      status: g.status, statusDetail: g.statusDetail,
      updatedAt: new Date(),
    }).where(eq(games.id, existing.id));
    return 0;
  }

  await db.insert(games).values({
    weekId, league: g.league, espnId: g.espnId,
    homeTeam: g.homeTeam, homeAbbr: g.homeAbbr,
    awayTeam: g.awayTeam, awayAbbr: g.awayAbbr,
    kickoffAt: g.kickoffAt,
    homeScore: g.homeScore, awayScore: g.awayScore,
    status: g.status, statusDetail: g.statusDetail,
    sortOrder,
  });
  return 1;
}

/* ------------------------------------------------------------------ */
/* Spreads                                                             */
/* ------------------------------------------------------------------ */

export interface SpreadSyncResult {
  updated: number;
  unmatched: string[];
  skippedManual: number;
  /** Lines the book posted as whole numbers, hooked onto the favourite. */
  hooked: string[];
  error?: string;
}

/**
 * Fill in spreads from the book. Lines the cousin has overridden by hand are
 * left alone -- his number is the pool's number.
 */
export async function syncSpreads(weekId: number): Promise<SpreadSyncResult> {
  const weekGames = await db.query.games.findMany({ where: eq(games.weekId, weekId) });
  if (!weekGames.length) return { updated: 0, unmatched: [], skippedManual: 0, hooked: [] };

  const leagues = [...new Set(weekGames.map((g) => g.league))] as League[];
  const linesByLeague = new Map<League, Awaited<ReturnType<typeof fetchSpreads>>>();

  try {
    for (const league of leagues) {
      linesByLeague.set(league, await fetchSpreads(league));
    }
  } catch (err) {
    const message =
      err instanceof OddsNotConfiguredError
        ? err.message
        : err instanceof Error ? err.message : "Odds lookup failed.";
    return { updated: 0, unmatched: [], skippedManual: 0, hooked: [], error: message };
  }

  let updated = 0, skippedManual = 0;
  const unmatched: string[] = [];
  const hooked: string[] = [];

  for (const game of weekGames) {
    const line = findLineFor(game, linesByLeague.get(game.league) ?? []);
    if (!line) {
      if (!game.spreadIsManual) unmatched.push(`${game.awayTeam} at ${game.homeTeam}`);
      continue;
    }

    /*
     * A hand-set line is the pool's number and the sync must not touch it --
     * but that only ever meant the spread. The over/under is a separate thing,
     * used solely as the auto tiebreaker guess, and the commissioner's sheet
     * does not carry one. So take the book's total even here.
     */
    if (game.spreadIsManual) {
      skippedManual++;
      const total = line.overUnder;
      if (total !== null && game.overUnder !== total.toFixed(1)) {
        await db.update(games)
          .set({ overUnder: total.toFixed(1), updatedAt: new Date() })
          .where(eq(games.id, game.id));
      }
      continue;
    }

    const spread = hookWholeNumber(line.homeSpread);
    if (spread !== line.homeSpread) {
      hooked.push(`${game.awayAbbr ?? game.awayTeam} at ${game.homeAbbr ?? game.homeTeam} (${line.homeSpread} -> ${spread})`);
    }

    await db.update(games)
      .set({
        spread: spread.toFixed(1),
        // Not hooked: the total is only ever a tiebreaker guess, never a
        // thing that has to come out one side or the other.
        overUnder: line.overUnder === null ? null : line.overUnder.toFixed(1),
        updatedAt: new Date(),
      })
      .where(eq(games.id, game.id));
    updated++;
  }
  return { updated, unmatched, skippedManual, hooked };
}

/* ------------------------------------------------------------------ */
/* Live scores                                                         */
/* ------------------------------------------------------------------ */

export interface RefreshResult {
  checked: number;
  changed: number;
  /** Upstream failures, so a broken feed cannot look like a clean run. */
  errors: string[];
}

/**
 * Refresh scores for every game in a week that is not already final.
 * Cheap enough to run every minute during the slate.
 */
export async function refreshScores(weekId: number): Promise<RefreshResult> {
  const open = await db.query.games.findMany({
    where: (t, { and, eq: e }) => and(e(t.weekId, weekId), ne(t.status, "final")),
  });
  if (!open.length) return { checked: 0, changed: 0, errors: [] };

  let changed = 0;
  const errors: string[] = [];
  const byLeague = new Map<League, typeof open>();
  for (const g of open) {
    const list = byLeague.get(g.league) ?? [];
    list.push(g);
    byLeague.set(g.league, list);
  }

  for (const [league, list] of byLeague) {
    const { games: live, errors: fetchErrors } = await fetchScoresForDates(
      league,
      list.map((g) => g.kickoffAt),
    );
    errors.push(...fetchErrors);
    for (const game of list) {
      const fresh = game.espnId ? live.get(game.espnId) : undefined;
      if (!fresh) continue;

      // Kickoff is tracked too, not just the score. The NFL flexes games
      // between slots, and the kickoff time is what decides when a pick locks
      // -- a stale one would either lock people out early or leave a game open
      // after it had started.
      const kickoffMoved = fresh.kickoffAt.getTime() !== game.kickoffAt.getTime();

      if (
        !kickoffMoved &&
        fresh.homeScore === game.homeScore &&
        fresh.awayScore === game.awayScore &&
        fresh.status === game.status &&
        fresh.statusDetail === game.statusDetail
      ) continue;

      await db.update(games).set({
        homeScore: fresh.homeScore,
        awayScore: fresh.awayScore,
        status: fresh.status,
        statusDetail: fresh.statusDetail,
        kickoffAt: fresh.kickoffAt,
        updatedAt: new Date(),
      }).where(eq(games.id, game.id));
      changed++;
    }
  }
  return { checked: open.length, changed, errors };
}

/** True when a game has started but has not been marked final yet. */
function isUnderway(g: { kickoffAt: Date; status: string }, now: Date): boolean {
  return g.status !== "final" && now.getTime() >= g.kickoffAt.getTime();
}

/**
 * Top up scores, at most once every `maxAgeMs`.
 *
 * This is what actually keeps the board live: a page view pulls fresh scores,
 * so the pool does not depend on a cron at all. Vercel's Hobby plan only
 * allows daily crons, and a board nobody is looking at does not need updating.
 *
 * Call this from `after()` rather than awaiting it in a render -- ESPN can
 * take seconds, and no viewer should sit through that. The refresh then lands
 * before the page next re-renders.
 *
 * The timestamp lives on the week row rather than in memory so the throttle
 * holds across serverless instances.
 *
 * `known` lets a caller pass rows it has already loaded, saving two round
 * trips to a database that may be a continent away.
 */
export async function refreshScoresIfStale(
  weekId: number,
  maxAgeMs = 120_000,
  known?: { scoresSyncedAt: Date | null; games: { kickoffAt: Date; status: string }[] },
): Promise<boolean> {
  const now = new Date();

  let scoresSyncedAt: Date | null;
  let weekGames: { kickoffAt: Date; status: string }[];

  if (known) {
    scoresSyncedAt = known.scoresSyncedAt;
    weekGames = known.games;
  } else {
    const week = await db.query.weeks.findFirst({ where: eq(weeks.id, weekId) });
    if (!week) return false;
    scoresSyncedAt = week.scoresSyncedAt;
    weekGames = await db.query.games.findMany({ where: eq(games.weekId, weekId) });
  }

  if (scoresSyncedAt && now.getTime() - scoresSyncedAt.getTime() < maxAgeMs) return false;
  if (!weekGames.some((g) => isUnderway(g, now))) return false;

  // Claim the slot before the slow part, so concurrent renders do not all
  // stampede ESPN with the same request.
  await db.update(weeks).set({ scoresSyncedAt: now }).where(eq(weeks.id, weekId));

  try {
    await refreshScores(weekId);
    return true;
  } catch (err) {
    console.error("[scores] refresh during render failed:", err);
    return false;
  }
}

/** Refresh every published week that still has an unfinished game. */
export async function refreshAllOpenWeeks() {
  const openGameRows = await db
    .select({ weekId: games.weekId })
    .from(games)
    .where(ne(games.status, "final"));
  const weekIds = [...new Set(openGameRows.map((r) => r.weekId))];
  if (!weekIds.length) return { weeks: 0, changed: 0, errors: [] };

  const published = await db.query.weeks.findMany({
    where: inArray(weeks.id, weekIds),
  });

  let changed = 0;
  const errors: string[] = [];
  for (const week of published.filter((w) => w.isPublished)) {
    const result = await refreshScores(week.id);
    changed += result.changed;
    errors.push(...result.errors);
  }
  return { weeks: published.length, changed, errors };
}
