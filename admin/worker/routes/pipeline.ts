// CRM pipeline (stages and the cards on them) and custom contact fields. Everything is per WhatsApp number: ?account=<gateway
// number id> is required, and a team member who is not an Owner only reaches numbers linked to their own clients (waAccounts.ts).
// Contacts themselves stay in the gateway; rows here are keyed by (number, phone).

import { Hono, type Context } from "hono";
import type { Env, Vars } from "../types";
import { requirePerm } from "../middleware";
import { acct, crmAccount, eligibleOwners } from "../lib/crmGuard";
import { ymdInTz } from "../lib/dates";
import { PRESETS } from "../lib/crmPresets";

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;
const pipeline = new Hono<{ Bindings: Env; Variables: Vars }>();
pipeline.use("*", requirePerm("crm"));

const COLORS = ["neutral", "blue", "violet", "amber", "green", "rose"] as const;
const KINDS = ["open", "won", "lost"] as const;
const FIELD_TYPES = ["text", "number", "date", "select", "checkbox", "url"] as const;
const MAX_STAGES = 20;
const MAX_FIELDS = 40;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const PHONE = /^\d{6,20}$/;
const DEFAULT_STAGES: Array<[string, (typeof COLORS)[number], (typeof KINDS)[number]]> = [
  ["New", "neutral", "open"], ["Contacted", "blue", "open"], ["Interested", "violet", "open"],
  ["Proposal", "amber", "open"], ["Won", "green", "won"], ["Lost", "rose", "lost"],
];

pipeline.use("*", crmAccount);

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null);

/** A number's first visit gets the usual stages, so the board is never empty and nothing needs set-up. */
async function ensureStages(c: Ctx, account: number) {
  const n = await c.env.DB.prepare("SELECT COUNT(*) n FROM crm_stages WHERE wa_account_id=?").bind(account).first<{ n: number }>();
  if (n?.n) return;
  await c.env.DB.batch(
    DEFAULT_STAGES.map(([name, color, kind], i) =>
      c.env.DB.prepare("INSERT OR IGNORE INTO crm_stages (wa_account_id, name, color, kind, position) VALUES (?,?,?,?,?)").bind(account, name, color, kind, i)
    )
  );
}

const parseOptions = (raw: string | null): string[] => {
  try { const v = JSON.parse(raw ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
};

// ------------------------------------------------------------------ overview
pipeline.get("/", async (c) => {
  const account = acct(c);
  await ensureStages(c, account);
  const [stages, leads, fields, owners] = await Promise.all([
    c.env.DB.prepare("SELECT id, name, color, kind, position FROM crm_stages WHERE wa_account_id=? ORDER BY position, id").bind(account).all(),
    c.env.DB.prepare("SELECT phone, stage_id, value_idr, expected_close, owner_user_id, stage_changed_at, created_at FROM crm_leads WHERE wa_account_id=? ORDER BY stage_changed_at DESC LIMIT 3000").bind(account).all(),
    c.env.DB.prepare("SELECT id, label, type, options_json, position, required FROM crm_field_defs WHERE wa_account_id=? ORDER BY position, id").bind(account).all<any>(),
    eligibleOwners(c),
  ]);
  return c.json({
    owners,
    stages: stages.results,
    leads: leads.results,
    fields: fields.results.map(({ options_json, required, ...f }: any) => ({ ...f, required: required === 1, options: parseOptions(options_json) })),
  });
});

// ------------------------------------------------------------------ report
/** Funnel numbers: how many cards are in each stage now, how many ever reached it, wins and losses, time to win. */
pipeline.get("/report", async (c) => {
  const account = acct(c);
  await ensureStages(c, account);
  const month = ymdInTz("Asia/Jakarta").slice(0, 7);
  const [stages, reached, totals] = await Promise.all([
    c.env.DB.prepare(
      `SELECT s.id, s.name, s.color, s.kind, COUNT(l.id) AS current, COALESCE(SUM(l.value_idr), 0) AS value
         FROM crm_stages s LEFT JOIN crm_leads l ON l.stage_id=s.id WHERE s.wa_account_id=? GROUP BY s.id ORDER BY s.position, s.id`
    ).bind(account).all<any>(),
    c.env.DB.prepare("SELECT to_stage_id AS id, COUNT(DISTINCT phone) AS n FROM crm_stage_events WHERE wa_account_id=? GROUP BY to_stage_id").bind(account).all<{ id: number; n: number }>(),
    c.env.DB.prepare(
      `SELECT s.kind, COUNT(*) AS n, COALESCE(SUM(l.value_idr), 0) AS value,
              AVG(julianday(l.stage_changed_at) - julianday(l.created_at)) AS avg_days,
              COALESCE(SUM(CASE WHEN substr(l.stage_changed_at, 1, 7) = ? THEN l.value_idr ELSE 0 END), 0) AS month_value
         FROM crm_leads l JOIN crm_stages s ON s.id=l.stage_id WHERE l.wa_account_id=? GROUP BY s.kind`
    ).bind(month, account).all<any>(),
  ]);
  const by = (k: string) => totals.results.find((r: any) => r.kind === k);
  const won = by("won"), lost = by("lost"), open = by("open");
  const reach = new Map(reached.results.map((r) => [r.id, r.n]));
  return c.json({
    stages: stages.results.map((s: any) => ({ ...s, reached: Math.max(reach.get(s.id) ?? 0, s.current) })),
    open: { count: open?.n ?? 0, value: open?.value ?? 0 },
    won: { count: won?.n ?? 0, value: won?.value ?? 0, avg_days: won?.avg_days == null ? null : Math.round(won.avg_days * 10) / 10, this_month_value: won?.month_value ?? 0 },
    lost: { count: lost?.n ?? 0 },
    win_rate: (won?.n ?? 0) + (lost?.n ?? 0) > 0 ? Math.round(((won?.n ?? 0) / ((won?.n ?? 0) + (lost?.n ?? 0))) * 1000) / 10 : null,
  });
});

// ------------------------------------------------------------------ stages
async function ownStage(c: Ctx, id: number) {
  return c.env.DB.prepare("SELECT id, kind FROM crm_stages WHERE id=? AND wa_account_id=?").bind(id, acct(c)).first<{ id: number; kind: string }>();
}

pipeline.post("/stages", async (c) => {
  const account = acct(c);
  const b: any = await c.req.json().catch(() => null);
  const name = text(b?.name, 40);
  if (!name) return c.json({ error: "Give the stage a name (up to 40 characters)." }, 400);
  const color = COLORS.includes(b?.color) ? b.color : "neutral";
  const kind = KINDS.includes(b?.kind) ? b.kind : "open";
  await ensureStages(c, account); // a first custom stage must not stop the usual ones from being created
  const n = await c.env.DB.prepare("SELECT COUNT(*) n, COALESCE(MAX(position), -1) p FROM crm_stages WHERE wa_account_id=?").bind(account).first<{ n: number; p: number }>();
  if ((n?.n ?? 0) >= MAX_STAGES) return c.json({ error: `A pipeline can have up to ${MAX_STAGES} stages.` }, 400);
  try {
    const row = await c.env.DB.prepare("INSERT INTO crm_stages (wa_account_id, name, color, kind, position) VALUES (?,?,?,?,?) RETURNING id, name, color, kind, position")
      .bind(account, name, color, kind, (n?.p ?? -1) + 1).first();
    return c.json({ stage: row }, 201);
  } catch {
    return c.json({ error: "A stage with this name already exists." }, 409);
  }
});

pipeline.patch("/stages/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!(await ownStage(c, id))) return c.json({ error: "Stage not found" }, 404);
  const b: any = await c.req.json().catch(() => null);
  const name = b?.name !== undefined ? text(b.name, 40) : undefined;
  if (name === null) return c.json({ error: "Give the stage a name (up to 40 characters)." }, 400);
  if (b?.color !== undefined && !COLORS.includes(b.color)) return c.json({ error: "Unknown colour." }, 400);
  if (b?.kind !== undefined && !KINDS.includes(b.kind)) return c.json({ error: "Unknown stage type." }, 400);
  try {
    await c.env.DB.prepare("UPDATE crm_stages SET name=COALESCE(?,name), color=COALESCE(?,color), kind=COALESCE(?,kind) WHERE id=?")
      .bind(name ?? null, b?.color ?? null, b?.kind ?? null, id).run();
  } catch {
    return c.json({ error: "A stage with this name already exists." }, 409);
  }
  return c.json({ ok: true });
});

/** Removing a stage that still has cards needs somewhere for them to go: ?move_to=<other stage id>. */
pipeline.delete("/stages/:id", async (c) => {
  const account = acct(c);
  const id = Number(c.req.param("id"));
  if (!(await ownStage(c, id))) return c.json({ error: "Stage not found" }, 404);
  const total = (await c.env.DB.prepare("SELECT COUNT(*) n FROM crm_stages WHERE wa_account_id=?").bind(account).first<{ n: number }>())?.n ?? 0;
  if (total <= 1) return c.json({ error: "A pipeline needs at least one stage." }, 400);
  const cards = (await c.env.DB.prepare("SELECT COUNT(*) n FROM crm_leads WHERE stage_id=?").bind(id).first<{ n: number }>())?.n ?? 0;
  if (cards > 0) {
    const to = Number(c.req.query("move_to"));
    if (!Number.isInteger(to) || to === id || !(await ownStage(c, to))) return c.json({ error: `This stage has ${cards} card(s). Choose where they go.`, cards }, 409);
    await c.env.DB.prepare("UPDATE crm_leads SET stage_id=?, stage_changed_at=datetime('now'), updated_at=datetime('now') WHERE stage_id=?").bind(to, id).run();
  }
  await c.env.DB.prepare("DELETE FROM crm_stages WHERE id=?").bind(id).run();
  return c.json({ ok: true });
});

pipeline.post("/stages/reorder", async (c) => {
  const account = acct(c);
  const b: any = await c.req.json().catch(() => null);
  const ids: unknown = b?.ids;
  const own = (await c.env.DB.prepare("SELECT id FROM crm_stages WHERE wa_account_id=?").bind(account).all<{ id: number }>()).results.map((r) => r.id);
  if (!Array.isArray(ids) || ids.length !== own.length || new Set(ids).size !== ids.length || !ids.every((x) => own.includes(x as number))) {
    return c.json({ error: "Send every stage exactly once." }, 400);
  }
  await c.env.DB.batch((ids as number[]).map((id, i) => c.env.DB.prepare("UPDATE crm_stages SET position=? WHERE id=?").bind(i, id)));
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ leads (cards)
type LeadPatch = { stage_id?: number; value_idr?: number | null; expected_close?: string | null; owner_user_id?: number | null };

/** Checks a lead body; returns an error text or the cleaned patch. */
function readLead(b: any): { error: string } | { patch: LeadPatch } {
  const patch: LeadPatch = {};
  if (b?.stage_id !== undefined) {
    if (!Number.isInteger(b.stage_id)) return { error: "Pick a stage." };
    patch.stage_id = b.stage_id;
  }
  if (b?.value_idr !== undefined) {
    if (b.value_idr !== null && !(Number.isInteger(b.value_idr) && b.value_idr >= 0 && b.value_idr <= 1e12)) return { error: "The deal value must be a whole amount in Rp, or empty." };
    patch.value_idr = b.value_idr;
  }
  if (b?.expected_close !== undefined) {
    if (b.expected_close !== null && !(typeof b.expected_close === "string" && YMD.test(b.expected_close))) return { error: "Expected close must be a date (YYYY-MM-DD), or empty." };
    patch.expected_close = b.expected_close;
  }
  if (b?.owner_user_id !== undefined) {
    if (b.owner_user_id !== null && !Number.isInteger(b.owner_user_id)) return { error: "Pick a team member, or leave it empty." };
    patch.owner_user_id = b.owner_user_id;
  }
  return { patch };
}

/** Puts a contact on the board, or changes its stage / value / date. A stage change is written to the history. */
async function saveLead(c: Ctx, phone: string, patch: LeadPatch): Promise<{ error: string; status: 400 | 404 } | { ok: true }> {
  const account = acct(c);
  const db = c.env.DB;
  const existing = await db.prepare("SELECT stage_id FROM crm_leads WHERE wa_account_id=? AND phone=?").bind(account, phone).first<{ stage_id: number }>();
  let stage = patch.stage_id ?? existing?.stage_id;
  if (stage === undefined) {
    await ensureStages(c, account);
    stage = (await db.prepare("SELECT id FROM crm_stages WHERE wa_account_id=? ORDER BY position, id LIMIT 1").bind(account).first<{ id: number }>())!.id;
  }
  const target = await ownStage(c, stage);
  if (!target) return { error: "Stage not found", status: 404 };
  const userId = c.get("user").id;
  const moved = existing?.stage_id !== stage;
  if (moved && target.kind === "won") {
    const { results: missing } = await db.prepare(
      `SELECT d.label FROM crm_field_defs d WHERE d.wa_account_id=? AND d.required=1
         AND NOT EXISTS (SELECT 1 FROM crm_field_values v WHERE v.field_id=d.id AND v.phone=?) ORDER BY d.position, d.id`
    ).bind(account, phone).all<{ label: string }>();
    if (missing.length) return { error: `Fill in ${missing.map((m) => m.label).join(", ")} before marking this as won.`, status: 400 };
  }
  const stmts = [
    db.prepare(
      `INSERT INTO crm_leads (wa_account_id, phone, stage_id, value_idr, expected_close, owner_user_id) VALUES (?,?,?,?,?,?)
       ON CONFLICT(wa_account_id, phone) DO UPDATE SET
         stage_id=excluded.stage_id,
         owner_user_id=CASE WHEN ?=1 THEN excluded.owner_user_id ELSE crm_leads.owner_user_id END,
         value_idr=CASE WHEN ?=1 THEN excluded.value_idr ELSE crm_leads.value_idr END,
         expected_close=CASE WHEN ?=1 THEN excluded.expected_close ELSE crm_leads.expected_close END,
         stage_changed_at=CASE WHEN crm_leads.stage_id<>excluded.stage_id THEN datetime('now') ELSE crm_leads.stage_changed_at END,
         updated_at=datetime('now')`
    ).bind(account, phone, stage, patch.value_idr ?? null, patch.expected_close ?? null, patch.owner_user_id ?? null, patch.owner_user_id !== undefined ? 1 : 0, patch.value_idr !== undefined ? 1 : 0, patch.expected_close !== undefined ? 1 : 0),
  ];
  if (moved) stmts.push(db.prepare("INSERT INTO crm_stage_events (wa_account_id, phone, from_stage_id, to_stage_id, user_id) VALUES (?,?,?,?,?)").bind(account, phone, existing?.stage_id ?? null, stage, userId));
  await db.batch(stmts);
  return { ok: true };
}

pipeline.put("/leads/:phone", async (c) => {
  const phone = c.req.param("phone");
  if (!PHONE.test(phone)) return c.json({ error: "Invalid phone number." }, 400);
  const read = readLead(await c.req.json().catch(() => null));
  if ("error" in read) return c.json({ error: read.error }, 400);
  if (read.patch.owner_user_id != null && !(await eligibleOwners(c)).some((o) => o.id === read.patch.owner_user_id)) {
    return c.json({ error: "That person cannot own leads on this number." }, 400);
  }
  const r = await saveLead(c, phone, read.patch);
  if ("error" in r) return c.json({ error: r.error }, r.status);
  return c.json({ ok: true });
});

/** Add many contacts to the board at once (all to one stage); contacts already on it are moved to that stage. */
pipeline.post("/leads/bulk", async (c) => {
  const b: any = await c.req.json().catch(() => null);
  const phones: unknown = b?.phones;
  if (!Array.isArray(phones) || phones.length === 0 || phones.length > 500 || !phones.every((p) => typeof p === "string" && PHONE.test(p))) {
    return c.json({ error: "Send between 1 and 500 phone numbers." }, 400);
  }
  const stage = Number.isInteger(b?.stage_id) ? (b.stage_id as number) : undefined;
  for (const p of new Set(phones as string[])) {
    const r = await saveLead(c, p, stage === undefined ? {} : { stage_id: stage });
    if ("error" in r) return c.json({ error: r.error }, r.status);
  }
  return c.json({ ok: true, count: new Set(phones as string[]).size });
});

pipeline.delete("/leads/:phone", async (c) => {
  const phone = c.req.param("phone");
  if (!PHONE.test(phone)) return c.json({ error: "Invalid phone number." }, 400);
  await c.env.DB.prepare("DELETE FROM crm_leads WHERE wa_account_id=? AND phone=?").bind(acct(c), phone).run();
  return c.json({ ok: true });
});

pipeline.get("/leads/:phone/history", async (c) => {
  const phone = c.req.param("phone");
  if (!PHONE.test(phone)) return c.json({ error: "Invalid phone number." }, 400);
  const { results } = await c.env.DB.prepare(
    `SELECT e.at, e.from_stage_id, e.to_stage_id, f.name AS from_name, t.name AS to_name, u.name AS user_name
       FROM crm_stage_events e LEFT JOIN crm_stages f ON f.id=e.from_stage_id JOIN crm_stages t ON t.id=e.to_stage_id LEFT JOIN users u ON u.id=e.user_id
      WHERE e.wa_account_id=? AND e.phone=? ORDER BY e.id DESC LIMIT 100`
  ).bind(acct(c), phone).all();
  return c.json({ events: results });
});

// ------------------------------------------------------------------ import (pipeline columns of a contacts file)
type ImportRow = { phone?: unknown; stage?: unknown; value_idr?: unknown; expected_close?: unknown; owner?: unknown; fields?: unknown };
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/**
 * The second half of a contacts import: after the gateway has the contacts, the stage, deal value, closing date, owner and custom
 * field columns of the same file land here, matched by name (stage name, owner name, field label). A row with a stage, value, date or
 * owner puts the contact on the board; rows with only field values just fill the fields. Bad cells are reported, never guessed.
 * At most 100 rows per call (each card is a few database calls).
 */
pipeline.post("/import", async (c) => {
  const account = acct(c);
  const b: any = await c.req.json().catch(() => null);
  const rows: ImportRow[] = Array.isArray(b?.rows) ? b.rows : [];
  if (rows.length === 0 || rows.length > 100) return c.json({ error: "Send between 1 and 100 rows per call." }, 400);
  await ensureStages(c, account);
  const [stages, defs, owners] = await Promise.all([
    c.env.DB.prepare("SELECT id, name FROM crm_stages WHERE wa_account_id=?").bind(account).all<{ id: number; name: string }>(),
    c.env.DB.prepare("SELECT id, label, type, options_json FROM crm_field_defs WHERE wa_account_id=?").bind(account).all<{ id: number; label: string; type: string; options_json: string | null }>(),
    eligibleOwners(c),
  ]);
  const stageBy = new Map(stages.results.map((s) => [norm(s.name), s.id]));
  const fieldBy = new Map(defs.results.map((d) => [norm(d.label), d]));
  const ownerBy = new Map(owners.map((o) => [norm(o.name), o.id]));
  const errors: Array<{ phone: string; message: string }> = [];
  const note = (phone: string, message: string) => { if (errors.length < 60) errors.push({ phone, message }); };
  let cards = 0, values = 0;
  const stmts: D1PreparedStatement[] = [];

  for (const r of rows) {
    const phone = String(r.phone ?? "");
    if (!PHONE.test(phone)) { note(phone || "(empty)", "Invalid phone number."); continue; }
    const patch: LeadPatch = {};
    let wants = false;
    if (r.stage !== undefined && String(r.stage).trim() !== "") {
      const id = stageBy.get(norm(r.stage));
      if (id === undefined) { note(phone, `Unknown stage "${String(r.stage).slice(0, 40)}".`); continue; }
      patch.stage_id = id; wants = true;
    }
    if (r.value_idr !== undefined && r.value_idr !== null && r.value_idr !== "") {
      const n = Number(r.value_idr);
      if (!(Number.isInteger(n) && n >= 0 && n <= 1e12)) note(phone, "The deal value must be a whole amount in Rp.");
      else { patch.value_idr = n; wants = true; }
    }
    if (r.expected_close !== undefined && r.expected_close !== null && r.expected_close !== "") {
      if (typeof r.expected_close === "string" && YMD.test(r.expected_close)) { patch.expected_close = r.expected_close; wants = true; }
      else note(phone, "The closing date must be YYYY-MM-DD.");
    }
    if (r.owner !== undefined && String(r.owner).trim() !== "") {
      const id = ownerBy.get(norm(r.owner));
      if (id === undefined) note(phone, `"${String(r.owner).slice(0, 40)}" cannot own leads on this number.`);
      else { patch.owner_user_id = id; wants = true; }
    }
    if (wants) {
      const res = await saveLead(c, phone, patch);
      if ("error" in res) { note(phone, res.error); continue; }
      cards++;
    }
    if (r.fields && typeof r.fields === "object" && !Array.isArray(r.fields)) {
      for (const [label, raw] of Object.entries(r.fields as Record<string, unknown>)) {
        const def = fieldBy.get(norm(label));
        if (!def) continue; // a column that is not one of this number's fields is simply not a field
        const clean = cleanValue(def.type, parseOptions(def.options_json), raw);
        if ("error" in clean) { note(phone, `${def.label}: ${clean.error}`); continue; }
        if (clean.value === null) continue; // an empty cell never erases what is already saved
        stmts.push(
          c.env.DB.prepare(
            `INSERT INTO crm_field_values (wa_account_id, phone, field_id, value) VALUES (?,?,?,?)
             ON CONFLICT(wa_account_id, phone, field_id) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`
          ).bind(account, phone, def.id, clean.value)
        );
        values++;
      }
    }
  }
  for (let i = 0; i < stmts.length; i += 90) await c.env.DB.batch(stmts.slice(i, i + 90));
  return c.json({ ok: true, cards, values, errors });
});

// ------------------------------------------------------------------ custom fields
async function ownField(c: Ctx, id: number) {
  return c.env.DB.prepare("SELECT id, type, options_json FROM crm_field_defs WHERE id=? AND wa_account_id=?").bind(id, acct(c)).first<{ id: number; type: string; options_json: string | null }>();
}

function readOptions(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean))];
  return out.length >= 1 && out.length <= 30 && out.every((x) => x.length <= 40) ? out : null;
}

pipeline.post("/fields", async (c) => {
  const account = acct(c);
  const b: any = await c.req.json().catch(() => null);
  const label = text(b?.label, 40);
  if (!label) return c.json({ error: "Give the field a name (up to 40 characters)." }, 400);
  if (!FIELD_TYPES.includes(b?.type)) return c.json({ error: "Unknown field type." }, 400);
  let options: string[] | null = null;
  if (b.type === "select") {
    options = readOptions(b.options);
    if (!options) return c.json({ error: "A choice field needs 1 to 30 options." }, 400);
  }
  const n = await c.env.DB.prepare("SELECT COUNT(*) n, COALESCE(MAX(position), -1) p FROM crm_field_defs WHERE wa_account_id=?").bind(account).first<{ n: number; p: number }>();
  if ((n?.n ?? 0) >= MAX_FIELDS) return c.json({ error: `Up to ${MAX_FIELDS} fields per number.` }, 400);
  try {
    const row = await c.env.DB.prepare("INSERT INTO crm_field_defs (wa_account_id, label, type, options_json, position, required) VALUES (?,?,?,?,?,?) RETURNING id, label, type, position, required")
      .bind(account, label, b.type, options ? JSON.stringify(options) : null, (n?.p ?? -1) + 1, b.required === true ? 1 : 0).first<any>();
    return c.json({ field: { ...row, required: row.required === 1, options: options ?? [] } }, 201);
  } catch {
    return c.json({ error: "A field with this name already exists." }, 409);
  }
});

/** Rename a field or change a choice field's options. The type never changes (existing values would not fit). */
pipeline.patch("/fields/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const f = await ownField(c, id);
  if (!f) return c.json({ error: "Field not found" }, 404);
  const b: any = await c.req.json().catch(() => null);
  const label = b?.label !== undefined ? text(b.label, 40) : undefined;
  if (label === null) return c.json({ error: "Give the field a name (up to 40 characters)." }, 400);
  let options: string[] | undefined;
  if (b?.options !== undefined) {
    if (f.type !== "select") return c.json({ error: "Only choice fields have options." }, 400);
    const o = readOptions(b.options);
    if (!o) return c.json({ error: "A choice field needs 1 to 30 options." }, 400);
    options = o;
  }
  try {
    if (b?.required !== undefined && typeof b.required !== "boolean") return c.json({ error: "required must be true or false." }, 400);
    await c.env.DB.prepare("UPDATE crm_field_defs SET label=COALESCE(?,label), options_json=COALESCE(?,options_json), required=COALESCE(?,required) WHERE id=?")
      .bind(label ?? null, options ? JSON.stringify(options) : null, b?.required === undefined ? null : b.required ? 1 : 0, id).run();
  } catch {
    return c.json({ error: "A field with this name already exists." }, 409);
  }
  return c.json({ ok: true });
});

/** The ready-made field sets (id, name, what it adds) and how many of each this number already has. */
pipeline.get("/presets", async (c) => {
  const have = new Set((await c.env.DB.prepare("SELECT label FROM crm_field_defs WHERE wa_account_id=?").bind(acct(c)).all<{ label: string }>()).results.map((r) => r.label));
  return c.json({ presets: PRESETS.map((p) => ({ id: p.id, name: p.name, description: p.description, fields: p.fields.length, missing: p.fields.filter((f) => !have.has(f.label)).length })) });
});

/** Adds the fields of a preset that this number does not have yet (by label); never touches existing ones. */
pipeline.post("/fields/preset", async (c) => {
  const account = acct(c);
  const b: any = await c.req.json().catch(() => null);
  const preset = PRESETS.find((p) => p.id === b?.preset);
  if (!preset) return c.json({ error: "Unknown field set." }, 400);
  const have = await c.env.DB.prepare("SELECT label FROM crm_field_defs WHERE wa_account_id=?").bind(account).all<{ label: string }>();
  const labels = new Set(have.results.map((r) => r.label));
  const add = preset.fields.filter((f) => !labels.has(f.label));
  if (have.results.length + add.length > MAX_FIELDS) return c.json({ error: `That would pass ${MAX_FIELDS} fields on this number. Remove some first.` }, 400);
  const top = (await c.env.DB.prepare("SELECT COALESCE(MAX(position), -1) p FROM crm_field_defs WHERE wa_account_id=?").bind(account).first<{ p: number }>())?.p ?? -1;
  if (add.length) {
    await c.env.DB.batch(add.map((f, i) => c.env.DB.prepare("INSERT INTO crm_field_defs (wa_account_id, label, type, options_json, position, required) VALUES (?,?,?,?,?,?)")
      .bind(account, f.label, f.type, f.options ? JSON.stringify(f.options) : null, top + 1 + i, f.required ? 1 : 0)));
  }
  return c.json({ added: add.length, kept: preset.fields.length - add.length });
});

pipeline.delete("/fields/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!(await ownField(c, id))) return c.json({ error: "Field not found" }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM crm_field_values WHERE field_id=?").bind(id),
    c.env.DB.prepare("DELETE FROM crm_field_defs WHERE id=?").bind(id),
  ]);
  return c.json({ ok: true });
});

pipeline.post("/fields/reorder", async (c) => {
  const b: any = await c.req.json().catch(() => null);
  const ids: unknown = b?.ids;
  const own = (await c.env.DB.prepare("SELECT id FROM crm_field_defs WHERE wa_account_id=?").bind(acct(c)).all<{ id: number }>()).results.map((r) => r.id);
  if (!Array.isArray(ids) || ids.length !== own.length || new Set(ids).size !== ids.length || !ids.every((x) => own.includes(x as number))) {
    return c.json({ error: "Send every field exactly once." }, 400);
  }
  await c.env.DB.batch((ids as number[]).map((id, i) => c.env.DB.prepare("UPDATE crm_field_defs SET position=? WHERE id=?").bind(i, id)));
  return c.json({ ok: true });
});

/** A value as stored text, or an error. "" / null clears it. */
function cleanValue(type: string, options: string[], v: unknown): { value: string | null } | { error: string } {
  if (v === null || v === "" || v === undefined) return { value: null };
  if (type === "checkbox") return v === true || v === "1" || v === 1 ? { value: "1" } : { value: null };
  if (typeof v !== "string" && typeof v !== "number") return { error: "Invalid value." };
  const s = String(v).trim();
  if (type === "number") return /^-?\d+(\.\d+)?$/.test(s) && s.length <= 20 ? { value: s } : { error: "Enter a number." };
  if (type === "date") return YMD.test(s) ? { value: s } : { error: "Enter a date (YYYY-MM-DD)." };
  if (type === "select") return options.includes(s) ? { value: s } : { error: "Pick one of the options." };
  if (type === "url") return /^https?:\/\/\S{3,500}$/i.test(s) ? { value: s } : { error: "Enter a web address starting with http:// or https://." };
  return s.length <= 500 ? { value: s } : { error: "Too long (500 characters at most)." };
}

pipeline.get("/values", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT phone, field_id, value FROM crm_field_values WHERE wa_account_id=? LIMIT 50000").bind(acct(c)).all<{ phone: string; field_id: number; value: string }>();
  const values: Record<string, Record<string, string>> = {};
  for (const r of results) (values[r.phone] ??= {})[r.field_id] = r.value;
  return c.json({ values });
});

pipeline.put("/values/:phone", async (c) => {
  const account = acct(c);
  const phone = c.req.param("phone");
  if (!PHONE.test(phone)) return c.json({ error: "Invalid phone number." }, 400);
  const b: any = await c.req.json().catch(() => null);
  const input = b?.values;
  if (!input || typeof input !== "object" || Array.isArray(input)) return c.json({ error: "Send { values: { <field id>: value } }." }, 400);
  const defs = (await c.env.DB.prepare("SELECT id, type, options_json FROM crm_field_defs WHERE wa_account_id=?").bind(account).all<{ id: number; type: string; options_json: string | null }>()).results;
  const stmts = [];
  for (const [key, raw] of Object.entries(input)) {
    const def = defs.find((d) => String(d.id) === key);
    if (!def) return c.json({ error: `Unknown field ${key}.` }, 400);
    const r = cleanValue(def.type, parseOptions(def.options_json), raw);
    if ("error" in r) return c.json({ error: r.error, field_id: def.id }, 400);
    stmts.push(
      r.value === null
        ? c.env.DB.prepare("DELETE FROM crm_field_values WHERE wa_account_id=? AND phone=? AND field_id=?").bind(account, phone, def.id)
        : c.env.DB.prepare(
            `INSERT INTO crm_field_values (wa_account_id, phone, field_id, value) VALUES (?,?,?,?)
             ON CONFLICT(wa_account_id, phone, field_id) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`
          ).bind(account, phone, def.id, r.value)
    );
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

export default pipeline;
