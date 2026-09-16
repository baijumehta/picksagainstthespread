import { eq } from "drizzle-orm";
import { db } from "@/db";
import { weeks as weeksTable } from "@/db/schema";
import {
  describeSpread, formatKickoffShort, getActiveWeek, getCurrentSeason,
  getWeekBundle, isPickVisible, listWeeks,
} from "@/lib/pool";
import { buildStandings, pickOutcome, sortStandings } from "@/lib/scoring";
import { Badge, Card, CardHeader, EmptyState, LiveDot, OutcomeCell } from "@/components/ui";
import { WeekNav } from "@/components/week-nav";
import { SetupNeeded } from "@/components/setup-needed";

export const dynamic = "force-dynamic";

export default async function BoardPage({ searchParams }: PageProps<"/board">) {
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
        <CardHeader title="Pick board" />
        <EmptyState title="No week is live yet." />
      </Card>
    );
  }

  const bundle = await getWeekBundle(activeWeek.id);
  if (!bundle) return <SetupNeeded />;

  const now = new Date();
  // Players run across the top in standings order so the board reads like a race.
  const ordered = sortStandings(
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

  const pickMap = new Map<string, "home" | "away">();
  for (const p of bundle.picks) pickMap.set(`${p.playerId}:${p.gameId}`, p.selection);

  const hiddenCount = bundle.games.filter((g) => !isPickVisible(g, now)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {activeWeek.label} pick board
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Each pick appears once its game kicks off.
            {hiddenCount ? ` ${hiddenCount} still hidden.` : ""}
          </p>
        </div>
        <WeekNav weeks={weekList} activeWeekId={activeWeek.id} basePath="/board" />
      </div>

      <Card className="overflow-hidden">
        {bundle.games.length === 0 ? (
          <EmptyState title="No games on this week yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th
                    scope="col"
                    className="grid-sticky-col min-w-[15rem] border-r border-line px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted"
                  >
                    Game
                  </th>
                  {ordered.map((row) => (
                    <th
                      key={row.playerId}
                      scope="col"
                      className="px-1.5 py-2 text-center text-xs font-semibold tracking-wide"
                    >
                      {row.initials}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bundle.games.map((game) => {
                  const visible = isPickVisible(game, now);
                  const spreadText = describeSpread(
                    game.spread,
                    game.homeAbbr ?? game.homeTeam,
                    game.awayAbbr ?? game.awayTeam,
                  );
                  return (
                    <tr key={game.id} className="border-b border-line last:border-0">
                      <th
                        scope="row"
                        className="grid-sticky-col border-r border-line px-3 py-2 text-left font-normal"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {game.awayAbbr ?? game.awayTeam} @ {game.homeAbbr ?? game.homeTeam}
                          </span>
                          {game.league === "ncaaf" ? <Badge>NCAA</Badge> : null}
                          {game.status === "in_progress" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-live">
                              <LiveDot />
                              {game.statusDetail ?? "Live"}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                          <span>{spreadText}</span>
                          <span aria-hidden>·</span>
                          {game.status === "scheduled" ? (
                            <span>{formatKickoffShort(game.kickoffAt)}</span>
                          ) : (
                            <span className="tabular-nums">
                              {game.awayScore ?? 0}–{game.homeScore ?? 0}
                              {game.status === "final" ? " F" : ""}
                            </span>
                          )}
                        </div>
                      </th>

                      {ordered.map((row) => {
                        const selection = pickMap.get(`${row.playerId}:${game.id}`) ?? null;
                        if (!visible) {
                          return (
                            <td key={row.playerId} className="px-1 py-1.5 text-center">
                              <span
                                className="text-muted"
                                title={selection ? "Pick is in, hidden until kickoff" : "No pick yet"}
                              >
                                {selection ? "•" : "–"}
                              </span>
                            </td>
                          );
                        }
                        const label = selection
                          ? selection === "home"
                            ? game.homeAbbr ?? "HOME"
                            : game.awayAbbr ?? "AWAY"
                          : "–";
                        return (
                          <td key={row.playerId} className="px-1 py-1.5">
                            <OutcomeCell outcome={pickOutcome(game, selection)} label={label} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {bundle.tiebreakerGame ? (
                  <tr className="bg-surface-2">
                    <th
                      scope="row"
                      className="grid-sticky-col border-r border-line px-3 py-2 text-left font-normal"
                      style={{ background: "var(--surface-2)" }}
                    >
                      <span className="font-medium">Tiebreaker</span>
                      <div className="mt-0.5 text-xs text-muted">
                        Combined points, {bundle.tiebreakerGame.awayAbbr ?? bundle.tiebreakerGame.awayTeam} @{" "}
                        {bundle.tiebreakerGame.homeAbbr ?? bundle.tiebreakerGame.homeTeam}
                      </div>
                    </th>
                    {ordered.map((row) => (
                      <td
                        key={row.playerId}
                        className="px-1 py-2 text-center text-sm tabular-nums"
                      >
                        {isPickVisible(bundle.tiebreakerGame!, now)
                          ? row.tiebreakerTotal ?? "–"
                          : row.tiebreakerTotal !== null
                            ? "•"
                            : "–"}
                      </td>
                    ))}
                  </tr>
                ) : null}

                <tr className="border-t-2 border-line font-semibold">
                  <th
                    scope="row"
                    className="grid-sticky-col border-r border-line px-3 py-2 text-left text-xs uppercase tracking-wide text-muted"
                  >
                    Record
                  </th>
                  {ordered.map((row) => (
                    <td key={row.playerId} className="px-1 py-2 text-center tabular-nums">
                      {row.wins}–{row.losses}
                      {row.pushes ? `–${row.pushes}` : ""}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <Legend className="bg-win-bg text-win" label="Covered ✓" />
        <Legend className="bg-loss-bg text-loss" label="Missed ✕" />
        <Legend className="bg-push-bg text-push" label="Push =" />
        <span>• = pick locked in, hidden until kickoff</span>
        <span>– = no pick</span>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className={`rounded px-2 py-0.5 font-medium ${className}`}>{label}</span>
  );
}
