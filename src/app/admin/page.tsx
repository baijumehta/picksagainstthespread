import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth";
import { getCurrentSeason, listWeeks } from "@/lib/pool";
import { db } from "@/db";
import { games as gamesTable, players as playersTable } from "@/db/schema";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { SetupNeeded } from "@/components/setup-needed";
import { NewWeekForm, NewSeasonForm } from "./new-forms";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
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

  const season = await getCurrentSeason();
  const weekList = season ? await listWeeks(season.id) : [];
  const allGames = await db
    .select({ weekId: gamesTable.weekId, status: gamesTable.status, spread: gamesTable.spread })
    .from(gamesTable);
  const allPlayers = await db.select({ isActive: playersTable.isActive }).from(playersTable);
  const activeCount = allPlayers.filter((p) => p.isActive).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Commissioner</h1>
        <Link
          href="/admin/players"
          className="text-sm font-medium text-accent hover:underline"
        >
          Manage players ({activeCount}) →
        </Link>
      </div>

      {!season ? (
        <Card>
          <CardHeader title="Start a season" subtitle="Nothing exists yet." />
          <div className="px-5 py-4">
            <NewSeasonForm defaultYear={new Date().getFullYear()} />
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader
              title={`${season.year} weeks`}
              subtitle="Publish a week to open it for picks."
            />
            {weekList.length === 0 ? (
              <EmptyState title="No weeks yet.">
                Add one below and the NFL schedule comes in automatically.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {weekList.map((w) => {
                  const wg = allGames.filter((g) => g.weekId === w.id);
                  const finals = wg.filter((g) => g.status === "final").length;
                  const noLine = wg.filter((g) => g.spread === null).length;
                  return (
                    <li key={w.id}>
                      <Link
                        href={`/admin/week/${w.id}`}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-surface-2"
                      >
                        <span className="font-medium">{w.label}</span>
                        {w.isPublished ? (
                          <Badge tone="win">live</Badge>
                        ) : (
                          <Badge>draft</Badge>
                        )}
                        <span className="text-sm text-muted">
                          {wg.length} games · {finals} final
                        </span>
                        {noLine > 0 ? (
                          <Badge tone="push">{noLine} without a line</Badge>
                        ) : null}
                        {!w.tiebreakerGameId ? <Badge tone="push">no tiebreaker</Badge> : null}
                        <span className="ml-auto text-sm text-accent">Open →</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="border-t border-line px-5 py-4">
              <NewWeekForm
                seasonId={season.id}
                suggestedWeek={nextWeekNumber(weekList.map((w) => w.weekNumber))}
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Score polling"
              subtitle="Live scores come from ESPN. Point a scheduler at this while games are on."
            />
            <div className="space-y-2 px-5 py-4 text-sm">
              <code className="block break-all rounded-lg bg-surface-2 px-3 py-2 text-xs">
                GET /api/cron/scores?secret=$CRON_SECRET
              </code>
              <p className="text-muted">
                On Vercel the included <code>vercel.json</code> runs it every minute and sends the
                secret automatically. You can also hit &quot;Refresh scores&quot; on any week.
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function nextWeekNumber(existing: number[]): number {
  for (let i = 1; i <= 18; i++) if (!existing.includes(i)) return i;
  return 1;
}
