"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the page on a timer while games are in progress.
 *
 * The server keeps the scores fresh; without this the viewer would be staring
 * at whatever was true when they loaded the page. Pauses while the tab is
 * hidden so a board left open overnight costs nothing.
 */
export function LiveRefresh({
  active,
  intervalMs = 30_000,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!active) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setUpdatedAt(new Date());
    };

    const start = () => {
      if (timer === null) timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer !== null) { clearInterval(timer); timer = null; }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") { tick(); start(); }
      else stop();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [active, intervalMs, router]);

  if (!active) return null;

  return (
    <span className="text-xs text-muted" aria-live="polite">
      {updatedAt
        ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`
        : "Updating automatically"}
    </span>
  );
}
