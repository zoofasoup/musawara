import { useState } from "react";
import { presets, type DateRange } from "../lib/dates";
import { fmtDayFull } from "../lib/format";

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets().map((p) => (
        <button
          key={p.key}
          onClick={() => {
            setCustomOpen(false);
            onChange(p);
          }}
          className={`inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium transition-colors ${
            value.key === p.key
              ? "bg-[var(--accent)] text-[var(--on-accent)]"
              : "border border-border bg-surface text-ink2 hover:bg-surface2 hover:text-ink"
          }`}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => setCustomOpen((o) => !o)}
        className={`inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium ${
          value.key === "custom"
            ? "bg-[var(--accent)] text-[var(--on-accent)]"
            : "border border-border bg-surface text-ink2 hover:bg-surface2 hover:text-ink"
        }`}
      >
        {value.key === "custom" ? `${fmtDayFull(value.from)} – ${fmtDayFull(value.to)}` : "Custom"}
      </button>
      {customOpen && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface2 px-2 py-1.5">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="min-h-11 rounded-lg border border-border2 bg-surface px-2 text-xs text-ink"
          />
          <span className="text-xs text-muted">→</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="min-h-11 rounded-lg border border-border2 bg-surface px-2 text-xs text-ink"
          />
          <button
            onClick={() => {
              if (from && to && from <= to) {
                onChange({ key: "custom", label: "Custom", from, to });
                setCustomOpen(false);
              }
            }}
            className="inline-flex min-h-11 items-center rounded-lg bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--on-accent)]"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
