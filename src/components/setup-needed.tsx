import { Card, CardHeader } from "./ui";

/** Shown instead of a stack trace when the app has not been wired up yet. */
export function SetupNeeded({ detail }: { detail?: string }) {
  return (
    <Card>
      <CardHeader
        title="Not set up yet"
        subtitle="The app is running, but it has nothing to show."
      />
      <div className="space-y-3 px-5 py-4 text-sm">
        <ol className="list-decimal space-y-1.5 pl-5 text-muted">
          <li>
            Copy <code className="rounded bg-surface-2 px-1">.env.example</code> to{" "}
            <code className="rounded bg-surface-2 px-1">.env.local</code> and set{" "}
            <code className="rounded bg-surface-2 px-1">DATABASE_URL</code>.
          </li>
          <li>
            Create the tables: <code className="rounded bg-surface-2 px-1">npm run db:push</code>
          </li>
          <li>
            Create the first admin: <code className="rounded bg-surface-2 px-1">npm run db:seed</code>
          </li>
          <li>Sign in, then add a week from the admin page.</li>
        </ol>
        {detail ? (
          <p className="rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-muted">
            {detail}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
