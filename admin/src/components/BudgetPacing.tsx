// Month-to-date spend vs ideal linear pace, with projected month-end spend.

import { fmtRp } from "../lib/format";

export type Pacing = {
  account_id: number;
  account_name: string | null;
  budget: number;
  spent: number;
  ideal: number;
  projected: number;
  day_of_month: number;
  days_in_month: number;
};

export function BudgetPacing({ pacing }: { pacing: Pacing[] }) {
  if (pacing.length === 0) return null;
  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
      {pacing.map((p) => {
        const spentPct = Math.min((p.spent / p.budget) * 100, 100);
        const idealPct = Math.min((p.ideal / p.budget) * 100, 100);
        const deviation = ((p.projected - p.budget) / p.budget) * 100;
        const off = Math.abs(deviation) > 20;
        return (
          <div key={p.account_id}>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-[13px] font-medium text-ink">{p.account_name ?? "Account"}</p>
              <p className="tnum text-xs text-ink2">
                Day {p.day_of_month}/{p.days_in_month} · projected{" "}
                <span className={off ? (deviation > 0 ? "font-semibold text-warn" : "font-semibold text-warn") : "text-ink"}>
                  {fmtRp(p.projected)}
                </span>{" "}
                <span className={off ? "text-warn" : "text-muted"}>
                  ({deviation >= 0 ? "+" : ""}
                  {Math.round(deviation)}%)
                </span>
              </p>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-surface3">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${spentPct}%`, background: "var(--accent)" }}
              />
              {/* ideal linear pace marker */}
              <div className="absolute inset-y-0 w-0.5 bg-ink/70" style={{ left: `${idealPct}%` }} title="Ideal pace" />
            </div>
            <div className="tnum mt-1 flex justify-between text-xs text-muted">
              <span>
                Spent <span className="text-ink2">{fmtRp(p.spent)}</span>
              </span>
              <span>
                Budget <span className="text-ink2">{fmtRp(p.budget)}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
