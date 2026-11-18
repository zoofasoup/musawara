// Ads Manager-style date control: one button, and a popover with presets on
// the left and a range calendar on the right. Picking a preset or two days
// only changes the draft; "Update" applies it. Bottom sheet on phones.

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../context/LangContext";
import { presets, todayJakarta, type DateRange } from "../lib/dates";
import { fmtDay, fmtDayFull } from "../lib/format";

function rangeText(from: string, to: string): string {
  if (from === to) return fmtDayFull(from);
  return from.slice(0, 4) === to.slice(0, 4) ? `${fmtDay(from)} – ${fmtDayFull(to)}` : `${fmtDayFull(from)} – ${fmtDayFull(to)}`;
}

const monthOf = (ymd: string) => ymd.slice(0, 7); // YYYY-MM
const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

const monthTitle = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" });
// 2024-01-01 was a Monday: weeks start on Monday.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => weekday.format(new Date(Date.UTC(2024, 0, 1 + i))));

/** Day cells for a month: leading nulls pad to Monday. */
function monthCells(ym: string): Array<string | null> {
  const [y, m] = ym.split("-").map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`),
  ];
}

function useWide(query: string): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return wide;
}

function Month({
  ym,
  today,
  from,
  to,
  hover,
  onPick,
  onHover,
}: {
  ym: string;
  today: string;
  from: string | null;
  to: string | null;
  hover: string | null;
  onPick: (d: string) => void;
  onHover: (d: string | null) => void;
}) {
  // While only the start is chosen, preview the range up to the hovered day.
  const end = to ?? (from && hover && hover >= from ? hover : null);
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-center text-[13px] font-medium capitalize text-ink">
        {monthTitle.format(new Date(`${ym}-01T00:00:00Z`))}
      </p>
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1 text-center text-xs uppercase text-muted">
            {w}
          </span>
        ))}
        {monthCells(ym).map((d, i) => {
          if (!d) return <span key={`b${i}`} />;
          const disabled = d > today;
          const isStart = d === from;
          const isEnd = d === end;
          const inRange = from != null && end != null && d > from && d < end;
          const band =
            inRange || (isStart && end && end !== from) || (isEnd && from && end !== from)
              ? `bg-[color-mix(in_srgb,var(--accent)_14%,white)] ${isStart ? "rounded-l-full" : ""} ${isEnd ? "rounded-r-full" : ""}`
              : "";
          return (
            <div key={d} className={band}>
              <button
                disabled={disabled}
                onClick={() => onPick(d)}
                onMouseEnter={() => onHover(d)}
                onMouseLeave={() => onHover(null)}
                aria-label={fmtDayFull(d)}
                aria-pressed={isStart || isEnd}
                className={`tnum h-11 w-full rounded-full text-xs sm:h-9 ${
                  isStart || isEnd
                    ? "bg-[var(--accent)] font-semibold text-[var(--on-accent)]"
                    : disabled
                      ? "text-muted/40"
                      : "text-ink hover:bg-surface3"
                }`}
              >
                {Number(d.slice(8))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<string | null>(value.from);
  const [to, setTo] = useState<string | null>(value.to);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState(monthOf(value.to));
  const root = useRef<HTMLDivElement>(null);
  const today = todayJakarta();
  const twoMonths = useWide("(min-width: 1024px)");
  const count = twoMonths ? 2 : 1;
  const list = useMemo(() => presets(), [open]);

  // Reset the draft in the same render that opens the popover (no flash of stale months).
  const toggle = () => {
    if (!open) {
      setFrom(value.from);
      setTo(value.to);
      setView(addMonths(monthOf(value.to), -(count - 1)));
    }
    setOpen(!open);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (d: string) => {
    if (from == null || to != null) {
      setFrom(d);
      setTo(null);
    } else if (d < from) {
      setTo(from);
      setFrom(d);
    } else {
      setTo(d);
    }
  };

  const maxView = addMonths(monthOf(today), -(count - 1));
  const activePreset = from && to ? list.find((p) => p.from === from && p.to === to) : undefined;
  const ready = from != null && to != null;

  return (
    <div ref={root} className="relative">
      <button
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex min-h-11 w-full items-center gap-2 rounded-xl border border-border2 bg-surface px-3 text-left text-xs text-ink hover:bg-surface2 sm:w-auto"
      >
        <span aria-hidden className="text-muted">▦</span>
        <span className="font-medium">{t(value.key === "custom" ? "Custom" : value.label)}</span>
        <span className="tnum text-muted">{rangeText(value.from, value.to)}</span>
        <span aria-hidden className="ml-auto text-muted sm:ml-0">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30 bg-ink/20 backdrop-blur-[2px] sm:hidden" aria-hidden />
          <div
            role="dialog"
            aria-label="Date range"
            data-glass=""
            className="fixed inset-x-0 bottom-0 z-40 max-h-[90dvh] overflow-y-auto rounded-t-[28px] border border-white/80 bg-white/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-3xl backdrop-saturate-[1.8] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_-12px_40px_rgba(20,24,36,0.16)] sm:absolute sm:bg-surface sm:backdrop-blur-none sm:shadow-[var(--shadow-panel)] sm:border-border sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-[31rem] sm:rounded-xl lg:w-[46rem]"
          >
            <div className="flex flex-col sm:flex-row">
              {/* presets */}
              <ul className="grid grid-cols-2 gap-1 border-b border-border p-2 sm:w-36 sm:shrink-0 sm:grid-cols-1 sm:gap-0 sm:border-b-0 sm:border-r">
                {list.map((p) => (
                  <li key={p.key}>
                    <button
                      onClick={() => {
                        setFrom(p.from);
                        setTo(p.to);
                        setView(addMonths(monthOf(p.to), -(count - 1)));
                      }}
                      className={`flex h-11 w-full items-center rounded-md px-2.5 text-left text-[13px] sm:h-8 ${
                        activePreset?.key === p.key
                          ? "bg-surface3 font-medium text-ink"
                          : "text-ink2 hover:bg-surface2 hover:text-ink"
                      }`}
                    >
                      {t(p.label)}
                    </button>
                  </li>
                ))}
              </ul>

              {/* calendar */}
              <div className="min-w-0 flex-1 p-3">
                <div className="relative flex gap-6">
                  {Array.from({ length: count }, (_, i) => addMonths(view, i)).map((ym) => (
                    <Month
                      key={ym}
                      ym={ym}
                      today={today}
                      from={from}
                      to={to}
                      hover={hover}
                      onPick={pick}
                      onHover={setHover}
                    />
                  ))}
                  <button
                    aria-label="Previous month"
                    onClick={() => setView((v) => addMonths(v, -1))}
                    className="absolute left-0 top-[-6px] inline-flex h-11 w-11 items-center justify-center rounded-full text-ink2 hover:bg-surface3 sm:top-[-10px] sm:h-9 sm:w-9"
                  >
                    ‹
                  </button>
                  <button
                    aria-label="Next month"
                    disabled={view >= maxView}
                    onClick={() => setView((v) => addMonths(v, 1))}
                    className="absolute right-0 top-[-6px] inline-flex h-11 w-11 items-center justify-center rounded-full text-ink2 hover:bg-surface3 disabled:opacity-30 sm:top-[-10px] sm:h-9 sm:w-9"
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
              <p className="tnum text-xs text-ink2">
                {from ? rangeText(from, to ?? from) : "Pick a start day"}
                {from && !to && <span className="text-muted"> · pick an end day</span>}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-11 items-center rounded-lg border border-border2 bg-surface px-4 text-xs font-medium text-ink2 hover:bg-surface2"
                >
                  {t("Cancel")}
                </button>
                <button
                  disabled={!ready}
                  onClick={() => {
                    if (!from || !to) return;
                    onChange(activePreset ?? { key: "custom", label: "Custom", from, to });
                    setOpen(false);
                  }}
                  className="inline-flex min-h-11 items-center rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--on-accent)] disabled:opacity-40"
                >
                  {t("Update")}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
