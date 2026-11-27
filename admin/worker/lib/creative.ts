// Creative (ad level) metrics: the raw sums come from SQL, the rates and the verdict are computed here.

import { costOf, goalOf, MIN_PEERS, type Goal } from "../../shared/goals";

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
  campaign_id?: string | null;
  /** The campaign's Meta objective: what the ad was run for. */
  objective?: string | null;
};

export type Verdict = "winner" | "ok" | "weak" | "fatigued" | "low_data" | "unrated";

export type Creative = CreativeRaw & {
  cpl: number | null;
  link_ctr: number | null; // link clicks / impressions, %
  cost_per_link_click: number | null;
  frequency: number | null;
  hook_rate: number | null; // 3-second views / impressions, % (video ads only)
  hold_rate: number | null; // ThruPlays / 3-second views, %
  avg_watch_s: number | null;
  verdict: Verdict;
  goal: Goal;
  /** The cost this ad's goal is judged on. */
  cost: number | null;
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

/** Rates for one ad plus a verdict relative to the client's other ads with the same goal in the same period. */
export function buildCreatives(raws: CreativeRaw[]): Creative[] {
  const chatCampaigns = new Set(raws.filter((r) => r.leads > 0 && r.campaign_id).map((r) => r.campaign_id));
  const judged = raws.map((r) => {
    const goal = goalOf(r.objective, r.campaign_id ? chatCampaigns.has(r.campaign_id) : r.leads > 0);
    return { r, goal, ...costOf(goal, r) };
  });
  const peers = new Map<Goal, { medCost: number | null; medSpend: number | null; enough: boolean }>();
  for (const goal of new Set(judged.map((j) => j.goal))) {
    const same = judged.filter((j) => j.goal === goal);
    peers.set(goal, {
      medCost: median(same.filter((j) => j.cost != null && j.r.spend > 0).map((j) => j.cost!)),
      medSpend: median(same.filter((j) => j.r.spend > 0).map((j) => j.r.spend)),
      enough: same.filter((j) => j.r.spend > 0 && j.r.impressions >= MIN_IMPRESSIONS).length >= MIN_PEERS,
    });
  }

  return judged.map(({ r, goal, cost, count }) => {
    const { medCost, medSpend, enough } = peers.get(goal)!;
    const frequency = r.reach > 0 ? r.impressions / r.reach : null;
    const big = medSpend != null && r.spend >= medSpend;
    let verdict: Verdict = "ok";
    if (r.impressions < MIN_IMPRESSIONS) verdict = "low_data";
    else if ((frequency ?? 0) > FATIGUE_FREQUENCY) verdict = "fatigued";
    else if (!enough) verdict = "unrated";
    else if (big && cost != null && medCost != null && count >= WINNER_MIN_LEADS && cost <= medCost * WINNER_CPL_RATIO) verdict = "winner";
    else if (big && (cost == null || (medCost != null && cost >= medCost * WEAK_CPL_RATIO))) verdict = "weak";
    return {
      ...r,
      goal,
      cost,
      cpl: r.leads > 0 ? r.spend / r.leads : null,
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
