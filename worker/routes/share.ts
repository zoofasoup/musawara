// Share-link bootstrap: resolves an unguessable token to public client branding.
// All data requests then go to /api/clients/:id/* with the X-Share-Token header,
// which clientAccess validates against this same token.

import { Hono } from "hono";
import type { Env, Vars } from "../types";

const share = new Hono<{ Bindings: Env; Variables: Vars }>();

share.get("/:token", async (c) => {
  const client = await c.env.DB.prepare(
    "SELECT id, name, slug, logo_url, brand_color FROM clients WHERE share_token=? AND share_enabled=1"
  )
    .bind(c.req.param("token"))
    .first();
  if (!client) return c.json({ error: "This share link is invalid or has been revoked" }, 404);
  return c.json({ client });
});

export default share;
