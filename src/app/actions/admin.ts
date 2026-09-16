"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { games, picks, players, seasons, weekEntries, weeks } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { fetchCollegeDay, type EspnGame } from "@/lib/espn";
import { addCollegeGame, importNflSlate, refreshScores, syncSpreads } from "@/lib/sync";

type Result = { ok: boolean; message: string };

function bump(weekId?: number) {
  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath("/picks");
  revalidatePath("/admin");
  if (weekId) revalidatePath(`/admin/week/${weekId}`);
}

/* ------------------------------------------------------------------ */
/* Seasons and weeks                                                   */
/* ------------------------------------------------------------------ */

export async function createSeasonAction(year: number): Promise<Result> {
  await requireAdmin();
  const parsed = z.number().int().min(2000).max(2100).safeParse(year);
  if (!parsed.success) return { ok: false, message: "That is not a valid season year." };

  const existing = await db.query.seasons.findFirst({ where: eq(seasons.year, parsed.data) });
  if (existing) return { ok: false, message: `${parsed.data} already exists.` };

  await db.update(seasons).set({ isCurrent: false });
  await db.insert(seasons).values({ year: parsed.data, isCurrent: true });
  bump();
  return { ok: true, message: `Created the ${parsed.data} season.` };
}

/**
 * Create a week and pull its NFL slate. Spreads come in a second step so a
 * missing odds key never blocks getting the schedule up.
 */
export async function createWeekAction(seasonId: number, weekNumber: number): Promise<Result> {
  await requireAdmin();
  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, seasonId) });
  if (!season) return { ok: false, message: "That season does not exist." };
  if (weekNumber < 1 || weekNumber > 18) {
    return { ok: false, message: "NFL regular-season weeks run 1 to 18." };
  }

  const existing = await db.query.weeks.findFirst({
    where: and(eq(weeks.seasonId, seasonId), eq(weeks.weekNumber, weekNumber)),
  });
  if (existing) return { ok: false, message: `Week ${weekNumber} already exists.` };

  const [week] = await db
    .insert(weeks)
    .values({ seasonId, weekNumber, label: `Week ${weekNumber}` })
    .returning();

  try {
    const { added } = await importNflSlate(week.id, season.year, weekNumber);
    bump(week.id);
    return { ok: true, message: `Week ${weekNumber} created with ${added} NFL games.` };
  } catch (err) {
    bump(week.id);
    const detail = err instanceof Error ? err.message : "unknown error";
    return {
      ok: true,
      message: `Week ${weekNumber} created, but the schedule import failed (${detail}). You can add games by hand.`,
    };
  }
}

export async function reimportSlateAction(weekId: number): Promise<Result> {
  await requireAdmin();
  const week = await db.query.weeks.findFirst({ where: eq(weeks.id, weekId) });
  if (!week) return { ok: false, message: "Week not found." };
  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, week.seasonId) });
  if (!season) return { ok: false, message: "Season not found." };

  try {
    const { found, added } = await importNflSlate(weekId, season.year, week.weekNumber);
    bump(weekId);
    return { ok: true, message: `Checked ${found} NFL games, added ${added} new.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Import failed." };
  }
}

export async function setWeekPublishedAction(weekId: number, published: boolean): Promise<Result> {
  await requireAdmin();
  if (published) {
    const count = await db.select({ id: games.id }).from(games).where(eq(games.weekId, weekId));
    if (!count.length) return { ok: false, message: "Add some games before publishing." };
  }
  await db.update(weeks).set({ isPublished: published }).where(eq(weeks.id, weekId));
  bump(weekId);
  return { ok: true, message: published ? "Week is live for picks." : "Week hidden." };
}

export async function setTiebreakerGameAction(
  weekId: number,
  gameId: string | null,
): Promise<Result> {
  await requireAdmin();
  await db.update(weeks).set({ tiebreakerGameId: gameId }).where(eq(weeks.id, weekId));
  bump(weekId);
  return { ok: true, message: gameId ? "Tiebreaker game set." : "Tiebreaker cleared." };
}

/* ------------------------------------------------------------------ */
/* Games and spreads                                                   */
/* ------------------------------------------------------------------ */

export async function syncSpreadsAction(weekId: number): Promise<Result> {
  await requireAdmin();
  const res = await syncSpreads(weekId);
  bump(weekId);
  if (res.error) return { ok: false, message: res.error };

  const bits = [`Updated ${res.updated} ${res.updated === 1 ? "line" : "lines"}.`];
  if (res.skippedManual) bits.push(`Left ${res.skippedManual} of your own lines alone.`);
  if (res.unmatched.length) bits.push(`No line found for: ${res.unmatched.join(", ")}.`);
  return { ok: true, message: bits.join(" ") };
}

/**
 * Override a line by hand. Once set this way the odds sync will not touch it
 * again, so the number the pool agreed on always wins.
 */
export async function setSpreadAction(gameId: string, rawSpread: string): Promise<Result> {
  await requireAdmin();
  const trimmed = rawSpread.trim();

  if (trimmed === "") {
    await db
      .update(games)
      .set({ spread: null, spreadIsManual: false, updatedAt: new Date() })
      .where(eq(games.id, gameId));
    bump();
    return { ok: true, message: "Line cleared; the next sync will refill it." };
  }

  const parsed = z.coerce.number().min(-60).max(60).safeParse(trimmed);
  if (!parsed.success) return { ok: false, message: "Enter a number like -3.5 or 7." };
  if ((Math.abs(parsed.data) * 2) % 1 !== 0) {
    return { ok: false, message: "Lines move in half points." };
  }

  await db
    .update(games)
    .set({ spread: parsed.data.toFixed(1), spreadIsManual: true, updatedAt: new Date() })
    .where(eq(games.id, gameId));
  bump();
  return { ok: true, message: "Line set. The odds sync will leave it alone now." };
}

export async function removeGameAction(gameId: string): Promise<Result> {
  await requireAdmin();
  const game = await db.query.games.findFirst({ where: eq(games.id, gameId) });
  if (!game) return { ok: false, message: "Game not found." };

  const week = await db.query.weeks.findFirst({ where: eq(weeks.id, game.weekId) });
  if (week?.tiebreakerGameId === gameId) {
    await db.update(weeks).set({ tiebreakerGameId: null }).where(eq(weeks.id, game.weekId));
  }
  await db.delete(games).where(eq(games.id, gameId)); // picks cascade
  bump(game.weekId);
  return { ok: true, message: "Game removed." };
}

export async function refreshScoresAction(weekId: number): Promise<Result> {
  await requireAdmin();
  const { checked, changed, errors } = await refreshScores(weekId);
  bump(weekId);
  if (errors.length) {
    return {
      ok: false,
      message: `Could not reach ESPN: ${errors[0]}${
        errors.length > 1 ? ` (and ${errors.length - 1} more)` : ""
      }`,
    };
  }
  return { ok: true, message: `Checked ${checked} open games, updated ${changed}.` };
}

/* ---- College fill-ins for bye weeks ---- */

export interface CollegeCandidate {
  espnId: string;
  label: string;
  kickoffIso: string;
  alreadyAdded: boolean;
}

/**
 * The FBS board for one day, so the late Saturday kickoffs used to pad a bye
 * week can be cherry-picked out of a ~60 game slate.
 */
export async function searchCollegeGamesAction(
  weekId: number,
  dateIso: string,
): Promise<{ ok: boolean; message: string; games: CollegeCandidate[] }> {
  await requireAdmin();
  const date = new Date(`${dateIso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, message: "Pick a date first.", games: [] };
  }

  try {
    const slate = await fetchCollegeDay(date);
    const existing = await db.query.games.findMany({ where: eq(games.weekId, weekId) });
    const have = new Set(existing.map((g) => g.espnId));

    return {
      ok: true,
      message: `${slate.length} FBS games that day.`,
      games: slate.map((g) => ({
        espnId: g.espnId,
        label: `${g.awayTeam} at ${g.homeTeam}`,
        kickoffIso: g.kickoffAt.toISOString(),
        alreadyAdded: have.has(g.espnId),
      })),
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "College lookup failed.",
      games: [],
    };
  }
}

export async function addCollegeGameAction(
  weekId: number,
  dateIso: string,
  espnId: string,
): Promise<Result> {
  await requireAdmin();
  const date = new Date(`${dateIso}T12:00:00Z`);
  let slate: EspnGame[];
  try {
    slate = await fetchCollegeDay(date);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "College lookup failed." };
  }

  const game = slate.find((g) => g.espnId === espnId);
  if (!game) return { ok: false, message: "That game is no longer on the board." };

  const added = await addCollegeGame(weekId, game);
  bump(weekId);
  return {
    ok: true,
    message: added
      ? `Added ${game.awayTeam} at ${game.homeTeam}. Sync spreads to pull its line.`
      : "That game was already on the card.",
  };
}

/* ------------------------------------------------------------------ */
/* Picks on someone's behalf                                           */
/* ------------------------------------------------------------------ */

/**
 * Picks still arrive by text. This keys them in, including after kickoff, and
 * every such pick is flagged in the audit column.
 */
export async function adminSetPickAction(
  playerId: string,
  gameId: string,
  selection: "home" | "away" | "clear",
): Promise<Result> {
  await requireAdmin();

  if (selection === "clear") {
    await db.delete(picks).where(and(eq(picks.playerId, playerId), eq(picks.gameId, gameId)));
    bump();
    return { ok: true, message: "Pick cleared." };
  }

  await db
    .insert(picks)
    .values({ playerId, gameId, selection, editedByAdmin: true })
    .onConflictDoUpdate({
      target: [picks.playerId, picks.gameId],
      set: { selection, editedByAdmin: true, updatedAt: new Date() },
    });
  bump();
  return { ok: true, message: "Pick saved." };
}

export async function adminSetTiebreakerAction(
  playerId: string,
  weekId: number,
  total: number | null,
): Promise<Result> {
  await requireAdmin();
  await db
    .insert(weekEntries)
    .values({ playerId, weekId, tiebreakerTotal: total })
    .onConflictDoUpdate({
      target: [weekEntries.playerId, weekEntries.weekId],
      set: { tiebreakerTotal: total, updatedAt: new Date() },
    });
  bump(weekId);
  return { ok: true, message: "Tiebreaker saved." };
}

/* ------------------------------------------------------------------ */
/* Players                                                             */
/* ------------------------------------------------------------------ */

const playerSchema = z.object({
  initials: z
    .string()
    .trim()
    .min(1)
    .max(6)
    .regex(/^[A-Za-z0-9.-]+$/, "Initials: letters and numbers only."),
  fullName: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  isAdmin: z.boolean().optional(),
});

export async function createPlayerAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = playerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the fields." };
  }
  const v = parsed.data;

  const clash = await db.query.players.findFirst({
    where: (t, { or, eq: e }) => or(e(t.email, v.email), e(t.initials, v.initials.toUpperCase())),
  });
  if (clash) return { ok: false, message: "Those initials or that email are already in use." };

  await db.insert(players).values({
    initials: v.initials.toUpperCase(),
    fullName: v.fullName || null,
    email: v.email,
    phone: v.phone || null,
    isAdmin: v.isAdmin ?? false,
  });
  bump();
  return { ok: true, message: `Added ${v.initials.toUpperCase()}.` };
}

export async function updatePlayerAction(playerId: string, input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = playerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the fields." };
  }
  const v = parsed.data;
  await db
    .update(players)
    .set({
      initials: v.initials.toUpperCase(),
      fullName: v.fullName || null,
      email: v.email,
      phone: v.phone || null,
      isAdmin: v.isAdmin ?? false,
    })
    .where(eq(players.id, playerId));
  bump();
  return { ok: true, message: "Player updated." };
}

/** Deactivate rather than delete, so past picks stay in the standings. */
export async function setPlayerActiveAction(playerId: string, active: boolean): Promise<Result> {
  const admin = await requireAdmin();
  if (admin.id === playerId && !active) {
    return { ok: false, message: "You cannot deactivate yourself." };
  }
  await db.update(players).set({ isActive: active }).where(eq(players.id, playerId));
  bump();
  return { ok: true, message: active ? "Player reactivated." : "Player deactivated." };
}
