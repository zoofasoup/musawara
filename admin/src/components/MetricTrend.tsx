// Trend for the three numbers that matter: spend, leads, purchases. One metric at a time, one unit,
// one axis, so the chart never mixes money with counts or ratios. Each tab shows its period total
// and the change against the comparison period; the dashed line is the comparison period.

import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtCompact, fmtDay, fmtDayFull, fmtNum, fmtRp } from "../lib/format";
import { Delta, EmptyState } from "./ui";

export type TrendDay = { date: string; spend: number; leads: number; purchases: number };

const METRICS = [
  { key: "spend", label: "Spend", fmt: (v: number) => fmtRp(v), color: "var(--color-chart-1)" },
  { key: "leads", label: "Leads", fmt: (v: number) => fmtNum(v), color: "var(--color-chart-4)" },
  { key: "purchases", label: "Purchases", fmt: (v: number) => fmtNum(v), color: "var(--color-chart-3)" },
] as const;
type Key = (typeof METRICS)[number]["key"];

const sum = (days: TrendDay[] | undefined, k: Key) => (days ? days.reduce((a, d) => a + (d[k] ?? 0), 0) : null);

export function MetricTrend({ days, compare }: { days: TrendDay[]; compare?: TrendDay[] }) {
  const [key, setKey] = useState<Key>("spend");
  const m = METRICS.find((x) => x.key === key)!;
  const hasCompare = !!compare && compare.length > 0;

  // the comparison period is drawn point by point against the current one (day 1 with day 1, ...)
  const data = useMemo(
    () => days.map((d, i) => ({ date: d.date, value: d[key] ?? 0, prev: hasCompare && compare![i] ? compare![i][key] ?? 0 : null, prevDate: compare?.[i]?.date ?? null })),
    [days, compare, key, hasCompare]
  );

  if (days.length === 0) return <EmptyState title="No data in this date range" hint="Try a wider range, or wait for the next sync." />;

  return (
    <div>
      <div role="tablist" aria-label="Metric" className="mb-4 grid grid-cols-3 gap-2">
        {METRICS.map((x) => {
          const total = sum(days, x.key) ?? 0;
          const prevTotal = hasCompare ? sum(compare, x.key) : null;
          const on = key === x.key;
          return (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setKey(x.key)}
              className={`min-w-0 rounded-2xl border px-3 py-2.5 text-left transition-colors ${on ? "border-transparent bg-surface2 shadow-[inset_0_0_0_1.5px_var(--tab-color)]" : "border-border/70 hover:bg-surface2/60"}`}
              style={{ ["--tab-color" as any]: x.color }}
            >
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: x.color }} />
                {x.label}
              </span>
              <span className="tnum mt-1 block truncate text-sm font-semibold text-ink sm:text-base" title={x.fmt(total)}>{x.fmt(total)}</span>
              {hasCompare && <Delta current={total} previous={prevTotal} direction={x.key === "spend" ? "neutral" : "higher-better"} className="mt-0.5 block" />}
            </button>
          );
        })}
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="25%">
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 5" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={{ stroke: "var(--color-border2)" }} tickLine={false} minTickGap={24} />
            <YAxis tickFormatter={(v: number) => (key === "spend" ? fmtCompact(v) : fmtNum(v))} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={44} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "var(--color-hair)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof data)[number];
                return (
                  <div className="rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-panel">
                    <p className="opacity-70">{fmtDayFull(p.date)}</p>
                    <p className="tnum font-semibold">{m.label}: {m.fmt(p.value)}</p>
                    {p.prev != null && <p className="tnum opacity-70">{p.prevDate ? fmtDayFull(p.prevDate) : "Compared"}: {m.fmt(p.prev)}</p>}
                  </div>
                );
              }}
            />
            <Bar dataKey="value" fill={`color-mix(in srgb, ${m.color} 38%, white)`} radius={[6, 6, 6, 6]} maxBarSize={28} activeBar={{ fill: m.color }} isAnimationActive={false} />
            {hasCompare && <Line dataKey="prev" stroke="var(--color-ink2)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted">{hasCompare ? "Bars are this period; the dashed line is the comparison period." : "Bars are this period."}</p>
    </div>
  );
}
