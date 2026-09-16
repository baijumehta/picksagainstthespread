"use client";

import { useState, useTransition } from "react";
import { removeGameAction, setSpreadAction } from "../actions/admin";
import { Badge, Button, LiveDot, Notice } from "@/components/ui";

export interface AdminGameRow {
  id: string;
  league: string;
  label: string;
  homeLabel: string;
  awayLabel: string;
  spread: string | null;
  spreadIsManual: boolean;
  kickoffLabel: string;
  locked: boolean;
  status: string;
  statusDetail: string | null;
  awayScore: number | null;
  homeScore: number | null;
  isTiebreaker: boolean;
}

export function GamesTable({ games }: { games: AdminGameRow[] }) {
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="space-y-3">
      {msg ? <Notice tone={msg.ok ? "ok" : "error"}>{msg.message}</Notice> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="px-3 py-2 font-medium">Game</th>
              <th scope="col" className="px-3 py-2 font-medium">Kickoff</th>
              <th scope="col" className="px-3 py-2 font-medium">
                Line <span className="normal-case">(home)</span>
              </th>
              <th scope="col" className="px-3 py-2 font-medium">Score</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Remove</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <GameRow key={g.id} game={g} onMessage={setMsg} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        The line is always from the home team&apos;s point of view: <code>-3.5</code> means the
        home team is laying 3.5. Type your own number to override the book — the sync will then
        leave that game alone. Clear the box to hand it back to the sync.
      </p>
    </div>
  );
}

function GameRow({
  game,
  onMessage,
}: {
  game: AdminGameRow;
  onMessage: (m: { ok: boolean; message: string }) => void;
}) {
  const [value, setValue] = useState(game.spread ?? "");
  const [pending, startTransition] = useTransition();

  const commit = () => {
    if (value === (game.spread ?? "")) return;
    startTransition(async () => onMessage(await setSpreadAction(game.id, value)));
  };

  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{game.label}</span>
          {game.league === "ncaaf" ? <Badge>NCAA</Badge> : null}
          {game.isTiebreaker ? <Badge tone="accent">Tiebreaker</Badge> : null}
          {game.locked ? <Badge>locked</Badge> : null}
        </div>
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-muted">{game.kickoffLabel}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            disabled={pending}
            placeholder="—"
            aria-label={`Home spread for ${game.label}`}
            className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-sm tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
          {game.spreadIsManual ? (
            <span className="text-xs text-push" title="Set by hand; the odds sync skips this game">
              yours
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
        {game.status === "scheduled" ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            {game.awayScore ?? 0}–{game.homeScore ?? 0}
            {game.status === "in_progress" ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-live">
                <LiveDot />
                {game.statusDetail ?? "Live"}
              </span>
            ) : (
              <span className="text-xs text-muted">F</span>
            )}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <RemoveButton gameId={game.id} label={game.label} onMessage={onMessage} />
      </td>
    </tr>
  );
}

function RemoveButton({
  gameId, label, onMessage,
}: {
  gameId: string;
  label: string;
  onMessage: (m: { ok: boolean; message: string }) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        Remove
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-muted">Delete picks too?</span>
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            onMessage(await removeGameAction(gameId));
            setConfirming(false);
          })
        }
        aria-label={`Confirm removing ${label}`}
      >
        Yes
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        No
      </Button>
    </span>
  );
}
