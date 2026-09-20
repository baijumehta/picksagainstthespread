"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Says when the scores were last pulled, and re-renders the page on a timer
 * while games are in progress.
 *
 * The timestamp is formatted on the server and passed in already-rendered, so
 * it cannot disagree between server and client. Each refresh brings a new one
 * down, which doubles as proof the loop is alive.
 *
 * Polling pauses while the tab is hidden, so a board left open overnight costs
 * nothing.
 */
export function LiveRefresh({
  active,
  syncedAtLabel,
  intervalMs = 120_000,
}: {
  active: boolean;
  /** Pre-formatted, e.g. "1:42:07 PM ET". Null when scores have never synced. */
  syncedAtLabel: string | null;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
    };
    const start = () => { if (timer === null) timer = setInterval(tick, intervalMs); };
    const stop = () => { if (timer !== null) { clearInterval(timer); timer = null; } };

    const onVisibility = () => {
      if (document.visibilityState === "visible") { tick(); start(); }
      else stop();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [active, intervalMs, router]);

  if (!syncedAtLabel && !active) return null;

  return (
    <span className="text-xs text-muted" aria-live="polite">
      {syncedAtLabel ? `Scores updated ${syncedAtLabel}` : "Waiting for the first scores"}
      {active ? (
        <span className="text-muted"> · checking every {Math.round(intervalMs / 60_000)} min</span>
      ) : null}
    </span>
  );
}
