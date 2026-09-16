"use client";

import { useState, useTransition } from "react";
import {
  addCollegeGameAction, searchCollegeGamesAction, type CollegeCandidate,
} from "../actions/admin";
import { Button, Notice } from "@/components/ui";

/**
 * Bye weeks leave the card short, so the commissioner pads it with college
 * games — usually the late Saturday kickoffs. Roughly 60 FBS games are played
 * on a Saturday, so this searches the day and lets him add just the ones he
 * wants rather than importing the whole board.
 */
export function CollegePicker({
  weekId,
  defaultDate,
}: {
  weekId: number;
  defaultDate: string;
}) {
  const [date, setDate] = useState(defaultDate);
  const [candidates, setCandidates] = useState<CollegeCandidate[] | null>(null);
  const [onlyLate, setOnlyLate] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function search() {
    setMsg(null);
    startTransition(async () => {
      const res = await searchCollegeGamesAction(weekId, date);
      setCandidates(res.games);
      setMsg({ ok: res.ok, message: res.message });
    });
  }

  function add(espnId: string) {
    startTransition(async () => {
      const res = await addCollegeGameAction(weekId, date, espnId);
      setMsg(res);
      if (res.ok) {
        setCandidates((prev) =>
          prev?.map((c) => (c.espnId === espnId ? { ...c, alreadyAdded: true } : c)) ?? null,
        );
      }
    });
  }

  // "Late" = 7pm ET or later, which is the window he actually uses.
  const shown = (candidates ?? []).filter((c) => {
    if (!onlyLate) return true;
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York", hour: "numeric", hour12: false,
      }).format(new Date(c.kickoffIso)),
    );
    return hour >= 19 || hour <= 3;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <Button onClick={search} disabled={pending}>
          {pending ? "Looking…" : "Find games"}
        </Button>
        <label className="ml-1 flex items-center gap-2 pb-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={onlyLate}
            onChange={(e) => setOnlyLate(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Late kickoffs only (7pm ET+)
        </label>
      </div>

      {msg ? <Notice tone={msg.ok ? "ok" : "error"}>{msg.message}</Notice> : null}

      {candidates ? (
        shown.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing matches. {onlyLate ? "Try unticking the late filter." : "Try another date."}
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto rounded-lg border border-line">
            {shown.map((c) => (
              <li key={c.espnId} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-muted">
                    {new Intl.DateTimeFormat("en-US", {
                      timeZone: "America/New_York",
                      weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short",
                    }).format(new Date(c.kickoffIso))}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={c.alreadyAdded ? "ghost" : "primary"}
                  disabled={c.alreadyAdded || pending}
                  onClick={() => add(c.espnId)}
                >
                  {c.alreadyAdded ? "On the card" : "Add"}
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
