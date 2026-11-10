// Called by the Apps Script inside the closing sheet (no login session there), so it
// is guarded by a shared secret instead of the admin cookie. Unset secret = disabled.

import { Hono } from "hono";
import { syncSheet, tokenMatches, type RawSheet } from "../lib/sheetSync";
import type { Env, Vars } from "../types";

const route = new Hono<{ Bindings: Env; Variables: Vars }>();

route.post("/", async (c) => {
  const expected = c.env.SHEET_SYNC_TOKEN;
  const given = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || !(await tokenMatches(given, expected))) return c.json({ error: "Unauthorized" }, 401);

  const { client_id, sheets } = await c.req.json().catch(() => ({}));
  const valid =
    Number.isInteger(client_id) &&
    Array.isArray(sheets) && sheets.length > 0 && sheets.length <= 20 &&
    sheets.every((s: any) => typeof s?.name === "string" && Array.isArray(s.rows) && s.rows.length <= 5000 &&
      s.rows.every((r: unknown) => Array.isArray(r) && r.length <= 60 && r.every((x) => typeof x === "string")));
  if (!valid) return c.json({ error: "Bad request" }, 400);

  const client = await c.env.DB.prepare("SELECT id FROM clients WHERE id=?").bind(client_id).first();
  if (!client) return c.json({ error: "Unknown client" }, 404);

  return c.json(await syncSheet(c.env, client_id, sheets as RawSheet[]));
});

export default route;
