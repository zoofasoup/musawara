// How the pipeline performs: how many cards reached each stage, wins and losses, win rate, time to win.
import { useEffect, useState } from "react";
import { Bento } from "../../../components/kit";
import { fmtNum, fmtRp } from "../../../lib/format";
import { STAGE_BAR, type Report } from "./api";

export function Funnel({ call, version }: { call: <T = any>(m: string, s: string) => Promise<T>; version: string }) {
  const [r, setR] = useState<Report | null>(null);
  useEffect(() => { void call<Report>("GET", "/report").then(setR).catch(() => setR(null)); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return <p className="text-sm text-muted">Loading…</p>;
  const top = Math.max(1, ...r.stages.map((s) => s.reached));
  const stat = (label: string, value: string, hint?: string) => (
    <Bento className="p-4"><p className="text-xs text-muted">{label}</p><p className="tnum mt-1 text-xl font-semibold text-ink">{value}</p>{hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}</Bento>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat("Open deals", fmtRp(r.open.value), `${fmtNum(r.open.count)} card(s)`)}
        {stat("Won", fmtRp(r.won.value), `${fmtNum(r.won.count)} deal(s) · ${fmtRp(r.won.this_month_value)} this month`)}
        {stat("Win rate", r.win_rate == null ? "–" : `${r.win_rate}%`, `${fmtNum(r.won.count)} won, ${fmtNum(r.lost.count)} lost`)}
        {stat("Time to win", r.won.avg_days == null ? "–" : `${r.won.avg_days} d`, "from first card to won")}
      </div>
      <Bento className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Cards that reached each stage</h3>
        <ul className="space-y-2.5">
          {r.stages.map((s, i) => {
            const prev = i > 0 ? r.stages[i - 1].reached : 0;
            return (
              <li key={s.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm"><span className="text-ink">{s.name}</span><span className="tnum text-ink2">{fmtNum(s.reached)} reached · {fmtNum(s.current)} now{s.value ? ` · ${fmtRp(s.value)}` : ""}</span></div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface3"><div className={`h-full rounded-full ${STAGE_BAR[s.color]}`} style={{ width: `${(s.reached / top) * 100}%` }} /></div>
                {i > 0 && prev > 0 && s.kind === "open" && <p className="mt-0.5 text-xs text-muted">{Math.round((s.reached / prev) * 100)}% of the stage before</p>}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted">Counts are of cards moved on the board, so history starts the day you began using it.</p>
      </Bento>
    </div>
  );
}
