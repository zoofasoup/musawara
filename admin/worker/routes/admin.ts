import { Hono, type Context } from "hono";
import type { AdAccountRow, Env, Vars } from "../types";
import { requireAdmin } from "../middleware";
import { randomToken } from "../lib/auth";
import { encryptString } from "../lib/secretbox";
import { fetchAccountInfo, fetchInsights, getMetaToken, validateToken } from "../lib/meta";
import { pullInsights, rederiveResults, syncAccount } from "../lib/sync";
import { halfMonthChunks, isCovered, MAX_HISTORY_DAYS, mergeRanges, REACH_WINDOW_DAYS } from "../lib/history";
import { DEFAULT_ALERT_CONFIG, resolveAlertConfig, runAlertRules } from "../lib/alerts";
import { clientSparkline, clientTotals } from "../lib/metrics";
import { SECTION_COUNT, SECTION_KEYS } from "../lib/brand";
import { ONBOARDING_TEMPLATE, parseTaskInput } from "../lib/ops";
import { addDays, ymdInTz } from "../lib/dates";
import spend from "./spend";
import conversions from "./conversions";

const admin = new Hono<{ Bindings: Env; Variables: Vars }>();
admin.use("*", requireAdmin);
admin.route("/spend", spend);
admin.route("/conversions", conversions);

// Friendly names for common Meta action types (result-type picker).
const ACTION_TYPE_LABELS: Record<string, string> = {
  "onsite_conversion.messaging_conversation_started_7d": "Chats Started (WhatsApp/Messenger)",
  lead: "Leads",
  purchase: "Purchases",
  "offsite_conversion.fb_pixel_lead": "Leads (Pixel)",
  "offsite_conversion.fb_pixel_purchase": "Purchases (Pixel)",
  "onsite_conversion.purchase": "Purchases (On-Facebook)",
  link_click: "Link Clicks",
  landing_page_view: "Landing Page Views",
  "onsite_conversion.lead_grouped": "Leads (On-Facebook)",
  add_to_cart: "Adds to Cart",
  initiate_checkout: "Checkouts Initiated",
  complete_registration: "Registrations",
  subscribe: "Subscriptions",
};

// ---------------------------------------------------------------- overview
admin.get("/overview", async (c) => {
  const today = ymdInTz("Asia/Jakarta");
  const to = addDays(today, -1);
  const from = addDays(to, -6);
  const sparkFrom = addDays(to, -13);

  const clientRows = await c.env.DB.prepare("SELECT * FROM clients ORDER BY name").all<any>();
  const cards = [];
  for (const client of clientRows.results) {
    const totals = await clientTotals(c.env, client.id, from, to);
    const spark = await clientSparkline(c.env, client.id, sparkFrom, to);
    const target = await c.env.DB.prepare(
      `SELECT MIN(s.cpr_target) t FROM account_settings s
       JOIN ad_accounts a ON a.id=s.ad_account_id WHERE a.client_id=? AND s.cpr_target > 0`
    )
      .bind(client.id)
      .first<{ t: number | null }>();
    const unack = await c.env.DB.prepare(
      `SELECT COUNT(*) n FROM alerts al JOIN ad_accounts a ON a.id=al.ad_account_id
       WHERE a.client_id=? AND al.acknowledged=0`
    )
      .bind(client.id)
      .first<{ n: number }>();
    cards.push({
      ...client,
      totals,
      spark,
      cpr_target: target?.t ?? null,
      unacknowledged_alerts: unack?.n ?? 0,
    });
  }

  const alerts = await c.env.DB.prepare(
    `SELECT al.*, a.account_name, a.client_id, cl.name client_name,
            COALESCE(e.name, al.entity_id) entity_name
     FROM alerts al
     JOIN ad_accounts a ON a.id=al.ad_account_id
     JOIN clients cl ON cl.id=a.client_id
     LEFT JOIN entities e ON e.ad_account_id=al.ad_account_id AND e.entity_id=al.entity_id
     ORDER BY al.created_at DESC LIMIT 20`
  ).all();

  const syncHealth = await c.env.DB.prepare(
    `SELECT a.id, a.account_name, a.meta_account_id, cl.name client_name,
            (SELECT MAX(finished_at) FROM sync_jobs j WHERE j.ad_account_id=a.id AND j.status='success') last_success,
            (SELECT status FROM sync_jobs j WHERE j.ad_account_id=a.id ORDER BY started_at DESC, id DESC LIMIT 1) last_status,
            (SELECT error FROM sync_jobs j WHERE j.ad_account_id=a.id ORDER BY started_at DESC, id DESC LIMIT 1) last_error
     FROM ad_accounts a JOIN clients cl ON cl.id=a.client_id
     WHERE a.status='active' ORDER BY cl.name`
  ).all();

  return c.json({ range: { from, to }, clients: cards, alerts: alerts.results, syncHealth: syncHealth.results });
});

// ---------------------------------------------------------------- clients CRUD
admin.get("/clients", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM ad_accounts a WHERE a.client_id=c.id) account_count,
            (SELECT COUNT(*) FROM users u WHERE u.client_id=c.id) user_count
     FROM clients c ORDER BY c.name`
  ).all();
  return c.json({ clients: rows.results });
});

admin.post("/clients", async (c) => {
  const { name, slug, logo_url, brand_color } = await c.req.json().catch(() => ({}));
  if (!name) return c.json({ error: "Name is required" }, 400);
  const finalSlug = (slug || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const row = await c.env.DB.prepare(
    "INSERT INTO clients (name, slug, logo_url, brand_color, share_token) VALUES (?,?,?,?,?) RETURNING *"
  )
    .bind(name, finalSlug, logo_url ?? null, brand_color ?? "#f59e0b", randomToken())
    .first();
  return c.json({ client: row });
});

// Profile photo: "" clears it; otherwise a small data URL (the admin resizes
// to ~192px before upload, so a few KB) or an https URL.
const LOGO_RE = /^(data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+|https:\/\/\S+)$/;
const validLogo = (v: unknown) => typeof v === "string" && (v === "" || (v.length <= 150_000 && LOGO_RE.test(v)));

admin.put("/clients/:id", async (c) => {
  const { name, slug, logo_url, brand_color } = await c.req.json().catch(() => ({}));
  if (logo_url !== undefined && logo_url !== null && !validLogo(logo_url)) {
    return c.json({ error: "Photo must be a PNG/JPEG/WebP image under 100 KB" }, 400);
  }
  const row = await c.env.DB.prepare(
    `UPDATE clients SET name=COALESCE(?,name), slug=COALESCE(?,slug),
     logo_url=COALESCE(?,logo_url), brand_color=COALESCE(?,brand_color) WHERE id=? RETURNING *`
  )
    .bind(name ?? null, slug ?? null, logo_url ?? null, brand_color ?? null, c.req.param("id"))
    .first();
  if (!row) return c.json({ error: "Client not found" }, 404);
  return c.json({ client: row });
});

admin.delete("/clients/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM clients WHERE id=?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

/** Enable/disable/regenerate the shareable read-only link. */
admin.post("/clients/:id/share", async (c) => {
  const { enabled, regenerate } = await c.req.json().catch(() => ({}));
  const sets: string[] = [];
  const binds: any[] = [];
  if (typeof enabled === "boolean") {
    sets.push("share_enabled=?");
    binds.push(enabled ? 1 : 0);
  }
  if (regenerate) {
    sets.push("share_token=?");
    binds.push(randomToken());
  }
  if (!sets.length) return c.json({ error: "Nothing to update" }, 400);
  const row = await c.env.DB.prepare(`UPDATE clients SET ${sets.join(", ")} WHERE id=? RETURNING *`)
    .bind(...binds, c.req.param("id"))
    .first();
  if (!row) return c.json({ error: "Client not found" }, 404);
  return c.json({ client: row });
});

// ---------------------------------------------------------------- brand knowledge
admin.put("/clients/:id/brand/:section", async (c) => {
  const section = c.req.param("section");
  if (!SECTION_KEYS.has(section)) return c.json({ error: "Unknown section" }, 404);
  const { body } = await c.req.json().catch(() => ({}));
  if (typeof body !== "string" || body.length > 20_000) return c.json({ error: "Body must be text under 20,000 characters" }, 400);
  const client = await c.env.DB.prepare("SELECT id FROM clients WHERE id=?").bind(c.req.param("id")).first();
  if (!client) return c.json({ error: "Client not found" }, 404);
  await c.env.DB.prepare(
    `INSERT INTO brand_knowledge (client_id, section, body, updated_by) VALUES (?,?,?,?)
     ON CONFLICT(client_id, section) DO UPDATE SET body=excluded.body, updated_at=datetime('now'), updated_by=excluded.updated_by`
  )
    .bind(c.req.param("id"), section, body, c.get("user").name)
    .run();
  return c.json({ ok: true });
});

admin.post("/clients/:id/brand-links", async (c) => {
  const { label, url } = await c.req.json().catch(() => ({}));
  if (typeof label !== "string" || !label.trim()) return c.json({ error: "Label is required" }, 400);
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return c.json({ error: "URL must start with http:// or https://" }, 400);
  const client = await c.env.DB.prepare("SELECT id FROM clients WHERE id=?").bind(c.req.param("id")).first();
  if (!client) return c.json({ error: "Client not found" }, 404);
  const row = await c.env.DB.prepare("INSERT INTO brand_links (client_id, label, url) VALUES (?,?,?) RETURNING id, label, url")
    .bind(c.req.param("id"), label.trim(), url.trim())
    .first();
  return c.json({ link: row });
});

admin.delete("/clients/:id/brand-links/:linkId", async (c) => {
  await c.env.DB.prepare("DELETE FROM brand_links WHERE id=? AND client_id=?")
    .bind(c.req.param("linkId"), c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- onboarding
async function onboardingState(c: Context<{ Bindings: Env; Variables: Vars }>, clientId: string) {
  const items = await c.env.DB.prepare(
    "SELECT id, label, done, done_at FROM onboarding_items WHERE client_id=? ORDER BY sort, id"
  )
    .bind(clientId)
    .all();
  const filled = await c.env.DB.prepare(
    "SELECT COUNT(*) n FROM brand_knowledge WHERE client_id=? AND TRIM(body) <> ''"
  )
    .bind(clientId)
    .first<{ n: number }>();
  return { items: items.results, brand: { filled: filled?.n ?? 0, total: SECTION_COUNT } };
}

admin.get("/clients/:id/onboarding", async (c) => c.json(await onboardingState(c, c.req.param("id"))));

admin.post("/clients/:id/onboarding/start", async (c) => {
  const id = c.req.param("id");
  const client = await c.env.DB.prepare("SELECT id FROM clients WHERE id=?").bind(id).first();
  if (!client) return c.json({ error: "Client not found" }, 404);
  const existing = await c.env.DB.prepare("SELECT COUNT(*) n FROM onboarding_items WHERE client_id=?").bind(id).first<{ n: number }>();
  if (!existing?.n) {
    await c.env.DB.batch(
      ONBOARDING_TEMPLATE.map((label, i) =>
        c.env.DB.prepare("INSERT INTO onboarding_items (client_id, label, sort) VALUES (?,?,?)").bind(id, label, i)
      )
    );
  }
  return c.json(await onboardingState(c, id));
});

admin.put("/onboarding/:itemId", async (c) => {
  const { done } = await c.req.json().catch(() => ({}));
  if (typeof done !== "boolean") return c.json({ error: "done must be true or false" }, 400);
  const res = await c.env.DB.prepare("UPDATE onboarding_items SET done=?, done_at=CASE WHEN ? THEN datetime('now') END WHERE id=?")
    .bind(done ? 1 : 0, done ? 1 : 0, c.req.param("itemId"))
    .run();
  if (!res.meta.changes) return c.json({ error: "Item not found" }, 404);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- tasks (project board)
admin.get("/tasks", async (c) => {
  const clientId = c.req.query("client_id");
  const rows = await c.env.DB.prepare(
    `SELECT t.id, t.client_id, c.name client_name, t.title, t.status, t.assignee, t.due_date
     FROM tasks t JOIN clients c ON c.id=t.client_id
     ${clientId ? "WHERE t.client_id=?" : ""}
     ORDER BY t.due_date IS NULL, t.due_date, t.id`
  )
    .bind(...(clientId ? [clientId] : []))
    .all();
  return c.json({ tasks: rows.results });
});

admin.post("/tasks", async (c) => {
  const parsed = parseTaskInput(await c.req.json().catch(() => ({})), false);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const v = parsed.value;
  const client = await c.env.DB.prepare("SELECT id FROM clients WHERE id=?").bind(v.client_id).first();
  if (!client) return c.json({ error: "Client not found" }, 404);
  const task = await c.env.DB.prepare(
    "INSERT INTO tasks (client_id, title, status, assignee, due_date) VALUES (?,?,?,?,?) RETURNING *"
  )
    .bind(v.client_id, v.title, v.status ?? "todo", v.assignee ?? null, v.due_date ?? null)
    .first();
  return c.json({ task });
});

admin.put("/tasks/:id", async (c) => {
  const parsed = parseTaskInput(await c.req.json().catch(() => ({})), true);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const entries = Object.entries(parsed.value).filter(([k]) => k !== "client_id");
  if (!entries.length) return c.json({ error: "Nothing to update" }, 400);
  const task = await c.env.DB.prepare(
    `UPDATE tasks SET ${entries.map(([k]) => `${k}=?`).join(", ")}, updated_at=datetime('now') WHERE id=? RETURNING *`
  )
    .bind(...entries.map(([, v]) => v), c.req.param("id"))
    .first();
  if (!task) return c.json({ error: "Task not found" }, 404);
  return c.json({ task });
});

admin.delete("/tasks/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM tasks WHERE id=?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- ad accounts
admin.get("/accounts", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT a.*, cl.name client_name,
            s.primary_result_type, s.primary_result_label, s.monthly_budget_idr, s.cpr_target, s.alert_config_json,
            (SELECT MAX(finished_at) FROM sync_jobs j WHERE j.ad_account_id=a.id AND j.status='success') last_success,
            (SELECT started_at FROM sync_jobs j WHERE j.ad_account_id=a.id ORDER BY started_at DESC, id DESC LIMIT 1) last_attempt,
            (SELECT status FROM sync_jobs j WHERE j.ad_account_id=a.id ORDER BY started_at DESC, id DESC LIMIT 1) last_status,
            (SELECT rows_upserted FROM sync_jobs j WHERE j.ad_account_id=a.id ORDER BY started_at DESC, id DESC LIMIT 1) last_rows,
            (SELECT error FROM sync_jobs j WHERE j.ad_account_id=a.id ORDER BY started_at DESC, id DESC LIMIT 1) last_error,
            (SELECT MIN(date) FROM insights_daily i WHERE i.ad_account_id=a.id AND i.level='campaign') data_from,
            (SELECT MAX(date) FROM insights_daily i WHERE i.ad_account_id=a.id AND i.level='campaign') data_to,
            (SELECT COUNT(DISTINCT date) FROM insights_daily i WHERE i.ad_account_id=a.id AND i.level='campaign') data_days,
            (SELECT COUNT(*) FROM entities e WHERE e.ad_account_id=a.id AND e.level='campaign') campaigns
     FROM ad_accounts a
     JOIN clients cl ON cl.id=a.client_id
     LEFT JOIN account_settings s ON s.ad_account_id=a.id
     ORDER BY cl.name, a.account_name`
  ).all();
  return c.json({ accounts: rows.results, defaults: DEFAULT_ALERT_CONFIG });
});

/** Recent sync runs for one account (admin "sync history"). */
admin.get("/accounts/:id/sync-jobs", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, started_at, finished_at, status, rows_upserted, error
     FROM sync_jobs WHERE ad_account_id=? ORDER BY started_at DESC, id DESC LIMIT 10`
  )
    .bind(c.req.param("id"))
    .all();
  return c.json({ jobs: rows.results });
});

/** Connect an account: validate the ID against the Meta API when a token is configured. */
admin.post("/accounts", async (c) => {
  const { client_id, meta_account_id } = await c.req.json().catch(() => ({}));
  if (!client_id || !meta_account_id) return c.json({ error: "client_id and meta_account_id are required" }, 400);

  let name: string | null = null;
  let currency = "IDR";
  let timezone = "Asia/Jakarta";
  let validated = false;
  if (await getMetaToken(c.env)) {
    try {
      const info = await fetchAccountInfo(c.env, String(meta_account_id));
      name = info.name ?? null;
      currency = info.currency ?? currency;
      timezone = info.timezone_name ?? timezone;
      validated = true;
    } catch (e: any) {
      return c.json({ error: `Meta API rejected this account ID: ${e.message}` }, 400);
    }
  }

  const normalized = String(meta_account_id).replace(/^act_/, "");
  const row = await c.env.DB.prepare(
    "INSERT INTO ad_accounts (client_id, meta_account_id, account_name, currency, timezone) VALUES (?,?,?,?,?) RETURNING *"
  )
    .bind(client_id, `act_${normalized}`, name, currency, timezone)
    .first<any>();
  await c.env.DB.prepare("INSERT INTO account_settings (ad_account_id) VALUES (?)").bind(row.id).run();
  return c.json({ account: row, validated });
});

admin.put("/accounts/:id/settings", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const resultTypeChanged = body.primary_result_type !== undefined;
  await c.env.DB.prepare(
    `INSERT INTO account_settings (ad_account_id, primary_result_type, primary_result_label, monthly_budget_idr, cpr_target, alert_config_json)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(ad_account_id) DO UPDATE SET
       primary_result_type=COALESCE(excluded.primary_result_type, account_settings.primary_result_type),
       primary_result_label=COALESCE(excluded.primary_result_label, account_settings.primary_result_label),
       monthly_budget_idr=COALESCE(excluded.monthly_budget_idr, account_settings.monthly_budget_idr),
       cpr_target=COALESCE(excluded.cpr_target, account_settings.cpr_target),
       alert_config_json=COALESCE(excluded.alert_config_json, account_settings.alert_config_json)`
  )
    .bind(
      id,
      body.primary_result_type ?? null,
      body.primary_result_label ?? null,
      body.monthly_budget_idr ?? null,
      body.cpr_target ?? null,
      body.alert_config_json ?? null
    )
    .run();
  // Changing what counts as a "result" re-derives history from stored actions_json.
  let rederived = 0;
  if (resultTypeChanged) rederived = await rederiveResults(c.env, id);
  const settings = await c.env.DB.prepare("SELECT * FROM account_settings WHERE ad_account_id=?").bind(id).first();
  return c.json({ settings, rederived, effective_alerts: resolveAlertConfig(settings as any) });
});

admin.delete("/accounts/:id", async (c) => {
  await c.env.DB.prepare("UPDATE ad_accounts SET status='archived' WHERE id=?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

/**
 * Result-type picker data: distinct action types actually present in this
 * account's recent insights (stored actions_json first, live API sample as
 * fallback) — the admin never has to guess strings.
 */
admin.get("/accounts/:id/action-types", async (c) => {
  const id = Number(c.req.param("id"));
  const counts = new Map<string, { count: number; total: number }>();
  const ingest = (actions: Array<{ action_type: string; value: any }>) => {
    for (const a of actions ?? []) {
      const cur = counts.get(a.action_type) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(a.value) || 0;
      counts.set(a.action_type, cur);
    }
  };

  const rows = await c.env.DB.prepare(
    "SELECT actions_json FROM insights_daily WHERE ad_account_id=? AND actions_json IS NOT NULL ORDER BY date DESC LIMIT 500"
  )
    .bind(id)
    .all<{ actions_json: string }>();
  for (const r of rows.results) {
    try {
      ingest(JSON.parse(r.actions_json));
    } catch {
      /* skip bad rows */
    }
  }

  if (counts.size === 0 && (await getMetaToken(c.env))) {
    const account = await c.env.DB.prepare("SELECT * FROM ad_accounts WHERE id=?").bind(id).first<AdAccountRow>();
    if (account) {
      const until = ymdInTz(account.timezone);
      const sample = await fetchInsights(c.env, account.meta_account_id, "campaign", addDays(until, -27), until).catch(
        () => []
      );
      for (const r of sample) ingest(r.actions);
    }
  }

  const actionTypes = [...counts.entries()]
    .map(([type, v]) => ({ type, label: ACTION_TYPE_LABELS[type] ?? type, days_seen: v.count, total: v.total }))
    .sort((a, b) => b.total - a.total);
  return c.json({ actionTypes });
});

/** Manual "Sync now" with a 10-minute cooldown. */
admin.post("/accounts/:id/sync", async (c) => {
  const id = Number(c.req.param("id"));
  const account = await c.env.DB.prepare("SELECT * FROM ad_accounts WHERE id=?").bind(id).first<AdAccountRow>();
  if (!account) return c.json({ error: "Account not found" }, 404);
  if (!(await getMetaToken(c.env))) {
    return c.json({ error: "No Meta access token configured. Add one in Settings → Meta Token." }, 400);
  }
  const recent = await c.env.DB.prepare(
    "SELECT id FROM sync_jobs WHERE ad_account_id=? AND started_at > datetime('now','-10 minutes')"
  )
    .bind(id)
    .first();
  if (recent) return c.json({ error: "Sync was triggered less than 10 minutes ago — please wait." }, 429);
  try {
    const result = await syncAccount(c.env, account);
    return c.json({ ok: true, ...result });
  } catch (e: any) {
    return c.json({ error: `Sync failed: ${e.message}` }, 502);
  }
});

/**
 * History backfill. The admin UI asks for a plan (half-month chunks, with the
 * already-final ones marked covered), then posts only the missing chunks, one
 * per call, so a Worker request stays short and a failure loses one chunk.
 * Meta keeps ~37 months of insights; reach per day only ~13 months.
 */
async function loadCoverage(env: Env, accountId: number) {
  const rows = await env.DB.prepare("SELECT date_from, date_to FROM insights_coverage WHERE ad_account_id=?")
    .bind(accountId)
    .all<{ date_from: string; date_to: string }>();
  return mergeRanges(rows.results);
}

admin.get("/accounts/:id/history-plan", async (c) => {
  const account = await c.env.DB.prepare("SELECT * FROM ad_accounts WHERE id=?")
    .bind(c.req.param("id"))
    .first<AdAccountRow>();
  if (!account) return c.json({ error: "Account not found" }, 404);
  const today = ymdInTz(account.timezone);
  const range = c.req.query("range") ?? "13m";
  const limit = addDays(today, -MAX_HISTORY_DAYS);
  let from: string;
  if (range === "all") {
    if (!(await getMetaToken(c.env))) return c.json({ error: "No Meta access token configured." }, 400);
    let created: string | null = null;
    try {
      const info = await fetchAccountInfo(c.env, account.meta_account_id);
      created = typeof info?.created_time === "string" ? info.created_time.slice(0, 10) : null;
    } catch (e: any) {
      return c.json({ error: `Could not read the account's creation date: ${e.message}` }, 502);
    }
    from = created && created > limit ? created : limit;
  } else {
    const months = range === "3m" ? 2 : 12;
    const [y, m] = today.split("-").map(Number);
    from = new Date(Date.UTC(y, m - 1 - months, 1)).toISOString().slice(0, 10);
  }
  const merged = await loadCoverage(c.env, account.id);
  const chunks = halfMonthChunks(from, today).map((ch) => ({ ...ch, covered: isCovered(ch, merged, today) }));
  const reachCutoff = addDays(today, -REACH_WINDOW_DAYS);
  return c.json({
    from,
    to: today,
    chunks,
    covered: chunks.filter((ch) => ch.covered).length,
    reach_limited_before: reachCutoff,
    capped_by_meta: from === limit,
  });
});

admin.post("/accounts/:id/backfill", async (c) => {
  const account = await c.env.DB.prepare("SELECT * FROM ad_accounts WHERE id=?")
    .bind(c.req.param("id"))
    .first<AdAccountRow>();
  if (!account) return c.json({ error: "Account not found" }, 404);
  if (!(await getMetaToken(c.env))) return c.json({ error: "No Meta access token configured." }, 400);
  const { since, until, force } = await c.req.json().catch(() => ({}));
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (!ymd.test(since) || !ymd.test(until) || since > until) return c.json({ error: "Invalid date range" }, 400);
  const today = ymdInTz(account.timezone);
  const end = until > today ? today : until;
  if (since < addDays(today, -MAX_HISTORY_DAYS)) return c.json({ error: "Meta only keeps about 37 months of insights" }, 400);
  if (since > end || end > addDays(since, 30)) return c.json({ error: "Range must be 31 days or less" }, 400);
  if (!force && isCovered({ since, until: end }, await loadCoverage(c.env, account.id), today)) {
    return c.json({ ok: true, skipped: true, since, until: end });
  }
  const withReach = since >= addDays(today, -REACH_WINDOW_DAYS);
  try {
    const rows = await pullInsights(c.env, account, since, end, withReach);
    return c.json({ ok: true, rows, since, until: end, withReach });
  } catch (e: any) {
    return c.json({ error: `Backfill failed for ${since}: ${e.message}` }, 502);
  }
});

/** Recompute anomaly alerts from current data (no Meta fetch). */
admin.post("/accounts/:id/recompute-alerts", async (c) => {
  const account = await c.env.DB.prepare("SELECT * FROM ad_accounts WHERE id=?")
    .bind(c.req.param("id"))
    .first<AdAccountRow>();
  if (!account) return c.json({ error: "Account not found" }, 404);
  const created = await runAlertRules(c.env, account);
  return c.json({ ok: true, created });
});

// ---------------------------------------------------------------- alerts
admin.post("/alerts/:id/ack", async (c) => {
  await c.env.DB.prepare("UPDATE alerts SET acknowledged=1 WHERE id=?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- users & invites
admin.get("/users", async (c) => {
  const users = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.client_id, u.created_at, c.name client_name
     FROM users u LEFT JOIN clients c ON c.id=u.client_id ORDER BY u.created_at`
  ).all();
  const invites = await c.env.DB.prepare(
    `SELECT i.id, i.token, i.email, i.role, i.client_id, i.created_at, c.name client_name
     FROM invites i LEFT JOIN clients c ON c.id=i.client_id WHERE i.used=0 ORDER BY i.created_at DESC`
  ).all();
  return c.json({ users: users.results, invites: invites.results });
});

admin.post("/invites", async (c) => {
  const { email, role, client_id } = await c.req.json().catch(() => ({}));
  const finalRole = role === "admin" ? "admin" : "client";
  if (finalRole === "client" && !client_id) return c.json({ error: "client_id is required for client invites" }, 400);
  const token = randomToken();
  await c.env.DB.prepare("INSERT INTO invites (token, email, role, client_id) VALUES (?,?,?,?)")
    .bind(token, email ?? null, finalRole, finalRole === "client" ? client_id : null)
    .run();
  return c.json({ token, path: `/invite/${token}` });
});

admin.delete("/invites/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM invites WHERE id=?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

admin.delete("/users/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (id === c.get("user").id) return c.json({ error: "You cannot delete your own account" }, 400);
  await c.env.DB.prepare("DELETE FROM users WHERE id=?").bind(id).run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- Meta token
admin.get("/token/status", async (c) => {
  const hasEnvToken = Boolean(c.env.META_ACCESS_TOKEN);
  const hasDbToken = Boolean(
    await c.env.DB.prepare("SELECT 1 FROM app_settings WHERE key='meta_token_enc'").first()
  );
  if (!hasEnvToken && !hasDbToken) return c.json({ configured: false });
  const check = await validateToken(c.env);
  return c.json({ configured: true, source: hasEnvToken ? "env" : "database", ...check });
});

admin.post("/token", async (c) => {
  const { token } = await c.req.json().catch(() => ({}));
  if (!token) return c.json({ error: "Token is required" }, 400);
  const encrypted = await encryptString(c.env.JWT_SECRET, token.trim());
  await c.env.DB.prepare(
    "INSERT INTO app_settings (key, value) VALUES ('meta_token_enc', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  )
    .bind(encrypted)
    .run();
  const check = await validateToken(c.env);
  if (!check.ok) return c.json({ saved: true, ...check, warning: "Token saved but /me validation failed" });
  return c.json({ saved: true, ...check });
});

export default admin;
