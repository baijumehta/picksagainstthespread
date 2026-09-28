import * as XLSX from "xlsx";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { games, picks, players, seasons, weekEntries, weeks } from "@/db/schema";
import { abbrForSheetTeam, looksLikeHomeTeam } from "./nfl-teams";
import { importNflSlate } from "./sync";

/**
 * Reading the commissioner's own pick sheet.
 *
 *   Week # 1 | SPREAD | CBY | SAH | KK | ...     <- header, players from col C
 *   New England (Wed.) | +3.5 |     |     |  X   <- away team, spread on the dog
 *   SEATTLE            |       |  X  |  X  |     <- HOME TEAM in capitals
 *   ...
 *   Tie Breaker*       |       |  47 |  63 |  42 <- Monday-night total guesses
 *
 * Shared by the CLI and the admin upload so both behave identically. Reads
 * .xls as well as .xlsx -- the sheets that actually arrive are the old format,
 * and making someone Save As every week is exactly the friction this removes.
 */

export type Side = "home" | "away";

export interface SheetGame {
  awayRaw: string;
  homeRaw: string;
  awayAbbr: string | null;
  homeAbbr: string | null;
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

  // 3. Game rows come in away/HOME pairs until the tiebreaker or a gap.
  const out: SheetGame[] = [];
  const tiebreakers = new Map<string, number>();
  let pending: { raw: string; spread: number | null; row: number } | null = null;

  for (let r = headerRow + 1; r < grid.length; r++) {
    const a = cell(r, 0);

    if (/tie\s*breaker/i.test(a)) {
      for (const who of initials) {
        const n = Number(cell(r, columnFor.get(who)!));
        if (Number.isFinite(n) && n > 0) tiebreakers.set(who, n);
      }
      continue;
    }
    if (!a) continue;
    if (/^(jackpot|running total|#\s*correct|\(\d+\s*games)/i.test(a)) continue;
    if (a.startsWith("*") || /home teams in/i.test(a)) continue;

    const abbr = abbrForSheetTeam(a);
    if (!abbr) continue;

    const spread = parseSpread(cell(r, 1));

    if (!looksLikeHomeTeam(a)) {
      pending = { raw: a, spread, row: r };
      continue;
    }
    if (!pending) continue;

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
      awayAbbr: abbrForSheetTeam(pending.raw),
      homeAbbr: abbr,
      homeSpread,
      picks: pickMap,
    });
    pending = null;
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
  playersCreated: string[];
  picksWritten: number;
  tiebreakersWritten: number;
  lineChanges: LineChange[];
  dryRun: boolean;
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
      // Nothing to compare against, so report and stop.
      summary.unmatched = parsed.games.map((g) => `${g.awayAbbr} at ${g.homeAbbr}`);
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
    const game = byPair.get(`${g.awayAbbr}@${g.homeAbbr}`);
    if (!game) {
      summary.unmatched.push(`${g.awayAbbr ?? g.awayRaw} at ${g.homeAbbr ?? g.homeRaw}`);
      continue;
    }
    summary.gamesMatched++;

    if (g.homeSpread !== null) {
      const next = g.homeSpread.toFixed(1);
      if (game.spread !== next) {
        summary.lineChanges.push({
          game: `${game.awayAbbr} @ ${game.homeAbbr}`,
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
    const last = [...slate].sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime()).at(-1)!;
    await db.update(weeks).set({ tiebreakerGameId: last.id }).where(eq(weeks.id, week.id));
  }

  return summary;
}
