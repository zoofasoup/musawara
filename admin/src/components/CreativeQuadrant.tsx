// Which ads are winning and which are burning money. Each ad is a dot: spend across, cost per lead up (lower is better),
// size = leads, colour = the same verdict the cards show. Bottom right (big spend, cheap leads) = scale up;
// top right (big spend, dear leads) = burning money. Dashed lines are the client's own typical values.

import { useMemo } from "react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { fmtCompact, fmtNum, fmtRp } from "../lib/format";
import { typicalCpl } from "../lib/rank";
import type { Creative } from "./CreativeCards";

const COLOR: Record<Creative["verdict"], string> = {
  winner: "var(--color-good)",
  ok: "var(--color-chart-4)",
  weak: "var(--color-warn)",
  fatigued: "var(--color-crit)",
  low_data: "var(--color-muted)",
};
const NAME: Record<Creative["verdict"], string> = { winner: "Winner", ok: "OK", weak: "Weak", fatigued: "Fatigued", low_data: "Low data" };

type P = Creative & { x: number; y: number; noLeads: boolean };

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[(s.length >> 1) - 1] + s[s.length >> 1]) / 2) : 0;
};

export function CreativeQuadrant({ ads, onSelect }: { ads: Creative[]; onSelect?: (id: string) => void }) {
  const { points, medSpend, medCpl, maxX, maxY } = useMemo(() => {
    const live = ads.filter((a) => a.spend > 0);
    const maxCpl = Math.max(1, ...live.map((a) => a.cpl ?? 0));
    const points: P[] = live.map((a) => ({ ...a, x: a.spend, y: a.cpl ?? maxCpl * 1.15, noLeads: a.cpl == null }));
    return { points, medSpend: median(live.map((a) => a.spend)), medCpl: typicalCpl(live) ?? 0, maxX: Math.max(1, ...live.map((a) => a.spend)) * 1.1, maxY: maxCpl * 1.3 };
  }, [ads]);

  if (points.length < 3) return <p className="py-10 text-center text-xs text-muted">Needs at least three ads with spend to compare.</p>;

  const dot = (p: any) => {
    const a = p.payload as P;
    const r = Math.min(20, 6 + Math.sqrt(a.leads) * 1.6);
    return (
      <circle cx={p.cx} cy={p.cy} r={r} fill={a.noLeads ? "var(--color-surface)" : COLOR[a.verdict]} fillOpacity={a.noLeads ? 1 : 0.78} stroke={COLOR[a.verdict]} strokeWidth={a.noLeads ? 2 : 1.5} strokeDasharray={a.noLeads ? "3 2" : undefined} style={{ cursor: onSelect ? "pointer" : "default" }} onClick={() => onSelect?.(a.entity_id)} />
    );
  };

  return (
    <div>
      <div className="relative h-80 w-full">
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 5" />
            <XAxis type="number" dataKey="x" domain={[0, maxX]} tickFormatter={(v: number) => fmtCompact(v)} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} name="Spend" />
            <YAxis type="number" dataKey="y" domain={[0, maxY]} tickFormatter={(v: number) => fmtCompact(v)} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={44} name="Cost / lead" reversed={false} />
            <ReferenceLine x={medSpend} stroke="var(--color-ink2)" strokeDasharray="4 4" strokeOpacity={0.5} />
            {medCpl > 0 && <ReferenceLine y={medCpl} stroke="var(--color-ink2)" strokeDasharray="4 4" strokeOpacity={0.5} />}
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const a = payload[0].payload as P;
                return (
                  <div className="max-w-56 rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-panel">
                    <p className="font-semibold">{a.name ?? a.entity_id}</p>
                    <p className="tnum opacity-80">Spend {fmtRp(a.spend)}</p>
                    <p className="tnum opacity-80">{a.noLeads ? "No leads yet" : `Cost / lead ${fmtRp(a.cpl)} · ${fmtNum(a.leads)} leads`}</p>
                    <p className="mt-0.5 opacity-80">{NAME[a.verdict]}{a.frequency != null ? ` · frequency ${fmtNum(a.frequency, 1)}` : ""}</p>
                  </div>
                );
              }}
            />
            <Scatter data={points} shape={dot} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
        {/* the four corners say what to do; kept out of the way of the dots */}
        <div className="pointer-events-none absolute inset-0 pl-[3.2rem] pr-3 pb-8 pt-2 text-[11px] font-semibold">
          <div className="relative h-full w-full">
            <span className="absolute left-1 top-0 text-muted">Test or drop</span>
            <span className="absolute right-1 top-0 text-crit">Burning money</span>
            <span className="absolute bottom-0 left-1 text-muted">Cheap, small</span>
            <span className="absolute bottom-0 right-1 text-good">Scale up</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink2">
        {(["winner", "ok", "weak", "fatigued", "low_data"] as const).map((v) => (
          <span key={v} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[v] }} />{NAME[v]}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-ink2" />No leads</span>
        <span className="text-muted">Dot size = leads. Dashed lines = this client's typical spend and cost per lead.</span>
      </div>
    </div>
  );
}
