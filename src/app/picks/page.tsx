import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { weeks as weeksTable } from "@/db/schema";
import { getCurrentPlayer } from "@/lib/auth";
import {
  formatKickoff, getActiveWeek, getCurrentSeason, getWeekBundle, isLocked, listWeeks,
} from "@/lib/pool";
import { myPicksForWeek } from "../actions/picks";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { WeekNav } from "@/components/week-nav";
import { SetupNeeded } from "@/components/setup-needed";
import { PickForm, type PickFormGame } from "./pick-form";

export const dynamic = "force-dynamic";

export default async function PicksPage({ searchParams }: PageProps<"/picks">) {
  const params = await searchParams;

  let player;
  try {
    player = await getCurrentPlayer();
  } catch (err) {
    return <SetupNeeded detail={err instanceof Error ? err.message : String(err)} />;
  }
  if (!player) redirect("/login");

  const season = await getCurrentSeason();
  if (!season) return <SetupNeeded />;

  const weekList = await listWeeks(season.id);
  const requested = Number(params.week);
  const activeWeek =
    Number.isFinite(requested) && requested > 0
      ? (await db.query.weeks.findFirst({ where: eq(weeksTable.id, requested) })) ?? null
      : await getActiveWeek(season.id);

  if (!activeWeek || !activeWeek.isPublished) {
    return (
      <Card>
        <CardHeader title="My picks" />
        <EmptyState title="No week is open yet.">
          You will be able to enter picks as soon as the week is published.
        </EmptyState>
      </Card>
    );
  }

  const bundle = await getWeekBundle(activeWeek.id);
  if (!bundle) return <SetupNeeded />;

  const { picks: mine, entry } = await myPicksForWeek(activeWeek.id);
  const now = new Date();

  const initialSelections: Record<string, "home" | "away"> = {};
  for (const p of mine) initialSelections[p.gameId] = p.selection;

  const formGames: PickFormGame[] = bundle.games.map((g) => ({
    id: g.id,
    league: g.league,
    awayTeam: g.awayTeam,
    awayAbbr: g.awayAbbr,
    homeTeam: g.homeTeam,
    homeAbbr: g.homeAbbr,
    spread: g.spread,
    kickoffLabel: formatKickoff(g.kickoffAt),
    locked: isLocked(g, now),
    status: g.status,
    statusDetail: g.statusDetail,
    awayScore: g.awayScore,
    homeScore: g.homeScore,
    isTiebreaker: g.id === activeWeek.tiebreakerGameId,
  }));

  const tb = bundle.tiebreakerGame;
  const openCount = formGames.filter((g) => !g.locked).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {activeWeek.label} — your picks
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Each game locks at its own kickoff. You can change a pick any time before then.
          </p>
        </div>
        <WeekNav weeks={weekList} activeWeekId={activeWeek.id} basePath="/picks" />
      </div>

      {openCount === 0 ? (
        <Card>
          <CardHeader title="This week is closed" />
          <EmptyState title="Every game has kicked off.">
            <Link href={`/board?week=${activeWeek.id}`} className="text-accent hover:underline">
              See how everyone did →
            </Link>
          </EmptyState>
        </Card>
      ) : null}

      {bundle.games.length === 0 ? (
        <Card>
          <EmptyState title="No games on this week yet." />
        </Card>
      ) : (
        <PickForm
          weekId={activeWeek.id}
          games={formGames}
          initialSelections={initialSelections}
          initialTiebreaker={entry?.tiebreakerTotal ?? null}
          tiebreakerLocked={tb ? isLocked(tb, now) : true}
          tiebreakerLabel={tb ? `${tb.awayTeam} at ${tb.homeTeam}` : null}
        />
      )}
    </div>
  );
}
