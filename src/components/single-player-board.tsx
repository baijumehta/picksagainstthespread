import { OutcomeCell, Badge, LiveDot, outcomeLabel } from "./ui";
import { pickOutcome, type PickOutcome } from "@/lib/scoring";
import type { GameStatus } from "@/db/schema";
import { describeSpread, formatKickoffShort, isPickVisible, sideLine } from "@/lib/format";

export interface SinglePlayerGame {
  id: string;
  league: string;
  homeTeam: string;
  homeAbbr: string | null;
  awayTeam: string;
  awayAbbr: string | null;
  kickoffAt: Date;
  spread: string | null;
  status: GameStatus;
  statusDetail: string | null;
  homeScore: number | null;
  awayScore: number | null;
  selection: "home" | "away" | null;
  isAutoPick: boolean;
}

/**
 * One player's card, read top to bottom.
 *
 * The full grid is 28 columns wide and has to scroll sideways on a phone.
 * This is the same information for a single person with nothing to scroll --
 * which is how most people actually want to follow their own week.
 */
export function SinglePlayerBoard({
  initials,
  games,
  isSelf,
  now = new Date(),
}: {
  initials: string;
  games: SinglePlayerGame[];
  /** Their own picks are shown before kickoff; other people's are not. */
  isSelf: boolean;
  now?: Date;
}) {
  const scored = games.map((g) => ({
    game: g,
    visible: isSelf || isPickVisible(g, now),
    outcome: pickOutcome(g, g.selection) as PickOutcome,
  }));

  const wins = scored.filter((s) => s.outcome === "win").length;
  const losses = scored.filter((s) => s.outcome === "loss").length;
  const pushes = scored.filter((s) => s.outcome === "push").length;
  const live = scored.filter((s) => s.outcome === "live-ahead").length;
  const missing = games.filter((g) => !g.selection).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-xl border border-line bg-surface px-4 py-3">
        <span className="text-lg font-semibold tracking-wide">{initials}</span>
        <span className="text-sm">
          <strong className="tabular-nums">{wins}</strong>
          <span className="text-muted">–</span>
          <strong className="tabular-nums">{losses}</strong>
          {pushes ? <span className="text-muted">–{pushes}</span> : null}
        </span>
        {live ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-live">
            <LiveDot /> {live} covering now
          </span>
        ) : null}
        {missing ? (
          <span className="text-sm text-loss">{missing} with no pick</span>
        ) : null}
      </div>

      <ul className="space-y-2">
        {scored.map(({ game, visible, outcome }) => {
          const away = game.awayAbbr ?? game.awayTeam;
          const home = game.homeAbbr ?? game.homeTeam;
          const pickLabel = game.selection
            ? game.selection === "home" ? home : away
            : null;

          return (
            <li
              key={game.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">
                    {away} @ {home}
                  </span>
                  {game.league === "ncaaf" ? <Badge>NCAA</Badge> : null}
                  {game.status === "in_progress" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-live">
                      <LiveDot /> {game.statusDetail ?? "Live"}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {describeSpread(game.spread, home, away)}
                  {" · "}
                  {game.status === "scheduled" ? (
                    formatKickoffShort(game.kickoffAt)
                  ) : (
                    <span className="tabular-nums">
                      {away} {game.awayScore ?? 0} – {home} {game.homeScore ?? 0}
                      {game.status === "final" ? " F" : ""}
                    </span>
                  )}
                </div>
              </div>

              <div className="w-28 shrink-0 text-right">
                {!visible ? (
                  <span className="text-xs text-muted">
                    {game.selection ? "pick is in" : "no pick"}
                  </span>
                ) : pickLabel ? (
                  <>
                    <OutcomeCell
                      outcome={outcome}
                      label={`${pickLabel} ${sideLine(game.spread, game.selection!)}`}
                    />
                    {game.isAutoPick ? (
                      <span className="mt-0.5 block text-[10px] text-push">auto</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-xs text-loss">no pick</span>
                )}
                <span className="sr-only">{outcomeLabel(outcome)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
