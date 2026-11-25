// Jubelio (omnichannel order system) -> sales report. Read-only: log in, list the sales orders changed since the last run, keep an
// allow-list of fields. pickOrder() is the only place an order becomes a stored row, so buyer name, phone and address never reach D1.
// API reference: https://docs-wms.jubelio.com (POST /login, GET /sales/v2/orders/; the token goes in `authorization` as is).

import type { Env } from "../types";

export type JubelioCfg = { email: string; password: string; clientId: number; host: string };
export const DEFAULT_HOST = "https://api2.jubelio.com";
const PAGE_SIZE = 200;
const MAX_PAGES = 60;
const FIRST_SYNC_FROM = "2026-01-01T00:00:00.000Z";
const OVERLAP_MS = 60 * 60 * 1000; // re-read the last hour, so an order saved while we were reading is not lost

export class JubelioError extends Error {}

/** Null until all three secrets are set: JUBELIO_EMAIL, JUBELIO_PASSWORD and JUBELIO_CLIENT_ID (the brand these orders belong to). */
export function jubelioCfg(env: Pick<Env, "JUBELIO_EMAIL" | "JUBELIO_PASSWORD" | "JUBELIO_CLIENT_ID" | "JUBELIO_API_HOST">): JubelioCfg | null {
  const clientId = Number(env.JUBELIO_CLIENT_ID);
  if (!env.JUBELIO_EMAIL || !env.JUBELIO_PASSWORD || !Number.isInteger(clientId) || clientId <= 0) return null;
  return { email: env.JUBELIO_EMAIL, password: env.JUBELIO_PASSWORD, clientId, host: (env.JUBELIO_API_HOST || DEFAULT_HOST).replace(/\/$/, "") };
}

async function login(cfg: JubelioCfg, fetchImpl: typeof fetch): Promise<string> {
  const res = await fetchImpl(`${cfg.host}/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: cfg.email, password: cfg.password }), signal: AbortSignal.timeout(20_000) });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) throw new JubelioError(res.status === 429 ? "Jubelio login is rate limited, try again later" : "Jubelio login failed: check the email and password");
  return String(body.token);
}

export type OrderRow = { id: number; orderNo: string; day: string; channel: string; store: string | null; total: number; status: string | null; canceled: number; paid: number; modified: string | null };

const jakartaDay = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);
const text = (v: unknown, max = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** The allow-list. Returns null for a row without an id or a readable date. */
export function pickOrder(raw: any): OrderRow | null {
  const id = Number(raw?.salesorder_id);
  const at = String(raw?.transaction_date ?? "");
  if (!Number.isInteger(id) || !Number.isFinite(Date.parse(at))) return null;
  const status = text(raw.wms_status) ?? text(raw.internal_status) ?? text(raw.channel_status);
  const total = Number(raw.grand_total);
  return {
    id,
    orderNo: text(raw.salesorder_no, 60) ?? String(id),
    day: jakartaDay(at),
    channel: text(raw.channel_name, 60) ?? "Unknown",
    store: text(raw.store_name),
    total: Number.isFinite(total) ? total : 0,
    status,
    canceled: raw.is_canceled === true || /^CANCEL/i.test(String(raw.internal_status ?? "")) || /^CANCELED$/i.test(String(raw.wms_status ?? "")) ? 1 : 0,
    paid: raw.is_paid === true ? 1 : 0,
    modified: text(raw.last_modified, 40),
  };
}

/** Reads every order changed since the last successful run and stores it. The position moves only when the whole read succeeded. */
export async function syncJubelio(env: Pick<Env, "DB">, cfg: JubelioCfg, fetchImpl: typeof fetch = fetch, now = Date.now()) {
  const state = await env.DB.prepare("SELECT synced_to FROM jubelio_sync WHERE client_id=?").bind(cfg.clientId).first<{ synced_to: string | null }>();
  const since = state?.synced_to ? new Date(Date.parse(state.synced_to) - OVERLAP_MS).toISOString() : FIRST_SYNC_FROM;
  try {
    const token = await login(cfg, fetchImpl);
    let saved = 0;
    for (let page = 1; ; page++) {
      if (page > MAX_PAGES) throw new JubelioError("Too many orders in one run");
      const url = `${cfg.host}/sales/v2/orders/?${new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), last_modified_since: since })}`;
      const res = await fetchImpl(url, { headers: { authorization: token }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new JubelioError(res.status === 429 ? "Jubelio is rate limiting requests, try again later" : `Jubelio answered ${res.status} for the order list`);
      const body: any = await res.json();
      const list: unknown[] = Array.isArray(body?.data) ? body.data : [];
      const orders = list.map(pickOrder).filter((o): o is OrderRow => o !== null);
      const stmts = orders.map((o) => env.DB.prepare(
        `INSERT INTO jubelio_orders (client_id, salesorder_id, order_no, day, channel, store, total, status, canceled, paid, modified) VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT (client_id, salesorder_id) DO UPDATE SET order_no=excluded.order_no, day=excluded.day, channel=excluded.channel, store=excluded.store,
           total=excluded.total, status=excluded.status, canceled=excluded.canceled, paid=excluded.paid, modified=excluded.modified`
      ).bind(cfg.clientId, o.id, o.orderNo, o.day, o.channel, o.store, o.total, o.status, o.canceled, o.paid, o.modified));
      for (let i = 0; i < stmts.length; i += 90) await env.DB.batch(stmts.slice(i, i + 90));
      saved += orders.length;
      if (list.length < PAGE_SIZE || page * PAGE_SIZE >= Number(body?.totalCount ?? 0)) break;
    }
    await env.DB.prepare(
      `INSERT INTO jubelio_sync (client_id, synced_to, last_sync_at, last_error) VALUES (?,?,datetime('now'),NULL)
       ON CONFLICT (client_id) DO UPDATE SET synced_to=excluded.synced_to, last_sync_at=excluded.last_sync_at, last_error=NULL`
    ).bind(cfg.clientId, new Date(now).toISOString()).run();
    return { orders: saved, since };
  } catch (e) {
    const message = e instanceof JubelioError ? e.message : "Unexpected error while syncing";
    if (!(e instanceof JubelioError)) console.error("jubelio sync failed", (e as Error)?.name);
    await env.DB.prepare("INSERT INTO jubelio_sync (client_id, last_error) VALUES (?,?) ON CONFLICT (client_id) DO UPDATE SET last_error=excluded.last_error").bind(cfg.clientId, message).run();
    throw new JubelioError(message);
  }
}

/** Per month: orders and sales per channel (cancelled ones apart), next to what was spent on ads per platform. */
export async function monthlyReport(db: D1Database, clientId: number) {
  const [orders, spend, sync] = await Promise.all([
    db.prepare(
      `SELECT substr(day,1,7) month, channel, SUM(canceled=0) orders, SUM(CASE WHEN canceled=0 THEN total ELSE 0 END) value, SUM(canceled) canceled
         FROM jubelio_orders WHERE client_id=? GROUP BY 1,2 ORDER BY 1 DESC`
    ).bind(clientId).all<{ month: string; channel: string; orders: number; value: number; canceled: number }>(),
    db.prepare("SELECT substr(date,1,7) month, source, SUM(amount) amount FROM spend_daily WHERE client_id=? GROUP BY 1,2").bind(clientId).all<{ month: string; source: string; amount: number }>(),
    db.prepare("SELECT last_sync_at, last_error FROM jubelio_sync WHERE client_id=?").bind(clientId).first<{ last_sync_at: string | null; last_error: string | null }>(),
  ]);
  const months = [...new Set(orders.results.map((r) => r.month))];
  return {
    channels: [...new Set(orders.results.map((r) => r.channel))].sort(),
    sources: [...new Set(spend.results.filter((s) => months.includes(s.month)).map((s) => s.source))].sort(),
    last_sync_at: sync?.last_sync_at ?? null,
    last_error: sync?.last_error ?? null,
    months: months.map((month) => {
      const rows = orders.results.filter((r) => r.month === month);
      const spent = Object.fromEntries(spend.results.filter((s) => s.month === month).map((s) => [s.source, s.amount]));
      return {
        month,
        orders: rows.reduce((n, r) => n + r.orders, 0),
        value: rows.reduce((n, r) => n + r.value, 0),
        canceled: rows.reduce((n, r) => n + r.canceled, 0),
        channels: Object.fromEntries(rows.map((r) => [r.channel, { orders: r.orders, value: r.value }])),
        spend: spent,
        spend_total: Object.values(spent).reduce((n: number, v) => n + Number(v), 0),
      };
    }),
  };
}
