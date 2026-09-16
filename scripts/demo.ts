/**
 * Load a realistic week so you can click around before the pool is real.
 *
 *   npm run db:demo
 *
 * Creates a season, imports a real NFL week from ESPN, sets the lines, invents
 * a handful of players with picks, and plays a few games out so the live
 * scoring and the standings have something to show. Re-running wipes and
 * rebuilds the demo week only.
 */
import "./env";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { games, picks, players, seasons, weekEntries, weeks } from "../src/db/schema";
import { importNflSlate } from "../src/lib/sync";

const YEAR = Number(process.env.DEMO_YEAR ?? new Date().getFullYear());
const WEEK = Number(process.env.DEMO_WEEK ?? 2);

/** Home-perspective lines, keyed by a distinctive bit of the home team name. */
const LINES: Record<string, number> = {
  Bills: -3.5, Jets: 6.5, Bears: -3.5, Patriots: -4.5, Falcons: -1.5,
  Buccaneers: -6.5, Texans: -2.5, Ravens: -7.5, Titans: 4.5, Chargers: -8.5,
  Broncos: -2.5, Cowboys: -4.5, Cardinals: 9.5, "49ers": -11.5, Chiefs: -5.5,
  Rams: -8.5,
};

const DEMO_PLAYERS = ["AB", "CJ", "DM", "KR", "PT", "SV"];

function lineFor(homeTeam: string): number | null {
  for (const [key, value] of Object.entries(LINES)) {
    if (homeTeam.includes(key)) return value;
  }
  return null;
}

async function main() {
  let season = await db.query.seasons.findFirst({ where: eq(seasons.year, YEAR) });
  if (!season) {
    await db.update(seasons).set({ isCurrent: false });
    [season] = await db.insert(seasons).values({ year: YEAR, isCurrent: true }).returning();
    console.log(`created season ${YEAR}`);
  }

  const existing = await db.query.weeks.findFirst({
    where: and(eq(weeks.seasonId, season.id), eq(weeks.weekNumber, WEEK)),
  });
  if (existing) {
    await db.delete(weeks).where(eq(weeks.id, existing.id));
    console.log(`removed the old demo week ${WEEK}`);
  }

  const [week] = await db
    .insert(weeks)
    .values({ seasonId: season.id, weekNumber: WEEK, label: `Week ${WEEK}`, isPublished: true })
    .returning();

  const { added } = await importNflSlate(week.id, YEAR, WEEK);
  console.log(`imported ${added} games from ESPN`);

  const slate = await db.query.games.findMany({ where: eq(games.weekId, week.id) });
  if (!slate.length) {
    console.error("ESPN returned no games for that week; nothing to demo.");
    process.exit(1);
  }

  for (const g of slate) {
    const line = lineFor(g.homeTeam);
    if (line !== null) {
      await db.update(games).set({ spread: line.toFixed(1) }).where(eq(games.id, g.id));
    }
  }
  console.log("set the lines");

  // Last game of the week is the tiebreaker, the way Monday night normally is.
  const ordered = [...slate].sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());
  const tiebreaker = ordered[ordered.length - 1];
  await db.update(weeks).set({ tiebreakerGameId: tiebreaker.id }).where(eq(weeks.id, week.id));

  for (const initials of DEMO_PLAYERS) {
    const email = `${initials.toLowerCase()}@example.invalid`;
    const found = await db.query.players.findFirst({ where: eq(players.email, email) });
    if (!found) await db.insert(players).values({ initials, email });
  }
  const roster = await db.query.players.findMany();
  console.log(`${roster.length} players`);

  // Deterministic pseudo-random picks so the demo looks the same each run.
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  await db.delete(picks);
  for (const player of roster) {
    for (const game of ordered) {
      if (rand() < 0.06) continue; // a few missing picks, like real life
      await db.insert(picks).values({
        playerId: player.id,
        gameId: game.id,
        selection: rand() < 0.5 ? "home" : "away",
      });
    }
    await db
      .insert(weekEntries)
      .values({
        playerId: player.id,
        weekId: week.id,
        tiebreakerTotal: 38 + Math.floor(rand() * 18),
      })
      .onConflictDoUpdate({
        target: [weekEntries.playerId, weekEntries.weekId],
        set: { tiebreakerTotal: 38 + Math.floor(rand() * 18) },
      });
  }
  console.log("made picks");

  // Play most of the card out: finals, two live, the rest still to come.
  const finalCount = Math.max(0, ordered.length - 4);
  for (const [i, game] of ordered.entries()) {
    if (i < finalCount) {
      await db.update(games).set({
        homeScore: 10 + Math.floor(rand() * 25),
        awayScore: 10 + Math.floor(rand() * 25),
        status: "final",
        statusDetail: "Final",
      }).where(eq(games.id, game.id));
    } else if (i < finalCount + 2) {
      await db.update(games).set({
        homeScore: 7 + Math.floor(rand() * 14),
        awayScore: 7 + Math.floor(rand() * 14),
        status: "in_progress",
        statusDetail: `${1 + Math.floor(rand() * 12)}:0${Math.floor(rand() * 9)} - 3rd`,
      }).where(eq(games.id, game.id));
    }
  }
  console.log(`played out ${finalCount} finals and 2 live games`);
  console.log("\nDemo week ready. Open http://localhost:3000");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
