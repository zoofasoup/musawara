// Client-scoped data endpoints. Served identically to admins drilling in,
// client viewers, and share-link visitors — clientAccess middleware enforces
// tenant isolation before any handler runs.

import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { clientAccess } from "../middleware";
import { clientEntities, clientTotals, clientTrend } from "../lib/metrics";
import { SECTIONS, brandMarkdown } from "../lib/brand";
import { addDays, dayOfMonth, daysInMonth, monthStart, ymdInTz } from "../lib/dates";

const clients = new Hono<{ Bindings: Env; Variables: Vars }>();
clients.use("/:clientId/*", clientAccess);

function range(c: any): { from: string; to: string; prevFrom: string; prevTo: string } {
  const today = ymdInTz("Asia/Jakarta");
  const to = c.req.query("to") || addDays(today, -1);
  const from = c.req.query("from") || addDays(to, -6);
  // a chosen comparison period (Compare to: previous month / year / custom) wins
  const cf = c.req.query("compFrom"), ct = c.req.query("compTo");
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (cf && ct && ymd.test(cf) && ymd.test(ct) && cf <= ct && (Date.parse(ct) - Date.parse(cf)) / 86_400_000 < 1200) {
    return { from, to, prevFrom: cf, prevTo: ct };
  }
  // default: previous equal-length period immediately before `from`
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const len = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000) + 1;
  return { from, to, prevFrom: addDays(from, -len), prevTo: addDays(from, -1) };
}

/** Client bootstrap: branding, accounts, result label, last sync (stale-data banner). */
clients.get("/:clientId/meta", async (c) => {
  const clientId = c.get("access").clientId;
  const client = await c.env.DB.prepare(
    "SELECT id, name, slug, logo_url, brand_color, target_cpa FROM clients WHERE id=?"
  )
    .bind(clientId)
    .first();
  if (!client) return c.json({ error: "Client not found" }, 404);
  const accounts = await c.env.DB.prepare(
    `SELECT a.id, a.account_name, a.meta_account_id, a.currency, a.timezone, a.status,
            s.primary_result_label, s.monthly_budget_idr, s.cpr_target,
            (SELECT MAX(finished_at) FROM sync_jobs j WHERE j.ad_account_id=a.id AND j.status='success') last_sync,
            (SELECT status FROM sync_jobs j WHERE j.ad_account_id=a.id ORDER BY started_at DESC, id DESC LIMIT 1) last_sync_status
     FROM ad_accounts a LEFT JOIN account_settings s ON s.ad_account_id=a.id
     WHERE a.client_id=?`
  )
    .bind(clientId)
    .all();
  const labels = [...new Set(accounts.results.map((a: any) => a.primary_result_label).filter(Boolean))];
  return c.json({
    client,
    accounts: accounts.results,
    resultLabel: labels.length === 1 ? labels[0] : "Results",
    isShare: c.get("access").type === "share",
  });
});

clients.get("/:clientId/summary", async (c) => {
  const clientId = c.get("access").clientId;
  const { from, to, prevFrom, prevTo } = range(c);
  const [current, previous] = await Promise.all([
    clientTotals(c.env, clientId, from, to),
    clientTotals(c.env, clientId, prevFrom, prevTo),
  ]);
  return c.json({ range: { from, to, prevFrom, prevTo }, current, previous });
});

clients.get("/:clientId/trend", async (c) => {
  const clientId = c.get("access").clientId;
  const { from, to, prevFrom, prevTo } = range(c);
  const current = await clientTrend(c.env, clientId, from, to);
  // the comparison period uses the same bucket so the two series line up point by point
  const compare = await clientTrend(c.env, clientId, prevFrom, prevTo, current.bucket);
  return c.json({ ...current, compare: compare.days });
});

clients.get("/:clientId/entities", async (c) => {
  const clientId = c.get("access").clientId;
  const level = c.req.query("level") ?? "campaign";
  if (!["campaign", "adset", "ad"].includes(level)) return c.json({ error: "Bad level" }, 400);
  const { from, to, prevFrom, prevTo } = range(c);
  const rows = await clientEntities(
    c.env,
    clientId,
    level as any,
    from,
    to,
    prevFrom,
    prevTo,
    c.req.query("parent_id") || undefined
  );
  return c.json({ entities: rows });
});

/** Creative view: all ads in range with thumbnails, winners first (CPR asc). */
clients.get("/:clientId/creatives", async (c) => {
  const clientId = c.get("access").clientId;
  const { from, to, prevFrom, prevTo } = range(c);
  const ads = await clientEntities(c.env, clientId, "ad", from, to, prevFrom, prevTo);
  ads.sort((a, b) => (a.cpl ?? Infinity) - (b.cpl ?? Infinity));
  return c.json({ ads });
});

clients.get("/:clientId/alerts", async (c) => {
  const clientId = c.get("access").clientId;
  const rows = await c.env.DB.prepare(
    `SELECT al.*, a.account_name,
            COALESCE(e.name, al.entity_id) entity_name
     FROM alerts al
     JOIN ad_accounts a ON a.id = al.ad_account_id
     LEFT JOIN entities e ON e.ad_account_id = al.ad_account_id AND e.entity_id = al.entity_id
     WHERE a.client_id=? AND al.type NOT IN ('zero_results','cpr_spike')
     ORDER BY al.acknowledged ASC, al.created_at DESC LIMIT 50`
  )
    .bind(clientId)
    .all();
  return c.json({ alerts: rows.results });
});

/** Budget pacing: month-to-date vs ideal linear pace, projected month-end. */
clients.get("/:clientId/pacing", async (c) => {
  const clientId = c.get("access").clientId;
  const today = ymdInTz("Asia/Jakarta");
  const accounts = await c.env.DB.prepare(
    `SELECT a.id, a.account_name, s.monthly_budget_idr
     FROM ad_accounts a JOIN account_settings s ON s.ad_account_id=a.id
     WHERE a.client_id=? AND s.monthly_budget_idr > 0`
  )
    .bind(clientId)
    .all<any>();
  const out = [];
  for (const acc of accounts.results) {
    const mtd = await c.env.DB.prepare(
      "SELECT SUM(spend) spend FROM insights_daily WHERE ad_account_id=? AND level='campaign' AND date BETWEEN ? AND ?"
    )
      .bind(acc.id, monthStart(today), today)
      .first<{ spend: number | null }>();
    const spent = mtd?.spend ?? 0;
    const dom = dayOfMonth(today);
    const dim = daysInMonth(today);
    out.push({
      account_id: acc.id,
      account_name: acc.account_name,
      budget: acc.monthly_budget_idr,
      spent,
      ideal: (acc.monthly_budget_idr / dim) * dom,
      projected: (spent / dom) * dim,
      day_of_month: dom,
      days_in_month: dim,
    });
  }
  return c.json({ pacing: out });
});

export default clients;

/** Brand knowledge. Internal strategy, so share-link visitors never get it. */
clients.get("/:clientId/brand", async (c) => {
  const access = c.get("access");
  if (access.type === "share") return c.json({ error: "Forbidden" }, 403);
  const clientId = access.clientId;
  const [client, rows, links] = await Promise.all([
    c.env.DB.prepare("SELECT name FROM clients WHERE id=?").bind(clientId).first<{ name: string }>(),
    c.env.DB.prepare("SELECT section, body, updated_at, updated_by FROM brand_knowledge WHERE client_id=?")
      .bind(clientId)
      .all<{ section: string; body: string; updated_at: string; updated_by: string | null }>(),
    c.env.DB.prepare("SELECT id, label, url FROM brand_links WHERE client_id=? ORDER BY id")
      .bind(clientId)
      .all<{ id: number; label: string; url: string }>(),
  ]);
  if (!client) return c.json({ error: "Client not found" }, 404);
  const byKey = new Map(rows.results.map((r) => [r.section, r]));
  const sections = SECTIONS.map((s) => ({
    ...s,
    body: byKey.get(s.key)?.body ?? "",
    updated_at: byKey.get(s.key)?.updated_at ?? null,
    updated_by: byKey.get(s.key)?.updated_by ?? null,
  }));
  const bodies = Object.fromEntries(sections.map((s) => [s.key, s.body]));
  return c.json({ sections, links: links.results, markdown: brandMarkdown(client.name, bodies, links.results) });
});
