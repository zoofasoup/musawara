// Organic content: Instagram accounts per client and the daily story count.

import { Hono } from "hono";
import { discoverInstagram, pollPosts, pollStories } from "../lib/organic";
import { addDays, ymdInTz } from "../lib/dates";
import type { Env, Vars } from "../types";

const organic = new Hono<{ Bindings: Env; Variables: Vars }>();
const DAYS = 14;

organic.get("/", async (c) => {
  const today = ymdInTz("Asia/Jakarta");
  const from = addDays(today, -(DAYS - 1));
  const [accounts, counts] = await Promise.all([
    c.env.DB.prepare(
      "SELECT o.*, c.name AS client_name FROM organic_accounts o JOIN clients c ON c.id=o.client_id ORDER BY c.name"
    ).all<any>(),
    c.env.DB.prepare(
      "SELECT ig_user_id, day, COUNT(*) AS n FROM organic_stories WHERE day>=? GROUP BY ig_user_id, day"
    )
      .bind(from)
      .all<{ ig_user_id: string; day: string; n: number }>(),
  ]);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(from, i));
  return c.json({
    today,
    accounts: accounts.results.map((a) => ({
      ...a,
      days: days.map((d) => ({ day: d, count: counts.results.find((r) => r.ig_user_id === a.ig_user_id && r.day === d)?.n ?? 0 })),
    })),
  });
});

organic.get("/posts", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, a.ig_username, a.followers, a.client_id, cl.name AS client_name
       FROM organic_posts p JOIN organic_accounts a ON a.ig_user_id=p.ig_user_id JOIN clients cl ON cl.id=a.client_id
      WHERE p.posted_at >= datetime('now','-30 days') ORDER BY p.posted_at DESC`
  ).all();
  return c.json({ posts: results });
});

organic.get("/discover", async (c) => {
  try {
    return c.json({ candidates: await discoverInstagram(c.env) });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

organic.post("/accounts", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const target = Number(b.story_target ?? 10);
  if (!Number.isInteger(b.client_id) || !b.ig_user_id || !(target > 0)) return c.json({ error: "client_id, ig_user_id and a positive target are required" }, 400);
  await c.env.DB.prepare(
    "INSERT INTO organic_accounts (client_id, ig_user_id, ig_username, page_id, story_target) VALUES (?,?,?,?,?) ON CONFLICT(ig_user_id) DO UPDATE SET client_id=excluded.client_id, story_target=excluded.story_target"
  )
    .bind(b.client_id, String(b.ig_user_id), b.ig_username ?? null, b.page_id ?? null, target)
    .run();
  return c.json({ ok: true });
});

organic.delete("/accounts/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM organic_accounts WHERE id=?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

organic.post("/poll", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, ig_user_id FROM organic_accounts").all<{ id: number; ig_user_id: string }>();
  let added = 0;
  const errors: string[] = [];
  for (const a of results) {
    try {
      added += await pollStories(c.env, a);
    } catch (e: any) {
      errors.push(`Stories: ${e.message}`);
    }
    try {
      await pollPosts(c.env, a, true);
    } catch (e: any) {
      errors.push(`Posts: ${e.message}`);
    }
  }
  return c.json({ added, errors });
});

export default organic;
