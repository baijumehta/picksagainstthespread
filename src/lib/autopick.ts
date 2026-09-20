/**
 * Filling in for anyone who did not get their picks in.
 *
 * The commissioner's long-standing fallback: give them the favourite in every
 * game, and the over/under as their tiebreaker guess. This lets a player opt
 * into that up front so nobody ends a week with a blank card.
 *
 * Planning is separated from writing so the rules can be tested without a
 * database.
 */

export type Side = "home" | "away";

/**
 * Which side the book makes the favourite, from the home-perspective spread.
 *
 * -3.5 => home laying points, home is the favourite
 * +6.5 => home getting points, away is the favourite
 *
 * A pick 'em has no favourite and a game with no line posted has nothing to
 * go on, so both return null and are left blank rather than guessed at.
 */
export function favoriteSide(spread: string | number | null | undefined): Side | null {
  if (spread === null || spread === undefined || spread === "") return null;
  const n = Number(spread);
  if (!Number.isFinite(n) || n === 0) return null;
  return n < 0 ? "home" : "away";
}

/** The over/under, rounded to a whole number of points. */
export function autoTiebreakerTotal(
  overUnder: string | number | null | undefined,
): number | null {
  if (overUnder === null || overUnder === undefined || overUnder === "") return null;
  const n = Number(overUnder);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export interface AutoPickPlayer {
  id: string;
  initials: string;
  /** Null means they have not opted in. */
  autoPickOptedInAt: Date | null;
}

export interface AutoPickGame {
  id: string;
  kickoffAt: Date;
  status: string;
  spread: string | null;
  overUnder: string | null;
}

export interface AutoPickPlan {
  picks: { playerId: string; gameId: string; selection: Side }[];
  tiebreakers: { playerId: string; total: number }[];
  /** Games that locked with no favourite to infer, so were left blank. */
  skipped: string[];
}

/**
 * Work out what should be filled in, without touching anything.
 *
 * Two rules matter:
 *   - only games that have locked, because a pick is not missed until then;
 *   - only games that locked *after* the player opted in, so switching this on
 *     never reaches back and rewrites a week that has already been played.
 */
export function planAutoPicks(input: {
  players: AutoPickPlayer[];
  games: AutoPickGame[];
  existingPicks: { playerId: string; gameId: string }[];
  existingEntries: { playerId: string; tiebreakerTotal: number | null }[];
  tiebreakerGame: AutoPickGame | null;
  now?: Date;
}): AutoPickPlan {
  const now = input.now ?? new Date();
  const plan: AutoPickPlan = { picks: [], tiebreakers: [], skipped: [] };

  const optedIn = input.players.filter((p) => p.autoPickOptedInAt !== null);
  if (!optedIn.length) return plan;

  const have = new Set(input.existingPicks.map((p) => `${p.playerId}:${p.gameId}`));
  const locked = input.games.filter(
    (g) => g.status !== "scheduled" || now.getTime() >= g.kickoffAt.getTime(),
  );

  for (const game of locked) {
    const side = favoriteSide(game.spread);
    for (const player of optedIn) {
      // Only games that locked after they opted in.
      if (game.kickoffAt.getTime() <= player.autoPickOptedInAt!.getTime()) continue;
      if (have.has(`${player.id}:${game.id}`)) continue;

      if (!side) {
        if (!plan.skipped.includes(game.id)) plan.skipped.push(game.id);
        continue;
      }
      plan.picks.push({ playerId: player.id, gameId: game.id, selection: side });
    }
  }

  const tb = input.tiebreakerGame;
  if (tb) {
    const tbLocked = tb.status !== "scheduled" || now.getTime() >= tb.kickoffAt.getTime();
    const total = autoTiebreakerTotal(tb.overUnder);
    if (tbLocked && total !== null) {
      const entryFor = new Map(
        input.existingEntries.map((e) => [e.playerId, e.tiebreakerTotal]),
      );
      for (const player of optedIn) {
        if (tb.kickoffAt.getTime() <= player.autoPickOptedInAt!.getTime()) continue;
        if (entryFor.get(player.id) != null) continue;
        plan.tiebreakers.push({ playerId: player.id, total });
      }
    }
  }

  return plan;
}
