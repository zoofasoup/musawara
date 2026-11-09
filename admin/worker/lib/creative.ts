// Creative (ad level) metrics: the raw sums come from SQL, the rates and the verdict are computed here.

export type CreativeRaw = {
  entity_id: string;
  name: string | null;
  thumbnail_url: string | null;
  status: string | null;
  effective_status: string | null;
  spend: number;
  impressions: number;
  reach: number;
  link_clicks: number;
  leads: number;
  views3s: number; // 3-second video views
  thruplays: number;
  plays: number;
  watch_weighted: number; // avg watch seconds * plays, so ads can be summed
  days_active: number;
  first_date: string | null;
  quality: string | null;
  engagement: string | null;
  conversion: string | null;
};

export type Verdict = "winner" | "ok" | "weak" | "fatigued" | "low_data";

export type Creative = CreativeRaw & {
  cpl: number | null;
  link_ctr: number | null; // link clicks / impressions, %
  cost_per_link_click: number | null;
  frequency: number | null;
  hook_rate: number | null; // 3-second views / impressions, % (video ads only)
  hold_rate: number | null; // ThruPlays / 3-second views, %
  avg_watch_s: number | null;
  verdict: Verdict;
};

export const FATIGUE_FREQUENCY = 3.5;
const MIN_IMPRESSIONS = 1000;
const WINNER_MIN_LEADS = 5;
const WINNER_CPL_RATIO = 0.8;
const WEAK_CPL_RATIO = 1.5;

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null;
};

/** Rates for one ad plus a verdict relative to the client's other ads in the same period. */
export function buildCreatives(raws: CreativeRaw[]): Creative[] {
  const withCpl = raws.filter((r) => r.leads > 0 && r.spend > 0);
  const medCpl = median(withCpl.map((r) => r.spend / r.leads));
  const medSpend = median(raws.filter((r) => r.spend > 0).map((r) => r.spend));

  return raws.map((r) => {
    const cpl = r.leads > 0 ? r.spend / r.leads : null;
    const frequency = r.reach > 0 ? r.impressions / r.reach : null;
    let verdict: Verdict = "ok";
    if (r.impressions < MIN_IMPRESSIONS) verdict = "low_data";
    else if ((frequency ?? 0) > FATIGUE_FREQUENCY) verdict = "fatigued";
    else if (cpl != null && medCpl != null && medSpend != null && r.spend >= medSpend && r.leads >= WINNER_MIN_LEADS && cpl <= medCpl * WINNER_CPL_RATIO) verdict = "winner";
    else if (medSpend != null && r.spend >= medSpend && (r.leads === 0 || (cpl != null && medCpl != null && cpl >= medCpl * WEAK_CPL_RATIO))) verdict = "weak";
    return {
      ...r,
      cpl,
      frequency,
      link_ctr: r.impressions > 0 ? (r.link_clicks / r.impressions) * 100 : null,
      cost_per_link_click: r.link_clicks > 0 ? r.spend / r.link_clicks : null,
      hook_rate: r.views3s > 0 && r.impressions > 0 ? (r.views3s / r.impressions) * 100 : null,
      // no stored ThruPlays (rows synced before video extras existed) must read as unknown, not 0%
      hold_rate: r.views3s > 0 && (r.thruplays > 0 || r.plays > 0) ? (r.thruplays / r.views3s) * 100 : null,
      avg_watch_s: r.plays > 0 && r.watch_weighted > 0 ? r.watch_weighted / r.plays : null,
      verdict,
    };
  });
}
