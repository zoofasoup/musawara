// Asset library and client approvals.
//
//   /api/approvals                              GET   admin: every request, all clients (status filter)
//   /api/approvals/:clientId/assets             GET POST            (admin)
//   /api/approvals/:clientId/assets/:id         PUT DELETE          (admin)
//   /api/approvals/:clientId/requests           GET (admin + that client's users) POST (admin)
//   /api/approvals/:clientId/requests/:id       GET
//   /api/approvals/:clientId/requests/:id/resubmit   POST (admin)
//   /api/approvals/:clientId/requests/:id/decision   POST (client users of that client)
//
// Tenant isolation: clientAccess resolves the client from the session (a client user can only
// reach their own :clientId). Every query below is scoped to that resolved id, never to a
// client_id in a body. Share-link visitors get nothing here. Files are Google Drive links only.

import { Hono, type Context } from "hono";
import type { Env, Vars } from "../types";
import { clientAccess, requirePerm, scopeSql } from "../middleware";
import { staffCan, type Feature } from "../../shared/permissions";
import { APPROVAL_STATUSES, ASSET_KINDS, decide, parseIds, resubmit, validateAsset, type ApprovalStatus } from "../lib/approvals";

const approvals = new Hono<{ Bindings: Env; Variables: Vars }>();
type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

// Team view across clients
approvals.get("/", requirePerm("approvals"), async (c) => {
  const status = c.req.query("status");
  if (status && !APPROVAL_STATUSES.includes(status as ApprovalStatus)) return c.json({ error: "Bad status" }, 400);
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.client_id, cl.name AS client_name, r.title, r.message, r.status, r.version, r.post_id, r.created_at, r.updated_at,
            (SELECT COUNT(*) FROM approval_request_assets x WHERE x.request_id=r.id) AS asset_count
       FROM approval_requests r JOIN clients cl ON cl.id=r.client_id
      WHERE (?1 IS NULL OR r.status=?1)${scopeSql(c.get("user"), "r.client_id")} ORDER BY r.updated_at DESC, r.id DESC LIMIT 300`
  )
    .bind(status || null)
    .all();
  return c.json({ requests: results });
});

approvals.use("/:clientId/*", clientAccess);

/** Resolved tenant + who is asking. Share links are refused; "team" means a team member whose role includes `feature`. A team member without it gets null (forbidden). */
function who(c: Ctx, feature: Feature) {
  const a = c.get("access");
  if (a.type !== "user") return null;
  const team = a.user.role === "admin";
  if (team && !staffCan(a.user.staff_role, feature)) return null;
  return { clientId: a.clientId, user: a.user, team };
}
const FORBIDDEN = { error: "Forbidden" };

// ---------------------------------------------------------------- assets
approvals.get("/:clientId/assets", async (c) => {
  const w = who(c, "content");
  if (!w?.team) return c.json(FORBIDDEN, 403);
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const tag = (c.req.query("tag") ?? "").trim().toLowerCase();
  const kind = c.req.query("kind") ?? "";
  if (kind && !ASSET_KINDS.includes(kind as any)) return c.json({ error: "Bad type" }, 400);
  const { results } = await c.env.DB.prepare(
    `SELECT id, client_id, title, kind, drive_url, tags, notes, created_by, created_at, updated_at FROM assets
      WHERE client_id=?1
        AND (?2='' OR kind=?2)
        AND (?3='' OR ','||tags||',' LIKE '%,'||?3||',%' ESCAPE '\\')
        AND (?4='' OR lower(title) LIKE '%'||?4||'%' ESCAPE '\\' OR lower(notes) LIKE '%'||?4||'%' ESCAPE '\\' OR tags LIKE '%'||?4||'%' ESCAPE '\\')
      ORDER BY created_at DESC, id DESC LIMIT 500`
  )
    .bind(w.clientId, kind, tag.replace(/[\\%_]/g, "\\$&"), q.replace(/[\\%_]/g, "\\$&"))
    .all<any>();
  return c.json({ assets: results.map((r) => ({ ...r, tags: r.tags ? String(r.tags).split(",") : [] })) });
});

approvals.post("/:clientId/assets", async (c) => {
  const w = who(c, "content");
  if (!w?.team) return c.json(FORBIDDEN, 403);
  const v = validateAsset(await c.req.json().catch(() => null));
  if (!v.ok) return c.json({ error: v.error }, 400);
  const a = v.asset;
  const r = await c.env.DB.prepare("INSERT INTO assets (client_id, title, kind, drive_url, tags, notes, created_by) VALUES (?,?,?,?,?,?,?)")
    .bind(w.clientId, a.title, a.kind, a.drive_url, a.tags, a.notes, w.user.id)
    .run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

approvals.put("/:clientId/assets/:id", async (c) => {
  const w = who(c, "content");
  if (!w?.team) return c.json(FORBIDDEN, 403);
  const v = validateAsset(await c.req.json().catch(() => null));
  if (!v.ok) return c.json({ error: v.error }, 400);
  const a = v.asset;
  const r = await c.env.DB.prepare(
    "UPDATE assets SET title=?, kind=?, drive_url=?, tags=?, notes=?, updated_at=datetime('now') WHERE id=? AND client_id=?"
  )
    .bind(a.title, a.kind, a.drive_url, a.tags, a.notes, Number(c.req.param("id")), w.clientId)
    .run();
  if (!r.meta.changes) return c.json({ error: "Asset not found" }, 404);
  return c.json({ ok: true });
});

approvals.delete("/:clientId/assets/:id", async (c) => {
  const w = who(c, "content");
  if (!w?.team) return c.json(FORBIDDEN, 403);
  const id = Number(c.req.param("id"));
  const used = await c.env.DB.prepare(
    `SELECT 1 FROM approval_request_assets x JOIN assets a ON a.id=x.asset_id WHERE x.asset_id=? AND a.client_id=? LIMIT 1`
  )
    .bind(id, w.clientId)
    .first();
  if (used) return c.json({ error: "This asset is part of an approval request, so it cannot be deleted." }, 409);
  const r = await c.env.DB.prepare("DELETE FROM assets WHERE id=? AND client_id=?").bind(id, w.clientId).run();
  if (!r.meta.changes) return c.json({ error: "Asset not found" }, 404);
  return c.json({ ok: true });
});

// -------------------------------------------------------------- requests
const REQUEST_COLS = "r.id, r.client_id, r.post_id, r.title, r.message, r.status, r.version, r.created_at, r.updated_at";

async function assetsFor(c: Ctx, clientId: number, requestIds: number[]) {
  const by = new Map<number, any[]>();
  if (!requestIds.length) return by;
  const { results } = await c.env.DB.prepare(
    `SELECT x.request_id, a.id, a.title, a.kind, a.drive_url FROM approval_request_assets x JOIN assets a ON a.id=x.asset_id
      WHERE a.client_id=? AND x.request_id IN (${requestIds.map(() => "?").join(",")}) ORDER BY x.position`
  )
    .bind(clientId, ...requestIds)
    .all<any>();
  for (const r of results) {
    const list = by.get(r.request_id) ?? [];
    list.push({ id: r.id, title: r.title, kind: r.kind, drive_url: r.drive_url });
    by.set(r.request_id, list);
  }
  return by;
}

approvals.get("/:clientId/requests", async (c) => {
  const w = who(c, "approvals");
  if (!w) return c.json(FORBIDDEN, 403);
  const status = c.req.query("status");
  if (status && !APPROVAL_STATUSES.includes(status as ApprovalStatus)) return c.json({ error: "Bad status" }, 400);
  const { results } = await c.env.DB.prepare(
    `SELECT ${REQUEST_COLS} FROM approval_requests r WHERE r.client_id=?1 AND (?2 IS NULL OR r.status=?2)
      ORDER BY (r.status='pending') DESC, r.updated_at DESC, r.id DESC LIMIT 200`
  )
    .bind(w.clientId, status || null)
    .all<any>();
  const assets = await assetsFor(c, w.clientId, results.map((r) => r.id));
  return c.json({ requests: results.map((r) => ({ ...r, assets: assets.get(r.id) ?? [] })) });
});

approvals.get("/:clientId/requests/:id", async (c) => {
  const w = who(c, "approvals");
  if (!w) return c.json(FORBIDDEN, 403);
  const id = Number(c.req.param("id"));
  const req = await c.env.DB.prepare(
    `SELECT ${REQUEST_COLS}, p.kind AS post_kind, p.caption AS post_caption
       FROM approval_requests r LEFT JOIN posts p ON p.id=r.post_id AND p.client_id=r.client_id
      WHERE r.id=? AND r.client_id=?`
  )
    .bind(id, w.clientId)
    .first<any>();
  if (!req) return c.json({ error: "Request not found" }, 404);
  const [assets, history] = await Promise.all([
    assetsFor(c, w.clientId, [id]),
    c.env.DB.prepare("SELECT id, version, action, actor_name, comment, created_at FROM approval_history WHERE request_id=? ORDER BY id").bind(id).all(),
  ]);
  return c.json({ request: { ...req, assets: assets.get(id) ?? [], history: history.results } });
});

/** Checks asset ids and the optional post belong to this client. Returns the ids to link. */
async function resolveLinks(c: Ctx, clientId: number, body: any): Promise<{ ok: true; assetIds: number[]; postId: number | null } | { ok: false; error: string }> {
  const assetIds = parseIds(body.asset_ids);
  if (!assetIds || assetIds.length === 0) return { ok: false, error: "Pick at least one asset." };
  const found = await c.env.DB.prepare(`SELECT id FROM assets WHERE client_id=? AND id IN (${assetIds.map(() => "?").join(",")})`)
    .bind(clientId, ...assetIds)
    .all<{ id: number }>();
  if (found.results.length !== assetIds.length) return { ok: false, error: "An asset does not belong to this client." };
  let postId: number | null = null;
  if (body.post_id != null && body.post_id !== "") {
    if (!Number.isInteger(body.post_id)) return { ok: false, error: "Invalid post." };
    const post = await c.env.DB.prepare("SELECT id FROM posts WHERE id=? AND client_id=?").bind(body.post_id, clientId).first();
    if (!post) return { ok: false, error: "That post does not belong to this client." };
    postId = body.post_id;
  }
  return { ok: true, assetIds, postId };
}

/** Link rows for a request. null = the request inserted earlier in the same batch (batches run serially in one transaction). */
const linkStmts = (c: Ctx, requestId: number | null, assetIds: number[]) =>
  assetIds.map((aid, i) =>
    c.env.DB.prepare(
      requestId === null
        ? "INSERT INTO approval_request_assets (request_id, asset_id, position) VALUES ((SELECT MAX(id) FROM approval_requests),?,?)"
        : "INSERT INTO approval_request_assets (request_id, asset_id, position) VALUES (?,?,?)"
    ).bind(...(requestId === null ? [aid, i] : [requestId, aid, i]))
  );

approvals.post("/:clientId/requests", async (c) => {
  const w = who(c, "approvals");
  if (!w?.team) return c.json(FORBIDDEN, 403);
  const body: any = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") return c.json({ error: "Body must be JSON." }, 400);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!title || title.length > 200) return c.json({ error: "Give the request a title (up to 200 characters)." }, 400);
  if (message.length > 2000) return c.json({ error: "The message is too long." }, 400);
  const links = await resolveLinks(c, w.clientId, body);
  if (!links.ok) return c.json({ error: links.error }, 400);

  // one batch = one transaction: the request, its first history row and its asset links land together
  const res = await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO approval_requests (client_id, post_id, title, message, created_by) VALUES (?,?,?,?,?)").bind(w.clientId, links.postId, title, message, w.user.id),
    c.env.DB.prepare("INSERT INTO approval_history (request_id, version, action, actor_id, actor_name, comment) VALUES ((SELECT MAX(id) FROM approval_requests),1,'submitted',?,?,?)").bind(w.user.id, w.user.name, message),
    ...linkStmts(c, null, links.assetIds),
  ]);
  const requestId = res[0].meta.last_row_id;
  return c.json({ id: requestId }, 201);
});

approvals.post("/:clientId/requests/:id/resubmit", async (c) => {
  const w = who(c, "approvals");
  if (!w?.team) return c.json(FORBIDDEN, 403);
  const id = Number(c.req.param("id"));
  const body: any = await c.req.json().catch(() => ({}));
  const req = await c.env.DB.prepare("SELECT status, version, message FROM approval_requests WHERE id=? AND client_id=?").bind(id, w.clientId).first<any>();
  if (!req) return c.json({ error: "Request not found" }, 404);
  const t = resubmit(req.status);
  if (!t.ok) return c.json({ error: t.error }, 409);
  const message = typeof body.message === "string" ? body.message.trim() : req.message;
  if (message.length > 2000) return c.json({ error: "The message is too long." }, 400);

  // swapping assets is optional; when sent they replace the set
  let assetIds: number[] | null = null;
  let postId: number | null | undefined;
  if (body.asset_ids !== undefined) {
    const links = await resolveLinks(c, w.clientId, body);
    if (!links.ok) return c.json({ error: links.error }, 400);
    assetIds = links.assetIds;
    if (body.post_id !== undefined) postId = links.postId;
  }
  const next = req.version + 1;
  // the status guard makes a double click or a racing decision a no-op
  const stmts = [
    c.env.DB.prepare(
      `UPDATE approval_requests SET status='pending', version=?, message=?, post_id=CASE WHEN ?=1 THEN ? ELSE post_id END, updated_at=datetime('now')
        WHERE id=? AND client_id=? AND status='changes_requested' AND version=?`
    ).bind(next, message, postId === undefined ? 0 : 1, postId ?? null, id, w.clientId, req.version),
    c.env.DB.prepare(
      `INSERT INTO approval_history (request_id, version, action, actor_id, actor_name, comment)
       SELECT ?,?,'resubmitted',?,?,? WHERE changes() > 0`
    ).bind(id, next, w.user.id, w.user.name, message),
  ];
  const res = await c.env.DB.batch(stmts);
  if (!res[0].meta.changes) return c.json({ error: "This request changed. Reload and try again." }, 409);
  if (assetIds) {
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM approval_request_assets WHERE request_id=?").bind(id),
      ...linkStmts(c, id, assetIds),
    ]);
  }
  return c.json({ ok: true, version: next });
});

approvals.post("/:clientId/requests/:id/decision", async (c) => {
  const w = who(c, "approvals");
  // the people who decide are the client's own approvers (viewers only read); the team does not approve on their behalf
  if (!w || w.team || w.user.client_role !== "approver") return c.json(FORBIDDEN, 403);
  const id = Number(c.req.param("id"));
  const body: any = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") return c.json({ error: "Body must be JSON." }, 400);
  const req = await c.env.DB.prepare("SELECT status, version FROM approval_requests WHERE id=? AND client_id=?").bind(id, w.clientId).first<any>();
  if (!req) return c.json({ error: "Request not found" }, 404);
  const t = decide(req.status, body.decision, body.comment);
  if (!t.ok) return c.json({ error: t.error }, req.status !== "pending" ? 409 : 400);
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  const res = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE approval_requests SET status=?, updated_at=datetime('now') WHERE id=? AND client_id=? AND status='pending' AND version=?"
    ).bind(t.to, id, w.clientId, req.version),
    c.env.DB.prepare(
      `INSERT INTO approval_history (request_id, version, action, actor_id, actor_name, comment)
       SELECT ?,?,?,?,?,? WHERE changes() > 0`
    ).bind(id, req.version, t.to, w.user.id, w.user.name, comment),
  ]);
  if (!res[0].meta.changes) return c.json({ error: "This request was already decided." }, 409);
  return c.json({ ok: true, status: t.to });
});

export default approvals;
