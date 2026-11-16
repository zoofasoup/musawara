// Trend for the report: spend as bars, the client's primary result as a line, and the
// comparison period's spend as a dashed line. No toggles (the report is read, not explored).

import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtCompact, fmtDay, fmtDayFull, fmtNum, fmtRp } from "../../lib/format";
import { Card } from "./ReportSection";
import type { ReportDoc } from "../../../worker/lib/report";

type Trend = NonNullable<ReportDoc["trend"]>;

export function ReportTrend({ trend, resultLabel, showCompare }: { trend: Trend; resultLabel: string; showCompare: boolean }) {
  const data = useMemo(
    () => trend.days.map((d, i) => ({ date: d.date, spend: d.spend, results: d.results, prev: showCompare ? trend.compare[i]?.spend ?? null : null, prevDate: trend.compare[i]?.date ?? null })),
    [trend, showCompare]
  );
  const hasPrev = data.some((d) => d.prev != null);
  const bucket = trend.bucket === "month" ? "Month of " : trend.bucket === "week" ? "Week of " : "";
  const LINE = "var(--color-chart-2)";
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink2">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--accent)" }} />Spend</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-3.5 rounded" style={{ background: LINE }} />{resultLabel}</span>
        {hasPrev && <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3.5 border-t-2 border-dashed border-ink2" />Spend, previous period</span>}
      </div>
      <div className="h-56 w-full sm:h-64" role="img" aria-label={`Spend and ${resultLabel} over the period`}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="25%">
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={{ stroke: "var(--color-border2)" }} tickLine={false} minTickGap={24} />
            <YAxis yAxisId="bar" tickFormatter={(v: number) => fmtCompact(v)} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
            <YAxis yAxisId="line" orientation="right" tickFormatter={(v: number) => fmtCompact(v)} tick={{ fill: LINE, fontSize: 12 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                return (
                  <div className="rounded-lg border border-border2 bg-surface px-3 py-2 text-xs shadow-panel">
                    <p className="mb-1 font-semibold text-ink">{bucket}{fmtDayFull(d.date)}</p>
                    <p className="tnum text-ink2">Spend: <span className="text-ink">{fmtRp(d.spend)}</span></p>
                    <p className="tnum text-ink2">{resultLabel}: <span className="text-ink">{fmtNum(d.results)}</span></p>
                    {d.prev != null && <p className="tnum text-ink2">Previous ({d.prevDate ? fmtDayFull(d.prevDate) : "–"}): <span className="text-ink">{fmtRp(d.prev)}</span></p>}
                  </div>
                );
              }}
            />
            <Bar yAxisId="bar" dataKey="spend" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            {hasPrev && <Line yAxisId="bar" dataKey="prev" stroke="var(--color-ink2)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={false} connectNulls isAnimationActive={false} />}
            <Line yAxisId="line" dataKey="results" stroke={LINE} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
