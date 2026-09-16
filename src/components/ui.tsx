import type { ReactNode } from "react";
import type { PickOutcome } from "@/lib/scoring";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-line bg-surface shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children ? (
        <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>
      ) : null}
    </div>
  );
}

/** Small status chip. */
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "win" | "loss" | "push" | "live" | "accent";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-surface-2 text-muted border-line",
    win: "bg-win-bg text-win border-transparent",
    loss: "bg-loss-bg text-loss border-transparent",
    push: "bg-push-bg text-push border-transparent",
    live: "bg-push-bg text-live border-transparent",
    accent: "bg-accent text-accent-fg border-transparent",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function LiveDot() {
  return (
    <span
      aria-hidden
      className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-live"
    />
  );
}

/**
 * One cell in the public pick grid. Colour carries the outcome, but every
 * state also carries a text label or symbol so it does not rely on colour
 * alone.
 */
export function OutcomeCell({
  outcome,
  label,
}: {
  outcome: PickOutcome;
  label: string;
}) {
  const styles: Record<PickOutcome, string> = {
    win: "bg-win-bg text-win font-semibold",
    loss: "bg-loss-bg text-loss line-through decoration-1 opacity-80",
    push: "bg-push-bg text-push",
    "live-ahead": "bg-win-bg/60 text-win font-medium",
    "live-behind": "bg-loss-bg/50 text-loss",
    pending: "text-foreground",
  };
  const suffix: Partial<Record<PickOutcome, string>> = {
    win: " ✓",
    loss: " ✕",
    push: " =",
  };
  return (
    <span
      className={`inline-block w-full rounded px-1.5 py-1 text-center text-sm ${styles[outcome]}`}
      title={outcomeLabel(outcome)}
    >
      {label}
      {suffix[outcome] ?? ""}
    </span>
  );
}

export function outcomeLabel(outcome: PickOutcome): string {
  switch (outcome) {
    case "win": return "Covered";
    case "loss": return "Did not cover";
    case "push": return "Push";
    case "live-ahead": return "Currently covering";
    case "live-behind": return "Currently not covering";
    default: return "Not started";
  }
}

export function Button({
  children,
  variant = "secondary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  const variants: Record<string, string> = {
    primary: "bg-accent text-accent-fg hover:opacity-90 border-transparent",
    secondary: "bg-surface hover:bg-surface-2 border-line",
    ghost: "bg-transparent hover:bg-surface-2 border-transparent",
    danger: "bg-transparent text-loss hover:bg-loss-bg border-line",
  };
  const sizes: Record<string, string> = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-3.5 py-2 text-sm",
  };
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

export function Notice({
  tone,
  children,
}: {
  tone: "ok" | "error" | "info";
  children: ReactNode;
}) {
  const tones = {
    ok: "bg-win-bg text-win",
    error: "bg-loss-bg text-loss",
    info: "bg-surface-2 text-muted",
  };
  return (
    <p className={`rounded-lg px-3 py-2 text-sm ${tones[tone]}`} role="status">
      {children}
    </p>
  );
}
