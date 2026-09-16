import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { weeks as weeksTable } from "@/db/schema";
import {
  formatKickoffShort, getActiveWeek, getCurrentSeason, getWeekBundle, listWeeks,
} from "@/lib/pool";
import { buildStandings, gameCover, withRanks } from "@/lib/scoring";
import { Badge, Card, CardHeader, EmptyState, LiveDot } from "@/components/ui";
import { WeekNav } from "@/components/week-nav";
import { SetupNeeded } from "@/components/setup-needed";

// Live scores change under us, so never serve this from cache.
export const dynamic = "force-dynamic";

export default async function StandingsPage({
  searchParams,
}: PageProps<"/">) {
  const params = await searchParams;

  let season, weekList, activeWeek;
  let loadError: string | null = null;
  try {
    season = await getCurrentSeason();
    if (season) {
      weekList = await listWeeks(season.id);
      const requested = Number(params.week);
      activeWeek = Number.isFinite(requested) && requested > 0
        ? (await db.query.weeks.findFirst({ where: eq(weeksTable.id, requested) })) ?? null
        : await getActiveWeek(season.id);
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }
  if (loadError) return <SetupNeeded detail={loadError} />;
  if (!season || !weekList) return <SetupNeeded />;

  if (!activeWeek || !activeWeek.isPublished) {
    return (
      <Card>
        <CardHeader title={`${season.year} season`} />
        <EmptyState title="No week is live yet.">
          Once the week is published, standings show up here.
        </EmptyState>
      </Card>
    );
  }

  const bundle = await getWeekBundle(activeWeek.id);
  if (!bundle) return <SetupNeeded />;

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
        <WeekNav weeks={weekList} activeWeekId={activeWeek.id} basePath="/" />
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
                    className="border-b border-line last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-2 tabular-nums text-muted">{row.rank}</td>
                    <td className="px-2 py-2 font-semibold tracking-wide">
                      {row.initials}
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
    <div className="flex gap-3 overflow-x-auto pb-1">
      {games.map((g) => {
        const cover = gameCover(g as never);
        return (
          <div
            key={g.id}
            className="min-w-[13rem] shrink-0 rounded-xl border border-line bg-surface px-3 py-2.5"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-live">
                <LiveDot /> {g.statusDetail ?? "Live"}
              </span>
              {g.league === "ncaaf" ? <Badge>NCAA</Badge> : null}
            </div>
            <ScoreLine
              label={g.awayAbbr ?? g.awayTeam}
              score={g.awayScore}
              covering={cover === "away"}
            />
            <ScoreLine
              label={g.homeAbbr ?? g.homeTeam}
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
  label, score, covering,
}: {
  label: string; score: number | null; covering: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className={covering ? "font-semibold" : "text-muted"}>
        {label}
        {covering ? <span className="ml-1 text-xs text-win">cov</span> : null}
      </span>
      <span className="font-semibold tabular-nums">{score ?? 0}</span>
    </div>
  );
}
