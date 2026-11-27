// Meta ads for one period: numbers, trend, winners, campaigns, pacing. Used by the Ads page, and with `full` (sales numbers and top
// creatives too) as the whole Overview of a client that sells no marketplace goods, and as the read-only share link.
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../lib/api";
import { fmtNum, fmtPct, fmtRp } from "../lib/format";
import type { SharedRange } from "../lib/range";
import { BudgetPacing, type Pacing } from "./BudgetPacing";
import { CampaignRanking } from "./CampaignRanking";
import { CreativeGrid, type Creative } from "./CreativeCards";
import { EntityTable, type Entity } from "./EntityTable";
import { KpiCard } from "./KpiCard";
import { Bento, Empty } from "./kit";
import { MetricTrend, type TrendDay } from "./MetricTrend";
import type { Platforms } from "./PlatformOverview";
import { CardSkeleton, ErrorState } from "./ui";

export type Meta = {
  client: { id: number; name: string; slug: string; logo_url: string | null; brand_color: string; target_cpa: number | null };
  accounts: Array<{
    id: number;
    account_name: string | null;
    last_sync: string | null;
    last_sync_status: string | null;
  }>;
  resultLabel: string;
  isShare: boolean;
  /** Sells through marketplaces (Jubelio orders, or Shopee / TikTok ad cost): only then is the per-platform view shown. */
  marketplace: boolean;
};

type Summary = {
  range: { from: string; to: string; prevFrom: string; prevTo: string };
  current: Totals;
  previous: Totals;
};
type Totals = {
  spend: number;
  results: number;
  leads: number;
  purchases: number;
  purchases_sent: number;
  purchase_value: number;
  ad_spend: number;
  reach: number;
  ctr: number | null;
  cpm: number | null;
  cpr: number | null;
  cpl: number | null;
  cpa: number | null;
  roas: number | null;
  frequency: number | null;
};

export function MetaSections({ clientId, period, share = false, full = share, children }: { clientId: number; period: SharedRange; share?: boolean; full?: boolean; children?: ReactNode }) {
  const { range, cmp, compare, compareOn, query } = period;
  const meta = useApi<Meta>(`/clients/${clientId}/meta`);
  const summary = useApi<Summary>(`/clients/${clientId}/summary?${query}`);
  const trend = useApi<{ days: TrendDay[]; compare?: TrendDay[]; bucket?: "day" | "week" | "month" }>(`/clients/${clientId}/trend?${query}`);
  const campaigns = useApi<{ entities: Entity[] }>(`/clients/${clientId}/entities?level=campaign&${query}`); // the same address EntityTable asks for, so the two share one answer
  const pacing = useApi<{ pacing: Pacing[] }>(`/clients/${clientId}/pacing`);
  const creatives = useApi<{ ads: Creative[] }>(full ? `/clients/${clientId}/creatives?from=${range.from}&to=${range.to}` : null);
  // what CS recorded as coming from Meta (the share link may not read this)
  const bought = useApi<Platforms>(full ? null : `/clients/${clientId}/platforms?from=${range.from}&to=${range.to}`);
  const boughtBefore = useApi<Platforms>(full || !compare ? null : `/clients/${clientId}/platforms?from=${compare.from}&to=${compare.to}`);

  const kpis = useMemo(() => {
    const c = summary.data?.current;
    const p = summary.data?.previous;
    // Target CPA is the most one sale may cost. ROAS needed to break even = average
    // sale value / target CPA, so it follows the real (varying) package prices.
    const target = meta.data?.client.target_cpa ?? null;
    const avgSale = c && c.purchases > 0 ? c.purchase_value / c.purchases : null;
    const needRoas = target && avgSale ? avgSale / target : null;
    const cpaNote: { text: string; tone?: "good" | "crit" | "muted" } | undefined = !target
      ? undefined
      : c?.cpa == null
        ? { text: `Target ${fmtRp(target)}`, tone: "muted" }
        : c.cpa <= target
          ? { text: `On target (${fmtRp(target)})`, tone: "good" }
          : { text: `${Math.round((c.cpa / target - 1) * 100)}% over target ${fmtRp(target)}`, tone: "crit" };
    const roasNote: { text: string; tone?: "good" | "crit" | "muted" } | undefined = needRoas
      ? c?.roas != null && c.roas >= needRoas
        ? { text: `Above the ${fmtNum(needRoas, 1)}x needed`, tone: "good" }
        : { text: `Needs ${fmtNum(needRoas, 1)}x to break even`, tone: c?.roas != null ? "crit" : "muted" }
      : undefined;
    // CPA and ROAS divide by every ad platform's cost, so say so when that differs from the Meta-only Spend tile.
    const allAds = c && c.ad_spend > c.spend ? `all ads ${fmtRp(c.ad_spend)}` : null;
    const withAds = (n?: { text: string; tone?: "good" | "crit" | "muted" }) =>
      !allAds ? n : n ? { ...n, text: `${n.text} · ${allAds}` } : { text: `Counts ${allAds}`, tone: "muted" as const };
    // Leads and purchases are the numbers that matter. Purchases are real sales
    // uploaded as offline conversions; Meta's own purchase counts are not used.
    const pct = (n: number | null | undefined) => fmtPct(n);
    const x = (n: number | null | undefined) => (n != null ? `${fmtNum(n, 1)}x` : "–");
    const f2 = (n: number | null | undefined) => fmtNum(n ?? null, 2);
    // Share of leads that became a sale in the same period (a rough close rate: sales can come from older leads).
    const leadToSale = (cur?: Totals, prev?: Totals) => {
      const r = (t?: Totals) => (t && t.leads > 0 ? (t.purchases / t.leads) * 100 : null);
      return { label: "Lead → Sale", dir: "higher-better" as const, note: undefined, value: fmtPct(r(cur)), cur: r(cur), prev: r(prev), prevText: prev ? fmtPct(r(prev)) : undefined };
    };
    type K = Exclude<keyof Totals, never>;
    const item = (label: string, fmt: (n: number | null | undefined) => string, key: K, dir: "higher-better" | "lower-better" | "neutral", note?: { text: string; tone?: "good" | "crit" | "muted" }) => ({
      label, dir, note,
      value: fmt(c?.[key] as number | null | undefined),
      cur: c?.[key] as number | null | undefined,
      prev: p?.[key] as number | null | undefined,
      prevText: p ? fmt(p[key] as number | null | undefined) : undefined,
    });
    const spend = item("Spend", fmtRp, "spend", "neutral");
    const leads = item("Leads", fmtNum, "leads", "higher-better");
    const cpl = item("Cost / Lead", fmtRp, "cpl", "lower-better");
    const delivery = [item("CTR", pct, "ctr", "higher-better"), item("CPM", fmtRp, "cpm", "lower-better"), item("Frequency", f2, "frequency", "neutral"), item("Reach", fmtNum, "reach", "higher-better")];
    if (!full) {
      const closings = (d?: Platforms) => (d ? d.ads.reduce((n, r) => n + (r.platform === "meta" ? r.orders : 0), 0) : null);
      const now = closings(bought.data), before = closings(boughtBefore.data);
      return [spend, leads, cpl, { label: "Purchases (CS sheet)", dir: "higher-better" as const, note: undefined, value: fmtNum(now), cur: now, prev: before, prevText: before != null ? fmtNum(before) : undefined }, ...delivery];
    }
    return [
      spend,
      leads,
      cpl,
      item("Purchases", fmtNum, "purchases", "higher-better", c && c.purchases > 0 ? { text: `${fmtNum(c.purchases_sent)} of ${fmtNum(c.purchases)} sent to Meta`, tone: "muted" } : undefined),
      leadToSale(c, p),
      item("Purchase value", fmtRp, "purchase_value", "higher-better"),
      item("CPA", fmtRp, "cpa", "lower-better", withAds(cpaNote)),
      item("ROAS", x, "roas", "higher-better", withAds(roasNote)),
      ...delivery,
    ];
  }, [summary.data, meta.data, bought.data, boughtBefore.data, full]);

  // One size for every number in the block: smaller and wider cells when any value is long.
  const longNumbers = kpis.some((x) => x.value.length > 13);

  return (
    <>
      {summary.error && <ErrorState message={summary.error} onRetry={summary.reload} />}
      <div className="grid gap-4 xl:grid-cols-12">
        {/* every metric in one card, one shape */}
        <Bento title={full ? "Key numbers" : "Meta ads"} className="xl:col-span-12">
          <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 ${longNumbers ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : full ? "sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" : "sm:grid-cols-4"}`}>
            {kpis.map((k) => (
              <div key={k.label} className="min-w-0 bg-surface px-4 py-3.5">
                <KpiCard
                  bare
                  dense={longNumbers}
                  label={k.label}
                  value={k.value}
                  current={k.cur}
                  previous={k.prev}
                  direction={k.dir}
                  note={k.note}
                  previousText={k.prevText}
                  compare={compareOn}
                  loading={summary.loading}
                />
              </div>
            ))}
          </div>
        </Bento>

        {/* trend */}
        <Bento title={trend.data?.bucket === "month" ? "Monthly trend" : trend.data?.bucket === "week" ? "Weekly trend" : "Daily trend"} subtitle={full ? "Spend, leads and purchases" : "Meta spend and leads"} className="xl:col-span-12">
          {trend.loading ? (
            <CardSkeleton lines={5} />
          ) : trend.error ? (
            <ErrorState message={trend.error} onRetry={trend.reload} />
          ) : (
            <MetricTrend days={trend.data?.days ?? []} compare={compareOn ? trend.data?.compare : undefined} metrics={full ? undefined : META_TREND} />
          )}
        </Bento>

        {full && (
          <Bento
            title="Top creatives by spend"
            className="xl:col-span-12"
            right={!share && <Link to={`/c/${clientId}/creatives`} className="inline-flex min-h-11 items-center text-xs font-medium text-musawara-ink hover:underline">All creatives</Link>}
          >
            {creatives.loading ? (
              <CardSkeleton lines={4} />
            ) : creatives.error ? (
              <ErrorState message={creatives.error} onRetry={creatives.reload} />
            ) : (creatives.data?.ads.length ?? 0) === 0 ? (
              <Empty title="No ads with delivery in this period" />
            ) : (
              <CreativeGrid ads={creatives.data!.ads.slice(0, 5)} />
            )}
          </Bento>
        )}

        {/* winners and boncos */}
        {(campaigns.data?.entities.length ?? 0) > 0 && (
          <Bento title="Winners and boncos" subtitle="Campaigns by spend, each judged on what it was run for" className="xl:col-span-12">
            <CampaignRanking rows={campaigns.data!.entities.map((e) => ({ id: e.entity_id, name: e.name ?? e.entity_id, spend: e.spend, leads: e.leads, objective: e.objective, link_clicks: e.link_clicks, reach: e.reach, impressions: e.impressions }))} />
          </Bento>
        )}

        {/* campaigns */}
        <Bento title="Campaigns" className="xl:col-span-12">
          <EntityTable bare clientId={clientId} from={range.from} to={range.to} compare={cmp} />
        </Bento>
        {children && <div className="min-w-0 xl:col-span-12">{children}</div>}
        <div className="grid min-w-0 gap-4 xl:col-span-12 xl:grid-cols-2">
          {(pacing.data?.pacing?.length ?? 0) > 0 && (
            <Bento title="Budget pacing" subtitle="This month, whatever dates are chosen">
              <BudgetPacing pacing={pacing.data!.pacing} />
            </Bento>
          )}
        </div>
      </div>
    </>
  );
}

const META_TREND = [
  { key: "spend", label: "Spend", fmt: (v: number) => fmtRp(v), color: "var(--color-chart-1)", money: true },
  { key: "leads", label: "Leads", fmt: (v: number) => fmtNum(v), color: "var(--color-chart-4)" },
];
