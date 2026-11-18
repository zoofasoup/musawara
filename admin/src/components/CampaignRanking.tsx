// Campaigns ranked by spend, each judged against the client's own typical cost per lead: winning, on par, watch, weak.
// Under it, one plain sentence when there is an honest budget move to suggest.

import { fmtNum, fmtRp } from "../lib/format";
import { budgetHint, rank, type RankInput } from "../lib/rank";
import { Pill } from "./kit";

const BAR = { good: "bg-good", neutral: "bg-chart-4/70", warn: "bg-warn", crit: "bg-crit" } as const;

export function CampaignRanking({ rows, limit = 8 }: { rows: RankInput[]; limit?: number }) {
  const { ranked, typical } = rank(rows);
  if (ranked.length === 0) return <p className="py-6 text-center text-xs text-muted">No campaign spend in this period.</p>;
  const max = Math.max(...ranked.map((r) => r.spend));
  const hint = budgetHint(ranked);
  const pct = (r: number | null) => (r == null ? "" : Math.abs(r - 1) < 0.005 ? "at typical" : r >= 1 ? `${Math.round((r - 1) * 100)}% above typical` : `${Math.round((1 - r) * 100)}% below typical`);
  return (
    <div>
      <ul className="space-y-3">
        {ranked.slice(0, limit).map((r) => (
          <li key={r.id}>
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium text-ink" title={r.name}>{r.name}</span>
              <Pill tone={r.tone} size="sm">{r.label}</Pill>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface3" role="img" aria-label={`${r.name}: spend ${fmtRp(r.spend)}`}>
                <div className={`h-full rounded-full ${BAR[r.tone]}`} style={{ width: `${Math.max(3, (r.spend / max) * 100)}%` }} />
              </div>
              <span className="tnum w-28 shrink-0 text-right text-xs text-ink2">{fmtRp(r.spend)}</span>
            </div>
            <p className="tnum mt-0.5 text-xs text-muted">
              {r.cpl == null ? "No leads yet" : `Cost / lead ${fmtRp(r.cpl)} · ${fmtNum(r.leads)} leads · ${pct(r.ratio)}`}
            </p>
          </li>
        ))}
      </ul>
      {typical != null && <p className="mt-3 text-xs text-muted">Typical cost per lead for this client: <span className="tnum text-ink2">{fmtRp(typical)}</span>. Winning is 20% or more below it; weak is 50% or more above.</p>}
      {hint && (
        <p className="mt-3 rounded-2xl bg-[color-mix(in_srgb,var(--accent)_10%,white)] px-4 py-3 text-sm text-ink">
          Consider moving budget from <b>{hint.from.name}</b> ({hint.from.cpl ? fmtRp(hint.from.cpl) : "no leads"} per lead) to <b>{hint.to.name}</b> ({fmtRp(hint.to.cpl)} per lead).
        </p>
      )}
    </div>
  );
}
