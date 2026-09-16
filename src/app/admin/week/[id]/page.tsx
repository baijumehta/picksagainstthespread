import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth";
import { formatKickoff, getWeekBundle, isLocked } from "@/lib/pool";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { SetupNeeded } from "@/components/setup-needed";
import { WeekActions } from "../../week-actions";
import { GamesTable, type AdminGameRow } from "../../games-table";
import { CollegePicker } from "../../college-picker";
import { AdminPickGrid, type GridGame, type GridPlayer } from "../../admin-pick-grid";

export const dynamic = "force-dynamic";

export default async function AdminWeekPage({ params }: PageProps<"/admin/week/[id]">) {
  const { id } = await params;
  const weekId = Number(id);
  if (!Number.isFinite(weekId)) notFound();

  let player;
  try {
    player = await getCurrentPlayer();
  } catch (err) {
    return <SetupNeeded detail={err instanceof Error ? err.message : String(err)} />;
  }
  if (!player) redirect("/login");
  if (!player.isAdmin) {
    return (
      <Card>
        <CardHeader title="Admin" />
        <EmptyState title="This page is for the commissioner only." />
      </Card>
    );
  }

  const bundle = await getWeekBundle(weekId);
  if (!bundle) notFound();

  const now = new Date();
  const { week, games, players, picks, entries } = bundle;

  const gameRows: AdminGameRow[] = games.map((g) => ({
    id: g.id,
    league: g.league,
    label: `${g.awayTeam} at ${g.homeTeam}`,
    homeLabel: g.homeAbbr ?? g.homeTeam,
    awayLabel: g.awayAbbr ?? g.awayTeam,
    spread: g.spread,
    spreadIsManual: g.spreadIsManual,
    kickoffLabel: formatKickoff(g.kickoffAt),
    locked: isLocked(g, now),
    status: g.status,
    statusDetail: g.statusDetail,
    awayScore: g.awayScore,
    homeScore: g.homeScore,
    isTiebreaker: g.id === week.tiebreakerGameId,
  }));

  const pickMap: Record<string, "home" | "away"> = {};
  const editedMap: Record<string, boolean> = {};
  for (const p of picks) {
    pickMap[`${p.playerId}:${p.gameId}`] = p.selection;
    if (p.editedByAdmin) editedMap[`${p.playerId}:${p.gameId}`] = true;
  }

  const gridGames: GridGame[] = games.map((g) => ({
    id: g.id,
    shortLabel: `${g.awayAbbr ?? g.awayTeam} @ ${g.homeAbbr ?? g.homeTeam}`,
    homeAbbr: g.homeAbbr ?? "HOME",
    awayAbbr: g.awayAbbr ?? "AWAY",
    locked: isLocked(g, now),
    league: g.league,
  }));

  const gridPlayers: GridPlayer[] = players.map((p) => ({
    id: p.id,
    initials: p.initials,
    missing: games.filter((g) => !pickMap[`${p.id}:${g.id}`]).length,
  }));

  const tiebreakers: Record<string, number | null> = {};
  for (const e of entries) tiebreakers[e.playerId] = e.tiebreakerTotal;

  const tb = bundle.tiebreakerGame;
  const missingAny = gridPlayers.filter((p) => p.missing > 0);
  const nextSaturday = upcomingSaturday(games[0]?.kickoffAt ?? now);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm text-muted hover:text-foreground">
            ← All weeks
          </Link>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight">
            {week.label}{" "}
            <span className="text-sm font-normal text-muted">
              {week.isPublished ? "· live" : "· draft"}
            </span>
          </h1>
        </div>
        <Link
          href={`/board?week=${week.id}`}
          className="text-sm font-medium text-accent hover:underline"
        >
          View public board →
        </Link>
      </div>

      <Card>
        <CardHeader title="Week actions" />
        <div className="px-5 py-4">
          <WeekActions
            weekId={week.id}
            isPublished={week.isPublished}
            tiebreakerGameId={week.tiebreakerGameId}
            games={games.map((g) => ({
              id: g.id,
              label: `${g.awayAbbr ?? g.awayTeam} @ ${g.homeAbbr ?? g.homeTeam}`,
            }))}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title={`Games and lines (${games.length})`}
          subtitle="Spreads come from the book; type over any of them to use your own."
        />
        <div className="px-3 py-4 sm:px-5">
          {games.length === 0 ? (
            <EmptyState title="No games yet.">
              Use &quot;Re-import NFL slate&quot; above, or add college games below.
            </EmptyState>
          ) : (
            <GamesTable games={gameRows} />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Add college games"
          subtitle="For bye weeks, when the NFL card comes up short."
        />
        <div className="px-5 py-4">
          <CollegePicker weekId={week.id} defaultDate={nextSaturday} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Everyone's picks"
          subtitle={
            missingAny.length
              ? `Still missing picks: ${missingAny.map((p) => `${p.initials} (${p.missing})`).join(", ")}`
              : "Everybody is in."
          }
        />
        <div className="px-3 py-4 sm:px-5">
          {players.length === 0 ? (
            <EmptyState title="No players yet.">
              <Link href="/admin/players" className="text-accent hover:underline">
                Add some players →
              </Link>
            </EmptyState>
          ) : games.length === 0 ? (
            <EmptyState title="Add games first." />
          ) : (
            <AdminPickGrid
              weekId={week.id}
              games={gridGames}
              players={gridPlayers}
              picks={pickMap}
              adminEdited={editedMap}
              tiebreakers={tiebreakers}
              tiebreakerLabel={tb ? `${tb.awayAbbr ?? tb.awayTeam} @ ${tb.homeAbbr ?? tb.homeTeam}` : null}
            />
          )}
        </div>
      </Card>
    </div>
  );
}

/** Default the college search to the Saturday of this week's slate. */
function upcomingSaturday(from: Date): string {
  const d = new Date(from);
  const day = d.getUTCDay();
  const delta = (6 - day + 7) % 7; // 6 = Saturday
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
