import { Delta, Skeleton } from "./ui";
import { Nested } from "./kit";

export function KpiCard({
  label,
  value,
  current,
  previous,
  direction,
  loading,
  flat,
  bare,
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
  /** One of several stats inside a shared card: just label and number, no box of its own. */
  bare?: boolean;
  /** One short line under the delta, e.g. "Target Rp 1 jt", coloured by `tone`. */
  note?: { text: string; tone?: "good" | "crit" | "muted" };
  /** The comparison period's value, formatted, shown as "vs Rp 24.103.000". */
  previousText?: string;
  /** false = comparison switched off: no delta line. */
  compare?: boolean;
}) {
  const box = "border-b border-r border-border bg-surface px-3.5 py-3";
  const body = loading ? (
    <>
      <Skeleton className="h-6 w-24" />
      <Skeleton className="mt-2 h-3 w-12" />
    </>
  ) : (
    <>
      {/* never truncate a number: long amounts get a smaller size, and may wrap after "Rp" on narrow cards */}
      <p className={`tnum font-semibold leading-tight text-ink ${value.length > 15 ? "text-base" : value.length > 12 ? "text-lg" : "text-xl"}`} title={value}>
        {value}
      </p>
      {compare && (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-1">
          <Delta current={current} previous={previous} direction={direction} />
          <span className="tnum text-xs text-muted">{previousText ? `vs ${previousText}` : "vs prev."}</span>
        </div>
      )}
      {note && (
        <p className={`mt-1 text-xs font-medium ${note.tone === "good" ? "text-good" : note.tone === "crit" ? "text-crit" : "text-muted"}`}>{note.text}</p>
      )}
    </>
  );
  if (bare) {
    return (
      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium text-muted">{label}</p>
        {body}
      </div>
    );
  }
  // The report strip (printed) keeps joined cells; everywhere else a stat is a nested card.
  if (flat) {
    return (
      <div className={box}>
        <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
        <div className="mt-1">{body}</div>
      </div>
    );
  }
  return <Nested title={label}>{body}</Nested>;
}
