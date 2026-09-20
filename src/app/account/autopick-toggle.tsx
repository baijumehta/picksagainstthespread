"use client";

import { useState, useTransition } from "react";
import { setAutoPickAction } from "../actions/account";
import { Notice } from "@/components/ui";

export function AutoPickToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setEnabled(next); // optimistic; the server is the authority on reload
    setMsg(null);
    startTransition(async () => {
      const res = await setAutoPickAction(next);
      setEnabled(res.enabled);
      setMsg(res.message);
    });
  }

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
        />
        <span className="text-sm">
          <span className="font-medium">
            If I miss a game, give me the favourite
          </span>
          <span className="mt-0.5 block text-muted">
            When a game kicks off and you have not picked it, it is set to whichever
            side the line makes the favourite. Your tiebreaker, if you have not
            entered one, is set to the over/under for that game.
          </span>
        </span>
      </label>

      {msg ? <Notice tone="ok">{msg}</Notice> : null}

      <ul className="space-y-1 border-t border-line pt-3 text-xs text-muted">
        <li>Only games that kick off after you switch this on. Past weeks are never changed.</li>
        <li>A pick you made yourself is never overwritten — you can still change it up to kickoff.</li>
        <li>Auto-filled picks are marked on your picks page and on the commissioner&apos;s screen.</li>
        <li>A pick &apos;em has no favourite, so it is left blank rather than guessed.</li>
      </ul>
    </div>
  );
}
