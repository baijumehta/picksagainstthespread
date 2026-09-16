/**
 * Pure lock and display rules. Kept free of server-only imports so they can be
 * unit tested and used from either side of the wire.
 */

export interface LockableGame {
  kickoffAt: Date;
  status: string;
}

/**
 * Picks lock per game, at that game's kickoff. So the Thursday nighter closes
 * Thursday while the Sunday slate stays open, and a late Saturday college
 * fill-in closes on its own clock.
 *
 * A game that ESPN has already moved off "scheduled" is locked regardless of
 * the clock, which covers an early start.
 */
export function isLocked(game: LockableGame, now: Date = new Date()): boolean {
  return game.status !== "scheduled" || now.getTime() >= game.kickoffAt.getTime();
}

/** A pick is only ever shown publicly once its game has locked. */
export const isPickVisible = isLocked;

/** "BUF -3.5" / "pick 'em" / "line TBD", from the home-perspective number. */
export function describeSpread(
  spread: string | number | null,
  homeLabel: string,
  awayLabel: string,
): string {
  if (spread === null) return "line TBD";
  const n = Number(spread);
  if (Number.isNaN(n)) return "line TBD";
  if (n === 0) return "pick 'em";
  return n < 0 ? `${homeLabel} ${n}` : `${awayLabel} -${n}`;
}

export function formatKickoff(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(d);
}

export function formatKickoffShort(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short", hour: "numeric", minute: "2-digit",
  }).format(d);
}
