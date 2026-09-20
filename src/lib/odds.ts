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
  /** Betting total, when the book posts one. Feeds the auto tiebreaker. */
  overUnder: number | null;
  bookmaker: string;
}

/**
 * Move a whole-number line half a point onto the favourite.
 *
 * No sportsbook avoids whole numbers -- 3 is the most common NFL margin of
 * victory, so -3 is the most common spread, and every book posts it (they
 * price the risk in the juice, which we never see). The pool has always run
 * half-point cards, so the number gets hooked here instead.
 *
 * The favourite always has to win by one more:
 *   -3 (home favoured)  -> -3.5, home must win by 4
 *   +3 (away favoured)  -> +3.5, away must win by 4
 * which is simply "move away from zero".
 *
 * A pick 'em has no favourite to hook toward, so it is left alone and can
 * still push.
 */
export function hookWholeNumber(spread: number): number {
  if (!Number.isInteger(spread) || spread === 0) return spread;
  return spread < 0 ? spread - 0.5 : spread + 0.5;
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
    `&regions=us&markets=spreads,totals&oddsFormat=american`;

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

    // Totals ride along in the same request. Over and under carry the same
    // number, so either outcome will do.
    const totalsMarket = (book.markets ?? []).find((m: any) => m.key === "totals");
    const totalPoint = (totalsMarket?.outcomes ?? [])[0]?.point;

    lines.push({
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: new Date(event.commence_time),
      homeSpread: outcome.point,
      overUnder: typeof totalPoint === "number" ? totalPoint : null,
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
