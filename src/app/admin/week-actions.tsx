"use client";

import { useState, useTransition } from "react";
import {
  refreshScoresAction, reimportSlateAction, setTiebreakerGameAction,
  setWeekPublishedAction, syncSpreadsAction,
} from "../actions/admin";
import { Button, Notice } from "@/components/ui";

export function WeekActions({
  weekId,
  isPublished,
  tiebreakerGameId,
  games,
}: {
  weekId: number;
  isPublished: boolean;
  tiebreakerGameId: string | null;
  games: { id: string; label: string }[];
}) {
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => () => {
    setMsg(null);
    startTransition(async () => setMsg(await fn()));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={run(() => syncSpreadsAction(weekId))}>
          Sync spreads
        </Button>
        <Button size="sm" disabled={pending} onClick={run(() => refreshScoresAction(weekId))}>
          Refresh scores
        </Button>
        <Button size="sm" disabled={pending} onClick={run(() => reimportSlateAction(weekId))}>
          Re-import NFL slate
        </Button>
        <Button
          size="sm"
          variant={isPublished ? "danger" : "primary"}
          disabled={pending}
          onClick={run(() => setWeekPublishedAction(weekId, !isPublished))}
        >
          {isPublished ? "Unpublish week" : "Publish week"}
        </Button>
      </div>

      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Tiebreaker game</span>
        <select
          value={tiebreakerGameId ?? ""}
          disabled={pending}
          onChange={(e) =>
            run(() => setTiebreakerGameAction(weekId, e.target.value || null))()
          }
          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
        >
          <option value="">— none —</option>
          {games.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
      </label>

      {msg ? <Notice tone={msg.ok ? "ok" : "error"}>{msg.message}</Notice> : null}
    </div>
  );
}
