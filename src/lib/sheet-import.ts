import * as XLSX from "xlsx";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { games, picks, players, seasons, weekEntries, weeks } from "@/db/schema";
import { abbrForSheetTeam } from "./nfl-teams";
import { matchCollegeGame } from "./college-teams";
import { fetchCollegeDay } from "./espn";
import { addCollegeGame, importNflSlate } from "./sync";

/**
 * Reading the commissioner's own pick sheet.
 *
 *   Week # 6 | SPREAD | CBY | SAH | KK | ...     <- header, players from col C
 *   Seattle (Thur.)    |       |     |  X  |     <- away team
 *   DENVER             | +2.5  |  X  |     |     <- HOME TEAM in capitals
 *   ...
 *   Wake Forest        |       |     |  X  |     <- bye weeks bring college in
 *   CAL BERKELEY       | +8.5  |  X  |     |
 *   Tie Breaker*       |       |  47 |  63 |     <- Monday-night total guesses
 *
 * Shared by the CLI and the admin upload so both behave identically. Reads
 * .xls as well as .xlsx, which is what actually arrives.
 */

export type Side = "home" | "away";
export type SheetLeague = "nfl" | "ncaaf";

export interface SheetGame {
  awayRaw: string;
  homeRaw: string;
  /** NFL abbreviations, or null for a college game. */
  awayAbbr: string | null;
  homeAbbr: string | null;
  league: SheetLeague;
  /** Home-perspective spread, as the app stores it. */
  homeSpread: number | null;
  picks: Map<string, Side>;
}

export interface ParsedSheet {
  weekNumber: number | null;
  initials: string[];
  games: SheetGame[];
  tiebreakers: Map<string, number>;
}

/** Rows inside the games block that are notes rather than teams. */
const LABEL_ROW =
  /^(jackpot|running total|#\s*correct|\(\d+\s*games|byes?\s*:|home teams in|spread$|week\s*#)/i;

/** "+3.5", "'+3.5", "-7" -> number. Blank -> null. */
function parseSpread(text: string): number | null {
  const cleaned = text.replace(/^'/, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseSheet(buffer: Buffer | ArrayBuffer): ParsedSheet {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const first = wb.SheetNames[0];
  if (!first) throw new Error("That workbook has no sheets.");

  const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[first], {
    header: 1,
    raw: false,
    defval: "",
  });
  const cell = (r: number, c: number) => String(grid[r]?.[c] ?? "").trim();

  // 1. The header row: column A starts with "Week # N".
  let headerRow = -1;
  let weekNumber: number | null = null;
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const m = /^week\s*#?\s*(\d+)/i.exec(cell(r, 0));
    if (m) { headerRow = r; weekNumber = Number(m[1]); break; }
  }
  if (headerRow === -1) throw new Error('Could not find the "Week # N" header row.');

  // 2. Player initials run from column C until a blank or the check column.
  const initials: string[] = [];
  const columnFor = new Map<string, number>();
  const width = Math.max(...grid.map((row) => row?.length ?? 0));
  for (let c = 2; c < width; c++) {
    const v = cell(headerRow, c);
    if (!v || /^check/i.test(v)) break;
    initials.push(v);
    columnFor.set(v, c);
  }
  // A blank sheet sent out before the week has lines but no player columns.
  // That is a normal thing to import: it sets the spreads and nothing else.

  // 3. The games block runs from the header to the tiebreaker.
  let tiebreakerRow = grid.length;
  for (let r = headerRow + 1; r < grid.length; r++) {
    if (/tie\s*breaker/i.test(cell(r, 0))) { tiebreakerRow = r; break; }
  }

  /*
   * Team rows are identified structurally -- any non-label row in the block,
   * paired away-then-HOME -- rather than by recognising the team name.
   *
   * This used to key off the NFL lookup, so a row it did not recognise was
   * skipped. During bye weeks he fills the card out with college games, and
   * those vanished without a word: the sheet had 16 games and 14 arrived.
   * Now an unrecognised pair is kept and marked as college, to be resolved
   * against ESPN later or reported if it cannot be.
   */
  const out: SheetGame[] = [];
  let pending: { raw: string; spread: number | null; row: number } | null = null;

  for (let r = headerRow + 1; r < tiebreakerRow; r++) {
    const a = cell(r, 0);
    if (!a || LABEL_ROW.test(a) || a.startsWith("*")) continue;

    const spread = parseSpread(cell(r, 1));

    if (!pending) {
      pending = { raw: a, spread, row: r };
      continue;
    }

    // Second of the pair: this is the home team.
    const awayAbbr = abbrForSheetTeam(pending.raw);
    const homeAbbr = abbrForSheetTeam(a);
    const league: SheetLeague = awayAbbr && homeAbbr ? "nfl" : "ncaaf";

    // The sheet puts the number on the underdog's line. Convert to the
    // home-perspective value the app stores.
    let homeSpread: number | null = null;
    if (spread !== null) homeSpread = spread;
    else if (pending.spread !== null) homeSpread = -pending.spread;

    const pickMap = new Map<string, Side>();
    for (const who of initials) {
      const col = columnFor.get(who)!;
      if (cell(pending.row, col).toUpperCase() === "X") pickMap.set(who, "away");
      if (cell(r, col).toUpperCase() === "X") pickMap.set(who, "home");
    }

    out.push({
      awayRaw: pending.raw,
      homeRaw: a,
      awayAbbr,
      homeAbbr,
      league,
      homeSpread,
      picks: pickMap,
    });
    pending = null;
  }

  // 4. Tiebreaker guesses.
  const tiebreakers = new Map<string, number>();
  if (tiebreakerRow < grid.length) {
    for (const who of initials) {
      const n = Number(cell(tiebreakerRow, columnFor.get(who)!));
      if (Number.isFinite(n) && n > 0) tiebreakers.set(who, n);
    }
  }

  return { weekNumber, initials, games: out, tiebreakers };
}

/* ------------------------------------------------------------------ */
/* Applying it                                                         */
/* ------------------------------------------------------------------ */

export interface LineChange {
  game: string;
  from: string | null;
  to: string;
  /** True when the game has already kicked off, which deserves a warning. */
  started: boolean;
}

export interface ImportSummary {
  weekNumber: number;
  weekCreated: boolean;
  gamesOnSheet: number;
  gamesMatched: number;
  unmatched: string[];
  /** College games found on ESPN and added to the week. */
  collegeAdded: string[];
  /** College games on the sheet that could not be found. */
  collegeUnresolved: string[];
  playersCreated: string[];
  picksWritten: number;
  tiebreakersWritten: number;
  lineChanges: LineChange[];
  dryRun: boolean;
}

/** The Thursday-to-Monday window a week's games fall in. */
function weekDates(slate: { kickoffAt: Date }[]): Date[] {
  if (!slate.length) return [];
  const times = slate.map((g) => g.kickoffAt.getTime());
  const start = new Date(Math.min(...times));
  const end = new Date(Math.max(...times));
  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 864e5)) {
    days.push(new Date(d));
  }
  return days;
}

/**
 * Write a parsed sheet into a week.
 *
 * With `dryRun` nothing is written and the summary says what would happen --
 * which matters most for `lineChanges`, since the sheet's numbers are the
 * pool's and can differ from whatever the odds sync last pulled.
 */
export async function importParsedSheet(
  parsed: ParsedSheet,
  weekNumber: number,
  opts: { dryRun?: boolean } = {},
): Promise<ImportSummary> {
  const dryRun = opts.dryRun ?? false;
  const summary: ImportSummary = {
    weekNumber,
    weekCreated: false,
    gamesOnSheet: parsed.games.length,
    gamesMatched: 0,
    unmatched: [],
    collegeAdded: [],
    collegeUnresolved: [],
    playersCreated: [],
    picksWritten: 0,
    tiebreakersWritten: 0,
    lineChanges: [],
    dryRun,
  };

  const season =
    (await db.query.seasons.findFirst({ where: eq(seasons.isCurrent, true) })) ??
    (await db.query.seasons.findFirst());
  if (!season) throw new Error("No season exists yet.");

  let week = await db.query.weeks.findFirst({
    where: and(eq(weeks.seasonId, season.id), eq(weeks.weekNumber, weekNumber)),
  });

  if (!week) {
    summary.weekCreated = true;
    if (dryRun) {
      summary.unmatched = parsed.games.map((g) => `${g.awayRaw} at ${g.homeRaw}`);
      return summary;
    }
    [week] = await db
      .insert(weeks)
      .values({ seasonId: season.id, weekNumber, label: `Week ${weekNumber}` })
      .returning();
  }

  let slate = await db.query.games.findMany({ where: eq(games.weekId, week.id) });
  if (!slate.length && !dryRun) {
    await importNflSlate(week.id, season.year, weekNumber);
    slate = await db.query.games.findMany({ where: eq(games.weekId, week.id) });
  }

  /*
   * College games are not in the NFL slate, so any the sheet carries have to
   * be found on ESPN and added before their picks can go anywhere.
   */
  const sheetCollege = parsed.games.filter((g) => g.league === "ncaaf");
  /** Sheet row -> the ESPN fixture it resolved to, so the main loop can reuse it. */
  const resolvedCollege = new Map<SheetGame, { awayTeam: string; homeTeam: string }>();

  if (sheetCollege.length) {
    const have = new Set(
      slate
        .filter((g) => g.league === "ncaaf")
        .map((g) => `${g.awayTeam}|${g.homeTeam}`.toLowerCase()),
    );
    const days = weekDates(slate);
    const board: Awaited<ReturnType<typeof fetchCollegeDay>> = [];
    for (const d of days) {
      try {
        board.push(...(await fetchCollegeDay(d)));
      } catch {
        // One bad day should not sink the import; it shows up as unresolved.
      }
    }

    for (const g of sheetCollege) {
      const hit = matchCollegeGame(g.awayRaw, g.homeRaw, board);
      if (!hit) {
        summary.collegeUnresolved.push(`${g.awayRaw} at ${g.homeRaw}`);
        continue;
      }
      const key = `${hit.game.awayTeam}|${hit.game.homeTeam}`.toLowerCase();
      summary.collegeAdded.push(`${hit.game.awayTeam} at ${hit.game.homeTeam}`);
      resolvedCollege.set(g, hit.game);
      if (!dryRun && !have.has(key)) {
        await addCollegeGame(week.id, hit.game);
      }
    }
    if (!dryRun && summary.collegeAdded.length) {
      slate = await db.query.games.findMany({ where: eq(games.weekId, week.id) });
    }
  }

  const byPair = new Map(slate.map((g) => [`${g.awayAbbr}@${g.homeAbbr}`, g]));

  // --- players ---
  const playerId = new Map<string, string>();
  for (const who of parsed.initials) {
    const found = await db.query.players.findFirst({ where: eq(players.initials, who) });
    if (found) { playerId.set(who, found.id); continue; }
    summary.playersCreated.push(who);
    if (dryRun) continue;
    const [created] = await db
      .insert(players)
      .values({
        initials: who,
        // Placeholder so the row is valid; a real address is needed before
        // that person can be sent a sign-in link.
        email: `${who.toLowerCase()}@placeholder.invalid`,
      })
      .returning();
    playerId.set(who, created.id);
  }

  const now = new Date();

  // --- lines and picks ---
  for (const g of parsed.games) {
    let game = g.league === "nfl"
      ? byPair.get(`${g.awayAbbr}@${g.homeAbbr}`)
      : undefined;

    if (!game && g.league === "ncaaf") {
      const fixture = resolvedCollege.get(g);
      if (fixture) {
        // The row we just added, found by ESPN's own names.
        game = slate.find(
          (s) =>
            s.league === "ncaaf" &&
            s.awayTeam === fixture.awayTeam &&
            s.homeTeam === fixture.homeTeam,
        );
        // On a dry run nothing was written, so there is no row to find --
        // but it did resolve, and would be added for real. Count what it
        // would bring with it so the preview totals are honest.
        if (!game && dryRun) {
          summary.gamesMatched++;
          summary.picksWritten += g.picks.size;
          if (g.homeSpread !== null) {
            summary.lineChanges.push({
              game: `${fixture.awayTeam} @ ${fixture.homeTeam}`,
              from: null,
              to: g.homeSpread.toFixed(1),
              started: false,
            });
          }
          continue;
        }
      }
    }

    if (!game) {
      if (g.league === "nfl") {
        summary.unmatched.push(`${g.awayAbbr ?? g.awayRaw} at ${g.homeAbbr ?? g.homeRaw}`);
      }
      continue;
    }
    summary.gamesMatched++;

    if (g.homeSpread !== null) {
      const next = g.homeSpread.toFixed(1);
      if (game.spread !== next) {
        summary.lineChanges.push({
          game: `${game.awayAbbr ?? game.awayTeam} @ ${game.homeAbbr ?? game.homeTeam}`,
          from: game.spread,
          to: next,
          started: game.status !== "scheduled" || now >= game.kickoffAt,
        });
      }
      if (!dryRun) {
        await db
          .update(games)
          .set({ spread: next, spreadIsManual: true, updatedAt: new Date() })
          .where(eq(games.id, game.id));
      }
    }

    for (const [who, selection] of g.picks) {
      summary.picksWritten++;
      if (dryRun) continue;
      await db
        .insert(picks)
        .values({ playerId: playerId.get(who)!, gameId: game.id, selection })
        .onConflictDoUpdate({
          target: [picks.playerId, picks.gameId],
          // isAutoPick is cleared: a pick off the sheet is a real one, even if
          // auto-fill had already guessed before the sheet arrived.
          set: { selection, isAutoPick: false, updatedAt: new Date() },
        });
    }
  }

  // --- tiebreakers ---
  for (const [who, total] of parsed.tiebreakers) {
    summary.tiebreakersWritten++;
    if (dryRun) continue;
    await db
      .insert(weekEntries)
      .values({ playerId: playerId.get(who)!, weekId: week.id, tiebreakerTotal: total })
      .onConflictDoUpdate({
        target: [weekEntries.playerId, weekEntries.weekId],
        set: { tiebreakerTotal: total, updatedAt: new Date() },
      });
  }

  // The last game of the week settles ties -- Monday night, per the sheet.
  if (!dryRun && !week.tiebreakerGameId && slate.length) {
    const nfl = slate.filter((g) => g.league === "nfl");
    const last = [...(nfl.length ? nfl : slate)]
      .sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime())
      .at(-1)!;
    await db.update(weeks).set({ tiebreakerGameId: last.id }).where(eq(weeks.id, week.id));
  }

  return summary;
}
