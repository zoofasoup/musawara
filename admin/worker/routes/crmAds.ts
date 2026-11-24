// What the platform knows about the Meta ad that brought a WhatsApp contact in (a Click-to-WhatsApp ad): its name, campaign
// and picture, taken from the synced ad data of the brand the number belongs to. The gateway only stores the ad id and what
// WhatsApp itself showed (headline, thumbnail); this adds our own names so the team sees which creative worked.

import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { requirePerm } from "../middleware";
import { accountClientId, crmAccount } from "../lib/crmGuard";

const ads = new Hono<{ Bindings: Env; Variables: Vars }>();
ads.use("*", requirePerm("crm"), crmAccount);

type Entity = { name: string | null; effective_status: string | null; parent_id: string | null; thumbnail_url: string | null };

/** GET /api/crm-ads?account=<number>&id=<Meta ad id>: { found:false } when this brand has no such ad. */
ads.get("/", async (c) => {
  const id = c.req.query("id") ?? "";
  if (!/^\d{5,25}$/.test(id)) return c.json({ error: "Invalid ad id." }, 400);
  const clientId = await accountClientId(c);
  if (clientId === null) return c.json({ found: false });
  const one = (level: string, entityId: string | null) => entityId === null ? Promise.resolve(null) : c.env.DB.prepare(
    `SELECT e.name, e.effective_status, e.parent_id, e.thumbnail_url FROM entities e JOIN ad_accounts a ON a.id = e.ad_account_id
      WHERE a.client_id=? AND e.level=? AND e.entity_id=? LIMIT 1`
  ).bind(clientId, level, entityId).first<Entity>();
  const ad = await one("ad", id);
  if (!ad) return c.json({ found: false });
  const adset = await one("adset", ad.parent_id);
  const campaign = await one("campaign", adset?.parent_id ?? null);
  return c.json({ found: true, ad: ad.name, status: ad.effective_status, thumbnail_url: ad.thumbnail_url, adset: adset?.name ?? null, campaign: campaign?.name ?? null });
});

export default ads;
