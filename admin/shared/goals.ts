// What an ad or campaign is judged on depends on what it was run for: an awareness campaign is not weak for bringing no chats.
// Items are only compared with others of the same goal, and only when there are enough of them.

export type Goal = "lead" | "click" | "reach" | "view";
export const MIN_PEERS = 3;

export const GOAL_LABEL: Record<Goal, string> = { lead: "Cost / lead", click: "Cost / click", reach: "Cost / 1,000 reached", view: "Cost / 1,000 views" };

/** From the Meta campaign objective. Engagement campaigns that open chats are lead work; the rest are paying for views. */
export function goalOf(objective: string | null | undefined, campaignHasLeads: boolean): Goal {
  const o = (objective ?? "").replace(/^OUTCOME_/, "");
  if (o === "AWARENESS" || o === "BRAND_AWARENESS" || o === "REACH") return "reach";
  if (o === "TRAFFIC" || o === "LINK_CLICKS") return "click";
  if (o === "ENGAGEMENT" || o === "POST_ENGAGEMENT" || o === "VIDEO_VIEWS" || o === "PAGE_LIKES") return campaignHasLeads ? "lead" : "view";
  return "lead"; // sales, leads, messages, and anything unknown
}

type Numbers = { spend: number; leads: number; link_clicks?: number; reach?: number; impressions?: number };

/** The cost for this goal (lower is better) and how many results stand behind it; null when nothing was delivered. */
export function costOf(goal: Goal, r: Numbers): { cost: number | null; count: number } {
  const count = goal === "lead" ? r.leads : goal === "click" ? (r.link_clicks ?? 0) : goal === "reach" ? (r.reach ?? 0) : (r.impressions ?? 0);
  const per = goal === "reach" || goal === "view" ? 1000 : 1;
  return { cost: count > 0 ? (r.spend / count) * per : null, count };
}
