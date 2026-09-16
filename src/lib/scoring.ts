import type { Game } from "@/db/schema";

export type Side = "home" | "away";
/** 'pending' = not enough info yet; 'push' = landed exactly on the number. */
export type CoverResult = Side | "push" | "pending";

/**
 * Who covers, given a home-perspective spread.
 *
 *   spread = -3.5  -> home laying 3.5, needs to win by 4+
 *   spread = +6.5  -> home getting 6.5, covers unless it loses by 7+
 *
 * Works for a final score or an in-progress one; callers decide how much to
 * trust the answer by looking at game.status.
 */
export function coveringSide(
  spread: number | null,
  homeScore: number | null,
  awayScore: number | null,
): CoverResult {
  if (spread === null || homeScore === null || awayScore === null) return "pending";
  const adjusted = homeScore - awayScore + spread;
  if (adjusted > 0) return "home";
  if (adjusted < 0) return "away";
  return "push";
}

export function gameSpread(game: ScorableGame): number | null {
  return game.spread === null || game.spread === undefined ? null : Number(game.spread);
}

// Narrow structural type so these helpers work with partial selects too.
type ScorableGame = Pick<Game, "spread" | "homeScore" | "awayScore" | "status">;

export function gameCover(game: ScorableGame): CoverResult {
  return coveringSide(gameSpread(game), game.homeScore, game.awayScore);
}

export type PickOutcome = "win" | "loss" | "push" | "live-ahead" | "live-behind" | "pending";

/** Resolve one pick. In-progress games return the 'live-*' shades. */
export function pickOutcome(game: ScorableGame, selection: Side | null): PickOutcome {
  if (!selection) return "pending";
  const cover = gameCover(game);
  if (cover === "pending") return "pending";

  if (game.status === "final") {
    if (cover === "push") return "push";
    return cover === selection ? "win" : "loss";
  }
  if (game.status === "in_progress") {
    if (cover === "push") return "live-behind";
    return cover === selection ? "live-ahead" : "live-behind";
  }
  return "pending";
}

/** A win is worth 1. A push is worth nothing to anybody, and costs nothing. */
export function pointsFor(outcome: PickOutcome): number {
  return outcome === "win" ? 1 : 0;
}

export interface StandingRow {
  playerId: string;
  initials: string;
  /** Points already banked from finished games. */
  wins: number;
  losses: number;
  pushes: number;
  /** Games still to be decided (not started, or in progress). */
  remaining: number;
  /** Picks currently covering in games that are underway. */
  liveAhead: number;
  /** wins + liveAhead -- what the board shows while games are on. */
  projected: number;
  tiebreakerTotal: number | null;
  /** |guess - actual| once the tiebreaker game is final. */
  tiebreakerDiff: number | null;
  pickCount: number;
}

export interface StandingsInput {
  players: { id: string; initials: string }[];
  games: (ScorableGame & { id: string })[];
  picks: { playerId: string; gameId: string; selection: Side }[];
  entries: { playerId: string; tiebreakerTotal: number | null }[];
  /** The game whose combined total settles ties, if one is set. */
  tiebreakerGame?: ScorableGame | null;
}

export function buildStandings(input: StandingsInput): StandingRow[] {
  const { players, games, picks, entries, tiebreakerGame } = input;

  const gameById = new Map(games.map((g) => [g.id, g]));
  const picksByPlayer = new Map<string, Map<string, Side>>();
  for (const p of picks) {
    let m = picksByPlayer.get(p.playerId);
    if (!m) picksByPlayer.set(p.playerId, (m = new Map()));
    m.set(p.gameId, p.selection);
  }
  const entryByPlayer = new Map(entries.map((e) => [e.playerId, e]));

  const actualTiebreakerTotal =
    tiebreakerGame &&
    tiebreakerGame.status === "final" &&
    tiebreakerGame.homeScore !== null &&
    tiebreakerGame.awayScore !== null
      ? tiebreakerGame.homeScore + tiebreakerGame.awayScore
      : null;

  const rows: StandingRow[] = players.map((player) => {
    const mine = picksByPlayer.get(player.id) ?? new Map<string, Side>();
    const row: StandingRow = {
      playerId: player.id,
      initials: player.initials,
      wins: 0, losses: 0, pushes: 0, remaining: 0, liveAhead: 0, projected: 0,
      tiebreakerTotal: entryByPlayer.get(player.id)?.tiebreakerTotal ?? null,
      tiebreakerDiff: null,
      pickCount: mine.size,
    };

    for (const game of games) {
      const selection = mine.get(game.id) ?? null;
      const outcome = pickOutcome(gameById.get(game.id)!, selection);
      switch (outcome) {
        case "win": row.wins++; break;
        case "loss": row.losses++; break;
        case "push": row.pushes++; break;
        case "live-ahead": row.liveAhead++; row.remaining++; break;
        case "live-behind": row.remaining++; break;
        case "pending": if (game.status !== "final") row.remaining++; break;
      }
    }

    row.projected = row.wins + row.liveAhead;
    if (actualTiebreakerTotal !== null && row.tiebreakerTotal !== null) {
      row.tiebreakerDiff = Math.abs(row.tiebreakerTotal - actualTiebreakerTotal);
    }
    return row;
  });

  return sortStandings(rows);
}

/**
 * Banked wins first, then live projection, then the tiebreaker. Someone who
 * never submitted a tiebreaker sorts below someone who did.
 */
export function sortStandings(rows: StandingRow[]): StandingRow[] {
  return [...rows].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.projected !== a.projected) return b.projected - a.projected;
    const ad = a.tiebreakerDiff, bd = b.tiebreakerDiff;
    if (ad !== null && bd !== null && ad !== bd) return ad - bd;
    if (ad !== null && bd === null) return -1;
    if (ad === null && bd !== null) return 1;
    return a.initials.localeCompare(b.initials);
  });
}

/* ------------------------------------------------------------------ */
/* Season totals                                                       */
/* ------------------------------------------------------------------ */

export interface SeasonRow {
  playerId: string;
  initials: string;
  /** Correct picks across every week. This is the season score. */
  totalWins: number;
  totalLosses: number;
  totalPushes: number;
  /** Weeks where they finished first. Ties count for everyone tied. */
  weeksWon: number;
  /** Weeks where they submitted at least one pick. */
  weeksPlayed: number;
  /** Decided picks, for a win percentage that is fair to late joiners. */
  decided: number;
  winPct: number;
}

export interface SeasonWeekInput {
  weekId: number;
  /** Only a finished week can have a winner. */
  isComplete: boolean;
  rows: StandingRow[];
}

/**
 * Roll weekly results into a season table.
 *
 * The pool has two prizes: winning an individual week, and the highest total
 * for the year. Those are different questions, so both are tracked here --
 * `weeksWon` and `totalWins`.
 */
export function buildSeasonStandings(weeks: SeasonWeekInput[]): SeasonRow[] {
  const byPlayer = new Map<string, SeasonRow>();

  const ensure = (playerId: string, initials: string): SeasonRow => {
    let row = byPlayer.get(playerId);
    if (!row) {
      row = {
        playerId, initials,
        totalWins: 0, totalLosses: 0, totalPushes: 0,
        weeksWon: 0, weeksPlayed: 0, decided: 0, winPct: 0,
      };
      byPlayer.set(playerId, row);
    }
    return row;
  };

  for (const week of weeks) {
    const ranked = withRanks(week.rows);
    for (const r of ranked) {
      const row = ensure(r.playerId, r.initials);
      row.totalWins += r.wins;
      row.totalLosses += r.losses;
      row.totalPushes += r.pushes;
      if (r.pickCount > 0) row.weeksPlayed += 1;
      // A week only has a winner once every game in it is final.
      if (week.isComplete && r.rank === 1 && r.pickCount > 0) row.weeksWon += 1;
    }
  }

  for (const row of byPlayer.values()) {
    row.decided = row.totalWins + row.totalLosses;
    row.winPct = row.decided ? row.totalWins / row.decided : 0;
  }

  return sortSeason([...byPlayer.values()]);
}

/** Season score first, then weeks won, then accuracy. */
export function sortSeason(rows: SeasonRow[]): SeasonRow[] {
  return [...rows].sort((a, b) => {
    if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
    if (b.weeksWon !== a.weeksWon) return b.weeksWon - a.weeksWon;
    if (b.winPct !== a.winPct) return b.winPct - a.winPct;
    return a.initials.localeCompare(b.initials);
  });
}

export function withSeasonRanks(rows: SeasonRow[]): (SeasonRow & { rank: number })[] {
  const key = (r: SeasonRow) => `${r.totalWins}|${r.weeksWon}|${r.winPct.toFixed(6)}`;
  let lastKey: string | null = null;
  let lastRank = 0;
  return rows.map((row, i) => {
    const k = key(row);
    if (k !== lastKey) { lastRank = i + 1; lastKey = k; }
    return { ...row, rank: lastRank };
  });
}

/**
 * Competition ranking (1,2,2,4). Two players are only tied if every field the
 * sort actually used matches.
 */
export function withRanks(rows: StandingRow[]): (StandingRow & { rank: number })[] {
  const key = (r: StandingRow) => `${r.wins}|${r.projected}|${r.tiebreakerDiff ?? "x"}`;
  let lastKey: string | null = null;
  let lastRank = 0;
  return rows.map((row, i) => {
    const k = key(row);
    if (k !== lastKey) { lastRank = i + 1; lastKey = k; }
    return { ...row, rank: lastRank };
  });
}
