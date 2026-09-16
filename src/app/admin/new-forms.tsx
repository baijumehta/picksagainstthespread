"use client";

import { useState, useTransition } from "react";
import { createSeasonAction, createWeekAction } from "../actions/admin";
import { Button, Notice } from "@/components/ui";

export function NewSeasonForm({ defaultYear }: { defaultYear: number }) {
  const [year, setYear] = useState(String(defaultYear));
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Season year</span>
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            inputMode="numeric"
            className="w-28 rounded-lg border border-line bg-surface px-3 py-2 text-sm tabular-nums outline-none focus:border-accent"
          />
        </label>
        <Button
          variant="primary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => setMsg(await createSeasonAction(Number(year))))
          }
        >
          {pending ? "Creating…" : "Create season"}
        </Button>
      </div>
      {msg ? <Notice tone={msg.ok ? "ok" : "error"}>{msg.message}</Notice> : null}
    </div>
  );
}

export function NewWeekForm({
  seasonId,
  suggestedWeek,
}: {
  seasonId: number;
  suggestedWeek: number;
}) {
  const [week, setWeek] = useState(String(suggestedWeek));
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Add week</span>
          <input
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            inputMode="numeric"
            className="w-24 rounded-lg border border-line bg-surface px-3 py-2 text-sm tabular-nums outline-none focus:border-accent"
          />
        </label>
        <Button
          variant="primary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => setMsg(await createWeekAction(seasonId, Number(week))))
          }
        >
          {pending ? "Pulling schedule…" : "Add week"}
        </Button>
        <span className="pb-2 text-xs text-muted">
          Pulls that week&apos;s NFL games from ESPN.
        </span>
      </div>
      {msg ? <Notice tone={msg.ok ? "ok" : "error"}>{msg.message}</Notice> : null}
    </div>
  );
}
