/**
 * Import a pick sheet from the command line.
 *
 *   npm run import:week -- --file "NFL 2026-Week 1-Final.xlsx" --week 1
 *   npm run import:week -- --file "sheet.xls" --dry
 *
 * Same code the admin upload screen runs, so the two cannot drift apart.
 * Most of the time the upload screen is the easier way in; this stays for
 * bulk work and for loading a season's back catalogue.
 */
import "./env";
import { readFileSync } from "node:fs";
import { importParsedSheet, parseSheet } from "../src/lib/sheet-import";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = arg("file");
  if (!file) {
    console.error('Usage: npm run import:week -- --file "sheet.xlsx" [--week N] [--dry]');
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry");

  const parsed = parseSheet(readFileSync(file));
  const weekNumber = Number(arg("week") ?? parsed.weekNumber);
  if (!Number.isFinite(weekNumber)) {
    throw new Error("Could not work out the week number; pass --week.");
  }

  console.log(
    parsed.initials.length
      ? `Sheet: week ${weekNumber}, ${parsed.games.length} games, ${parsed.initials.length} players`
      : `Sheet: week ${weekNumber}, ${parsed.games.length} games, lines only (no picks on this sheet)`,
  );

  const s = await importParsedSheet(parsed, weekNumber, { dryRun });

  console.log(`\nmatched ${s.gamesMatched}/${s.gamesOnSheet} games`);
  if (s.unmatched.length) console.log(`  ! no game in the app for: ${s.unmatched.join(", ")}`);
  if (s.playersCreated.length) console.log(`  new players: ${s.playersCreated.join(", ")}`);

  if (s.lineChanges.length) {
    console.log(`\n${s.lineChanges.length} line(s) ${dryRun ? "would change" : "changed"}:`);
    for (const c of s.lineChanges) {
      console.log(`  ${c.game.padEnd(14)} ${String(c.from ?? "none").padEnd(7)} -> ${c.to}${c.started ? "   (already started)" : ""}`);
    }
  }

  console.log(
    dryRun
      ? `\n--dry, nothing written. Would write ${s.picksWritten} picks and ${s.tiebreakersWritten} tiebreakers.`
      : `\nwrote ${s.picksWritten} picks and ${s.tiebreakersWritten} tiebreakers.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
