// Results per platform for a client's overview: what was spent on ads there next to what was sold there. Meta ads sell through
// other channels and the internal channel has no ad account, so those rows show one side only; no ratio is invented for them.
import type { D1Database } from "@cloudflare/workers-types";

export type PlatformRow = { platform: string; spend: number; orders: number; sales: number; ratio: number | null };

const OF_SPEND: Record<string, string> = { meta: "Meta ads", shopee: "Shopee", tiktok: "TikTok / Tokopedia", tokopedia: "TikTok / Tokopedia", other: "Other" };
const OF_SALES: Record<string, string> = { Shopee: "Shopee", Tokopedia: "TikTok / Tokopedia", "TikTok / Tokopedia Shop": "TikTok / Tokopedia" };
const ORDER = ["Meta ads", "Shopee", "TikTok / Tokopedia"];

export function platformRows(spend: Array<{ source: string; amount: number }>, sales: Array<{ source: string | null; orders: number; value: number }>): PlatformRow[] {
  const rows = new Map<string, PlatformRow>();
  const row = (platform: string) => rows.get(platform) ?? rows.set(platform, { platform, spend: 0, orders: 0, sales: 0, ratio: null }).get(platform)!;
  for (const s of spend) row(OF_SPEND[s.source] ?? s.source).spend += s.amount;
  for (const s of sales) {
    const r = row(OF_SALES[s.source ?? ""] ?? (s.source || "Not recorded"));
    r.orders += s.orders;
    r.sales += s.value;
  }
  const at = (p: string) => (ORDER.indexOf(p) + 1 || ORDER.length + 1);
  return [...rows.values()]
    .map((r) => ({ ...r, ratio: r.spend > 0 && r.sales > 0 ? r.sales / r.spend : null }))
    .sort((a, b) => at(a.platform) - at(b.platform) || b.sales - a.sales);
}

export async function platformResults(db: D1Database, clientId: number, from: string, to: string) {
  const [spend, sales, jubelio] = await Promise.all([
    db.prepare("SELECT source, SUM(amount) amount FROM spend_daily WHERE client_id=? AND date BETWEEN ? AND ? GROUP BY source").bind(clientId, from, to).all<{ source: string; amount: number }>(),
    db.prepare(
      `SELECT source, COUNT(*) orders, COALESCE(SUM(value), 0) value FROM dashboard_sales
        WHERE client_id=? AND sale_date BETWEEN ? AND ? AND deleted_at IS NULL AND COALESCE(pay_status, '') <> 'cancelled' GROUP BY source`
    ).bind(clientId, from, to).all<{ source: string | null; orders: number; value: number }>(),
    db.prepare("SELECT last_sync_at, last_error FROM jubelio_sync WHERE client_id=?").bind(clientId).first<{ last_sync_at: string | null; last_error: string | null }>(),
  ]);
  return { rows: platformRows(spend.results.filter((s) => s.amount > 0), sales.results), jubelio: jubelio ?? null };
}
