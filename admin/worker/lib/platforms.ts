// A client's overview, in two lists that are never mixed: what was spent per ad platform, and where the orders were placed.
// No order says which ad caused it, so the two are only compared as totals.
import type { D1Database } from "@cloudflare/workers-types";

export type AdRow = { key: string; name: string; spend: number; leads: number | null };
export type ChannelRow = { name: string; orders: number; sales: number };

const ADS = [
  { key: "meta", name: "Meta Ads", sources: ["meta"] },
  { key: "shopee", name: "Shopee Ads", sources: ["shopee"] },
  { key: "tiktok", name: "TikTok / Tokopedia Ads", sources: ["tiktok", "tokopedia"] },
  { key: "other", name: "Other ads", sources: ["other"] },
];
const CHANNEL: Record<string, string> = { Tokopedia: "TikTok / Tokopedia", "TikTok / Tokopedia Shop": "TikTok / Tokopedia" };

/** Meta, Shopee and TikTok are always listed, so a platform with nothing recorded is visible as such. */
export function adRows(spend: Array<{ source: string; amount: number }>, metaLeads: number): AdRow[] {
  return ADS.map((a) => ({
    key: a.key,
    name: a.name,
    spend: spend.filter((s) => a.sources.includes(s.source)).reduce((n, s) => n + s.amount, 0),
    leads: a.key === "meta" ? metaLeads : null,
  })).filter((r) => r.key !== "other" || r.spend > 0);
}

export function channelRows(sales: Array<{ source: string | null; orders: number; value: number }>): ChannelRow[] {
  const rows = new Map<string, ChannelRow>();
  for (const s of sales) {
    const name = CHANNEL[s.source ?? ""] ?? (s.source || "Not recorded");
    const r = rows.get(name) ?? { name, orders: 0, sales: 0 };
    rows.set(name, { name, orders: r.orders + s.orders, sales: r.sales + s.value });
  }
  return [...rows.values()].sort((a, b) => b.sales - a.sales);
}

export async function platformResults(db: D1Database, clientId: number, from: string, to: string) {
  const [spend, leads, sales, jubelio] = await Promise.all([
    db.prepare("SELECT source, SUM(amount) amount FROM spend_daily WHERE client_id=? AND category='ads' AND date BETWEEN ? AND ? GROUP BY source").bind(clientId, from, to).all<{ source: string; amount: number }>(),
    db.prepare(
      "SELECT COALESCE(SUM(i.leads), 0) leads FROM insights_daily i JOIN ad_accounts a ON a.id=i.ad_account_id WHERE a.client_id=? AND i.level='campaign' AND i.date BETWEEN ? AND ?"
    ).bind(clientId, from, to).first<{ leads: number }>(),
    db.prepare(
      `SELECT source, COUNT(*) orders, COALESCE(SUM(value), 0) value FROM dashboard_sales
        WHERE client_id=? AND sale_date BETWEEN ? AND ? AND deleted_at IS NULL AND COALESCE(pay_status, '') <> 'cancelled' GROUP BY source`
    ).bind(clientId, from, to).all<{ source: string | null; orders: number; value: number }>(),
    db.prepare("SELECT last_sync_at, last_error FROM jubelio_sync WHERE client_id=?").bind(clientId).first<{ last_sync_at: string | null; last_error: string | null }>(),
  ]);
  return { ads: adRows(spend.results, leads?.leads ?? 0), channels: channelRows(sales.results), jubelio: jubelio ?? null };
}
