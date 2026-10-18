import { Delta, Skeleton } from "./ui";

export function KpiCard({
  label,
  value,
  current,
  previous,
  direction,
  loading,
}: {
  label: string;
  value: string;
  current: number | null | undefined;
  previous: number | null | undefined;
  direction: "higher-better" | "lower-better" | "neutral";
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-3.5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2 h-6 w-24" />
        <Skeleton className="mt-2 h-3 w-12" />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-surface p-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="tnum mt-1 truncate text-xl font-semibold text-ink" title={value}>
        {value}
      </p>
      <div className="mt-1">
        <Delta current={current} previous={previous} direction={direction} />
        <span className="ml-1 text-[10px] text-muted">vs prev.</span>
      </div>
    </div>
  );
}
