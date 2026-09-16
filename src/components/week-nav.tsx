import Link from "next/link";

export function WeekNav({
  weeks,
  activeWeekId,
  basePath,
}: {
  weeks: { id: number; label: string; isPublished: boolean }[];
  activeWeekId: number;
  basePath: string;
}) {
  const visible = weeks.filter((w) => w.isPublished);
  if (visible.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((w) => {
        const active = w.id === activeWeekId;
        return (
          <Link
            key={w.id}
            href={`${basePath}?week=${w.id}`}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
              active
                ? "border-transparent bg-accent text-accent-fg"
                : "border-line bg-surface text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {w.label.replace("Week ", "Wk ")}
          </Link>
        );
      })}
    </div>
  );
}
