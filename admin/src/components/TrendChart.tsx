// Trend: bars (spend or leads) + line (cost per lead/CTR/CPM) on a labeled
// secondary axis, per the product spec. Metrics are toggleable.

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCompact, fmtDay, fmtDayFull, fmtNum, fmtPct, fmtRp } from "../lib/format";
import { EmptyState } from "./ui";

export type TrendDay = {
  date: string;
  spend: number;
  leads: number;
  cpl: number | null;
  ctr: number | null;
  cpm: number | null;
};

const BAR_METRICS = [
  { key: "spend", label: "Spend", fmt: fmtRp },
  { key: "leads", label: "Leads", fmt: (v: number | null) => fmtNum(v ?? null) },
] as const;

const LINE_METRICS = [
  { key: "cpl", label: "Cost / Lead", fmt: fmtRp },
  { key: "ctr", label: "CTR", fmt: (v: number | null) => fmtPct(v) },
  { key: "cpm", label: "CPM", fmt: fmtRp },
] as const;

const BAR_COLOR = "var(--color-chart-1)";
const LINE_COLOR = "var(--color-chart-2)";

export function TrendChart({ days, compare, bucket = "day" }: { days: TrendDay[]; compare?: TrendDay[]; bucket?: "day" | "week" | "month" }) {
  const [barKey, setBarKey] = useState<"spend" | "leads">("spend");
  const [lineKey, setLineKey] = useState<"cpl" | "ctr" | "cpm" | "none">("cpl");

  const bar = BAR_METRICS.find((m) => m.key === barKey)!;
  const line = LINE_METRICS.find((m) => m.key === lineKey);
  const barLabel = bar.label;
  const lineLabel = line?.label;

  // the comparison period is drawn point by point against the current one (day 1 with day 1, ...)
  const data = useMemo(
    () => days.map((d, i) => ({ ...d, barValue: d[barKey] ?? 0, lineValue: line ? d[line.key] : null, prevValue: compare && compare[i] ? compare[i][barKey] ?? 0 : null, prevDate: compare?.[i]?.date ?? null })),
    [days, compare, barKey, line]
  );

  if (days.length === 0) {
    return <EmptyState title="No data in this date range" hint="Try a wider range, or wait for the next sync." />;
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-surface2 p-0.5">
          {BAR_METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setBarKey(m.key)}
              className={`rounded-md px-2 py-1 text-xs font-medium ${barKey === m.key ? "bg-surface3 text-ink" : "text-muted hover:text-ink2"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-surface2 p-0.5">
          {LINE_METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setLineKey(lineKey === m.key ? "none" : m.key)}
              className={`rounded-md px-2 py-1 text-xs font-medium ${lineKey === m.key ? "bg-surface3 text-ink" : "text-muted hover:text-ink2"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-ink2">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: BAR_COLOR }} />
            {barLabel}
          </span>
          {line && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3.5 rounded" style={{ background: LINE_COLOR }} />
              {lineLabel}
            </span>
          )}
          {compare && compare.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3.5 border-t-2 border-dashed" style={{ borderColor: "var(--color-ink2)" }} />
              {barLabel}, compared period
            </span>
          )}
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="25%">
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDay}
              tick={{ fill: "var(--color-muted)", fontSize: 10 }}
              axisLine={{ stroke: "var(--color-border2)" }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              yAxisId="bar"
              tickFormatter={(v: number) => fmtCompact(v)}
              tick={{ fill: "var(--color-muted)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            {line && (
              <YAxis
                yAxisId="line"
                orientation="right"
                tickFormatter={(v: number) => fmtCompact(v)}
                tick={{ fill: LINE_COLOR, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
            )}
            <Tooltip
              cursor={{ fill: "var(--color-hair)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                return (
                  <div className="rounded-lg border border-border2 bg-surface px-3 py-2 text-xs shadow-panel">
                    <p className="mb-1 font-semibold text-ink">{bucket === "week" ? "Week of " : bucket === "month" ? "Month of " : ""}{fmtDayFull(String(label))}</p>
                    <p className="tnum text-ink2">
                      {barLabel}: <span className="text-ink">{bar.fmt(d.barValue as any)}</span>
                    </p>
                    {d.prevValue != null && (
                      <p className="tnum text-ink2">
                        Compared ({d.prevDate ? fmtDayFull(d.prevDate) : "–"}): <span className="text-ink">{bar.fmt(d.prevValue as any)}</span>
                      </p>
                    )}
                    {line && (
                      <p className="tnum text-ink2">
                        {lineLabel}: <span className="text-ink">{d.lineValue == null ? "–" : line.fmt(d.lineValue as any)}</span>
                      </p>
                    )}
                  </div>
                );
              }}
            />
            <Bar yAxisId="bar" dataKey="barValue" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
            {compare && compare.length > 0 && (
              <Line yAxisId="bar" dataKey="prevValue" stroke="var(--color-ink2)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={false} connectNulls isAnimationActive={false} />
            )}
            {line && (
              <Line
                yAxisId="line"
                dataKey="lineValue"
                stroke={LINE_COLOR}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: LINE_COLOR, stroke: "var(--color-surface)", strokeWidth: 2 }}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
