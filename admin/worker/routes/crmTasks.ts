// CRM follow-up tasks and notes, and the activity timeline of one contact. Same rules as the pipeline: ?account=<gateway number id>
// is required and must be a number the caller may use. Dates are Asia/Jakarta calendar days (YYYY-MM-DD).

import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { requirePerm } from "../middleware";
import { acct, crmAccount, eligibleOwners } from "../lib/crmGuard";
import { ymdInTz } from "../lib/dates";

const tasks = new Hono<{ Bindings: Env; Variables: Vars }>();
tasks.use("*", requirePerm("crm"), crmAccount);

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const PHONE = /^\d{6,20}$/;
const today = () => ymdInTz("Asia/Jakarta");
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null);

const SELECT = `SELECT t.id, t.phone, t.title, t.due_date, t.done_at, t.assignee_user_id, a.name AS assignee_name, t.created_at
                  FROM crm_tasks t LEFT JOIN users a ON a.id = t.assignee_user_id`;

/** Open and done tasks of this number. ?mine=1 only the caller's; ?phone= one contact; ?scope=open|done|all (default open). */
tasks.get("/", async (c) => {
  const scope = c.req.query("scope") ?? "open";
  const where = ["t.wa_account_id=?"];
  const binds: unknown[] = [acct(c)];
  if (scope === "open") where.push("t.done_at IS NULL");
  else if (scope === "done") where.push("t.done_at IS NOT NULL");
  if (c.req.query("mine") === "1") { where.push("t.assignee_user_id=?"); binds.push(c.get("user").id); }
  const phone = c.req.query("phone");
  if (phone) {
    if (!PHONE.test(phone)) return c.json({ error: "Invalid phone number." }, 400);
    where.push("t.phone=?"); binds.push(phone);
  }
  const order = scope === "done" ? "t.done_at DESC" : "t.due_date IS NULL, t.due_date, t.id";
  const { results } = await c.env.DB.prepare(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 500`).bind(...binds).all();
  return c.json({ today: today(), owners: await eligibleOwners(c), tasks: results });
});

/** Numbers for the tab badge: open tasks that are overdue or due today (the caller's own, or unassigned). */
tasks.get("/summary", async (c) => {
  const t = today();
  const row = await c.env.DB.prepare(
    `SELECT SUM(due_date < ?) overdue, SUM(due_date = ?) due_today FROM crm_tasks
      WHERE wa_account_id=? AND done_at IS NULL AND due_date IS NOT NULL AND (assignee_user_id=? OR assignee_user_id IS NULL)`
  ).bind(t, t, acct(c), c.get("user").id).first<{ overdue: number | null; due_today: number | null }>();
  return c.json({ today: t, overdue: row?.overdue ?? 0, due_today: row?.due_today ?? 0 });
});

async function checkAssignee(c: Parameters<typeof eligibleOwners>[0], id: unknown): Promise<{ value: number | null } | { error: string }> {
  if (id === null || id === undefined) return { value: null };
  if (!Number.isInteger(id)) return { error: "Pick a team member, or leave it empty." };
  return (await eligibleOwners(c)).some((o) => o.id === id) ? { value: id as number } : { error: "That person cannot take tasks on this number." };
}

tasks.post("/", async (c) => {
  const b: any = await c.req.json().catch(() => null);
  const phone = String(b?.phone ?? "");
  if (!PHONE.test(phone)) return c.json({ error: "Invalid phone number." }, 400);
  const title = text(b?.title, 200);
  if (!title) return c.json({ error: "Write what needs to be done (up to 200 characters)." }, 400);
  if (b?.due_date != null && !(typeof b.due_date === "string" && YMD.test(b.due_date))) return c.json({ error: "The due date must be a date (YYYY-MM-DD), or empty." }, 400);
  const who = b?.assignee_user_id === undefined ? { value: c.get("user").id } : await checkAssignee(c, b.assignee_user_id);
  if ("error" in who) return c.json({ error: who.error }, 400);
  const row = await c.env.DB.prepare("INSERT INTO crm_tasks (wa_account_id, phone, title, due_date, assignee_user_id, created_by) VALUES (?,?,?,?,?,?) RETURNING id")
    .bind(acct(c), phone, title, b?.due_date ?? null, who.value, c.get("user").id).first<{ id: number }>();
  return c.json({ id: row!.id }, 201);
});

tasks.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const own = await c.env.DB.prepare("SELECT id FROM crm_tasks WHERE id=? AND wa_account_id=?").bind(id, acct(c)).first();
  if (!own) return c.json({ error: "Task not found" }, 404);
  const b: any = await c.req.json().catch(() => null);
  const title = b?.title !== undefined ? text(b.title, 200) : undefined;
  if (title === null) return c.json({ error: "Write what needs to be done (up to 200 characters)." }, 400);
  if (b?.due_date !== undefined && b.due_date !== null && !(typeof b.due_date === "string" && YMD.test(b.due_date))) return c.json({ error: "The due date must be a date (YYYY-MM-DD), or empty." }, 400);
  if (b?.done !== undefined && typeof b.done !== "boolean") return c.json({ error: "done must be true or false." }, 400);
  let assignee: { value: number | null } | undefined;
  if (b?.assignee_user_id !== undefined) {
    const r = await checkAssignee(c, b.assignee_user_id);
    if ("error" in r) return c.json({ error: r.error }, 400);
    assignee = r;
  }
  await c.env.DB.prepare(
    `UPDATE crm_tasks SET title=COALESCE(?,title),
       due_date=CASE WHEN ?=1 THEN ? ELSE due_date END,
       assignee_user_id=CASE WHEN ?=1 THEN ? ELSE assignee_user_id END,
       done_at=CASE WHEN ?=1 THEN datetime('now') WHEN ?=0 THEN NULL ELSE done_at END
     WHERE id=?`
  ).bind(title ?? null, b?.due_date !== undefined ? 1 : 0, b?.due_date ?? null, assignee ? 1 : 0, assignee?.value ?? null, b?.done === undefined ? -1 : b.done ? 1 : 0, b?.done === undefined ? -1 : b.done ? 1 : 0, id).run();
  return c.json({ ok: true });
});

tasks.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM crm_tasks WHERE id=? AND wa_account_id=?").bind(Number(c.req.param("id")), acct(c)).run();
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ notes and timeline
tasks.post("/notes", async (c) => {
  const b: any = await c.req.json().catch(() => null);
  const phone = String(b?.phone ?? "");
  if (!PHONE.test(phone)) return c.json({ error: "Invalid phone number." }, 400);
  const body = text(b?.body, 2000);
  if (!body) return c.json({ error: "Write the note (up to 2000 characters)." }, 400);
  const row = await c.env.DB.prepare("INSERT INTO crm_notes (wa_account_id, phone, body, user_id) VALUES (?,?,?,?) RETURNING id").bind(acct(c), phone, body, c.get("user").id).first<{ id: number }>();
  return c.json({ id: row!.id }, 201);
});

/** A note can be removed by whoever wrote it, or an Owner. */
tasks.delete("/notes/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const note = await c.env.DB.prepare("SELECT user_id FROM crm_notes WHERE id=? AND wa_account_id=?").bind(id, acct(c)).first<{ user_id: number | null }>();
  if (!note) return c.json({ error: "Note not found" }, 404);
  if (note.user_id !== user.id && user.client_ids !== null) return c.json({ error: "Only the author or an Owner can remove a note." }, 403);
  await c.env.DB.prepare("DELETE FROM crm_notes WHERE id=?").bind(id).run();
  return c.json({ ok: true });
});

/** Everything that happened to one contact, newest first: notes, stage moves, tasks added and finished. */
tasks.get("/timeline/:phone", async (c) => {
  const phone = c.req.param("phone");
  if (!PHONE.test(phone)) return c.json({ error: "Invalid phone number." }, 400);
  const account = acct(c);
  const [notes, moves, made, done] = await Promise.all([
    c.env.DB.prepare("SELECT n.id, n.body, n.created_at AS at, u.name AS user_name, n.user_id FROM crm_notes n LEFT JOIN users u ON u.id=n.user_id WHERE n.wa_account_id=? AND n.phone=? ORDER BY n.id DESC LIMIT 100").bind(account, phone).all<any>(),
    c.env.DB.prepare(
      `SELECT e.at, f.name AS from_name, t.name AS to_name, u.name AS user_name FROM crm_stage_events e
         LEFT JOIN crm_stages f ON f.id=e.from_stage_id JOIN crm_stages t ON t.id=e.to_stage_id LEFT JOIN users u ON u.id=e.user_id
        WHERE e.wa_account_id=? AND e.phone=? ORDER BY e.id DESC LIMIT 100`
    ).bind(account, phone).all<any>(),
    c.env.DB.prepare("SELECT t.title, t.created_at AS at, u.name AS user_name FROM crm_tasks t LEFT JOIN users u ON u.id=t.created_by WHERE t.wa_account_id=? AND t.phone=? ORDER BY t.id DESC LIMIT 100").bind(account, phone).all<any>(),
    c.env.DB.prepare("SELECT title, done_at AS at FROM crm_tasks WHERE wa_account_id=? AND phone=? AND done_at IS NOT NULL ORDER BY done_at DESC LIMIT 100").bind(account, phone).all<any>(),
  ]);
  const items = [
    ...notes.results.map((n) => ({ kind: "note", id: n.id, at: n.at, text: n.body, user_name: n.user_name, user_id: n.user_id })),
    ...moves.results.map((m) => ({ kind: "stage", at: m.at, text: m.from_name ? `${m.from_name} → ${m.to_name}` : `Added to ${m.to_name}`, user_name: m.user_name })),
    ...made.results.map((t) => ({ kind: "task", at: t.at, text: `Task added: ${t.title}`, user_name: t.user_name })),
    ...done.results.map((t) => ({ kind: "task_done", at: t.at, text: `Task done: ${t.title}` })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 150);
  return c.json({ items });
});

export default tasks;
