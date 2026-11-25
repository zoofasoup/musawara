// Shopee Open Platform v2 client, for the sales dashboard only (read-only calls).
//
// Privacy: Shopee's Data Protection Policy forbids keeping buyer personal data past 90 days, and this
// dashboard has no use for it. pickOrder() is the single place a Shopee order becomes a stored row and it
// copies an explicit allow-list of fields, so buyer name, phone, address and email can never reach D1.
import { decryptString, encryptString } from "./secretbox";
import type { Env } from "../types";

export type ShopeeCfg = { partnerId: number; partnerKey: string; host: string };
type Shop = { accessToken: string; shopId: number };
type Fetch = typeof fetch;

export const DEFAULT_HOST = "https://partner.shopeemobile.com";
const WINDOW_SECONDS = 15 * 24 * 3600; // get_order_list accepts at most 15 days per call
const FIRST_SYNC_DAYS = 30;
const MAX_LIST_PAGES = 30;
const DETAIL_BATCH = 50;
const DETAIL_FIELDS = "item_list,total_amount";
/** Orders that never became (or stopped being) a sale. */
export const NOT_A_SALE = ["UNPAID", "CANCELLED", "IN_CANCEL"];

export class ShopeeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message ? `${code}: ${message}` : code);
    this.code = code;
  }
}

/** Null until SHOPEE_PARTNER_ID and SHOPEE_PARTNER_KEY are set as Worker secrets. */
export function shopeeCfg(env: Pick<Env, "SHOPEE_PARTNER_ID" | "SHOPEE_PARTNER_KEY" | "SHOPEE_API_HOST">): ShopeeCfg | null {
  const partnerId = Number(env.SHOPEE_PARTNER_ID);
  if (!Number.isInteger(partnerId) || partnerId <= 0 || !env.SHOPEE_PARTNER_KEY) return null;
  return { partnerId, partnerKey: env.SHOPEE_PARTNER_KEY, host: (env.SHOPEE_API_HOST || DEFAULT_HOST).replace(/\/$/, "") };
}

export async function hmacHex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Shopee signs partner_id + path + timestamp, plus access_token + shop_id for shop-level calls. */
export const signRequest = (cfg: ShopeeCfg, path: string, ts: number, shop?: Shop) =>
  hmacHex(cfg.partnerKey, `${cfg.partnerId}${path}${ts}${shop ? shop.accessToken + shop.shopId : ""}`);

/** The page the shop owner opens to authorise this app. Shopee redirects back with ?code and ?shop_id. */
export async function authUrl(cfg: ShopeeCfg, redirect: string, ts = Math.floor(Date.now() / 1000)): Promise<string> {
  const path = "/api/v2/shop/auth_partner";
  const q = new URLSearchParams({ partner_id: String(cfg.partnerId), timestamp: String(ts), sign: await signRequest(cfg, path, ts), redirect });
  return `${cfg.host}${path}?${q}`;
}

type CallOpts = { method?: "GET" | "POST"; shop?: Shop; query?: Record<string, string | number>; body?: unknown; ts?: number; fetchImpl?: Fetch };

/** One signed call. Returns the `response` object (token calls answer at the top level, so that is returned instead). */
export async function shopeeCall(cfg: ShopeeCfg, path: string, o: CallOpts = {}): Promise<any> {
  const ts = o.ts ?? Math.floor(Date.now() / 1000);
  const q = new URLSearchParams({ partner_id: String(cfg.partnerId), timestamp: String(ts), sign: await signRequest(cfg, path, ts, o.shop) });
  if (o.shop) {
    q.set("access_token", o.shop.accessToken);
    q.set("shop_id", String(o.shop.shopId));
  }
  for (const [k, v] of Object.entries(o.query ?? {})) q.set(k, String(v));
  const res = await (o.fetchImpl ?? fetch)(`${cfg.host}${path}?${q}`, {
    method: o.method ?? "GET",
    headers: o.body === undefined ? undefined : { "content-type": "application/json" },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (json.error) throw new ShopeeError(String(json.error), String(json.message ?? ""));
  if (!res.ok) throw new ShopeeError(`http_${res.status}`, "");
  return json.response ?? json;
}

export type Tokens = { accessToken: string; refreshToken: string; accessExpiresAt: number; refreshExpiresAt: number };
const REFRESH_TOKEN_DAYS = 30;
const tokensFrom = (r: any, now: number): Tokens => ({
  accessToken: String(r.access_token),
  refreshToken: String(r.refresh_token),
  accessExpiresAt: now + Number(r.expire_in ?? 14400),
  refreshExpiresAt: now + REFRESH_TOKEN_DAYS * 24 * 3600,
});

export async function exchangeCode(cfg: ShopeeCfg, code: string, shopId: number, fetchImpl?: Fetch, now = Math.floor(Date.now() / 1000)): Promise<Tokens> {
  const r = await shopeeCall(cfg, "/api/v2/auth/token/get", { method: "POST", body: { code, shop_id: shopId, partner_id: cfg.partnerId }, fetchImpl, ts: now });
  return tokensFrom(r, now);
}

export async function refreshTokens(cfg: ShopeeCfg, refreshToken: string, shopId: number, fetchImpl?: Fetch, now = Math.floor(Date.now() / 1000)): Promise<Tokens> {
  const r = await shopeeCall(cfg, "/api/v2/auth/access_token/get", { method: "POST", body: { refresh_token: refreshToken, shop_id: shopId, partner_id: cfg.partnerId }, fetchImpl, ts: now });
  return tokensFrom(r, now);
}

export type ItemRow = { item_id: number; model_id: number; item_name: string; quantity: number; unit_price: number };
export type OrderRow = { order_sn: string; status: string; created_ts: number; updated_ts: number; total_amount: number; currency: string; items: ItemRow[] };

/** Allow-list copy of a Shopee order. Anything not named here (buyer, recipient, address, phone, notes) is dropped. */
export function pickOrder(raw: any): OrderRow | null {
  if (!raw || typeof raw.order_sn !== "string" || !raw.order_sn) return null;
  const items: ItemRow[] = (Array.isArray(raw.item_list) ? raw.item_list : []).map((i: any) => ({
    item_id: Number(i.item_id) || 0,
    model_id: Number(i.model_id) || 0,
    item_name: String(i.item_name ?? "").slice(0, 200),
    quantity: Number(i.model_quantity_purchased) || 0,
    unit_price: Number(i.model_discounted_price ?? i.model_original_price) || 0,
  }));
  return {
    order_sn: raw.order_sn,
    status: String(raw.order_status ?? "UNKNOWN"),
    created_ts: Number(raw.create_time) || 0,
    updated_ts: Number(raw.update_time) || 0,
    total_amount: Number(raw.total_amount) || 0,
    currency: String(raw.currency ?? "IDR"),
    items,
  };
}

/** SQL for one order: upsert the row, replace its items. Pure, so it can be unit tested. */
export function orderStatements(db: D1Database, clientId: number, o: OrderRow): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT INTO shopee_orders (client_id,order_sn,status,created_ts,updated_ts,total_amount,currency) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT (client_id,order_sn) DO UPDATE SET status=excluded.status, updated_ts=excluded.updated_ts, total_amount=excluded.total_amount, currency=excluded.currency`
      )
      .bind(clientId, o.order_sn, o.status, o.created_ts, o.updated_ts, o.total_amount, o.currency),
    db.prepare(`DELETE FROM shopee_order_items WHERE client_id=? AND order_sn=?`).bind(clientId, o.order_sn),
    ...o.items.map((i) =>
      db
        .prepare(`INSERT OR REPLACE INTO shopee_order_items (client_id,order_sn,item_id,model_id,item_name,quantity,unit_price) VALUES (?,?,?,?,?,?,?)`)
        .bind(clientId, o.order_sn, i.item_id, i.model_id, i.item_name, i.quantity, i.unit_price)
    ),
  ];
}

export async function saveShop(env: Pick<Env, "DB" | "JWT_SECRET">, clientId: number, shopId: number, t: Tokens, syncedTo: number) {
  const [a, r] = await Promise.all([encryptString(env.JWT_SECRET, t.accessToken), encryptString(env.JWT_SECRET, t.refreshToken)]);
  await env.DB
    .prepare(
      `INSERT INTO shopee_shops (client_id,shop_id,access_token_enc,refresh_token_enc,access_expires_at,refresh_expires_at,synced_to)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT (client_id) DO UPDATE SET shop_id=excluded.shop_id, access_token_enc=excluded.access_token_enc, refresh_token_enc=excluded.refresh_token_enc,
         access_expires_at=excluded.access_expires_at, refresh_expires_at=excluded.refresh_expires_at, last_error=NULL, updated_at=datetime('now')`
    )
    .bind(clientId, shopId, a, r, t.accessExpiresAt, t.refreshExpiresAt, syncedTo)
    .run();
}

/** Connect (or re-connect) a shop. A re-connect keeps the existing sync position. */
export async function connectShop(env: Pick<Env, "DB" | "JWT_SECRET">, cfg: ShopeeCfg, clientId: number, code: string, shopId: number, fetchImpl?: Fetch, now = Math.floor(Date.now() / 1000)) {
  const t = await exchangeCode(cfg, code, shopId, fetchImpl, now);
  const prev = await env.DB.prepare(`SELECT synced_to FROM shopee_shops WHERE client_id=? AND shop_id=?`).bind(clientId, shopId).first<{ synced_to: number }>();
  await saveShop(env, clientId, shopId, t, prev?.synced_to ?? now - FIRST_SYNC_DAYS * 24 * 3600);
}

/** A usable access token, refreshing (and storing the new pair) when it is about to expire. */
async function freshShop(env: Pick<Env, "DB" | "JWT_SECRET">, cfg: ShopeeCfg, clientId: number, fetchImpl: Fetch | undefined, now: number) {
  const row = await env.DB.prepare(`SELECT * FROM shopee_shops WHERE client_id=?`).bind(clientId).first<any>();
  if (!row) throw new ShopeeError("not_connected", "Toko Shopee belum terhubung");
  if (row.refresh_expires_at <= now) throw new ShopeeError("reauthorize", "Otorisasi Shopee kedaluwarsa, hubungkan ulang toko");
  if (row.access_expires_at - 300 > now) return { row, shop: { accessToken: await decryptString(env.JWT_SECRET, row.access_token_enc), shopId: row.shop_id } as Shop };
  const t = await refreshTokens(cfg, await decryptString(env.JWT_SECRET, row.refresh_token_enc), row.shop_id, fetchImpl, now);
  await saveShop(env, clientId, row.shop_id, t, row.synced_to);
  return { row, shop: { accessToken: t.accessToken, shopId: row.shop_id } as Shop };
}

/** Pull one window (at most 15 days) of changed orders and advance the sync position. Call again until `caughtUp`. */
export async function syncShop(env: Pick<Env, "DB" | "JWT_SECRET">, cfg: ShopeeCfg, clientId: number, fetchImpl?: Fetch, now = Math.floor(Date.now() / 1000)) {
  try {
    const { row, shop } = await freshShop(env, cfg, clientId, fetchImpl, now);
    const from = row.synced_to;
    const to = Math.min(now, from + WINDOW_SECONDS);
    const sns: string[] = [];
    let cursor = "";
    for (let page = 0; ; page++) {
      if (page >= MAX_LIST_PAGES) throw new ShopeeError("too_many_orders", "Terlalu banyak pesanan dalam satu jendela");
      const r = await shopeeCall(cfg, "/api/v2/order/get_order_list", {
        shop, fetchImpl, ts: now,
        query: { time_range_field: "update_time", time_from: from, time_to: to, page_size: 100, ...(cursor ? { cursor } : {}) },
      });
      for (const o of r.order_list ?? []) if (o?.order_sn) sns.push(String(o.order_sn));
      if (!r.more) break;
      cursor = String(r.next_cursor ?? "");
      if (!cursor) break;
    }
    let saved = 0;
    for (let i = 0; i < sns.length; i += DETAIL_BATCH) {
      const r = await shopeeCall(cfg, "/api/v2/order/get_order_detail", {
        shop, fetchImpl, ts: now,
        query: { order_sn_list: sns.slice(i, i + DETAIL_BATCH).join(","), response_optional_fields: DETAIL_FIELDS },
      });
      const orders = (r.order_list ?? []).map(pickOrder).filter((o: OrderRow | null): o is OrderRow => o !== null);
      const stmts = orders.flatMap((o: OrderRow) => orderStatements(env.DB, clientId, o));
      for (let j = 0; j < stmts.length; j += 90) await env.DB.batch(stmts.slice(j, j + 90));
      saved += orders.length;
    }
    await env.DB.prepare(`UPDATE shopee_shops SET synced_to=?, last_sync_at=datetime('now'), last_error=NULL WHERE client_id=?`).bind(to, clientId).run();
    return { orders: saved, from, to, caughtUp: to >= now };
  } catch (e: any) {
    // Only Shopee's own error text is shown to the team; anything else is logged and summarised.
    if (!(e instanceof ShopeeError)) console.error("shopee sync failed", e);
    await env.DB.prepare(`UPDATE shopee_shops SET last_error=? WHERE client_id=?`).bind(e instanceof ShopeeError ? e.message.slice(0, 300) : "Unexpected error while syncing", clientId).run();
    throw e;
  }
}

/**
 * The hourly job: every connected shop, window after window until caught up (at most 8 windows per run, so a first sync that is
 * far behind finishes over a few runs). One shop failing does not stop the others; its error is kept on the shop and the job reports it.
 */
export async function syncAllShops(env: Pick<Env, "DB" | "JWT_SECRET">, cfg: ShopeeCfg, fetchImpl?: Fetch, now = Math.floor(Date.now() / 1000)) {
  const shops = (await env.DB.prepare(`SELECT client_id FROM shopee_shops ORDER BY client_id`).all<{ client_id: number }>()).results;
  let orders = 0;
  const failed: number[] = [];
  for (const { client_id } of shops) {
    try {
      for (let i = 0; i < 8; i++) {
        const r = await syncShop(env, cfg, client_id, fetchImpl, now);
        orders += r.orders;
        if (r.caughtUp) break;
      }
    } catch {
      failed.push(client_id);
    }
  }
  if (failed.length) throw new Error(`shopee sync failed for client ${failed.join(", ")}`);
  return { shops: shops.length, orders };
}

/** Jakarta calendar day (YYYY-MM-DD) to the unix second its day starts (UTC+7). */
export const jakartaStart = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 1000 - 7 * 3600;

/** Sales for [fromYmd, toYmd] inclusive, Jakarta days. Unpaid and cancelled orders are excluded from the sales figures. */
export async function salesSummary(db: D1Database, clientId: number, fromYmd: string, toYmd: string) {
  const lo = jakartaStart(fromYmd);
  const hi = jakartaStart(toYmd) + 24 * 3600; // exclusive
  const skip = NOT_A_SALE.map(() => "?").join(",");
  const base = [clientId, lo, hi, ...NOT_A_SALE];
  const [daily, products, statuses] = await Promise.all([
    db
      .prepare(
        `SELECT date(o.created_ts+25200,'unixepoch') AS day, COUNT(*) AS orders, COALESCE(SUM(o.total_amount),0) AS revenue,
                COALESCE(SUM((SELECT SUM(quantity) FROM shopee_order_items i WHERE i.client_id=o.client_id AND i.order_sn=o.order_sn)),0) AS units
           FROM shopee_orders o WHERE o.client_id=? AND o.created_ts>=? AND o.created_ts<? AND o.status NOT IN (${skip})
          GROUP BY day ORDER BY day`
      )
      .bind(...base)
      .all<{ day: string; orders: number; revenue: number; units: number }>(),
    db
      .prepare(
        `SELECT i.item_id, i.item_name AS name, SUM(i.quantity) AS units, SUM(i.quantity*i.unit_price) AS revenue
           FROM shopee_order_items i JOIN shopee_orders o ON o.client_id=i.client_id AND o.order_sn=i.order_sn
          WHERE o.client_id=? AND o.created_ts>=? AND o.created_ts<? AND o.status NOT IN (${skip})
          GROUP BY i.item_id, i.item_name ORDER BY units DESC LIMIT 10`
      )
      .bind(...base)
      .all<{ item_id: number; name: string; units: number; revenue: number }>(),
    db
      .prepare(`SELECT status, COUNT(*) AS orders FROM shopee_orders WHERE client_id=? AND created_ts>=? AND created_ts<? GROUP BY status ORDER BY orders DESC`)
      .bind(clientId, lo, hi)
      .all<{ status: string; orders: number }>(),
  ]);
  const days = daily.results;
  const orders = days.reduce((s, d) => s + d.orders, 0);
  const revenue = days.reduce((s, d) => s + d.revenue, 0);
  const units = days.reduce((s, d) => s + d.units, 0);
  return { from: fromYmd, to: toYmd, totals: { orders, units, revenue, avg_order: orders ? Math.round(revenue / orders) : 0 }, daily: days, top_products: products.results, statuses: statuses.results };
}
