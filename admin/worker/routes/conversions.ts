// Offline conversions. The browser parses the file, hashes identifiers and
// computes a deterministic row_key per sale; this side keeps the ledger that
// makes double-sending impossible:
//   - rows are claimed with INSERT ... ON CONFLICT, only a brand-new row (or a
//     row that previously FAILED) is ever sent;
//   - a row goes 'pending' -> 'sending' before the request and 'sent' only after
//     Meta confirms it; if we never learn the outcome it stays 'sending'
//     ("uncertain") and is never resent automatically.

import { Hono } from "hono";
import { encryptString } from "../lib/secretbox";
import { CAPI_TOKEN_KEY, getCapiToken, MAX_EVENT_AGE_DAYS, SEND_CHUNK, sendCapiEvents, type CapiEvent } from "../lib/capi";
import { fetchAccountInfo, getMetaToken, metaGetAll } from "../lib/meta";
import type { Env, Vars } from "../types";

const conv = new Hono<{ Bindings: Env; Variables: Vars }>();

const HEX64 = /^[a-f0-9]{64}$/;
const ACTION_SOURCES = ["physical_store", "chat", "phone_call", "email", "other", "system_generated", "business_messaging"];
const UNCERTAIN_AFTER_MIN = 10;

// ------------------------------------------------------------------ settings & token
conv.get("/settings", async (c) => {
  const [rows, token] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM capi_settings").all(),
    getCapiToken(c.env),
  ]);
  return c.json({ settings: rows.results, tokenConfigured: Boolean(token), actionSources: ACTION_SOURCES });
});

conv.put("/settings/:clientId", async (c) => {
  const { dataset_id, action_source, event_name, currency } = await c.req.json().catch(() => ({}));
  if (dataset_id != null && !/^\d{5,20}$/.test(String(dataset_id))) return c.json({ error: "Dataset ID must be the numeric ID from Events Manager" }, 400);
  if (action_source && !ACTION_SOURCES.includes(action_source)) return c.json({ error: "Unknown action source" }, 400);
  if (currency && !/^[A-Z]{3}$/.test(currency)) return c.json({ error: "Currency must be a 3-letter code" }, 400);
  await c.env.DB.prepare(
    `INSERT INTO capi_settings (client_id, dataset_id, action_source, event_name, currency)
     VALUES (?, ?, COALESCE(?, 'physical_store'), COALESCE(?, 'Purchase'), COALESCE(?, 'IDR'))
     ON CONFLICT(client_id) DO UPDATE SET
       dataset_id=excluded.dataset_id,
       action_source=COALESCE(?, capi_settings.action_source),
       event_name=COALESCE(?, capi_settings.event_name),
       currency=COALESCE(?, capi_settings.currency)`
  )
    .bind(c.req.param("clientId"), dataset_id ? String(dataset_id) : null, action_source ?? null, event_name ?? null, currency ?? null, action_source ?? null, event_name ?? null, currency ?? null)
    .run();
  return c.json({ ok: true });
});

conv.post("/token", async (c) => {
  const { token } = await c.req.json().catch(() => ({}));
  if (!token || typeof token !== "string") return c.json({ error: "Token is required" }, 400);
  const enc = await encryptString(c.env.JWT_SECRET, token.trim());
  await c.env.DB.prepare(
    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  )
    .bind(CAPI_TOKEN_KEY, enc)
    .run();
  return c.json({ ok: true });
});

/** Datasets (pixels) the client's first ad account can see, via the read token. */
conv.get("/datasets", async (c) => {
  const clientId = Number(c.req.query("client_id"));
  const account = await c.env.DB.prepare("SELECT meta_account_id FROM ad_accounts WHERE client_id=? ORDER BY id LIMIT 1")
    .bind(clientId)
    .first<{ meta_account_id: string }>();
  if (!account) return c.json({ datasets: [] });
  if (!(await getMetaToken(c.env))) return c.json({ error: "No Meta read token configured." }, 400);
  try {
    const id = account.meta_account_id.startsWith("act_") ? account.meta_account_id : `act_${account.meta_account_id}`;
    const list = await metaGetAll(c.env, `${id}/adspixels`, { fields: "id,name,last_fired_time", limit: "100" }, 3);
    return c.json({ datasets: list.map((d) => ({ id: d.id, name: d.name, last_fired_time: d.last_fired_time ?? null })) });
  } catch (e: any) {
    return c.json({ datasets: [], note: `Could not list datasets: ${e.message}` });
  }
});

// ------------------------------------------------------------------ duplicate check
/** Status of each key in the ledger: sent | failed | uncertain | pending. Unknown keys are new. */
conv.post("/check", async (c) => {
  const { dataset_id, is_test, keys } = await c.req.json().catch(() => ({}));
  if (!dataset_id || !Array.isArray(keys) || keys.length > 20000 || !keys.every((k) => HEX64.test(k))) {
    return c.json({ error: "Bad request" }, 400);
  }
  const existing: Record<string, string> = {};
  for (let i = 0; i < keys.length; i += 90) {
    const part = keys.slice(i, i + 90);
    const res = await c.env.DB.prepare(
      `SELECT row_key, status, updated_at,
              (status='sending' AND updated_at < datetime('now', ?)) AS stale
       FROM offline_events WHERE dataset_id=? AND is_test=? AND row_key IN (${part.map(() => "?").join(",")})`
    )
      .bind(`-${UNCERTAIN_AFTER_MIN} minutes`, String(dataset_id), is_test ? 1 : 0, ...part)
      .all<{ row_key: string; status: string; stale: number }>();
    for (const r of res.results) existing[r.row_key] = r.status === "sending" && r.stale ? "uncertain" : r.status;
  }
  return c.json({ existing });
});

// ------------------------------------------------------------------ batches
conv.post("/batches", async (c) => {
  const { client_id, dataset_id, filename, is_test, test_event_code } = await c.req.json().catch(() => ({}));
  if (!client_id || !/^\d{5,20}$/.test(String(dataset_id))) return c.json({ error: "Client and dataset are required" }, 400);
  if (is_test && !test_event_code) return c.json({ error: "A test event code is required for test sends" }, 400);
  const row = await c.env.DB.prepare(
    "INSERT INTO offline_batches (client_id, dataset_id, filename, is_test, test_event_code, created_by) VALUES (?,?,?,?,?,?) RETURNING id"
  )
    .bind(client_id, String(dataset_id), String(filename ?? "").slice(0, 200) || null, is_test ? 1 : 0, is_test ? String(test_event_code).slice(0, 40) : null, c.get("user").id)
    .first<{ id: number }>();
  return c.json({ id: row!.id });
});

type InRow = {
  row_key: string;
  event_name: string;
  event_time: number;
  action_source: string;
  value: number | null;
  currency: string | null;
  order_id: string | null;
  user_data: Record<string, string[]>;
};

function validateRow(r: any): string | null {
  if (!r || !HEX64.test(r.row_key ?? "")) return "bad row_key";
  if (typeof r.event_name !== "string" || !r.event_name || r.event_name.length > 50) return "bad event_name";
  if (!ACTION_SOURCES.includes(r.action_source)) return "bad action_source";
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(r.event_time) || r.event_time > now + 300 || r.event_time < now - MAX_EVENT_AGE_DAYS * 86400) return "event_time outside the allowed window";
  if (r.value != null && (typeof r.value !== "number" || !isFinite(r.value) || r.value < 0)) return "bad value";
  if (r.currency != null && !/^[A-Z]{3}$/.test(r.currency)) return "bad currency";
  const ud = r.user_data;
  if (!ud || typeof ud !== "object") return "missing user_data";
  let ids = 0;
  for (const [k, v] of Object.entries(ud)) {
    if (!Array.isArray(v) || v.length === 0 || v.length > 5 || !v.every((h) => typeof h === "string" && HEX64.test(h))) {
      return `user_data.${k} must be SHA-256 hashes`; // raw personal data is refused, never stored
    }
    if (k === "ph" || k === "em") ids++;
  }
  if (ids === 0) return "needs a hashed phone or email";
  return null;
}

/**
 * Claim and send one chunk (<= 200 rows) of an upload. Safe to call again with
 * the same rows: already-sent / in-flight / uncertain rows are skipped, and
 * only failed rows are re-queued.
 */
conv.post("/batches/:id/send", async (c) => {
  const batchId = Number(c.req.param("id"));
  const batch = await c.env.DB.prepare("SELECT * FROM offline_batches WHERE id=?").bind(batchId).first<any>();
  if (!batch) return c.json({ error: "Batch not found" }, 404);
  const token = await getCapiToken(c.env);
  if (!token) return c.json({ error: "No Conversions API token configured. Add one in Settings, Meta connection." }, 400);

  const { rows } = await c.req.json().catch(() => ({ rows: null }));
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > SEND_CHUNK) return c.json({ error: `Send between 1 and ${SEND_CHUNK} rows per call` }, 400);
  for (const r of rows) {
    const bad = validateRow(r);
    if (bad) return c.json({ error: `Row rejected: ${bad}` }, 400);
  }
  const seen = new Set<string>();
  const input = (rows as InRow[]).filter((r) => (seen.has(r.row_key) ? false : (seen.add(r.row_key), true)));

  // 1. claim: insert new rows; re-queue only FAILED ones (changes = 1 means ours).
  const claimStmts = input.map((r) =>
    c.env.DB.prepare(
      `INSERT INTO offline_events (batch_id, client_id, dataset_id, is_test, row_key, event_name, event_time, action_source, value, currency, order_id, user_data_json, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'pending')
       ON CONFLICT(dataset_id, is_test, row_key) DO UPDATE SET
         status='pending', batch_id=excluded.batch_id, error=NULL, updated_at=datetime('now')
       WHERE offline_events.status='failed'`
    ).bind(batchId, batch.client_id, batch.dataset_id, batch.is_test, r.row_key, r.event_name, r.event_time, r.action_source, r.value ?? null, r.currency ?? null, r.order_id ?? null, JSON.stringify(r.user_data))
  );
  const claimed = await c.env.DB.batch(claimStmts);
  const mine = input.filter((_, i) => (claimed[i].meta.changes ?? 0) > 0);
  const skipped = input.length - mine.length;
  if (mine.length === 0) return c.json({ sent: 0, failed: 0, uncertain: 0, skipped });

  // 2. mark in-flight BEFORE the request, so a crash leaves them 'sending' (uncertain), never 'pending'.
  await c.env.DB.batch(
    mine.map((r) =>
      c.env.DB.prepare("UPDATE offline_events SET status='sending', updated_at=datetime('now') WHERE dataset_id=? AND is_test=? AND row_key=? AND status='pending'")
        .bind(batch.dataset_id, batch.is_test, r.row_key)
    )
  );

  const events: CapiEvent[] = mine.map((r) => ({
    event_name: r.event_name,
    event_time: r.event_time,
    action_source: r.action_source,
    event_id: r.row_key, // lets Meta de-duplicate too
    user_data: r.user_data,
    custom_data: { ...(r.currency ? { currency: r.currency } : {}), ...(r.value != null ? { value: r.value } : {}), ...(r.order_id ? { order_id: r.order_id } : {}) },
  }));
  const result = await sendCapiEvents(c.env, token, batch.dataset_id, events, batch.test_event_code);

  // 3. record the outcome.
  const mark = (sql: string, ...extra: unknown[]) =>
    c.env.DB.batch(mine.map((r) => c.env.DB.prepare(sql).bind(...extra, batch.dataset_id, batch.is_test, r.row_key)));
  if (result.kind === "ok" && result.received === mine.length) {
    await mark("UPDATE offline_events SET status='sent', sent_at=datetime('now'), updated_at=datetime('now'), fbtrace_id=? WHERE dataset_id=? AND is_test=? AND row_key=?", result.fbtrace_id ?? null);
    return c.json({ sent: mine.length, failed: 0, uncertain: 0, skipped });
  }
  if (result.kind === "rejected") {
    await mark("UPDATE offline_events SET status='failed', error=?, updated_at=datetime('now'), fbtrace_id=? WHERE dataset_id=? AND is_test=? AND row_key=?", result.error.slice(0, 500), result.fbtrace_id ?? null);
    return c.json({ sent: 0, failed: mine.length, uncertain: 0, skipped, error: result.error });
  }
  // unknown outcome, or Meta accepted fewer than we sent: keep 'sending' and say so.
  const why = result.kind === "ok" ? `Meta accepted ${result.received} of ${mine.length}` : result.error;
  await mark("UPDATE offline_events SET error=?, updated_at=datetime('now') WHERE dataset_id=? AND is_test=? AND row_key=?", `Uncertain: ${why}`.slice(0, 500));
  return c.json({ sent: 0, failed: 0, uncertain: mine.length, skipped, error: why });
});

/** Settle rows stuck in 'sending' after the user checked Events Manager. */
conv.post("/uncertain/resolve", async (c) => {
  const { dataset_id, is_test, keys, action } = await c.req.json().catch(() => ({}));
  if (!dataset_id || !Array.isArray(keys) || !keys.every((k) => HEX64.test(k)) || !["mark_sent", "retry"].includes(action)) return c.json({ error: "Bad request" }, 400);
  const status = action === "mark_sent" ? "sent" : "failed";
  const note = action === "mark_sent" ? "Confirmed in Events Manager" : "Released for retry by an admin";
  for (let i = 0; i < keys.length; i += 90) {
    const part = keys.slice(i, i + 90);
    await c.env.DB.prepare(
      `UPDATE offline_events SET status=?, error=?, updated_at=datetime('now') WHERE dataset_id=? AND is_test=? AND status='sending' AND row_key IN (${part.map(() => "?").join(",")})`
    )
      .bind(status, note, String(dataset_id), is_test ? 1 : 0, ...part)
      .run();
  }
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ history
conv.get("/batches", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT b.id, b.client_id, cl.name client_name, b.dataset_id, b.filename, b.is_test, b.created_at,
            COUNT(e.id) total,
            SUM(e.status='sent') sent, SUM(e.status='failed') failed, SUM(e.status='sending') uncertain,
            SUM(CASE WHEN e.status='sent' THEN COALESCE(e.value,0) ELSE 0 END) value_sent
     FROM offline_batches b
     JOIN clients cl ON cl.id=b.client_id
     LEFT JOIN offline_events e ON e.batch_id=b.id
     GROUP BY b.id ORDER BY b.id DESC LIMIT 50`
  ).all();
  return c.json({ batches: rows.results });
});

conv.get("/batches/:id/events", async (c) => {
  const status = c.req.query("status");
  const rows = await c.env.DB.prepare(
    `SELECT row_key, event_name, event_time, value, currency, order_id, status, error
     FROM offline_events WHERE batch_id=? ${status ? "AND status=?" : ""} ORDER BY id LIMIT 2000`
  )
    .bind(...(status ? [c.req.param("id"), status] : [c.req.param("id")]))
    .all();
  return c.json({ events: rows.results });
});

export default conv;
