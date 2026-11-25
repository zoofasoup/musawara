// Client report: one combined view of ads, organic and sales for a period.
// Tenant isolation comes from clientAccess (session, client user or share token): every query
// below is scoped to the clientId it resolves (c.get("access").clientId), never to a raw parameter.
//
// GET /api/report/:clientId?from=YYYY-MM-DD&to=YYYY-MM-DD[&compFrom=&compTo=]
// No from/to = the last full calendar month.

import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { clientAccess, clientFeature } from "../middleware";
import { clientEntities, clientTotals, clientTrend } from "../lib/metrics";
import { ymdInTz } from "../lib/dates";
import { buildReport, resolveRange, type OrganicPost, type SaleRow } from "../lib/report";

const report = new Hono<{ Bindings: Env; Variables: Vars }>();
report.use("/:clientId/*", clientAccess);
report.use("/:clientId", clientAccess);
report.use("/:clientId/*", clientFeature("ads"));
report.use("/:clientId", clientFeature("ads"));

async function organicFor(env: Env, clientId: number, from: string, to: string, prevFrom: string, prevTo: string) {
  const accounts = await env.DB.prepare("SELECT ig_username, followers FROM organic_accounts WHERE client_id=? ORDER BY id")
    .bind(clientId)
    .all<{ ig_username: string | null; followers: number | null }>();
  if (accounts.results.length === 0) return null;
  const posts = (f: string, t: string) =>
    env.DB.prepare(
      `SELECT p.media_id, p.format, p.permalink, p.caption, p.thumbnail_url, p.day, p.likes, p.comments, p.reach, p.views, p.saves, p.shares, p.interactions
       FROM organic_posts p JOIN organic_accounts a ON a.ig_user_id = p.ig_user_id
       WHERE a.client_id=? AND p.day BETWEEN ? AND ?`
    )
      .bind(clientId, f, t)
      .all<OrganicPost>();
  const stories = (f: string, t: string) =>
    env.DB.prepare(
      `SELECT COUNT(*) n FROM organic_stories s JOIN organic_accounts a ON a.ig_user_id = s.ig_user_id
       WHERE a.client_id=? AND s.day BETWEEN ? AND ?`
    )
      .bind(clientId, f, t)
      .first<{ n: number }>();
  const [cur, prev, sCur, sPrev] = await Promise.all([posts(from, to), posts(prevFrom, prevTo), stories(from, to), stories(prevFrom, prevTo)]);
  return { accounts: accounts.results, posts: cur.results, prevPosts: prev.results, stories: sCur?.n ?? 0, prevStories: sPrev?.n ?? 0 };
}

/** The rows the dashboard counts as sales (not deleted); cancelled ones are kept so they can be reported apart. */
function salesFor(env: Env, clientId: number, from: string, to: string) {
  return env.DB.prepare(
    `SELECT sale_date, value, source, package_name, pay_status FROM dashboard_sales
     WHERE client_id=? AND sale_date BETWEEN ? AND ? AND deleted_at IS NULL`
  )
    .bind(clientId, from, to)
    .all<SaleRow>();
}

report.get("/:clientId", async (c) => {
  const clientId = c.get("access").clientId;
  const range = resolveRange(
    { from: c.req.query("from"), to: c.req.query("to"), compFrom: c.req.query("compFrom"), compTo: c.req.query("compTo") },
    ymdInTz("Asia/Jakarta")
  );
  if (!range.ok) return c.json({ error: range.error }, 400);
  const { from, to, prevFrom, prevTo } = range;
  const env = c.env;

  const client = await env.DB.prepare("SELECT id, name, logo_url, brand_color FROM clients WHERE id=?")
    .bind(clientId)
    .first<{ id: number; name: string; logo_url: string | null; brand_color: string | null }>();
  if (!client) return c.json({ error: "Client not found" }, 404);

  const [labels, current, previous, trend, campaigns, creatives, organic, sales, prevSales] = await Promise.all([
    env.DB.prepare(
      `SELECT DISTINCT s.primary_result_label label FROM ad_accounts a JOIN account_settings s ON s.ad_account_id=a.id
       WHERE a.client_id=? AND s.primary_result_label IS NOT NULL AND s.primary_result_label <> ''`
    )
      .bind(clientId)
      .all<{ label: string }>(),
    clientTotals(env, clientId, from, to),
    clientTotals(env, clientId, prevFrom, prevTo),
    clientTrend(env, clientId, from, to),
    clientEntities(env, clientId, "campaign", from, to, prevFrom, prevTo),
    clientEntities(env, clientId, "ad", from, to, prevFrom, prevTo),
    organicFor(env, clientId, from, to, prevFrom, prevTo),
    salesFor(env, clientId, from, to),
    salesFor(env, clientId, prevFrom, prevTo),
  ]);
  // the comparison series uses the same bucket so the two line up point by point
  const compare = await clientTrend(env, clientId, prevFrom, prevTo, trend.bucket);

  return c.json(
    buildReport({
      client,
      resultLabel: labels.results.length === 1 ? labels.results[0].label : "Results",
      range,
      ads: { current, previous },
      trend: { bucket: trend.bucket, days: trend.days, compare: compare.days },
      campaigns,
      creatives,
      organic,
      sales: sales.results,
      prevSales: prevSales.results,
      generatedAt: new Date().toISOString(),
    })
  );
});

export default report;
