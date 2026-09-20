import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth";
import { formatPhone } from "@/lib/phone";
import { Card, CardHeader } from "@/components/ui";
import { SetupNeeded } from "@/components/setup-needed";
import { PhoneForm } from "./phone-form";
import { AutoPickToggle } from "./autopick-toggle";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  let me;
  try {
    me = await getCurrentPlayer();
  } catch (err) {
    return <SetupNeeded detail={err instanceof Error ? err.message : String(err)} />;
  }
  if (!me) redirect("/login");

  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">Your details</h1>

      <Card>
        <CardHeader
          title="Never miss a week"
          subtitle="The commissioner's fallback, applied automatically."
        />
        <div className="px-5 py-4">
          <AutoPickToggle initial={me.autoPickOptedInAt !== null} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Text reminders"
          subtitle="Add your mobile and we can nudge you when you have not picked yet. Nothing is sent today — this is groundwork."
        />
        <div className="px-5 py-4">
          <PhoneForm initial={formatPhone(me.phone)} />
        </div>
      </Card>

      <Card>
        <CardHeader title="The rest" subtitle="Ask the commissioner to change these." />
        <dl className="divide-y divide-[var(--border)] text-sm">
          <div className="flex justify-between gap-4 px-5 py-2.5">
            <dt className="text-muted">Initials</dt>
            <dd className="font-semibold tracking-wide">{me.initials}</dd>
          </div>
          <div className="flex justify-between gap-4 px-5 py-2.5">
            <dt className="text-muted">Email</dt>
            <dd className="truncate">{me.email}</dd>
          </div>
        </dl>
        <p className="border-t border-line px-5 py-2.5 text-xs text-muted">
          Your initials are the only thing shown publicly.
        </p>
      </Card>
    </div>
  );
}
