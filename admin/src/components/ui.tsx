// Small shared primitives: skeletons, empty/error states, badges, deltas, sparkline.

import type { ReactNode } from "react";
import { useT } from "../context/LangContext";
import { fmtNum } from "../lib/format";
import { statusTone } from "../lib/tone";
import { Pill } from "./kit";

import { Skeleton } from "@/components/ui/skeleton";
export { Skeleton };

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-2xl bg-surface p-5 shadow-[var(--shadow-soft)] space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i === 0 ? "w-1/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-surface px-6 py-8 text-center shadow-[var(--shadow-soft)]">
      <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-crit/8 text-crit">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-1-5a1 1 0 1 1 2 0v1a1 1 0 1 1-2 0v-1zm0-4a1 1 0 1 1 2 0v2a1 1 0 1 1-2 0V9z" clipRule="evenodd" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-crit">{t("Something went wrong")}</p>
      <p className="mt-1 text-xs text-ink2">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-surface3 px-4 text-xs font-medium text-ink transition-colors hover:bg-surface3/70"
        >
          {t("Try again")}
        </button>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  return (
    <Pill tone={statusTone(status)} size="sm" dot={false}>
      {status.replace(/_/g, " ").toLowerCase()}
    </Pill>
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
  const t = useT();
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="whitespace-nowrap text-sm font-semibold text-ink">{typeof children === "string" ? t(children) : children}</h2>
      {right}
    </div>
  );
}
