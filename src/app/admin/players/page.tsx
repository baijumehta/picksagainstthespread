import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { players as playersTable } from "@/db/schema";
import { getCurrentPlayer } from "@/lib/auth";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { SetupNeeded } from "@/components/setup-needed";
import { PlayersManager } from "./players-manager";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  let me;
  try {
    me = await getCurrentPlayer();
  } catch (err) {
    return <SetupNeeded detail={err instanceof Error ? err.message : String(err)} />;
  }
  if (!me) redirect("/login");
  if (!me.isAdmin) {
    return (
      <Card>
        <CardHeader title="Players" />
        <EmptyState title="This page is for the commissioner only." />
      </Card>
    );
  }

  const all = await db.query.players.findMany({ orderBy: [asc(playersTable.initials)] });

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin" className="text-sm text-muted hover:text-foreground">
          &larr; Admin
        </Link>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight">Players</h1>
      </div>

      <Card>
        <CardHeader
          title={`${all.filter((p) => p.isActive).length} active`}
          subtitle="Only these people can sign in. Everything public shows initials only."
        />
        <div className="px-3 py-4 sm:px-5">
          <PlayersManager
            players={all.map((p) => ({
              id: p.id,
              initials: p.initials,
              fullName: p.fullName,
              email: p.email,
              phone: p.phone,
              isAdmin: p.isAdmin,
              isActive: p.isActive,
            }))}
          />
        </div>
      </Card>
    </div>
  );
}
