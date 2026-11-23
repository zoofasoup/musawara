// Notion sync for planning. Any team member. Mounted at /api/notion.
//   GET  /status   configured? last run, last error
//   POST /sync     runs one two-way sync now
import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { requireStaff } from "../middleware";
import { notionCfg, runNotionSync } from "../lib/notion";

const notion = new Hono<{ Bindings: Env; Variables: Vars }>();
notion.use("*", requireStaff); // any team member may sync: it moves planning cards, nothing client-private

notion.get("/status", async (c) => {
  const row = await c.env.DB.prepare("SELECT last_run, last_error, summary FROM notion_sync WHERE id=1").first<any>();
  return c.json({
    configured: Boolean(notionCfg(c.env)),
    last_run: row?.last_run ?? null,
    last_error: row?.last_error ?? null,
    summary: row?.summary ? JSON.parse(row.summary) : null,
  });
});

notion.post("/sync", async (c) => {
  if (!notionCfg(c.env)) return c.json({ error: "Notion belum dikonfigurasi (NOTION_TOKEN)", code: "notion_unconfigured" }, 503);
  const r = await runNotionSync(c.env);
  if (!r.ok) return c.json({ error: r.error }, 502);
  return c.json(r.result);
});

export default notion;
