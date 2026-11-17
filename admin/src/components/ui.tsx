// Small shared primitives: skeletons, empty/error states, badges, deltas, sparkline.

import type { ReactNode } from "react";
import { fmtNum } from "../lib/format";

import { Skeleton } from "@/components/ui/skeleton";
export { Skeleton };

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)] p-4 space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i === 0 ? "w-1/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border2 bg-surface px-6 py-10 text-center">
      <div className="mb-2 text-2xl opacity-60">📭</div>
      <p className="text-sm font-medium text-ink2">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-crit/30 bg-crit/5 px-6 py-8 text-center">
      <p className="text-sm font-medium text-crit">Something went wrong</p>
      <p className="mt-1 text-xs text-ink2">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-border2 bg-surface px-4 text-xs font-medium text-ink hover:bg-surface3"
        >
          Try again
        </button>
      )}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-good/15 text-good",
  PAUSED: "bg-warn/15 text-warn",
  ARCHIVED: "bg-muted/15 text-muted",
  DELETED: "bg-crit/15 text-crit",
  CAMPAIGN_PAUSED: "bg-warn/15 text-warn",
  ADSET_PAUSED: "bg-warn/15 text-warn",
};

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const style = STATUS_STYLES[status] ?? "bg-muted/15 text-ink2";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold tracking-wide ${style}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function SeverityDot({ severity }: { severity: string }) {
  return (
    <span
      className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${severity === "critical" ? "bg-crit" : "bg-warn"}`}
      title={severity}
    />
  );
}

/**
 * Delta vs previous period. `direction`:
 *  - "higher-better" (results, CTR, reach) — up is green
 *  - "lower-better"  (CPR, CPM) — down is green
 *  - "neutral"       (spend, frequency) — informational gray
 */
export function Delta({
  current,
  previous,
  direction = "higher-better",
  className = "",
}: {
  current: number | null | undefined;
  previous: number | null | undefined;
  direction?: "higher-better" | "lower-better" | "neutral";
  className?: string;
}) {
  if (current == null || previous == null || previous === 0) {
    return <span className={`text-xs text-muted ${className}`}>–</span>;
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (!isFinite(pct)) return <span className={`text-xs text-muted ${className}`}>–</span>;
  const up = pct >= 0;
  const color =
    direction === "neutral"
      ? "text-ink2"
      : (direction === "lower-better" ? !up : up)
        ? "text-good"
        : "text-crit";
  return (
    <span className={`tnum inline-flex items-center gap-0.5 text-xs font-medium ${color} ${className}`}>
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {fmtNum(Math.abs(pct), 1)}%
    </span>
  );
}

/** Tiny spend sparkline (admin client cards). */
export function Sparkline({ points, color = "var(--accent)" }: { points: number[]; color?: string }) {
  if (points.length < 2) return <div className="h-8" />;
  const w = 120;
  const h = 32;
  const max = Math.max(...points, 1);
  const step = w / (points.length - 1);
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="whitespace-nowrap text-sm font-semibold text-ink">{children}</h2>
      {right}
    </div>
  );
}
