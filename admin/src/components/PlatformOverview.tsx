// The Overview's business view: ad spend, sales, ROAS and CPA for all platforms or one, how spend and sales split per platform,
// and their trend. "All" compares every ad rupiah with every recorded sale. One platform compares its cost with what came from its
// ads (Shopee and TikTok report that themselves; for Meta it is the CS sheet). Those per-platform claims are never added up.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../lib/api";
import { addDays } from "../lib/dates";
import { fmtDateTime, fmtNum, fmtRp } from "../lib/format";
import type { SharedRange } from "../lib/range";
import { Callout } from "./Callout";
import { KpiCard } from "./KpiCard";
import { Bento, Empty } from "./kit";
import { MetricTrend } from "./MetricTrend";
import { Segmented } from "./Segmented";
import { CardSkeleton, ErrorState } from "./ui";

export type PlatformKey = "meta" | "shopee" | "tiktok" | "other";
export type Platforms = {
  bucket: "day" | "week" | "month";
  ads: Array<{ date: string; platform: PlatformKey; spend: number; revenue: number; orders: number }>;
  shop: Array<{ date: string; place: PlatformKey; orders: number; sales: number }>;
  estimated: PlatformKey[];
  jubelio: { last_sync_at: string | null; last_error: string | null } | null;
  samples: { orders: number; value: number };
};

type View = "all" | "meta" | "shopee" | "tiktok";
const VIEWS: Array<{ value: View; label: string }> = [{ value: "all", label: "All" }, { value: "meta", label: "Meta" }, { value: "shopee", label: "Shopee" }, { value: "tiktok", label: "TikTok" }];
export const PLATFORM_NAME: Record<PlatformKey, string> = { meta: "Meta", shopee: "Shopee", tiktok: "TikTok / Tokopedia", other: "Not on a marketplace" };

/** Cost, sales and number of sales for one view of a period. */
export function totalsOf(data: Platforms, view: View | PlatformKey) {
  const ads = data.ads.filter((r) => view === "all" || r.platform === view);
  const spend = ads.reduce((n, r) => n + r.spend, 0);
  const sales = view === "all" ? data.shop.reduce((n, r) => n + r.sales, 0) : ads.reduce((n, r) => n + r.revenue, 0);
  const count = view === "all" ? data.shop.reduce((n, r) => n + r.orders, 0) : ads.reduce((n, r) => n + r.orders, 0);
  return { spend, sales, count, roas: spend > 0 && sales > 0 ? sales / spend : null, cpa: spend > 0 && count > 0 ? spend / count : null };
}

const times = (v: number | null) => (v == null ? "–" : `${fmtNum(v, 2)}x`);
const share = (part: number, whole: number) => (whole > 0 && part > 0 ? `${fmtNum((part / whole) * 100)}%` : "–");
const money = (v: number) => (v ? fmtRp(v) : "–");

function days(data: Platforms, view: View, from: string, to: string) {
  const by = new Map<string, { date: string; spend: number; sales: number; orders: number }>();
  const day = (date: string) => by.get(date) ?? by.set(date, { date, spend: 0, sales: 0, orders: 0 }).get(date)!;
  // daily: every day of the period has a place, so quiet days are visible and the comparison lines up day by day
  if (data.bucket === "day" && (data.ads.length || data.shop.length)) for (let d = from; d <= to; d = addDays(d, 1)) day(d);
  for (const r of data.ads) {
    if (view !== "all" && r.platform !== view) continue;
    const d = day(r.date);
    d.spend += r.spend;
    if (view !== "all") { d.sales += r.revenue; d.orders += r.orders; }
  }
  if (view === "all") for (const r of data.shop) { const d = day(r.date); d.sales += r.sales; d.orders += r.orders; }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const TREND = [
  { key: "spend", label: "Ad spend", fmt: (v: number) => fmtRp(v), color: "var(--color-chart-1)", money: true },
  { key: "sales", label: "Sales", fmt: (v: number) => fmtRp(v), color: "var(--color-chart-3)", money: true },
  { key: "orders", label: "Purchases", fmt: (v: number) => fmtNum(v), color: "var(--color-chart-4)" },
];

function SplitTable({ data }: { data: Platforms }) {
  const all = totalsOf(data, "all");
  const rows = (["meta", "shopee", "tiktok", "other"] as PlatformKey[]).map((key) => ({
    key,
    ...totalsOf(data, key),
    shop: data.shop.reduce((n, r) => n + (r.place === key ? r.sales : 0), 0),
  })).filter((r) => r.key !== "other" || r.spend || r.shop);
  const head = ["Platform", "Ad spend", "Share of spend", "Shop sales", "Share of sales", "From its ads", "ROAS", "CPA"];
  const lines = [
    ...rows.map((r) => [PLATFORM_NAME[r.key], money(r.spend), share(r.spend, all.spend), money(r.shop), share(r.shop, all.sales), money(r.sales), times(r.roas), fmtRp(r.cpa)]),
    ["Total", money(all.spend), share(all.spend, all.spend), money(all.sales), share(all.sales, all.sales), "–", times(all.roas), fmtRp(all.cpa)],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr>{head.map((h, i) => <th key={h} className={`whitespace-nowrap px-3 py-2 text-xs font-medium text-muted ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
        <tbody>
          {lines.map((cells) => (
            <tr key={cells[0]} className={`border-t border-border ${cells[0] === "Total" ? "font-semibold" : ""}`}>
              {cells.map((c, i) => <td key={i} className={`whitespace-nowrap px-3 py-2 text-ink ${i ? "tnum text-right" : "font-medium"}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PlatformOverview({ clientId, period, targetCpa, reloadKey }: { clientId: number; period: SharedRange; targetCpa: number | null; reloadKey: number }) {
  const [view, setView] = useState<View>("all");
  const { range, compare } = period;
  const now = useApi<Platforms>(`/clients/${clientId}/platforms?from=${range.from}&to=${range.to}&v=${reloadKey}`);
  const before = useApi<Platforms>(compare && now.data ? `/clients/${clientId}/platforms?from=${compare.from}&to=${compare.to}&bucket=${now.data.bucket}&v=${reloadKey}` : null);

  if (now.error) return <ErrorState message={now.error} onRetry={now.reload} />;
  if (!now.data) return <CardSkeleton lines={6} />;
  const data = now.data;
  const t = totalsOf(data, view);
  const p = compare && before.data ? totalsOf(before.data, view) : null;
  const name = view === "all" ? "" : PLATFORM_NAME[view];

  // Break-even ROAS = average sale / the most a sale may cost, so it follows the real prices.
  const need = view === "all" && targetCpa && t.count > 0 ? t.sales / t.count / targetCpa : null;
  const cpaNote = view !== "all" || !targetCpa ? undefined
    : t.cpa == null ? { text: `Target ${fmtRp(targetCpa)}`, tone: "muted" as const }
    : t.cpa <= targetCpa ? { text: `On target (${fmtRp(targetCpa)})`, tone: "good" as const }
    : { text: `${fmtNum((t.cpa / targetCpa - 1) * 100)}% over target ${fmtRp(targetCpa)}`, tone: "crit" as const };
  const roasNote = !need ? undefined : t.roas != null && t.roas >= need ? { text: `Above the ${fmtNum(need, 1)}x needed`, tone: "good" as const } : { text: `Needs ${fmtNum(need, 1)}x to break even`, tone: "crit" as const };

  const cards = [
    { label: "Ad spend", value: money(t.spend), cur: t.spend, prev: p?.spend, dir: "neutral" as const, prevText: p ? money(p.spend) : undefined, note: undefined },
    { label: view === "all" ? "Sales" : "Sales from its ads", value: money(t.sales), cur: t.sales, prev: p?.sales, dir: "higher-better" as const, prevText: p ? money(p.sales) : undefined, note: t.count ? { text: `${fmtNum(t.count)} ${t.count === 1 ? "purchase" : "purchases"}`, tone: "muted" as const } : undefined },
    { label: "ROAS", value: times(t.roas), cur: t.roas, prev: p?.roas, dir: "higher-better" as const, prevText: p ? times(p.roas) : undefined, note: roasNote },
    { label: "CPA", value: fmtRp(t.cpa), cur: t.cpa, prev: p?.cpa, dir: "lower-better" as const, prevText: p ? fmtRp(p.cpa) : undefined, note: cpaNote },
  ];
  const estimated = data.estimated.filter((k) => view === "all" || k === view);

  return (
    <div className="grid gap-4">
      <div><Segmented label="Platform" value={view} onChange={setView} options={VIEWS} /></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <KpiCard key={c.label} label={c.label} value={c.value} current={c.cur} previous={c.prev} previousText={c.prevText} direction={c.dir} note={c.note} compare={!!compare} />
        ))}
      </div>

      <Bento title="Spend and sales by platform" subtitle="In the chosen period">
        {data.ads.length || data.shop.length ? <SplitTable data={data} /> : <Empty title="No spend or sales in this period" />}
        <div className="mt-3 space-y-1.5 text-xs text-muted">
          <p>
            ROAS and CPA per platform use only what came from its ads: Shopee and TikTok report that themselves, Meta is the CS sheet (a minimum).
            Platforms can claim the same sale, so those are never added up. The total row uses every recorded sale.
          </p>
          {estimated.length > 0 && <p>{estimated.map((k) => PLATFORM_NAME[k]).join(" and ")}: the report only gives monthly totals, spread evenly per day, so parts of a month are estimates.</p>}
          {data.samples.orders > 0 && <p>Not counted as sales: {fmtNum(data.samples.orders)} free affiliate samples, listed at {fmtRp(data.samples.value)}.</p>}
          {data.jubelio?.last_sync_at && <p>Orders last synced {fmtDateTime(data.jubelio.last_sync_at)}.</p>}
          <p><Link to="/spend" className="font-medium text-musawara-ink underline">Add Shopee or TikTok ad reports on the Spend page</Link></p>
        </div>
        {data.jubelio?.last_error && <Callout tone="crit" compact>The last order sync failed: {data.jubelio.last_error}</Callout>}
      </Bento>

      <Bento title={data.bucket === "month" ? "Monthly trend" : data.bucket === "week" ? "Weekly trend" : "Daily trend"} subtitle={view === "all" ? "Ad spend and sales" : `${name}: ad spend and what came from its ads`}>
        <MetricTrend days={days(data, view, range.from, range.to)} compare={compare && before.data ? days(before.data, view, compare.from, compare.to) : undefined} metrics={TREND} />
      </Bento>
    </div>
  );
}
