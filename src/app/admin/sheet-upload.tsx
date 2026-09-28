"use client";

import { useRef, useState, useTransition } from "react";
import { uploadSheetAction, type UploadResult } from "../actions/upload";
import { Badge, Button, Notice } from "@/components/ui";

/**
 * Upload a pick sheet from the admin screen.
 *
 * Two steps on purpose. The sheet's lines are the pool's lines and regularly
 * differ from whatever the odds sync pulled, so the preview names every line
 * that would move -- and flags any whose game has already kicked off, because
 * changing one of those changes a result people may already have seen.
 */
export function SheetUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [week, setWeek] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [committed, setCommitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function send(commit: boolean) {
    if (!file) {
      setResult({ ok: false, message: "Choose a spreadsheet first." });
      return;
    }
    const fd = new FormData();
    fd.set("sheet", file);
    if (week.trim()) fd.set("week", week.trim());
    if (commit) fd.set("commit", "yes");

    startTransition(async () => {
      const res = await uploadSheetAction(fd);
      setResult(res);
      setCommitted(commit && res.ok);
    });
  }

  function reset() {
    setFile(null);
    setWeek("");
    setResult(null);
    setCommitted(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  const summary = result?.ok ? result.summary : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Pick sheet</span>
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setCommitted(false);
            }}
            className="block w-full max-w-sm text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-surface-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Week <span className="font-normal">(optional)</span>
          </span>
          <input
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            inputMode="numeric"
            placeholder="auto"
            className="w-20 rounded-lg border border-line bg-surface px-3 py-2 text-sm tabular-nums outline-none focus:border-accent"
          />
        </label>
        <Button onClick={() => send(false)} disabled={pending || !file}>
          {pending && !committed ? "Readingâ€¦" : "Check it"}
        </Button>
        {result ? (
          <Button variant="ghost" onClick={reset} disabled={pending}>
            Start over
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted">
        Takes the sheet exactly as it comes â€” <code>.xls</code> or <code>.xlsx</code>. The week
        is read off the <code>Week&nbsp;#</code> cell unless you set it. Nothing is written
        until you confirm.
      </p>

      {result && !result.ok ? <Notice tone="error">{result.message}</Notice> : null}

      {summary ? (
        <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Week {summary.weekNumber}</span>
            {summary.weekCreated ? <Badge tone="push">new week</Badge> : null}
            <span className="text-sm text-muted">
              {summary.gamesMatched}/{summary.gamesOnSheet} games matched Â·{" "}
              {summary.picksWritten} picks Â· {summary.tiebreakersWritten} tiebreakers
            </span>
          </div>

          {summary.playersCreated.length ? (
            <Notice tone="info">
              New {summary.playersCreated.length === 1 ? "player" : "players"}:{" "}
              <strong>{summary.playersCreated.join(", ")}</strong>. They get a placeholder
              email and cannot sign in until you put a real one in.
            </Notice>
          ) : null}

          {summary.unmatched.length ? (
            <Notice tone="error">
              No game in the app for: {summary.unmatched.join(", ")}. Those picks are skipped.
            </Notice>
          ) : null}

          {summary.lineChanges.length ? (
            <div>
              <p className="mb-1.5 text-sm font-medium">
                {summary.lineChanges.length} line
                {summary.lineChanges.length === 1 ? "" : "s"} would change
              </p>
              <ul className="space-y-0.5 text-sm">
                {summary.lineChanges.map((c) => (
                  <li key={c.game} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.game}</span>
                    <span className="tabular-nums text-muted">
                      {c.from ?? "none"} â†’ {c.to}
                    </span>
                    {c.started ? (
                      <Badge tone="loss">already started</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
              {summary.lineChanges.some((c) => c.started) ? (
                <p className="mt-2 text-xs text-loss">
                  Changing a line on a game that has started can change who covered it. Only
                  go ahead if the sheet has the number your pool actually played.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted">No lines change.</p>
          )}

          {committed ? (
            <Notice tone="ok">
              Imported. {summary.picksWritten} picks and {summary.tiebreakersWritten} tiebreakers
              are in.
            </Notice>
          ) : (
            <Button variant="primary" onClick={() => send(true)} disabled={pending}>
              {pending ? "Importingâ€¦" : `Import week ${summary.weekNumber}`}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
