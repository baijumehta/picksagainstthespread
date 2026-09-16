import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { games, picks, players, seasons, weekEntries, weeks } from "@/db/schema";

// Lock and display rules live in ./format so they stay unit-testable.
export {
  isLocked, isPickVisible, describeSpread, formatKickoff, formatKickoffShort,
} from "./format";

/* ------------------------------------------------------------------ */
/* Seasons and weeks                                                   */
/* ------------------------------------------------------------------ */

export async function getCurrentSeason() {
  const current = await db.query.seasons.findFirst({ where: eq(seasons.isCurrent, true) });
  if (current) return current;
  return db.query.seasons.findFirst({ orderBy: [desc(seasons.year)] });
}

export async function listWeeks(seasonId: number) {
  return db.query.weeks.findMany({
    where: eq(weeks.seasonId, seasonId),
    orderBy: [asc(weeks.weekNumber)],
  });
}

/**
 * The week the pool is "on": the latest published week that has any game not
 * yet final, else the most recent published week.
 */
export async function getActiveWeek(seasonId: number) {
  const published = await db.query.weeks.findMany({
    where: and(eq(weeks.seasonId, seasonId), eq(weeks.isPublished, true)),
    orderBy: [asc(weeks.weekNumber)],
  });
  if (!published.length) return null;

  const ids = published.map((w) => w.id);
  const openGames = await db
    .select({ weekId: games.weekId, status: games.status })
    .from(games)
    .where(inArray(games.weekId, ids));

  const openWeekIds = new Set(
    openGames.filter((g) => g.status !== "final").map((g) => g.weekId),
  );
  const firstOpen = published.find((w) => openWeekIds.has(w.id));
  return firstOpen ?? published[published.length - 1];
}

export async function getWeekBundle(weekId: number) {
  const week = await db.query.weeks.findFirst({ where: eq(weeks.id, weekId) });
  if (!week) return null;

  // These do not depend on each other, so run them together rather than
  // paying a database round trip for each in turn.
  const [weekGames, activePlayers, entries] = await Promise.all([
    db.query.games.findMany({
      where: eq(games.weekId, weekId),
      orderBy: [asc(games.kickoffAt), asc(games.sortOrder)],
    }),
    db.query.players.findMany({
      where: eq(players.isActive, true),
      orderBy: [asc(players.initials)],
    }),
    db.query.weekEntries.findMany({ where: eq(weekEntries.weekId, weekId) }),
  ]);

  const gameIds = weekGames.map((g) => g.id);
  const weekPicks = gameIds.length
    ? await db.select().from(picks).where(inArray(picks.gameId, gameIds))
    : [];

  const tiebreakerGame = week.tiebreakerGameId
    ? weekGames.find((g) => g.id === week.tiebreakerGameId) ?? null
    : null;

  return { week, games: weekGames, players: activePlayers, picks: weekPicks, entries, tiebreakerGame };
}

export type WeekBundle = NonNullable<Awaited<ReturnType<typeof getWeekBundle>>>;

/**
 * Every published week's standings for a season, for the year-long table.
 * One query per table rather than one per week, since the pool runs 18 weeks.
 */
export async function getSeasonWeeks(seasonId: number) {
  const published = await db.query.weeks.findMany({
    where: and(eq(weeks.seasonId, seasonId), eq(weeks.isPublished, true)),
    orderBy: [asc(weeks.weekNumber)],
  });
  if (!published.length) return { weeks: [], games: [], picks: [], entries: [], players: [] };

  const weekIds = published.map((w) => w.id);
  const [allGames, allEntries, activePlayers] = await Promise.all([
    db.query.games.findMany({
      where: inArray(games.weekId, weekIds),
      orderBy: [asc(games.kickoffAt)],
    }),
    db.query.weekEntries.findMany({ where: inArray(weekEntries.weekId, weekIds) }),
    db.query.players.findMany({
      where: eq(players.isActive, true),
      orderBy: [asc(players.initials)],
    }),
  ]);
  const gameIds = allGames.map((g) => g.id);

  const allPicks = gameIds.length
    ? await db.select().from(picks).where(inArray(picks.gameId, gameIds))
    : [];

  return {
    weeks: published,
    games: allGames,
    picks: allPicks,
    entries: allEntries,
    players: activePlayers,
  };
}
