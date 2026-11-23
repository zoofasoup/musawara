// Admin-only Publish setup: is the Meta token allowed to publish, and which Instagram and
// Facebook accounts belong to which client. Mounted under /api/admin; connecting Meta accounts is Owner-only.

import { Hono } from "hono";
import { metaGet } from "../lib/meta";
import { missingPermissions } from "../lib/metaPermissions";
import { discoverInstagram } from "../lib/organic";
import { requirePerm } from "../middleware";
import type { Env, Vars } from "../types";

const setup = new Hono<{ Bindings: Env; Variables: Vars }>();

setup.get("/permissions", requirePerm("settings"), async (c) => {
  try {
    const res = await metaGet(c.env, "me/permissions", {}, 1);
    const missing = missingPermissions(res?.data ?? []);
    return c.json({ ok: missing.length === 0, missing });
  } catch (e: any) {
    // e.g. no token configured, or Meta does not expose /me/permissions for this token type
    return c.json({ ok: false, missing: [], error: e.message });
  }
});

setup.get("/candidates", requirePerm("settings"), async (c) => {
  try {
    return c.json({ candidates: await discoverInstagram(c.env) });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Connecting an Instagram account also connects the Facebook Page it hangs off.
setup.post("/channels", requirePerm("settings"), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!Number.isInteger(b.client_id) || !b.ig_user_id || !b.page_id) return c.json({ error: "client_id, ig_user_id and page_id are required" }, 400);
  const client = await c.env.DB.prepare("SELECT id FROM clients WHERE id=?").bind(b.client_id).first();
  if (!client) return c.json({ error: "Client not found" }, 404);
  const upsert = `INSERT INTO channels (client_id, platform, external_id, page_id, name) VALUES (?,?,?,?,?)
    ON CONFLICT(client_id, platform, external_id) DO UPDATE SET name=excluded.name, page_id=excluded.page_id, status='active'`;
  await c.env.DB.batch([
    c.env.DB.prepare(upsert).bind(b.client_id, "instagram", String(b.ig_user_id), String(b.page_id), b.ig_username ? `@${b.ig_username}` : String(b.ig_user_id)),
    c.env.DB.prepare(upsert).bind(b.client_id, "facebook", String(b.page_id), String(b.page_id), String(b.page_name ?? b.page_id)),
  ]);
  return c.json({ ok: true });
});

// Disabling keeps history: posts that targeted the channel still show it.
setup.delete("/channels/:id", requirePerm("settings"), async (c) => {
  await c.env.DB.prepare("UPDATE channels SET status='disabled' WHERE id=?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

export default setup;
