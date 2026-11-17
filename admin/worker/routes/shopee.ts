// Shopee connection and sales summary. Team (admin) only. Mounted at /api/shopee.
//
//   GET    /status?client_id=      configured? connected? last sync
//   POST   /auth-url               { client_id }  ->  { url } to send the shop owner to
//   GET    /callback               Shopee redirects here with code + shop_id + our signed state
//   POST   /sync                   { client_id }  pulls one window of orders (call again until caught_up)
//   GET    /summary?client_id&from&to
//   DELETE /connection?client_id   disconnects and deletes that client's stored orders
//
// The callback is a browser redirect, so it relies on the admin's session cookie AND on a signed,
// short-lived `state` that names the client. Without the state, a link crafted by someone else could
// attach a stranger's shop to one of our clients.

import { Hono, type Context } from "hono";
import { sign, verify } from "hono/jwt";
import type { Env, Vars } from "../types";
import { requireAdmin } from "../middleware";
import { authUrl, connectShop, salesSummary, shopeeCfg, ShopeeError, syncShop } from "../lib/shopee";

const shopee = new Hono<{ Bindings: Env; Variables: Vars }>();
type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

const STATE_TTL_SECONDS = 600;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Where Shopee sends the owner back to. Must match the Redirect URL registered on the app. */
const callbackUrl = (c: Ctx) => `${new URL(c.req.url).origin}/api/shopee/callback`;

const clientIdOf = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const unconfigured = (c: Ctx) => c.json({ error: "Shopee belum dikonfigurasi (SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY)", code: "shopee_unconfigured" }, 503);

async function clientExists(c: Ctx, id: number) {
  return Boolean(await c.env.DB.prepare(`SELECT 1 FROM clients WHERE id=?`).bind(id).first());
}

// The callback is a plain browser redirect, so it answers with a redirect rather than JSON.
shopee.get("/callback", requireAdmin, async (c) => {
  const done = (result: string) => c.redirect(`/shopee?shopee=${result}`);
  const cfg = shopeeCfg(c.env);
  if (!cfg) return done("unconfigured");
  const code = c.req.query("code");
  const shopId = Number(c.req.query("shop_id"));
  const state = c.req.query("state");
  if (!code || !Number.isInteger(shopId) || shopId <= 0 || !state) return done("invalid");
  let clientId: number | null;
  try {
    const p = await verify(state, c.env.JWT_SECRET, "HS256");
    clientId = p.purpose === "shopee" ? clientIdOf(p.client_id) : null;
  } catch {
    return done("expired");
  }
  if (!clientId || !(await clientExists(c, clientId))) return done("invalid");
  try {
    await connectShop(c.env, cfg, clientId, code, shopId);
  } catch (e) {
    console.error("shopee connect failed", e instanceof ShopeeError ? e.code : "unknown");
    return done("failed");
  }
  return done("connected");
});

shopee.use("*", requireAdmin);

shopee.get("/status", async (c) => {
  const clientId = clientIdOf(c.req.query("client_id"));
  if (!clientId) return c.json({ error: "client_id required" }, 400);
  const row = await c.env.DB
    .prepare(`SELECT shop_id, synced_to, last_sync_at, last_error, refresh_expires_at FROM shopee_shops WHERE client_id=?`)
    .bind(clientId)
    .first<any>();
  return c.json({ configured: shopeeCfg(c.env) !== null, connected: Boolean(row), shop: row ?? null });
});

shopee.post("/auth-url", async (c) => {
  const cfg = shopeeCfg(c.env);
  if (!cfg) return unconfigured(c);
  const body = await c.req.json().catch(() => ({}));
  const clientId = clientIdOf((body as any).client_id);
  if (!clientId || !(await clientExists(c, clientId))) return c.json({ error: "Client not found" }, 404);
  const state = await sign({ purpose: "shopee", client_id: clientId, exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS }, c.env.JWT_SECRET, "HS256");
  const redirect = `${callbackUrl(c)}?${new URLSearchParams({ state })}`;
  return c.json({ url: await authUrl(cfg, redirect) });
});

shopee.post("/sync", async (c) => {
  const cfg = shopeeCfg(c.env);
  if (!cfg) return unconfigured(c);
  const body = await c.req.json().catch(() => ({}));
  const clientId = clientIdOf((body as any).client_id);
  if (!clientId) return c.json({ error: "client_id required" }, 400);
  try {
    const r = await syncShop(c.env, cfg, clientId);
    return c.json({ ok: true, orders: r.orders, caught_up: r.caughtUp });
  } catch (e) {
    if (e instanceof ShopeeError) return c.json({ error: e.message, code: e.code }, e.code === "not_connected" ? 404 : 502);
    throw e;
  }
});

shopee.get("/summary", async (c) => {
  const clientId = clientIdOf(c.req.query("client_id"));
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? "";
  if (!clientId) return c.json({ error: "client_id required" }, 400);
  if (!YMD.test(from) || !YMD.test(to) || from > to) return c.json({ error: "from and to must be YYYY-MM-DD, from <= to" }, 400);
  return c.json(await salesSummary(c.env.DB, clientId, from, to));
});

shopee.delete("/connection", async (c) => {
  const clientId = clientIdOf(c.req.query("client_id"));
  if (!clientId) return c.json({ error: "client_id required" }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM shopee_order_items WHERE client_id=?`).bind(clientId),
    c.env.DB.prepare(`DELETE FROM shopee_orders WHERE client_id=?`).bind(clientId),
    c.env.DB.prepare(`DELETE FROM shopee_shops WHERE client_id=?`).bind(clientId),
  ]);
  return c.json({ ok: true });
});

export default shopee;
