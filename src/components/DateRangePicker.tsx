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
          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
            value.key === p.key
              ? "bg-[var(--accent)] text-black"
              : "border border-border bg-surface text-ink2 hover:bg-surface2 hover:text-ink"
          }`}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => setCustomOpen((o) => !o)}
        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
          value.key === "custom"
            ? "bg-[var(--accent)] text-black"
            : "border border-border bg-surface text-ink2 hover:bg-surface2 hover:text-ink"
        }`}
      >
        {value.key === "custom" ? `${fmtDayFull(value.from)} – ${fmtDayFull(value.to)}` : "Custom"}
      </button>
      {customOpen && (
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface2 px-2 py-1.5">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded bg-surface3 px-1.5 py-0.5 text-xs text-ink [color-scheme:dark]"
          />
          <span className="text-xs text-muted">→</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="rounded bg-surface3 px-1.5 py-0.5 text-xs text-ink [color-scheme:dark]"
          />
          <button
            onClick={() => {
              if (from && to && from <= to) {
                onChange({ key: "custom", label: "Custom", from, to });
                setCustomOpen(false);
              }
            }}
            className="rounded bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-black"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
