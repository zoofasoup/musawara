// Trend for up to three numbers (by default spend, leads, purchases). One metric at a time, one unit,
// one axis, so the chart never mixes money with counts or ratios. Each tab shows its period total
// and the change against the comparison period; the dashed line is the comparison period.

import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtCompact, fmtDay, fmtDayFull, fmtNum, fmtRp } from "../lib/format";
import { Delta } from "./ui";
import { Empty } from "./kit";

export type TrendDay = { date: string; spend: number; leads: number; purchases: number };
export type TrendMetric = { key: string; label: string; fmt: (v: number) => string; color: string; money?: boolean };
type Point = { date: string } & Record<string, any>;

const METRICS: TrendMetric[] = [
  { key: "spend", label: "Spend", fmt: (v) => fmtRp(v), color: "var(--color-chart-1)", money: true },
  { key: "leads", label: "Leads", fmt: (v) => fmtNum(v), color: "var(--color-chart-4)" },
  { key: "purchases", label: "Purchases", fmt: (v) => fmtNum(v), color: "var(--color-chart-3)" },
];

const sum = (days: Point[] | undefined, k: string) => (days ? days.reduce((a, d) => a + (d[k] ?? 0), 0) : null);

export function MetricTrend({ days, compare, metrics = METRICS }: { days: Point[]; compare?: Point[]; metrics?: TrendMetric[] }) {
  const [chosen, setKey] = useState(metrics[0].key);
  const m = metrics.find((x) => x.key === chosen) ?? metrics[0];
  const key = m.key;
  const hasCompare = !!compare && compare.length > 0;

  // the comparison period is drawn point by point against the current one (day 1 with day 1, ...)
  const data = useMemo(
    () => days.map((d, i) => ({ date: d.date, value: d[key] ?? 0, prev: hasCompare && compare![i] ? compare![i][key] ?? 0 : null, prevDate: compare?.[i]?.date ?? null })),
    [days, compare, key, hasCompare]
  );

  if (days.length === 0) return <Empty title="No data in this date range" hint="Try a wider range, or wait for the next sync." />;

  return (
    <div>
      <div role="tablist" aria-label="Metric" className={`mb-4 grid gap-2 ${metrics.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {metrics.map((x) => {
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
              <span key={String(total)} className="swap-in tnum mt-1 block text-sm font-semibold text-ink sm:truncate sm:text-base" title={x.fmt(total)}>
                {x.money ? (
                  <>
                    <span className="sm:hidden">Rp {fmtCompact(total)}</span>
                    <span className="hidden sm:inline">{x.fmt(total)}</span>
                  </>
                ) : (
                  x.fmt(total)
                )}
              </span>
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
            <YAxis tickFormatter={(v: number) => (m.money ? fmtCompact(v) : fmtNum(v))} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={44} allowDecimals={false} />
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
