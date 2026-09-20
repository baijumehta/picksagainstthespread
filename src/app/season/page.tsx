import Link from "next/link";
import { getCurrentSeason, getSeasonWeeks } from "@/lib/pool";
import {
  buildSeasonStandings, buildStandings, withSeasonRanks, type SeasonWeekInput,
} from "@/lib/scoring";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { SetupNeeded } from "@/components/setup-needed";
import { getCurrentPlayer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SeasonPage() {
  let season: Awaited<ReturnType<typeof getCurrentSeason>>;
  let data: Awaited<ReturnType<typeof getSeasonWeeks>> | undefined;
  let loadError: string | null = null;
  try {
    season = await getCurrentSeason();
    if (season) data = await getSeasonWeeks(season.id);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }
  if (loadError) return <SetupNeeded detail={loadError} />;
  if (!season || !data) return <SetupNeeded />;

  if (!data.weeks.length) {
    return (
      <Card>
        <CardHeader title={`${season.year} season`} />
        <EmptyState title="No weeks published yet.">
          Season totals appear once the first week is live.
        </EmptyState>
      </Card>
    );
  }

  // Score each week on its own, then roll the weeks up.
  const weekInputs: SeasonWeekInput[] = data.weeks.map((week) => {
    const weekGames = data.games.filter((g) => g.weekId === week.id);
    const gameIds = new Set(weekGames.map((g) => g.id));
    const rows = buildStandings({
      players: data.players.map((p) => ({ id: p.id, initials: p.initials })),
      games: weekGames,
      picks: data.picks
        .filter((p) => gameIds.has(p.gameId))
        .map((p) => ({ playerId: p.playerId, gameId: p.gameId, selection: p.selection })),
      entries: data.entries
        .filter((e) => e.weekId === week.id)
        .map((e) => ({ playerId: e.playerId, tiebreakerTotal: e.tiebreakerTotal })),
      tiebreakerGame: weekGames.find((g) => g.id === week.tiebreakerGameId) ?? null,
    });
    return {
      weekId: week.id,
      isComplete: weekGames.length > 0 && weekGames.every((g) => g.status === "final"),
      rows,
    };
  });

  const rows = withSeasonRanks(buildSeasonStandings(weekInputs));
  const completeWeeks = weekInputs.filter((w) => w.isComplete).length;
  // Who is looking, so their own row stands out of a 28-line table.
  const me = await getCurrentPlayer().catch(() => null);

  // Who took each finished week, for the strip under the table.
  const weekWinners = weekInputs
    .filter((w) => w.isComplete)
    .map((w) => {
      const week = data.weeks.find((x) => x.id === w.weekId)!;
      const top = w.rows.filter((r) => r.pickCount > 0);
      const best = top[0];
      const tied = best ? top.filter((r) => r.wins === best.wins && r.tiebreakerDiff === best.tiebreakerDiff) : [];
      return {
        id: week.id,
        label: week.label,
        winners: tied.map((r) => r.initials),
        score: best ? `${best.wins}-${best.losses}` : "—",
      };
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {season.year} season standings
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Total correct picks across {data.weeks.length}{" "}
            {data.weeks.length === 1 ? "week" : "weeks"}
            {completeWeeks < data.weeks.length ? ` (${completeWeeks} finished)` : ""}.
          </p>
        </div>
        <Link href="/" className="text-sm font-medium text-accent hover:underline">
          This week&apos;s standings →
        </Link>
      </div>

      <Card>
        <CardHeader
          title="Year to date"
          subtitle="Ordered on correct picks. Weeks won is the pool's other prize and does not affect this order, so players level on picks are shown level."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="w-12 px-4 py-2 font-medium">#</th>
                <th scope="col" className="px-2 py-2 font-medium">Player</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Correct</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">L</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">P</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Pct</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Weeks won</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Weeks in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.playerId}
                  className={
                    "border-b border-line last:border-0 hover:bg-surface-2 " +
                    (row.playerId === me?.id ? "bg-accent/10" : "")
                  }
                >
                  <td className="px-4 py-2 tabular-nums text-muted">{row.rank}</td>
                  <td className="px-2 py-2 font-semibold tracking-wide">
                    <Link
                      href={`/board?only=${row.initials}`}
                      className="underline-offset-2 hover:text-accent hover:underline"
                      title={`See ${row.initials}'s card for the current week`}
                    >
                      {row.initials}
                    </Link>
                    {row.playerId === me?.id ? (
                      <span className="ml-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-fg">
                        you
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-right text-base font-semibold tabular-nums">
                    {row.totalWins}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted">{row.totalLosses}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted">{row.totalPushes}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted">
                    {row.decided ? `${Math.round(row.winPct * 100)}%` : "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {row.weeksWon ? (
                      <span className="font-semibold text-win">{row.weeksWon}</span>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">
                    {row.weeksPlayed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {weekWinners.length ? (
        <Card>
          <CardHeader title="Weekly winners" />
          <ul className="divide-y divide-[var(--border)]">
            {weekWinners.map((w) => (
              <li key={w.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <Link href={`/board?week=${w.id}`} className="text-muted hover:text-foreground">
                  {w.label}
                </Link>
                <span className="font-semibold tracking-wide">
                  {w.winners.join(" & ") || "—"}
                </span>
                <Badge>{w.score}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
