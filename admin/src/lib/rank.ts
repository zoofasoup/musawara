// Winning or weak? One rule used by the campaign ranking and the creative quadrant: each campaign is compared with the client's other
// campaigns that have the same goal (the median of their cost for that goal). It mirrors the creative verdicts in worker/lib/creative.ts.
import { costOf, goalOf, MIN_PEERS, type Goal } from "../../shared/goals.ts";

export type RankTone = "good" | "neutral" | "warn" | "crit";
export type RankInput = { id: string; name: string; spend: number; leads: number; objective?: string | null; link_clicks?: number; reach?: number; impressions?: number };
export type Ranked = RankInput & { goal: Goal; cost: number | null; cpl: number | null; ratio: number | null; tone: RankTone; label: "Winning" | "On par" | "Watch" | "Weak" | "No leads" | "Not compared" };

export const WIN_RATIO = 0.8; // 20% or more cheaper than typical
export const WATCH_RATIO = 1.2;
export const WEAK_RATIO = 1.5; // 50% or more dearer than typical

const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The client's typical cost per lead: median over items with spend and leads. */
export const typicalCpl = (rows: Array<{ spend: number; leads: number }>) => median(rows.filter((r) => r.spend > 0 && r.leads > 0).map((r) => r.spend / r.leads));

export function rank(rows: RankInput[]): { ranked: Ranked[]; typical: number | null } {
  const judged = rows.filter((r) => r.spend > 0).map((r) => {
    const goal = goalOf(r.objective, r.leads > 0);
    return { r, goal, ...costOf(goal, r) };
  });
  const typicalOf = (goal: Goal) => {
    const same = judged.filter((j) => j.goal === goal);
    return same.length >= MIN_PEERS ? median(same.filter((j) => j.cost != null).map((j) => j.cost!)) : null;
  };
  const ranked = judged
    .map<Ranked>(({ r, goal, cost }) => {
      const base = { ...r, goal, cost, cpl: r.leads > 0 ? r.spend / r.leads : null };
      if (judged.filter((j) => j.goal === goal).length < MIN_PEERS) return { ...base, ratio: null, tone: "neutral", label: "Not compared" };
      if (cost == null) return { ...base, ratio: null, tone: "crit", label: "No leads" };
      const typical = typicalOf(goal);
      const ratio = typical ? cost / typical : 1;
      const [tone, label] = ratio <= WIN_RATIO ? (["good", "Winning"] as const) : ratio <= WATCH_RATIO ? (["neutral", "On par"] as const) : ratio < WEAK_RATIO ? (["warn", "Watch"] as const) : (["crit", "Weak"] as const);
      return { ...base, ratio, tone, label };
    })
    .sort((a, b) => b.spend - a.spend);
  return { ranked, typical: typicalOf("lead") };
}

/** "Move budget from the weakest big spender to the best performer" among lead campaigns, or null when there is no honest pair. */
export function budgetHint(ranked: Ranked[]): { from: Ranked; to: Ranked } | null {
  const leads = ranked.filter((r) => r.goal === "lead");
  const from = leads.filter((r) => r.tone === "crit").sort((a, b) => b.spend - a.spend)[0];
  const to = leads.filter((r) => r.tone === "good" && r.leads >= 5).sort((a, b) => (a.cpl ?? Infinity) - (b.cpl ?? Infinity))[0];
  return from && to && from.id !== to.id ? { from, to } : null;
}
