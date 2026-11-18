// Dashboard widgets for the Overview: hatched bar chart with a highlighted peak, segmented half-gauge,
// and a segmented share bar. Pure SVG/CSS except the bars (recharts), no data fetching.

import { useId } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtCompact, fmtDay, fmtDayFull, fmtRp } from "../lib/format";

export type DayPoint = { date: string; value: number };

/** Daily bars filled with a diagonal hatch; the peak day is solid accent, hover shows a dark tooltip. */
export function HatchBars({ days }: { days: DayPoint[] }) {
  const id = useId().replace(/:/g, "");
  const peak = days.reduce((m, d, i) => (d.value > (days[m]?.value ?? -1) ? i : m), 0);
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer>
        <BarChart data={days} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap="22%">
          <defs>
            <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--color-surface2)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-border2)" strokeWidth="2" />
            </pattern>
          </defs>
          <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={28} />
          <YAxis tickFormatter={(v: number) => fmtCompact(v)} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as DayPoint;
              return (
                <div className="rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-panel">
                  <p className="opacity-70">{fmtDayFull(p.date)}</p>
                  <p className="tnum font-semibold">{fmtRp(p.value)}</p>
                </div>
              );
            }}
          />
          <Bar dataKey="value" radius={[6, 6, 6, 6]} maxBarSize={30} activeBar={{ fill: "var(--accent)" }}>
            {days.map((d, i) => (
              <Cell key={d.date} fill={i === peak && d.value > 0 ? "var(--accent)" : `url(#${id})`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const SEGMENTS = 13;

/** Half-circle made of rounded segments; the first `value`% are green, fading toward the end. */
export function SegmentGauge({ value, label }: { value: number; label: string }) {
  const cx = 120;
  const cy = 112;
  const r1 = 62;
  const r2 = 104;
  const gap = 2.2;
  const span = (180 - gap * (SEGMENTS - 1)) / SEGMENTS;
  const filled = Math.round((Math.min(100, Math.max(0, value)) / 100) * SEGMENTS);
  const pt = (r: number, deg: number) => {
    const a = (Math.PI * (180 + deg)) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  };
  return (
    <div className="relative mx-auto w-full max-w-[17rem]">
      <svg viewBox="0 0 240 120" className="w-full" role="img" aria-label={`${Math.round(value)}% ${label}`}>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const a0 = i * (span + gap);
          const a1 = a0 + span;
          const on = i < filled;
          const fade = 1 - (i / SEGMENTS) * 0.6;
          return (
            <path
              key={i}
              d={`M${pt(r1, a0)} L${pt(r2, a0)} A${r2},${r2} 0 0 1 ${pt(r2, a1)} L${pt(r1, a1)} A${r1},${r1} 0 0 0 ${pt(r1, a0)} Z`}
              fill={on ? "var(--color-good)" : "var(--color-surface3)"}
              fillOpacity={on ? fade : 1}
              stroke={on ? "var(--color-good)" : "var(--color-surface3)"}
              strokeOpacity={on ? fade : 1}
              strokeWidth="5"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="tnum text-3xl font-semibold leading-none text-ink">{Math.round(value)}%</p>
        <p className="mt-1 text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

/** A row of thin rounded ticks, `pct`% of them in `color`. */
export function TickBar({ pct, color }: { pct: number; color: string }) {
  const n = 16;
  const on = Math.round((Math.min(100, Math.max(0, pct)) / 100) * n);
  return (
    <div className="flex h-7 gap-[3px]" aria-hidden>
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className="flex-1 rounded-full" style={{ background: color, opacity: i < on ? 1 : 0.18 }} />
      ))}
    </div>
  );
}
