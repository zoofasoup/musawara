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

export type MonthRow = { month: string; spend: number; result: number; adOrders: number; shopOrders: number; shopSales: number };

/** One platform month by month. `result` is what the platform itself reports: chat leads for Meta, attributed revenue elsewhere. */
async function platformMonths(db: D1Database, clientId: number, from: string, to: string) {
  const [spend, leads, results, shop] = await Promise.all([
    db.prepare("SELECT substr(date,1,7) month, source, SUM(amount) amount FROM spend_daily WHERE client_id=? AND category='ads' AND date BETWEEN ? AND ? GROUP BY 1,2").bind(clientId, from, to).all<{ month: string; source: string; amount: number }>(),
    db.prepare(
      "SELECT substr(i.date,1,7) month, COALESCE(SUM(i.leads), 0) leads FROM insights_daily i JOIN ad_accounts a ON a.id=i.ad_account_id WHERE a.client_id=? AND i.level='campaign' AND i.date BETWEEN ? AND ? GROUP BY 1"
    ).bind(clientId, from, to).all<{ month: string; leads: number }>(),
    db.prepare("SELECT substr(date,1,7) month, source, SUM(revenue) revenue, SUM(orders) orders FROM ad_results WHERE client_id=? AND date BETWEEN ? AND ? GROUP BY 1,2").bind(clientId, from, to).all<{ month: string; source: string; revenue: number; orders: number }>(),
    db.prepare(
      `SELECT substr(sale_date,1,7) month, source, COUNT(*) orders, COALESCE(SUM(value), 0) value FROM dashboard_sales
        WHERE client_id=? AND sale_date BETWEEN ? AND ? AND deleted_at IS NULL AND COALESCE(pay_status, '') <> 'cancelled' GROUP BY 1,2`
    ).bind(clientId, from, to).all<{ month: string; source: string | null; orders: number; value: number }>(),
  ]);
  const of = (sources: string[], channel: string | null) => {
    const rows = new Map<string, MonthRow>();
    const row = (month: string) => rows.get(month) ?? rows.set(month, { month, spend: 0, result: 0, adOrders: 0, shopOrders: 0, shopSales: 0 }).get(month)!;
    for (const s of spend.results) if (sources.includes(s.source) && s.amount > 0) row(s.month).spend += s.amount;
    for (const r of results.results) if (sources.includes(r.source)) { const x = row(r.month); x.result += r.revenue; x.adOrders += r.orders; }
    if (sources.includes("meta")) for (const l of leads.results) if (l.leads > 0) row(l.month).result += l.leads;
    if (channel) for (const s of shop.results) if ((CHANNEL[s.source ?? ""] ?? s.source) === channel) { const x = row(s.month); x.shopOrders += s.orders; x.shopSales += s.value; }
    return [...rows.values()].sort((a, b) => a.month.localeCompare(b.month));
  };
  return { meta: of(["meta"], null), shopee: of(["shopee"], "Shopee"), tiktok: of(["tiktok", "tokopedia"], "TikTok / Tokopedia") };
}

export async function platformResults(db: D1Database, clientId: number, from: string, to: string) {
  const detail = await platformMonths(db, clientId, from, to);
  const [spend, leads, sales, jubelio, samples] = await Promise.all([
    db.prepare("SELECT source, SUM(amount) amount FROM spend_daily WHERE client_id=? AND category='ads' AND date BETWEEN ? AND ? GROUP BY source").bind(clientId, from, to).all<{ source: string; amount: number }>(),
    db.prepare(
      "SELECT COALESCE(SUM(i.leads), 0) leads FROM insights_daily i JOIN ad_accounts a ON a.id=i.ad_account_id WHERE a.client_id=? AND i.level='campaign' AND i.date BETWEEN ? AND ?"
    ).bind(clientId, from, to).first<{ leads: number }>(),
    db.prepare(
      `SELECT source, COUNT(*) orders, COALESCE(SUM(value), 0) value FROM dashboard_sales
        WHERE client_id=? AND sale_date BETWEEN ? AND ? AND deleted_at IS NULL AND COALESCE(pay_status, '') <> 'cancelled' GROUP BY source`
    ).bind(clientId, from, to).all<{ source: string | null; orders: number; value: number }>(),
    db.prepare("SELECT last_sync_at, last_error FROM jubelio_sync WHERE client_id=?").bind(clientId).first<{ last_sync_at: string | null; last_error: string | null }>(),
    db.prepare("SELECT COUNT(*) orders, COALESCE(SUM(total), 0) value FROM jubelio_orders WHERE client_id=? AND sample=1 AND canceled=0 AND paid=1 AND day BETWEEN ? AND ?")
      .bind(clientId, from, to).first<{ orders: number; value: number }>(),
  ]);
  return { ads: adRows(spend.results, leads?.leads ?? 0), channels: channelRows(sales.results), jubelio: jubelio ?? null, samples: samples ?? { orders: 0, value: 0 }, detail };
}
