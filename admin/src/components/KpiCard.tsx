import { Delta, Skeleton } from "./ui";

export function KpiCard({
  label,
  value,
  current,
  previous,
  direction,
  loading,
  flat,
  note,
  previousText,
  compare = true,
}: {
  label: string;
  value: string;
  current: number | null | undefined;
  previous: number | null | undefined;
  direction: "higher-better" | "lower-better" | "neutral";
  loading?: boolean;
  /** Cell inside a metrics strip: no own border/radius, the strip draws the dividers. */
  flat?: boolean;
  /** One short line under the delta, e.g. "Target Rp 1 jt", coloured by `tone`. */
  note?: { text: string; tone?: "good" | "crit" | "muted" };
  /** The comparison period's value, formatted, shown as "vs Rp 24.103.000". */
  previousText?: string;
  /** false = comparison switched off: no delta line. */
  compare?: boolean;
}) {
  const box = flat
    ? "border-b border-r border-border bg-surface px-3.5 py-3"
    : "rounded-xl border border-border bg-surface p-3.5";
  if (loading) {
    return (
      <div className={box}>
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2 h-6 w-24" />
        <Skeleton className="mt-2 h-3 w-12" />
      </div>
    );
  }
  return (
    <div className={box}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      {/* never truncate a number: long amounts get a smaller size, and may wrap after "Rp" on narrow cards */}
      <p className={`tnum mt-1 font-semibold leading-tight text-ink ${value.length > 15 ? "text-base" : value.length > 12 ? "text-lg" : "text-xl"}`} title={value}>
        {value}
      </p>
      {compare && (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-1">
          <Delta current={current} previous={previous} direction={direction} />
          <span className="tnum text-[10px] text-muted">{previousText ? `vs ${previousText}` : "vs prev."}</span>
        </div>
      )}
      {note && (
        <p className={`mt-1 text-[11px] font-medium ${note.tone === "good" ? "text-good" : note.tone === "crit" ? "text-crit" : "text-muted"}`}>{note.text}</p>
      )}
    </div>
  );
}
