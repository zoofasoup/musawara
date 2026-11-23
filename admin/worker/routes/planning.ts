// SMM planning: content calendar and idea kanban. Team only (roles with the "content" feature, and only their own clients), for reads AND writes: the
// planning data is internal, so a client user or share link never reaches it even though the
// per-client mount sits behind clientAccess. Mounted twice: /api/clients/:clientId/plan (one client)
// and /api/admin/plan (all clients, optional ?client_id=). Nothing here schedules or publishes.

import { Hono, type Context } from "hono";
import type { Env, Vars } from "../types";
import { staffCan } from "../../shared/permissions";
import { canReachClient, scopeSql } from "../middleware";
import { KINDS } from "../lib/publishRules";
import { bucketByDay, checkMove, isStage, isYmd, jakartaDay, jakartaDayStartUtc, SYNC_SQL, addDaysYmd } from "../lib/planning";

const plan = new Hono<{ Bindings: Env; Variables: Vars }>();
type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

/** The signed-in team member behind this request, or null for a client login or share link. */
const actor = (c: Ctx) => {
  const a = c.get("access");
  return a ? (a.type === "user" ? a.user : null) : c.get("user");
};

plan.use("*", async (c, next) => {
  const user = actor(c);
  if (!user || user.role !== "admin" || !staffCan(user.staff_role, "content")) return c.json({ error: "Forbidden" }, 403);
  const asked = scope(c);
  if (asked !== null && !Number.isNaN(asked) && !canReachClient(user, asked)) return c.json({ error: "Forbidden" }, 403);
  await next();
});

/** The client this request is limited to, or null for the all-clients view. */
function scope(c: Ctx): number | null {
  const p = c.req.param("clientId") ?? c.req.query("client_id");
  if (p == null || p === "") return null;
  const n = Number(p);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}
const badScope = (c: Ctx) => c.json({ error: "Bad client id" }, 400);

const userId = (c: Ctx) => actor(c)?.id ?? null;
/** AND-fragment limiting a query to the caller's clients (empty for Owner). */
const mine = (c: Ctx, column: string) => scopeSql(actor(c)!, column);

const syncPlans = (c: Ctx) => c.env.DB.batch(SYNC_SQL.map((s) => c.env.DB.prepare(s)));

const CARD_SELECT = `SELECT cp.id, cp.client_id, cl.name AS client_name, cp.title, cp.brief, cp.kind, cp.stage, cp.planned_date,
       cp.progress, cp.pillar, cp.campaign, cp.platforms, cp.reference_url, cp.final_url, cp.posted_date, cp.source_notion_id,
       cp.owner_user_id, u.name AS owner_name, cp.post_id, p.status AS post_status, p.scheduled_at AS post_scheduled_at,
       cp.updated_at
  FROM content_plans cp JOIN clients cl ON cl.id=cp.client_id
  LEFT JOIN users u ON u.id=cp.owner_user_id LEFT JOIN posts p ON p.id=cp.post_id`;

async function cardById(c: Ctx, id: number, cid: number | null) {
  return c.env.DB.prepare(`${CARD_SELECT} WHERE cp.id=? AND (? IS NULL OR cp.client_id=?)${mine(c, "cp.client_id")}`).bind(id, cid, cid).first<any>();
}

// Source items without a verified client are visible to staff for review only.
plan.get("/imports/review", async (c) => {
  const rows = await c.env.DB.prepare("SELECT source_id,title,progress,source_url FROM content_import_review ORDER BY title,source_id").all();
  return c.json({ items: rows.results });
});

// Private to the current staff member, independent of the selected client filter.
plan.get("/notifications", async (c) => {
  const uid = userId(c);
  const rows = await c.env.DB.prepare(`SELECT n.id,n.plan_id,n.message,n.created_at,n.read_at,cp.title,cl.name AS client_name
    FROM content_workflow_notifications n JOIN content_plans cp ON cp.id=n.plan_id JOIN clients cl ON cl.id=cp.client_id
    WHERE n.recipient_user_id=? ORDER BY n.id DESC LIMIT 100`).bind(uid).all();
  return c.json({ notifications: rows.results });
});

plan.post("/notifications/:id/read", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return c.json({ error: "Invalid notification." }, 400);
  const result = await c.env.DB.prepare("UPDATE content_workflow_notifications SET read_at=COALESCE(read_at,datetime('now')) WHERE id=? AND recipient_user_id=?").bind(id, userId(c)).run();
  if (!result.meta.changes) return c.json({ error: "Notification not found." }, 404);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------- board
plan.get("/board", async (c) => {
  const cid = scope(c);
  if (Number.isNaN(cid)) return badScope(c);
  await syncPlans(c);
  const [cards, owners] = await Promise.all([
    c.env.DB.prepare(`${CARD_SELECT} WHERE (? IS NULL OR cp.client_id=?)${mine(c, "cp.client_id")} ORDER BY cp.planned_date IS NULL, cp.planned_date, cp.id DESC`).bind(cid, cid).all(),
    c.env.DB.prepare("SELECT id, name FROM users WHERE role='admin' ORDER BY name").all(),
  ]);
  return c.json({ cards: cards.results, owners: owners.results });
});

const PROGRESS = ["Ideation", "Copy / Script", "Review Copy", "Production", "Ready to Edit", "Design / Editing", "Review Visual", "Ready to Post", "Scheduled", "Posted", "Failed"] as const;
type CardBody = { progress?: string; pillar?: string; campaign?: string; platforms?: string; reference_url?: string; final_url?: string; posted_date?: string | null; title?: string; brief?: string; kind?: string; planned_date?: string | null; owner_user_id?: number | null; post_id?: number | null; stage?: string };

async function validateFields(c: Ctx, b: CardBody, clientId: number, ownCardId: number | null) {
  if (b.progress !== undefined && !PROGRESS.includes(b.progress as any)) return "Unknown progress.";
  for (const key of ["pillar", "campaign", "platforms", "reference_url", "final_url"] as const) {
    if (b[key] !== undefined && (typeof b[key] !== "string" || b[key]!.length > 1000)) return `Invalid ${key}.`;
  }
  for (const key of ["reference_url", "final_url"] as const) {
    if (b[key]) { try { if (!["https:", "http:"].includes(new URL(b[key]!).protocol)) return `Invalid ${key}.`; } catch { return `Invalid ${key}.`; } }
  }
  if (b.posted_date != null && !isYmd(b.posted_date)) return "Posted date must be YYYY-MM-DD.";
  if (b.title !== undefined && (typeof b.title !== "string" || !b.title.trim() || b.title.length > 200)) return "Give the card a title (up to 200 characters).";
  if (b.brief !== undefined && (typeof b.brief !== "string" || b.brief.length > 20000)) return "The brief is too long (maximum 20,000 characters).";
  if (b.kind !== undefined && !KINDS.includes(b.kind as any)) return "Unknown post type.";
  if (b.planned_date != null && !isYmd(b.planned_date)) return "Planned date must be YYYY-MM-DD.";
  if (b.owner_user_id != null) {
    const u = await c.env.DB.prepare("SELECT id FROM users WHERE id=? AND role='admin'").bind(b.owner_user_id).first();
    if (!u) return "Owner must be a team member.";
  }
  if (b.post_id != null) {
    if (!Number.isInteger(b.post_id)) return "Invalid post.";
    const p = await c.env.DB.prepare("SELECT id FROM posts WHERE id=? AND client_id=?").bind(b.post_id, clientId).first();
    if (!p) return "That post does not belong to this client.";
    const taken = await c.env.DB.prepare("SELECT id FROM content_plans WHERE post_id=? AND id IS NOT ?").bind(b.post_id, ownCardId).first();
    if (taken) return "That post is already linked to another card.";
  }
  return null;
}

plan.post("/cards", async (c) => {
  const b: CardBody & { client_id?: number } = (await c.req.json().catch(() => null)) ?? {};
  const scoped = scope(c);
  if (Number.isNaN(scoped)) return badScope(c);
  const clientId = scoped ?? b.client_id;
  if (!Number.isInteger(clientId)) return c.json({ error: "client_id is required" }, 400);
  if (!canReachClient(actor(c)!, clientId as number)) return c.json({ error: "Forbidden" }, 403);
  const client = await c.env.DB.prepare("SELECT id FROM clients WHERE id=?").bind(clientId).first();
  if (!client) return c.json({ error: "Client not found" }, 404);
  if (typeof b.title !== "string") return c.json({ error: "Give the card a title (up to 200 characters)." }, 400);
  // New cards start in a manual column; Scheduled/Published only come from a linked post.
  const stage = b.stage ?? "idea";
  if (!isStage(stage) || !["idea", "drafting", "in_review"].includes(stage)) return c.json({ error: "New cards start in Idea, Drafting or In review." }, 400);
  const err = await validateFields(c, b, clientId as number, null);
  if (err) return c.json({ error: err }, 400);
  const r = await c.env.DB.prepare(
    "INSERT INTO content_plans (client_id, title, brief, kind, stage, planned_date, owner_user_id, post_id, created_by) VALUES (?,?,?,?,?,?,?,?,?)"
  )
    .bind(clientId, b.title!.trim(), b.brief ?? "", b.kind ?? "feed", stage, b.planned_date ?? null, b.owner_user_id ?? null, b.post_id ?? null, userId(c))
    .run();
  const id = r.meta.last_row_id as number;
  if (b.post_id != null) await syncPlans(c);
  return c.json({ card: await cardById(c, id, null) }, 201);
});

plan.patch("/cards/:id", async (c) => {
  const cid = scope(c);
  if (Number.isNaN(cid)) return badScope(c);
  const id = Number(c.req.param("id"));
  const existing = await cardById(c, id, cid);
  if (!existing) return c.json({ error: "Card not found" }, 404);
  const b: CardBody = (await c.req.json().catch(() => null)) ?? {};
  if ("stage" in b) return c.json({ error: "Use the move action to change the column." }, 400);
  const err = await validateFields(c, b, existing.client_id, id);
  if (err) return c.json({ error: err }, 400);
  const has = (k: keyof CardBody) => k in b;
  await c.env.DB.prepare(
    `UPDATE content_plans SET title=?, brief=?, kind=?, planned_date=?, owner_user_id=?, post_id=?, progress=?, pillar=?, campaign=?, platforms=?, reference_url=?, final_url=?, posted_date=?, updated_at=datetime('now') WHERE id=?`
  )
    .bind(
      has("title") ? b.title!.trim() : existing.title,
      has("brief") ? b.brief : existing.brief,
      has("kind") ? b.kind : existing.kind,
      has("planned_date") ? b.planned_date ?? null : existing.planned_date,
      has("owner_user_id") ? b.owner_user_id ?? null : existing.owner_user_id,
      has("post_id") ? b.post_id ?? null : existing.post_id,
      has("progress") ? b.progress : existing.progress,
      has("pillar") ? b.pillar : existing.pillar,
      has("campaign") ? b.campaign : existing.campaign,
      has("platforms") ? b.platforms : existing.platforms,
      has("reference_url") ? b.reference_url : existing.reference_url,
      has("final_url") ? b.final_url : existing.final_url,
      has("posted_date") ? b.posted_date ?? null : existing.posted_date,
      id
    )
    .run();
  await syncPlans(c); // linking a scheduled/published post raises the card; unlinking never lowers or changes any post
  return c.json({ card: await cardById(c, id, null) });
});

plan.post("/cards/:id/move", async (c) => {
  const cid = scope(c);
  if (Number.isNaN(cid)) return badScope(c);
  const id = Number(c.req.param("id"));
  const existing = await cardById(c, id, cid);
  if (!existing) return c.json({ error: "Card not found" }, 404);
  const b: any = await c.req.json().catch(() => null);
  if (!isStage(b?.stage)) return c.json({ error: "Unknown column." }, 400);
  const verdict = checkMove(existing.stage, b.stage, existing.post_status ?? null);
  if (!verdict.ok) return c.json({ error: verdict.error }, 409);
  // Only the card changes. This route never touches posts / post_targets.
  await c.env.DB.prepare("UPDATE content_plans SET stage=?, updated_at=datetime('now') WHERE id=?").bind(b.stage, id).run();
  return c.json({ card: await cardById(c, id, null) });
});

plan.delete("/cards/:id", async (c) => {
  const cid = scope(c);
  if (Number.isNaN(cid)) return badScope(c);
  const id = Number(c.req.param("id"));
  if (!(await cardById(c, id, cid))) return c.json({ error: "Card not found" }, 404);
  await c.env.DB.prepare("DELETE FROM content_plans WHERE id=?").bind(id).run(); // the linked post, if any, is untouched
  return c.json({ ok: true });
});

// Internal discussion and external links. These never send data to Notion or clients.
plan.get("/cards/:id/details", async (c) => {
  const cid = scope(c);
  if (Number.isNaN(cid)) return badScope(c);
  const id = Number(c.req.param("id"));
  if (!(await cardById(c, id, cid))) return c.json({ error: "Card not found" }, 404);
  const [comments, links] = await Promise.all([
    c.env.DB.prepare("SELECT id, author_name, body, created_at FROM content_plan_comments WHERE plan_id=? ORDER BY id").bind(id).all(),
    c.env.DB.prepare("SELECT id, title, url, created_at FROM content_plan_links WHERE plan_id=? ORDER BY id").bind(id).all(),
  ]);
  return c.json({ comments: comments.results, links: links.results });
});

plan.post("/cards/:id/comments", async (c) => {
  const cid = scope(c);
  if (Number.isNaN(cid)) return badScope(c);
  const id = Number(c.req.param("id"));
  if (!(await cardById(c, id, cid))) return c.json({ error: "Card not found" }, 404);
  const b: any = await c.req.json().catch(() => null);
  if (typeof b?.body !== "string" || !b.body.trim() || b.body.length > 5000) return c.json({ error: "Comment must be 1–5000 characters." }, 400);
  const access = c.get("access");
  const user = access?.type === "user" ? access.user : c.get("user");
  await c.env.DB.prepare("INSERT INTO content_plan_comments (plan_id, author_user_id, author_name, body) VALUES (?,?,?,?)").bind(id, user.id, user.name, b.body.trim()).run();
  return c.json({ ok: true }, 201);
});

plan.post("/cards/:id/links", async (c) => {
  const cid = scope(c);
  if (Number.isNaN(cid)) return badScope(c);
  const id = Number(c.req.param("id"));
  if (!(await cardById(c, id, cid))) return c.json({ error: "Card not found" }, 404);
  const b: any = await c.req.json().catch(() => null);
  if (typeof b?.title !== "string" || !b.title.trim() || b.title.length > 200 || typeof b.url !== "string" || b.url.length > 2000) return c.json({ error: "Provide a title and valid link." }, 400);
  try { if (!["https:", "http:"].includes(new URL(b.url).protocol)) throw new Error(); } catch { return c.json({ error: "Provide a valid HTTP or HTTPS link." }, 400); }
  await c.env.DB.prepare("INSERT INTO content_plan_links (plan_id, title, url) VALUES (?,?,?)").bind(id, b.title.trim(), b.url).run();
  return c.json({ ok: true }, 201);
});

// Posts a card could link to: this client's posts that no card uses yet.
plan.get("/linkable-posts", async (c) => {
  const cid = scope(c);
  if (cid == null || Number.isNaN(cid)) return c.json({ error: "client_id is required" }, 400);
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.status, p.kind, substr(p.caption,1,120) AS caption, p.scheduled_at
       FROM posts p WHERE p.client_id=? AND NOT EXISTS (SELECT 1 FROM content_plans cp WHERE cp.post_id=p.id)
      ORDER BY p.id DESC LIMIT 100`
  ).bind(cid).all();
  return c.json({ posts: results });
});

// ---------------------------------------------------------------- calendar
// Posts by scheduled_at and unlinked cards by planned_date, bucketed in Asia/Jakarta.
plan.get("/calendar", async (c) => {
  const cid = scope(c);
  if (Number.isNaN(cid)) return badScope(c);
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (!isYmd(from) || !isYmd(to) || to < from) return c.json({ error: "from and to must be YYYY-MM-DD" }, 400);
  if (Date.parse(to) - Date.parse(from) > 100 * 86_400_000) return c.json({ error: "Range too long" }, 400);
  await syncPlans(c);
  const startUtc = jakartaDayStartUtc(from);
  const endUtc = jakartaDayStartUtc(addDaysYmd(to, 1));
  const [posts, cards] = await Promise.all([
    c.env.DB.prepare(
      `SELECT p.id, p.client_id, cl.name AS client_name, p.status, p.kind, substr(p.caption,1,160) AS caption, p.scheduled_at, p.last_error,
              (SELECT group_concat(DISTINCT ch.platform) FROM post_targets t JOIN channels ch ON ch.id=t.channel_id WHERE t.post_id=p.id) AS platforms,
              (SELECT cp.id FROM content_plans cp WHERE cp.post_id=p.id) AS card_id
         FROM posts p JOIN clients cl ON cl.id=p.client_id
        WHERE (? IS NULL OR p.client_id=?)${mine(c, "p.client_id")} AND p.scheduled_at >= ? AND p.scheduled_at < ? ORDER BY p.scheduled_at`
    ).bind(cid, cid, startUtc, endUtc).all<any>(),
    c.env.DB.prepare(`${CARD_SELECT} WHERE (? IS NULL OR cp.client_id=?)${mine(c, "cp.client_id")} AND cp.post_id IS NULL AND cp.planned_date BETWEEN ? AND ? ORDER BY cp.planned_date, cp.id`)
      .bind(cid, cid, from, to).all(),
  ]);
  const withDay = posts.results.map((p) => ({ ...p, platforms: p.platforms ? String(p.platforms).split(",") : [], day: jakartaDay(p.scheduled_at) }));
  const days: Record<string, number> = {};
  for (const [d, items] of bucketByDay(withDay)) days[d] = items.length;
  return c.json({ posts: withDay, cards: cards.results, counts: days });
});

export default plan;
