import Link from "next/link";
import { after } from "next/server";
import { formatClock, formatKickoffShort, sideLine } from "@/lib/format";
import { loadWeekView } from "@/lib/pool";
import { buildStandings, gameCover, withRanks } from "@/lib/scoring";
import { Badge, Card, CardHeader, EmptyState, LiveDot } from "@/components/ui";
import { WeekNav } from "@/components/week-nav";
import { SetupNeeded } from "@/components/setup-needed";
import { LiveRefresh } from "@/components/live-refresh";
import { refreshScoresIfStale } from "@/lib/sync";
import { getCurrentPlayer } from "@/lib/auth";

// Live scores change under us, so never serve this from cache.
export const dynamic = "force-dynamic";

export default async function StandingsPage({
  searchParams,
}: PageProps<"/">) {
  const params = await searchParams;

  const requested = Number(params.week);
  let view: Awaited<ReturnType<typeof loadWeekView>> = null;
  let loadError: string | null = null;
  try {
    view = await loadWeekView(
      Number.isFinite(requested) && requested > 0 ? requested : undefined,
    );
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }
  if (loadError) return <SetupNeeded detail={loadError} />;
  if (!view) return <SetupNeeded />;

  const { season, weekList, week: activeWeek } = view;

  if (!activeWeek) {
    return (
      <Card>
        <CardHeader title={`${season.year} season`} />
        <EmptyState title="No week is live yet.">
          Once the week is published, standings show up here.
        </EmptyState>
      </Card>
    );
  }

  // Top up scores after the response has gone out. ESPN can take seconds and
  // nobody should wait on it; the fresh numbers land before the next render.
  after(async () => {
    await refreshScoresIfStale(activeWeek.id, 120_000, {
      scoresSyncedAt: activeWeek.scoresSyncedAt,
      games: view.games,
    });
  });

  const bundle = view;
  // Who is looking, so their own row can be picked out of 28.
  const me = await getCurrentPlayer().catch(() => null);

  const rows = withRanks(
    buildStandings({
      players: bundle.players.map((p) => ({ id: p.id, initials: p.initials })),
      games: bundle.games,
      picks: bundle.picks.map((p) => ({
        playerId: p.playerId, gameId: p.gameId, selection: p.selection,
      })),
      entries: bundle.entries.map((e) => ({
        playerId: e.playerId, tiebreakerTotal: e.tiebreakerTotal,
      })),
      tiebreakerGame: bundle.tiebreakerGame,
    }),
  );

  const liveGames = bundle.games.filter((g) => g.status === "in_progress");
  const finalCount = bundle.games.filter((g) => g.status === "final").length;
  const tb = bundle.tiebreakerGame;
  const tbActual =
    tb?.status === "final" && tb.homeScore !== null && tb.awayScore !== null
      ? tb.homeScore + tb.awayScore
      : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {activeWeek.label} standings
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {season.year} season · {finalCount} of {bundle.games.length} games final
            {liveGames.length ? (
              <>
                {" · "}
                <span className="inline-flex items-center gap-1 font-medium text-live">
                  <LiveDot /> {liveGames.length} live
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveRefresh
            active={liveGames.length > 0}
            syncedAtLabel={activeWeek.scoresSyncedAt ? formatClock(activeWeek.scoresSyncedAt) : null}
          />
          <WeekNav weeks={weekList} activeWeekId={activeWeek.id} basePath="/" />
        </div>
      </div>

      {liveGames.length ? <LiveStrip games={liveGames} /> : null}

      <Card>
        <CardHeader
          title="Standings"
          subtitle={
            liveGames.length
              ? "Proj. counts picks currently covering in games underway."
              : undefined
          }
          action={
            <Link
              href={`/board?week=${activeWeek.id}`}
              className="text-sm font-medium text-accent hover:underline"
            >
              See every pick →
            </Link>
          }
        />
        {rows.length === 0 ? (
          <EmptyState title="Nobody is in the pool yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="w-12 px-4 py-2 font-medium">#</th>
                  <th scope="col" className="px-2 py-2 font-medium">Player</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">W</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">L</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">P</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Proj.</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Left</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Tiebreak
                  </th>
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
                        href={`/board?week=${activeWeek.id}&only=${row.initials}`}
                        className="underline-offset-2 hover:text-accent hover:underline"
                        title={`See ${row.initials}'s card`}
                      >
                        {row.initials}
                      </Link>
                      {row.playerId === me?.id ? (
                        <span className="ml-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-fg">
                          you
                        </span>
                      ) : null}
                      {row.pickCount < bundle.games.length ? (
                        <span
                          className="ml-2 text-xs font-normal text-muted"
                          title={`${bundle.games.length - row.pickCount} games with no pick`}
                        >
                          {row.pickCount}/{bundle.games.length}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">{row.wins}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted">{row.losses}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted">{row.pushes}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {row.liveAhead ? (
                        <span className="font-semibold text-live">{row.projected}</span>
                      ) : (
                        <span className="text-muted">{row.projected}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted">{row.remaining}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted">
                      {row.tiebreakerTotal === null ? (
                        "—"
                      ) : row.tiebreakerDiff === null ? (
                        row.tiebreakerTotal
                      ) : (
                        <>
                          {row.tiebreakerTotal}{" "}
                          <span className="text-xs">(off {row.tiebreakerDiff})</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tb ? (
          <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
            Tiebreaker: combined points in {tb.awayTeam} at {tb.homeTeam}
            {tbActual !== null ? ` — finished on ${tbActual}` : ` (${formatKickoffShort(tb.kickoffAt)})`}.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function LiveStrip({
  games,
}: {
  games: {
    id: string; awayAbbr: string | null; awayTeam: string; homeAbbr: string | null;
    homeTeam: string; awayScore: number | null; homeScore: number | null;
    statusDetail: string | null; spread: string | null; league: string;
  }[];
}) {
  return (
    // Stacked rather than a side-scrolling strip: a full Sunday puts eight or
    // more games up at once, and nobody should have to swipe to find one.
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {games.map((g) => {
        const cover = gameCover(g as never);
        return (
          <div
            key={g.id}
            className="rounded-xl border border-line bg-surface px-3 py-2.5"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-live">
                <LiveDot /> {g.statusDetail ?? "Live"}
              </span>
              {g.league === "ncaaf" ? <Badge>NCAA</Badge> : null}
            </div>
            <ScoreLine
              label={g.awayAbbr ?? g.awayTeam}
              line={sideLine(g.spread, "away")}
              score={g.awayScore}
              covering={cover === "away"}
            />
            <ScoreLine
              label={g.homeAbbr ?? g.homeTeam}
              line={sideLine(g.spread, "home")}
              score={g.homeScore}
              covering={cover === "home"}
            />
          </div>
        );
      })}
    </div>
  );
}

function ScoreLine({
  label, line, score, covering,
}: {
  label: string; line: string; score: number | null; covering: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className={covering ? "font-semibold" : "text-muted"}>
        {label}
        <span className="ml-1 text-xs font-normal tabular-nums text-muted">{line}</span>
        {covering ? <span className="ml-1 text-xs text-win">cov</span> : null}
      </span>
      <span className="font-semibold tabular-nums">{score ?? 0}</span>
    </div>
  );
}
