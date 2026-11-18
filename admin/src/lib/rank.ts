// Winning or weak? One rule used by the campaign ranking and the creative quadrant, relative to the client's own typical cost per lead
// (the median of items that have leads). It mirrors the creative verdict thresholds in worker/lib/creative.ts.

export type RankTone = "good" | "neutral" | "warn" | "crit";
export type RankInput = { id: string; name: string; spend: number; leads: number };
export type Ranked = RankInput & { cpl: number | null; ratio: number | null; tone: RankTone; label: "Winning" | "On par" | "Watch" | "Weak" | "No leads" };

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
  const typical = typicalCpl(rows);
  const ranked = rows
    .filter((r) => r.spend > 0)
    .map<Ranked>((r) => {
      const cpl = r.leads > 0 ? r.spend / r.leads : null;
      if (cpl == null) return { ...r, cpl, ratio: null, tone: "crit", label: "No leads" };
      const ratio = typical ? cpl / typical : 1;
      const [tone, label] = ratio <= WIN_RATIO ? (["good", "Winning"] as const) : ratio <= WATCH_RATIO ? (["neutral", "On par"] as const) : ratio < WEAK_RATIO ? (["warn", "Watch"] as const) : (["crit", "Weak"] as const);
      return { ...r, cpl, ratio, tone, label };
    })
    .sort((a, b) => b.spend - a.spend);
  return { ranked, typical };
}

/** "Move budget from the weakest big spender to the best performer", or null when there is no honest pair. */
export function budgetHint(ranked: Ranked[]): { from: Ranked; to: Ranked } | null {
  const from = ranked.filter((r) => r.tone === "crit").sort((a, b) => b.spend - a.spend)[0];
  const to = ranked.filter((r) => r.tone === "good" && r.leads >= 5).sort((a, b) => (a.cpl ?? Infinity) - (b.cpl ?? Infinity))[0];
  return from && to && from.id !== to.id ? { from, to } : null;
}
