import Link from "next/link";

/**
 * Everyone / just-me / anyone-else switch for the pick board.
 *
 * Plain links rather than client state so the choice survives a refresh and
 * can be shared or bookmarked.
 */
export function BoardViewSwitch({
  weekId,
  players,
  selected,
  meInitials,
}: {
  weekId: number;
  players: { initials: string }[];
  /** Initials currently being shown on their own, or null for everyone. */
  selected: string | null;
  meInitials: string | null;
}) {
  const href = (only?: string) =>
    `/board?week=${weekId}${only ? `&only=${encodeURIComponent(only)}` : ""}`;

  const chip = (active: boolean) =>
    `rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
      active
        ? "border-transparent bg-accent text-accent-fg"
        : "border-line bg-surface text-muted hover:bg-surface-2 hover:text-foreground"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link href={href()} className={chip(selected === null)}>
        Everyone
      </Link>
      {meInitials ? (
        <Link href={href(meInitials)} className={chip(selected === meInitials)}>
          Just me
        </Link>
      ) : null}
      <span className="mx-1 text-xs text-muted">or</span>
      {players
        .filter((p) => p.initials !== meInitials)
        .map((p) => (
          <Link key={p.initials} href={href(p.initials)} className={chip(selected === p.initials)}>
            {p.initials}
          </Link>
        ))}
    </div>
  );
}
