"use client";

import { useMemo, useState, useTransition } from "react";
import { savePicksAction } from "../actions/picks";
import { Badge, Button, LiveDot, Notice } from "@/components/ui";

export interface PickFormGame {
  id: string;
  league: string;
  awayTeam: string;
  awayAbbr: string | null;
  homeTeam: string;
  homeAbbr: string | null;
  spread: string | null;
  kickoffLabel: string;
  locked: boolean;
  status: string;
  statusDetail: string | null;
  awayScore: number | null;
  homeScore: number | null;
  isTiebreaker: boolean;
  /** Filled in with the favourite because the player missed the kickoff. */
  isAutoPick: boolean;
}

export function PickForm({
  weekId,
  games,
  initialSelections,
  initialTiebreaker,
  tiebreakerLocked,
  tiebreakerLabel,
}: {
  weekId: number;
  games: PickFormGame[];
  initialSelections: Record<string, "home" | "away">;
  initialTiebreaker: number | null;
  tiebreakerLocked: boolean;
  tiebreakerLabel: string | null;
}) {
  const [selections, setSelections] = useState(initialSelections);
  const [tiebreaker, setTiebreaker] = useState(
    initialTiebreaker === null ? "" : String(initialTiebreaker),
  );
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const openGames = useMemo(() => games.filter((g) => !g.locked), [games]);
  const openPicked = openGames.filter((g) => selections[g.id]).length;
  const totalPicked = games.filter((g) => selections[g.id]).length;

  const dirty =
    JSON.stringify(selections) !== JSON.stringify(initialSelections) ||
    tiebreaker !== (initialTiebreaker === null ? "" : String(initialTiebreaker));

  function choose(gameId: string, side: "home" | "away") {
    setResult(null);
    setSelections((prev) =>
      prev[gameId] === side
        ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== gameId))
        : { ...prev, [gameId]: side },
    );
  }

  function save() {
    setResult(null);
    startTransition(async () => {
      // Only send games that are still open; the server enforces this too.
      const payload: Record<string, "home" | "away"> = {};
      for (const g of openGames) {
        const s = selections[g.id];
        if (s) payload[g.id] = s;
      }
      const total = tiebreaker.trim() === "" ? null : Number(tiebreaker);
      const res = await savePicksAction(
        weekId,
        payload,
        total !== null && Number.isFinite(total) ? total : null,
      );
      setResult({ ok: res.ok, message: res.message });
    });
  }

  return (
    <div className="space-y-3 pb-24">
      {games.map((game) => (
        <GameRow
          key={game.id}
          game={game}
          selection={selections[game.id] ?? null}
          onChoose={choose}
        />
      ))}

      {tiebreakerLabel ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Tiebreaker</p>
              <p className="text-xs text-muted">
                Total points scored by both teams in {tiebreakerLabel}.
              </p>
            </div>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={200}
              value={tiebreaker}
              disabled={tiebreakerLocked}
              onChange={(e) => { setTiebreaker(e.target.value); setResult(null); }}
              placeholder="e.g. 44"
              aria-label="Predicted combined points"
              className="w-28 rounded-lg border border-line bg-surface px-3 py-2 text-sm tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-60"
            />
          </div>
          {tiebreakerLocked ? (
            <p className="mt-2 text-xs text-muted">That game has started, so this is locked.</p>
          ) : null}
        </div>
      ) : null}

      {/* Sticky save bar so the button is always reachable on a phone. */}
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="text-sm">
            <span className="font-semibold tabular-nums">
              {totalPicked}/{games.length}
            </span>{" "}
            <span className="text-muted">picked</span>
            {openGames.length !== games.length ? (
              <span className="text-muted">
                {" · "}
                {openPicked}/{openGames.length} still open
              </span>
            ) : null}
          </div>
          {result ? (
            <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
              <Notice tone={result.ok ? "ok" : "error"}>{result.message}</Notice>
            </div>
          ) : (
            <div className="hidden flex-1 sm:block" />
          )}
          <Button
            variant="primary"
            onClick={save}
            disabled={pending || !dirty || openGames.length === 0}
            className="ml-auto"
          >
            {pending ? "Saving…" : dirty ? "Save picks" : "Saved"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function GameRow({
  game,
  selection,
  onChoose,
}: {
  game: PickFormGame;
  selection: "home" | "away" | null;
  onChoose: (gameId: string, side: "home" | "away") => void;
}) {
  const spread = game.spread === null ? null : Number(game.spread);
  const line = (side: "home" | "away") => {
    if (spread === null) return "—";
    const v = side === "home" ? spread : -spread;
    return v === 0 ? "PK" : v > 0 ? `+${v}` : `${v}`;
  };

  return (
    <div
      className={`rounded-xl border bg-surface px-3 py-3 sm:px-4 ${
        game.locked ? "border-line opacity-80" : "border-line"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{game.kickoffLabel}</span>
        {game.league === "ncaaf" ? <Badge>NCAA</Badge> : null}
        {game.isTiebreaker ? <Badge tone="accent">Tiebreaker</Badge> : null}
        {game.isAutoPick ? <Badge tone="push">auto: favourite</Badge> : null}
        {game.status === "in_progress" ? (
          <span className="inline-flex items-center gap-1 font-medium text-live">
            <LiveDot /> {game.statusDetail ?? "Live"} · {game.awayScore ?? 0}–{game.homeScore ?? 0}
          </span>
        ) : game.status === "final" ? (
          <span className="font-medium">
            Final {game.awayScore ?? 0}–{game.homeScore ?? 0}
          </span>
        ) : game.locked ? (
          <span className="font-medium">Locked</span>
        ) : null}
        {spread === null && !game.locked ? (
          <span className="text-push">line not posted yet</span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SideButton
          label={game.awayTeam}
          sub={`at ${game.homeAbbr ?? game.homeTeam}`}
          line={line("away")}
          selected={selection === "away"}
          disabled={game.locked || spread === null}
          onClick={() => onChoose(game.id, "away")}
        />
        <SideButton
          label={game.homeTeam}
          sub="home"
          line={line("home")}
          selected={selection === "home"}
          disabled={game.locked || spread === null}
          onClick={() => onChoose(game.id, "home")}
        />
      </div>
    </div>
  );
}

function SideButton({
  label, sub, line, selected, disabled, onClick,
}: {
  label: string; sub: string; line: string;
  selected: boolean; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition disabled:cursor-not-allowed ${
        selected
          ? "border-accent bg-accent/10 ring-1 ring-accent"
          : "border-line hover:bg-surface-2 disabled:hover:bg-surface"
      } ${disabled && !selected ? "opacity-55" : ""}`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-sm font-semibold tabular-nums ${
          selected ? "text-accent" : "text-muted"
        }`}
      >
        {line}
      </span>
    </button>
  );
}
