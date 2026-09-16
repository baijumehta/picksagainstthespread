/**
 * Import a completed pick sheet in the commissioner's own format.
 *
 *   npm run import:week -- --file "NFL 2026-Week 1-Final.xlsx" --week 1
 *
 * The sheet looks like this:
 *
 *   Week # 1 | SPREAD | CBY | SAH | KK | ...        <- header, players from col C
 *   New England (Wed.) | +3.5 |     |     |  X |    <- away team, spread on the dog
 *   SEATTLE            |       |  X  |  X  |       <- HOME TEAM in capitals
 *   ...
 *   Tie Breaker*       |       |  47 |  63 |  42    <- Monday-night total guesses
 *
 * An X in a player's column is that player taking that team. Players are
 * created if they do not exist yet; picks and spreads are overwritten, so the
 * import is safe to re-run.
 *
 * Pass --dry to see what it would do without writing anything.
 */
import "./env";
import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { games, picks, players, seasons, weekEntries, weeks } from "../src/db/schema";
import { abbrForSheetTeam, looksLikeHomeTeam } from "../src/lib/nfl-teams";
import { importNflSlate } from "../src/lib/sync";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const DRY = process.argv.includes("--dry");

interface SheetGame {
  awayRaw: string;
  homeRaw: string;
  awayAbbr: string | null;
  homeAbbr: string | null;
  /** Home-perspective spread, as the app stores it. */
  homeSpread: number | null;
  /** initials -> which side they took */
  picks: Map<string, "home" | "away">;
}

interface ParsedSheet {
  weekNumber: number | null;
  initials: string[];
  games: SheetGame[];
  tiebreakers: Map<string, number>;
}

/** Cells can hold numbers, strings, or formula results. Flatten to text. */
function cellText(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return "";
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "result" in v) return String(v.result ?? "").trim();
  if (typeof v === "object" && "richText" in v) {
    return v.richText.map((r) => r.text).join("").trim();
  }
  return String(v).trim();
}

/** "+3.5", "'+3.5", "-7" -> number. Blank -> null. */
function parseSpread(text: string): number | null {
  const cleaned = text.replace(/^'/, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

async function parseSheet(file: string): Promise<ParsedSheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("That workbook has no sheets.");

  // 1. Find the header row: column A starts with "Week #".
  let headerRow = -1;
  let weekNumber: number | null = null;
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    const a = cellText(ws.getRow(r).getCell(1));
    const m = /^week\s*#?\s*(\d+)/i.exec(a);
    if (m) { headerRow = r; weekNumber = Number(m[1]); break; }
  }
  if (headerRow === -1) throw new Error('Could not find the "Week # N" header row.');

  // 2. Player initials run from column C until a blank or the check column.
  const initials: string[] = [];
  const columnFor = new Map<string, number>();
  for (let c = 3; c <= ws.columnCount; c++) {
    const v = cellText(ws.getRow(headerRow).getCell(c));
    if (!v) break;
    if (/^check/i.test(v)) break;
    initials.push(v);
    columnFor.set(v, c);
  }
  if (!initials.length) throw new Error("No player columns found next to the header.");

  // 3. Game rows come in away/HOME pairs until the tiebreaker or a gap.
  const gamesOut: SheetGame[] = [];
  const tiebreakers = new Map<string, number>();
  let pending: { raw: string; spread: number | null; row: ExcelJS.Row } | null = null;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const a = cellText(row.getCell(1));

    if (/tie\s*breaker/i.test(a)) {
      for (const who of initials) {
        const n = Number(cellText(row.getCell(columnFor.get(who)!)));
        if (Number.isFinite(n) && n > 0) tiebreakers.set(who, n);
      }
      continue;
    }
    if (!a) continue;
    if (/^(jackpot|running total|#\s*correct|\(\d+\s*games)/i.test(a)) continue;
    if (a.startsWith("*") || /home teams in/i.test(a)) continue;

    const abbr = abbrForSheetTeam(a);
    if (!abbr) continue; // not a team row

    const spread = parseSpread(cellText(row.getCell(2)));

    if (!looksLikeHomeTeam(a)) {
      pending = { raw: a, spread, row };
      continue;
    }

    // Capitalised row: this closes out the pair.
    if (!pending) continue;
    const awayAbbr = abbrForSheetTeam(pending.raw);

    // The sheet puts the number on the underdog's line. Convert to the
    // home-perspective value the app stores.
    let homeSpread: number | null = null;
    if (spread !== null) homeSpread = spread;            // home is the dog: +N
    else if (pending.spread !== null) homeSpread = -pending.spread; // away is the dog

    const pickMap = new Map<string, "home" | "away">();
    for (const who of initials) {
      const col = columnFor.get(who)!;
      if (cellText(pending.row.getCell(col)).toUpperCase() === "X") pickMap.set(who, "away");
      if (cellText(row.getCell(col)).toUpperCase() === "X") pickMap.set(who, "home");
    }

    gamesOut.push({
      awayRaw: pending.raw, homeRaw: a,
      awayAbbr, homeAbbr: abbr,
      homeSpread, picks: pickMap,
    });
    pending = null;
  }

  return { weekNumber, initials, games: gamesOut, tiebreakers };
}

async function main() {
  const file = arg("file");
  if (!file) {
    console.error('Usage: npm run import:week -- --file "sheet.xlsx" [--week N] [--dry]');
    process.exit(1);
  }

  const parsed = await parseSheet(file);
  const weekNumber = Number(arg("week") ?? parsed.weekNumber);
  if (!Number.isFinite(weekNumber)) {
    throw new Error("Could not work out the week number; pass --week.");
  }

  console.log(`Sheet: week ${weekNumber}, ${parsed.games.length} games, ${parsed.initials.length} players`);
  const unmapped = parsed.games.filter((g) => !g.awayAbbr || !g.homeAbbr);
  for (const g of unmapped) console.warn(`  ! could not map: ${g.awayRaw} at ${g.homeRaw}`);
  if (parsed.games.length === 0) throw new Error("No games parsed; is this the right sheet?");

  if (DRY) {
    for (const g of parsed.games) {
      console.log(`  ${g.awayAbbr} at ${g.homeAbbr}  line ${g.homeSpread ?? "?"}  ${g.picks.size} picks`);
    }
    console.log("tiebreakers:", [...parsed.tiebreakers].map(([k, v]) => `${k}=${v}`).join(" "));
    console.log("\n--dry, nothing written.");
    process.exit(0);
  }

  // --- Season and week -------------------------------------------------
  const season =
    (await db.query.seasons.findFirst({ where: eq(seasons.isCurrent, true) })) ??
    (await db.query.seasons.findFirst());
  if (!season) throw new Error("No season yet. Run npm run db:seed first.");

  let week = await db.query.weeks.findFirst({
    where: and(eq(weeks.seasonId, season.id), eq(weeks.weekNumber, weekNumber)),
  });
  if (!week) {
    [week] = await db
      .insert(weeks)
      .values({ seasonId: season.id, weekNumber, label: `Week ${weekNumber}` })
      .returning();
    console.log(`created week ${weekNumber}`);
  }

  const existingGames = await db.query.games.findMany({ where: eq(games.weekId, week.id) });
  if (!existingGames.length) {
    const { added } = await importNflSlate(week.id, season.year, weekNumber);
    console.log(`pulled ${added} games from ESPN`);
  }

  const slate = await db.query.games.findMany({ where: eq(games.weekId, week.id) });
  const byPair = new Map(slate.map((g) => [`${g.awayAbbr}@${g.homeAbbr}`, g]));

  // --- Players ---------------------------------------------------------
  const playerId = new Map<string, string>();
  for (const who of parsed.initials) {
    const found = await db.query.players.findFirst({ where: eq(players.initials, who) });
    if (found) { playerId.set(who, found.id); continue; }
    const [created] = await db
      .insert(players)
      .values({
        initials: who,
        // Placeholder so the row is valid; the commissioner fills in the real
        // address before that person can sign in.
        email: `${who.toLowerCase()}@placeholder.invalid`,
      })
      .returning();
    playerId.set(who, created.id);
  }
  console.log(`${playerId.size} players ready`);

  // --- Spreads and picks ------------------------------------------------
  let lines = 0, saved = 0, missed = 0;
  for (const g of parsed.games) {
    const game = byPair.get(`${g.awayAbbr}@${g.homeAbbr}`);
    if (!game) {
      console.warn(`  ! no ESPN game for ${g.awayAbbr} at ${g.homeAbbr}`);
      missed++;
      continue;
    }
    if (g.homeSpread !== null) {
      await db
        .update(games)
        .set({ spread: g.homeSpread.toFixed(1), spreadIsManual: true })
        .where(eq(games.id, game.id));
      lines++;
    }
    for (const [who, selection] of g.picks) {
      await db
        .insert(picks)
        .values({ playerId: playerId.get(who)!, gameId: game.id, selection })
        .onConflictDoUpdate({
          target: [picks.playerId, picks.gameId],
          set: { selection, updatedAt: new Date() },
        });
      saved++;
    }
  }

  for (const [who, total] of parsed.tiebreakers) {
    await db
      .insert(weekEntries)
      .values({ playerId: playerId.get(who)!, weekId: week.id, tiebreakerTotal: total })
      .onConflictDoUpdate({
        target: [weekEntries.playerId, weekEntries.weekId],
        set: { tiebreakerTotal: total, updatedAt: new Date() },
      });
  }

  // The last game of the week settles ties -- Monday night, per the sheet.
  if (!week.tiebreakerGameId && slate.length) {
    const last = [...slate].sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime()).at(-1)!;
    await db.update(weeks).set({ tiebreakerGameId: last.id }).where(eq(weeks.id, week.id));
    console.log(`tiebreaker set to ${last.awayAbbr} at ${last.homeAbbr}`);
  }

  console.log(`\nset ${lines} lines, ${saved} picks, ${parsed.tiebreakers.size} tiebreakers`);
  if (missed) console.log(`${missed} games could not be matched.`);
  console.log("Publish the week in the admin screen when you are ready.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
