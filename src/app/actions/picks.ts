"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { games, picks, weekEntries } from "@/db/schema";
import { requirePlayer } from "@/lib/auth";
import { isLocked } from "@/lib/pool";

const savePicksSchema = z.object({
  weekId: z.coerce.number().int().positive(),
  selections: z.record(z.string().uuid(), z.enum(["home", "away"])),
  tiebreakerTotal: z.number().int().min(0).max(200).nullable(),
});

export interface SavePicksResult {
  ok: boolean;
  saved: number;
  rejected: string[];
  message: string;
}

/**
 * Save the signed-in player's picks. Games that have already kicked off are
 * refused server-side -- the disabled control in the UI is a courtesy, not the
 * rule.
 */
export async function savePicksAction(
  weekId: number,
  selections: Record<string, "home" | "away">,
  tiebreakerTotal: number | null,
): Promise<SavePicksResult> {
  const player = await requirePlayer();
  const parsed = savePicksSchema.safeParse({ weekId, selections, tiebreakerTotal });
  if (!parsed.success) {
    return { ok: false, saved: 0, rejected: [], message: "Those picks did not look right." };
  }

  const gameIds = Object.keys(parsed.data.selections);
  const weekGames = await db.query.games.findMany({ where: eq(games.weekId, weekId) });
  const byId = new Map(weekGames.map((g) => [g.id, g]));

  const now = new Date();
  const rejected: string[] = [];
  let saved = 0;

  for (const gameId of gameIds) {
    const game = byId.get(gameId);
    if (!game) continue;
    if (isLocked(game, now)) {
      rejected.push(`${game.awayTeam} at ${game.homeTeam}`);
      continue;
    }
    const selection = parsed.data.selections[gameId];
    await db
      .insert(picks)
      .values({ playerId: player.id, gameId, selection })
      .onConflictDoUpdate({
        target: [picks.playerId, picks.gameId],
        set: { selection, updatedAt: now, editedByAdmin: false },
      });
    saved++;
  }

  // The tiebreaker stays open until its own game kicks off.
  const tbId = await tiebreakerGameId(weekId);
  const tbGame = tbId ? weekGames.find((g) => g.id === tbId) : undefined;
  if (parsed.data.tiebreakerTotal !== null && (!tbGame || !isLocked(tbGame, now))) {
    await db
      .insert(weekEntries)
      .values({ playerId: player.id, weekId, tiebreakerTotal: parsed.data.tiebreakerTotal })
      .onConflictDoUpdate({
        target: [weekEntries.playerId, weekEntries.weekId],
        set: { tiebreakerTotal: parsed.data.tiebreakerTotal, updatedAt: now },
      });
  }

  revalidatePath("/picks");
  revalidatePath("/");
  revalidatePath("/board");

  return {
    ok: rejected.length === 0,
    saved,
    rejected,
    message: rejected.length
      ? `Saved ${saved}. These had already started, so they were not changed: ${rejected.join(", ")}.`
      : `Saved ${saved} ${saved === 1 ? "pick" : "picks"}.`,
  };
}

async function tiebreakerGameId(weekId: number) {
  const week = await db.query.weeks.findFirst({
    where: (t, { eq: e }) => e(t.id, weekId),
    columns: { tiebreakerGameId: true },
  });
  return week?.tiebreakerGameId ?? null;
}

/** Everything the signed-in player has already entered for a week. */
export async function myPicksForWeek(weekId: number) {
  const player = await requirePlayer();
  const weekGames = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.weekId, weekId));
  const ids = weekGames.map((g) => g.id);

  const mine = ids.length
    ? await db.select().from(picks).where(and(eq(picks.playerId, player.id), inArray(picks.gameId, ids)))
    : [];
  const entry = await db.query.weekEntries.findFirst({
    where: and(eq(weekEntries.playerId, player.id), eq(weekEntries.weekId, weekId)),
  });
  return { picks: mine, entry };
}
