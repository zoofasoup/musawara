// Unified spend across Meta (auto-synced) and manually entered marketplace spend.
// Mounted under /api/admin/spend; admin.ts gates it to roles with the "spend" feature.

import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { addDays } from "../lib/dates";
import { canReachClient, reachVia, scopeSql } from "../middleware";
import type { AuthUser } from "../types";

const spend = new Hono<{ Bindings: Env; Variables: Vars }>();

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const SOURCES = ["shopee", "tiktok", "tokopedia", "other"];
const CATEGORIES = ["ads", "fee"];

function dayCount(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}

/** Optional client filter appended to a WHERE clause; "none" = company-wide rows. A scoped team member never sees company-wide rows or other clients. */
function clientClause(raw: string | undefined, user: AuthUser): { sql: string; binds: unknown[] } {
  const scope = scopeSql(user, "client_id");
  if (!raw) return { sql: scope, binds: [] };
  if (raw === "none") return { sql: " AND client_id IS NULL" + scope, binds: [] };
  return { sql: " AND client_id = ?" + scope, binds: [Number(raw)] };
}

spend.get("/", async (c) => {
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? "";
  if (!YMD.test(from) || !YMD.test(to) || from > to) return c.json({ error: "Invalid date range" }, 400);

  const filter = clientClause(c.req.query("client_id"), c.get("user"));
  const where = `date BETWEEN ? AND ?${filter.sql}`;
  const binds = [from, to, ...filter.binds];

  const len = dayCount(from, to);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(len - 1));

  const [bySource, byClient, trend, prev] = await Promise.all([
    c.env.DB.prepare(
      `SELECT source, category, SUM(amount) amount FROM spend_daily WHERE ${where} GROUP BY source, category`
    ).bind(...binds).all<{ source: string; category: string; amount: number }>(),
    c.env.DB.prepare(
      `SELECT d.client_id, c.name client_name, SUM(d.amount) amount
       FROM (SELECT client_id, amount FROM spend_daily WHERE ${where}) d
       LEFT JOIN clients c ON c.id = d.client_id
       GROUP BY d.client_id ORDER BY amount DESC`
    ).bind(...binds).all<{ client_id: number | null; client_name: string | null; amount: number }>(),
    c.env.DB.prepare(
      `SELECT date, source, SUM(amount) amount FROM spend_daily WHERE ${where} GROUP BY date, source ORDER BY date`
    ).bind(...binds).all<{ date: string; source: string; amount: number }>(),
    c.env.DB.prepare(`SELECT COALESCE(SUM(amount), 0) amount FROM spend_daily WHERE ${where}`)
      .bind(prevFrom, prevTo, ...filter.binds)
      .first<{ amount: number }>(),
  ]);

  const total = bySource.results.reduce((s, r) => s + r.amount, 0);
  return c.json({
    range: { from, to },
    total,
    previous_total: prev?.amount ?? 0,
    by_source: bySource.results,
    by_client: byClient.results,
    trend: trend.results,
  });
});

spend.get("/entries", async (c) => {
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? "";
  if (!YMD.test(from) || !YMD.test(to) || from > to) return c.json({ error: "Invalid date range" }, 400);
  const filter = clientClause(c.req.query("client_id"), c.get("user"));
  const rows = await c.env.DB.prepare(
    `SELECT e.id, e.client_id, c.name client_name, e.source, e.category, e.date, e.amount, e.note
     FROM (SELECT * FROM spend_entries WHERE date BETWEEN ? AND ?${filter.sql}) e
     LEFT JOIN clients c ON c.id = e.client_id
     ORDER BY e.date DESC, e.id DESC LIMIT 200`
  ).bind(from, to, ...filter.binds).all();
  return c.json({ entries: rows.results });
});

spend.post("/entries", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const amount = Number(b.amount);
  const clientId = b.client_id === "" || b.client_id == null ? null : Number(b.client_id);
  if (!SOURCES.includes(b.source)) return c.json({ error: "Invalid source" }, 400);
  if (!CATEGORIES.includes(b.category ?? "ads")) return c.json({ error: "Invalid category" }, 400);
  if (typeof b.date !== "string" || !YMD.test(b.date)) return c.json({ error: "Invalid date" }, 400);
  if (!Number.isFinite(amount) || amount <= 0) return c.json({ error: "Amount must be greater than 0" }, 400);
  if (clientId === null ? c.get("user").client_ids !== null : !canReachClient(c.get("user"), clientId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (clientId !== null) {
    const exists = await c.env.DB.prepare("SELECT 1 FROM clients WHERE id=?").bind(clientId).first();
    if (!exists) return c.json({ error: "Unknown client" }, 400);
  }
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 200) : null;
  const res = await c.env.DB.prepare(
    "INSERT INTO spend_entries (client_id, source, category, date, amount, note) VALUES (?,?,?,?,?,?)"
  ).bind(clientId, b.source, b.category ?? "ads", b.date, amount, note).run();
  return c.json({ id: res.meta.last_row_id });
});

const IMPORT_NOTE = "Imported from ad report";
const MAX_IMPORT_DAYS = 400;

/**
 * Daily ad cost from a marketplace report. Importing a day again replaces what an earlier import wrote for it;
 * entries typed by hand are never touched, and the number of days that also have one is reported so nobody counts twice.
 */
spend.post("/import", async (c) => {
  const b: any = await c.req.json().catch(() => null);
  const clientId = b?.client_id === "" || b?.client_id == null ? null : Number(b.client_id);
  const rows: Array<{ date: string; amount: number; revenue?: number; orders?: number }> = Array.isArray(b?.rows) ? b.rows : [];
  const optional = (v: unknown) => v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= 0);
  if (!SOURCES.includes(b?.source)) return c.json({ error: "Invalid source" }, 400);
  if (!rows.length || rows.length > MAX_IMPORT_DAYS) return c.json({ error: `Send 1 to ${MAX_IMPORT_DAYS} days.` }, 400);
  if (!rows.every((r) => typeof r?.date === "string" && YMD.test(r.date) && typeof r.amount === "number" && Number.isFinite(r.amount) && r.amount >= 0 && optional(r.revenue) && optional(r.orders))) {
    return c.json({ error: "Every row needs a date and an amount of 0 or more." }, 400);
  }
  if (new Set(rows.map((r) => r.date)).size !== rows.length) return c.json({ error: "Each date may appear only once." }, 400);
  // A report that covers a period (a month's total) replaces everything an earlier import wrote inside that period.
  const period = b.from !== undefined || b.to !== undefined;
  if (period && !(YMD.test(b.from) && YMD.test(b.to) && rows.every((r) => r.date >= b.from && r.date <= b.to))) return c.json({ error: "Every date must lie inside the period." }, 400);
  if (clientId === null ? c.get("user").client_ids !== null : !canReachClient(c.get("user"), clientId)) return c.json({ error: "Forbidden" }, 403);
  if (clientId !== null && !(await c.env.DB.prepare("SELECT 1 FROM clients WHERE id=?").bind(clientId).first())) return c.json({ error: "Unknown client" }, 400);

  const manual = await c.env.DB.prepare(
    "SELECT date FROM spend_entries WHERE client_id IS ? AND source=? AND category='ads' AND COALESCE(note,'') <> ? AND date BETWEEN ? AND ?"
  ).bind(clientId, b.source, IMPORT_NOTE, rows.map((r) => r.date).sort()[0], rows.map((r) => r.date).sort().at(-1)).all<{ date: string }>();
  const manualDates = new Set(manual.results.map((r) => r.date));

  const clear = (table: string, extra: string, extraBinds: unknown[], from: string, to: string) =>
    c.env.DB.prepare(`DELETE FROM ${table} WHERE client_id IS ? AND source=?${extra} AND date BETWEEN ? AND ?`).bind(clientId, b.source, ...extraBinds, from, to);
  const spans = period ? [[b.from, b.to]] : rows.map((r) => [r.date, r.date]);
  const results = clientId === null ? [] : rows.filter((r) => r.revenue !== undefined);
  await c.env.DB.batch([
    ...spans.map(([from, to]) => clear("spend_entries", " AND category='ads' AND note=?", [IMPORT_NOTE], from, to)),
    ...(results.length ? spans.map(([from, to]) => clear("ad_results", "", [], from, to)) : []),
    ...rows.filter((r) => r.amount > 0).map((r) =>
      c.env.DB.prepare("INSERT INTO spend_entries (client_id, source, category, date, amount, note) VALUES (?,?,'ads',?,?,?)").bind(clientId, b.source, r.date, r.amount, IMPORT_NOTE)),
    ...results.filter((r) => r.revenue! > 0 || (r.orders ?? 0) > 0).map((r) =>
      c.env.DB.prepare("INSERT INTO ad_results (client_id, source, date, revenue, orders) VALUES (?,?,?,?,?)").bind(clientId, b.source, r.date, r.revenue, r.orders ?? 0)),
  ]);
  return c.json({ days: rows.length, total: rows.reduce((s, r) => s + r.amount, 0), manual_days: rows.filter((r) => manualDates.has(r.date)).length });
});

spend.delete("/entries/:id", reachVia("id", "SELECT client_id FROM spend_entries WHERE id=?"), async (c) => {
  await c.env.DB.prepare("DELETE FROM spend_entries WHERE id=?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

export default spend;
