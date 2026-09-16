import type { League } from "@/db/schema";
import { matchupSimilarity, MATCH_THRESHOLD } from "./teams";

const BASE = "https://api.the-odds-api.com/v4/sports";
const SPORT_KEY: Record<League, string> = {
  nfl: "americanfootball_nfl",
  ncaaf: "americanfootball_ncaaf",
};

export interface OddsLine {
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
  /** Home-perspective points. -3.5 => home favoured by 3.5. */
  homeSpread: number;
  bookmaker: string;
}

export class OddsNotConfiguredError extends Error {
  constructor() {
    super("ODDS_API_KEY is not set, so spreads must be entered by hand.");
    this.name = "OddsNotConfiguredError";
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Current spreads for a league. Prefers the book named in ODDS_BOOKMAKER and
 * falls back to the first book quoting the game, so one missing book does not
 * blank out the whole slate.
 */
export async function fetchSpreads(league: League): Promise<OddsLine[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new OddsNotConfiguredError();
  const preferred = (process.env.ODDS_BOOKMAKER ?? "draftkings").toLowerCase();

  const url =
    `${BASE}/${SPORT_KEY[league]}/odds?apiKey=${encodeURIComponent(apiKey)}` +
    `&regions=us&markets=spreads&oddsFormat=american`;

  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) throw new Error("The Odds API rejected the key (401).");
  if (res.status === 429) throw new Error("The Odds API monthly quota is used up (429).");
  if (!res.ok) throw new Error(`The Odds API returned ${res.status}.`);

  const events: any[] = await res.json();
  const lines: OddsLine[] = [];

  for (const event of events) {
    const books: any[] = event.bookmakers ?? [];
    if (!books.length) continue;
    const book = books.find((b) => String(b.key).toLowerCase() === preferred) ?? books[0];
    const market = (book.markets ?? []).find((m: any) => m.key === "spreads");
    const outcome = (market?.outcomes ?? []).find(
      (o: any) => o.name === event.home_team,
    );
    if (!outcome || typeof outcome.point !== "number") continue;

    lines.push({
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: new Date(event.commence_time),
      homeSpread: outcome.point,
      bookmaker: book.key,
    });
  }
  return lines;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Find the line for one game. Names must match on both sides and the kickoff
 * must be within a day, so we never staple a line onto the wrong matchup.
 */
export function findLineFor(
  game: { homeTeam: string; awayTeam: string; kickoffAt: Date },
  lines: OddsLine[],
): OddsLine | null {
  let best: OddsLine | null = null;
  let bestScore = 0;

  for (const line of lines) {
    const hoursApart =
      Math.abs(line.commenceTime.getTime() - game.kickoffAt.getTime()) / 36e5;
    if (hoursApart > 24) continue;

    const score = matchupSimilarity(
      { home: game.homeTeam, away: game.awayTeam },
      { home: line.homeTeam, away: line.awayTeam },
    );
    if (score > bestScore) { bestScore = score; best = line; }
  }
  return bestScore >= MATCH_THRESHOLD ? best : null;
}
