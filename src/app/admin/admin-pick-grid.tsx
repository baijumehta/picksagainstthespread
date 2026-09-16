"use client";

import { useState, useTransition } from "react";
import { adminSetPickAction, adminSetTiebreakerAction } from "../actions/admin";
import { Badge, Notice } from "@/components/ui";

export interface GridGame {
  id: string;
  shortLabel: string;
  homeAbbr: string;
  awayAbbr: string;
  locked: boolean;
  league: string;
}

export interface GridPlayer {
  id: string;
  initials: string;
  missing: number;
}

/**
 * The commissioner's view: every pick, editable, including after kickoff for
 * the ones that still come in by text. Anything changed here is flagged so the
 * audit trail survives.
 */
export function AdminPickGrid({
  weekId,
  games,
  players,
  picks,
  adminEdited,
  tiebreakers,
  tiebreakerLabel,
}: {
  weekId: number;
  games: GridGame[];
  players: GridPlayer[];
  picks: Record<string, "home" | "away">;
  adminEdited: Record<string, boolean>;
  tiebreakers: Record<string, number | null>;
  tiebreakerLabel: string | null;
}) {
  const [local, setLocal] = useState(picks);
  const [edited, setEdited] = useState(adminEdited);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [, startTransition] = useTransition();

  function cycle(playerId: string, game: GridGame) {
    const key = `${playerId}:${game.id}`;
    const current = local[key] ?? null;
    // away -> home -> cleared -> away
    const next: "home" | "away" | "clear" =
      current === null ? "away" : current === "away" ? "home" : "clear";

    setLocal((prev) => {
      const copy = { ...prev };
      if (next === "clear") delete copy[key];
      else copy[key] = next;
      return copy;
    });
    setEdited((prev) => ({ ...prev, [key]: next !== "clear" }));

    startTransition(async () => {
      const res = await adminSetPickAction(playerId, game.id, next);
      if (!res.ok) setMsg(res);
    });
  }

  return (
    <div className="space-y-3">
      {msg ? <Notice tone="error">{msg.message}</Notice> : null}
      <p className="text-xs text-muted">
        Click a cell to cycle it: away → home → blank. Saves immediately. A dot marks a pick you
        entered on someone&apos;s behalf.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th
                scope="col"
                className="grid-sticky-col min-w-[11rem] border-r border-line px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted"
              >
                Game
              </th>
              {players.map((p) => (
                <th key={p.id} scope="col" className="px-1 py-2 text-center text-xs font-semibold">
                  {p.initials}
                  {p.missing > 0 ? (
                    <span
                      className="ml-1 font-normal text-loss"
                      title={`${p.missing} games with no pick`}
                    >
                      {p.missing}
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {games.map((game) => (
              <tr key={game.id} className="border-b border-line last:border-0">
                <th
                  scope="row"
                  className="grid-sticky-col border-r border-line px-3 py-1.5 text-left text-xs font-normal"
                >
                  <span className="font-medium">{game.shortLabel}</span>
                  {game.league === "ncaaf" ? <span className="ml-1 text-muted">(NCAA)</span> : null}
                  {game.locked ? <span className="ml-1 text-muted">·&nbsp;locked</span> : null}
                </th>
                {players.map((p) => {
                  const key = `${p.id}:${game.id}`;
                  const sel = local[key] ?? null;
                  const label = sel === "home" ? game.homeAbbr : sel === "away" ? game.awayAbbr : "–";
                  return (
                    <td key={p.id} className="px-0.5 py-1">
                      <button
                        type="button"
                        onClick={() => cycle(p.id, game)}
                        title={`${p.initials} — ${game.shortLabel}`}
                        className={`w-full rounded px-1 py-1 text-center text-xs transition ${
                          sel
                            ? "bg-surface-2 font-medium hover:bg-accent/15"
                            : "text-muted hover:bg-surface-2"
                        }`}
                      >
                        {label}
                        {edited[key] && sel ? (
                          <span className="ml-0.5 text-accent" aria-label="entered by admin">•</span>
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}

            {tiebreakerLabel ? (
              <tr className="border-t-2 border-line bg-surface-2">
                <th
                  scope="row"
                  className="grid-sticky-col border-r border-line px-3 py-2 text-left text-xs font-normal"
                  style={{ background: "var(--surface-2)" }}
                >
                  <span className="font-medium">Tiebreaker</span>
                  <div className="text-muted">{tiebreakerLabel}</div>
                </th>
                {players.map((p) => (
                  <td key={p.id} className="px-0.5 py-1">
                    <TiebreakerCell
                      playerId={p.id}
                      weekId={weekId}
                      initial={tiebreakers[p.id] ?? null}
                      onError={setMsg}
                    />
                  </td>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted">
        <span><Badge>–</Badge> no pick</span>
        <span className="text-accent">• entered by you</span>
      </div>
    </div>
  );
}

function TiebreakerCell({
  playerId, weekId, initial, onError,
}: {
  playerId: string;
  weekId: number;
  initial: number | null;
  onError: (m: { ok: boolean; message: string }) => void;
}) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [, startTransition] = useTransition();

  const commit = () => {
    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && !Number.isFinite(parsed)) return;
    if (parsed === initial) return;
    startTransition(async () => {
      const res = await adminSetTiebreakerAction(playerId, weekId, parsed);
      if (!res.ok) onError(res);
    });
  };

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      inputMode="numeric"
      aria-label="Tiebreaker total"
      className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-center text-xs tabular-nums outline-none focus:border-accent focus:bg-surface"
    />
  );
}
