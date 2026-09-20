import "server-only";
import { db } from "@/db";
import { picks, weekEntries } from "@/db/schema";
import {
  planAutoPicks, type AutoPickGame, type AutoPickPlayer, type Side,
} from "./autopick";

export interface AppliedAutoPicks {
  picks: { playerId: string; gameId: string; selection: Side; isAutoPick: true }[];
  entries: { playerId: string; tiebreakerTotal: number }[];
}

/**
 * Work out what is missing and write it.
 *
 * Returns what it wrote so the caller can fold it into what it already has in
 * memory, rather than paying another round trip to read it back.
 *
 * Writes use onConflictDoNothing: two people loading the board at the same
 * moment can both decide a pick is missing, and only one of them should win.
 */
export async function applyAutoPicks(input: {
  players: AutoPickPlayer[];
  games: AutoPickGame[];
  existingPicks: { playerId: string; gameId: string }[];
  existingEntries: { playerId: string; tiebreakerTotal: number | null }[];
  tiebreakerGame: AutoPickGame | null;
  weekId: number;
}): Promise<AppliedAutoPicks> {
  const plan = planAutoPicks(input);
  if (!plan.picks.length && !plan.tiebreakers.length) {
    return { picks: [], entries: [] };
  }

  if (plan.picks.length) {
    await db
      .insert(picks)
      .values(
        plan.picks.map((p) => ({
          playerId: p.playerId,
          gameId: p.gameId,
          selection: p.selection,
          isAutoPick: true,
        })),
      )
      .onConflictDoNothing({ target: [picks.playerId, picks.gameId] });
  }

  for (const t of plan.tiebreakers) {
    await db
      .insert(weekEntries)
      .values({
        playerId: t.playerId,
        weekId: input.weekId,
        tiebreakerTotal: t.total,
      })
      .onConflictDoUpdate({
        target: [weekEntries.playerId, weekEntries.weekId],
        set: { tiebreakerTotal: t.total, updatedAt: new Date() },
      });
  }

  if (plan.skipped.length) {
    console.warn(
      `[autopick] ${plan.skipped.length} locked game(s) had no favourite to infer, left blank`,
    );
  }

  return {
    picks: plan.picks.map((p) => ({ ...p, isAutoPick: true as const })),
    entries: plan.tiebreakers.map((t) => ({
      playerId: t.playerId,
      tiebreakerTotal: t.total,
    })),
  };
}
