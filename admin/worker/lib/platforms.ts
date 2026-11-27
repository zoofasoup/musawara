// A client's overview per ad platform: what was spent, what each platform brought (its own report, or for Meta the closings CS
// wrote down), and where the orders were placed. The last two are never added together: no order says which ad caused it.
import type { D1Database } from "@cloudflare/workers-types";
import { bucketKey, trendBucket, type TrendBucket } from "./metrics.ts";
import { SPREAD_NOTE } from "./spread.ts";

export type PlatformKey = "meta" | "shopee" | "tiktok" | "other";
export type AdDayRow = { date: string; platform: PlatformKey; spend: number; revenue: number; orders: number };
export type ShopRow = { date: string; place: PlatformKey; orders: number; sales: number };

const PLATFORM: Record<string, PlatformKey> = { meta: "meta", shopee: "shopee", tiktok: "tiktok", tokopedia: "tiktok", other: "other" };
/** Marketplace order sources; everything else (WhatsApp, manual, a sales sheet's lead source) is "other". */
const PLACE: Record<string, PlatformKey> = { Shopee: "shopee", Tokopedia: "tiktok", "TikTok / Tokopedia Shop": "tiktok" };

/** Lead sources, as the CS team types them, that mean the customer came from Meta ("Instagram", "Web IG", "Ads IG", or just "Ads"). */
const META_LEAD = /\b(facebook|fb|instagram|ig|meta|ads)\b/i;
const NOT_META = /organi[ck]|tiktok|shopee|tokopedia|google/i;

/**
 * Per day (week or month for long ranges). Meta's `revenue`/`orders` are the closings CS recorded with a Meta lead source
 * (table `sales`, not dashboard_sales: a Jubelio brand's closings only say where a sale came from).
 */
export async function platformResults(db: D1Database, clientId: number, from: string, to: string, forceBucket?: TrendBucket) {
  const bucket = forceBucket ?? trendBucket(from, to);
  const range = [clientId, from, to] as const;
  const live = "deleted_at IS NULL AND COALESCE(pay_status, '') <> 'cancelled'";
  const [spend, claimed, closed, shop, spread, jubelio, samples] = await Promise.all([
    db.prepare(`SELECT ${bucketKey("date", bucket)} AS date, source, SUM(amount) amount FROM spend_daily WHERE client_id=? AND category='ads' AND date BETWEEN ? AND ? GROUP BY 1,2`)
      .bind(...range).all<{ date: string; source: string; amount: number }>(),
    db.prepare(`SELECT ${bucketKey("date", bucket)} AS date, source, SUM(revenue) revenue, SUM(orders) orders FROM ad_results WHERE client_id=? AND date BETWEEN ? AND ? GROUP BY 1,2`)
      .bind(...range).all<{ date: string; source: string; revenue: number; orders: number }>(),
    db.prepare(`SELECT ${bucketKey("sale_date", bucket)} AS date, source, COUNT(*) orders, COALESCE(SUM(value), 0) revenue FROM sales WHERE client_id=? AND sale_date BETWEEN ? AND ? AND ${live} GROUP BY 1,2`)
      .bind(...range).all<{ date: string; source: string | null; orders: number; revenue: number }>(),
    db.prepare(`SELECT ${bucketKey("sale_date", bucket)} AS date, source, COUNT(*) orders, COALESCE(SUM(value), 0) sales FROM dashboard_sales WHERE client_id=? AND sale_date BETWEEN ? AND ? AND ${live} GROUP BY 1,2`)
      .bind(...range).all<{ date: string; source: string | null; orders: number; sales: number }>(),
    db.prepare("SELECT DISTINCT source FROM spend_entries WHERE client_id=? AND date BETWEEN ? AND ? AND note=?")
      .bind(...range, SPREAD_NOTE).all<{ source: string }>(),
    db.prepare("SELECT last_sync_at, last_error FROM jubelio_sync WHERE client_id=?").bind(clientId).first<{ last_sync_at: string | null; last_error: string | null }>(),
    db.prepare("SELECT COUNT(*) orders, COALESCE(SUM(total), 0) value FROM jubelio_orders WHERE client_id=? AND sample=1 AND canceled=0 AND paid=1 AND day BETWEEN ? AND ?")
      .bind(...range).first<{ orders: number; value: number }>(),
  ]);

  const rows = new Map<string, AdDayRow>();
  const row = (date: string, source: string) => {
    const platform = PLATFORM[source] ?? "other";
    const key = `${date}|${platform}`;
    return rows.get(key) ?? rows.set(key, { date, platform, spend: 0, revenue: 0, orders: 0 }).get(key)!;
  };
  for (const s of spend.results) if (s.amount > 0) row(s.date, s.source).spend += s.amount;
  for (const r of claimed.results) { const x = row(r.date, r.source); x.revenue += r.revenue; x.orders += r.orders; }
  for (const s of closed.results) {
    if (!META_LEAD.test(s.source ?? "") || NOT_META.test(s.source ?? "")) continue;
    const x = row(s.date, "meta"); x.revenue += s.revenue; x.orders += s.orders;
  }

  const places = new Map<string, ShopRow>();
  for (const s of shop.results) {
    const place = PLACE[s.source ?? ""] ?? "other";
    const key = `${s.date}|${place}`;
    const x = places.get(key) ?? places.set(key, { date: s.date, place, orders: 0, sales: 0 }).get(key)!;
    x.orders += s.orders; x.sales += s.sales;
  }

  const byDate = <T extends { date: string }>(list: Iterable<T>) => [...list].sort((a, b) => a.date.localeCompare(b.date));
  return {
    bucket,
    ads: byDate(rows.values()),
    shop: byDate(places.values()),
    estimated: [...new Set(spread.results.map((r) => PLATFORM[r.source] ?? "other"))],
    jubelio: jubelio ?? null,
    samples: samples ?? { orders: 0, value: 0 },
  };
}
