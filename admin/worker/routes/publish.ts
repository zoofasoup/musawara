// Publish per client: channels, posts, media. clientAccess has already resolved the tenant
// (c.get("access").clientId); writes are admin-only, share links are read-only.

import { Hono, type Context } from "hono";
import type { Env, Vars } from "../types";
import { can, parseScheduledAt, type PostStatus } from "../lib/postState";
import { checkUpload, KINDS, MAX_CAROUSEL, validatePost, type Kind, type Platform } from "../lib/publishRules";

const publish = new Hono<{ Bindings: Env; Variables: Vars }>();
type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

publish.use("*", async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") return next();
  const a = c.get("access");
  if (a.type !== "user" || a.user.role !== "admin") return c.json({ error: "Read-only access" }, 403);
  await next();
});

const clientOf = (c: Ctx) => c.get("access").clientId;
const FILE_RE = /^[0-9a-f-]{36}\.(jpg|mp4|mov)$/;

// ------------------------------------------------------------------ channels
publish.get("/channels", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, platform, external_id, name FROM channels WHERE client_id=? AND status='active' ORDER BY platform, name"
  )
    .bind(clientOf(c))
    .all();
  return c.json({ channels: results });
});

// --------------------------------------------------------------------- posts
type MediaBody = { r2_key: string; type: "image" | "video"; bytes: number; width: number | null; height: number | null; duration_sec: number | null };
type Parsed = { kind: Kind; caption: string; channelIds: number[]; media: MediaBody[]; schedule: boolean; scheduledAt: string | null };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** Reads and checks a post body. Drafts only need to be well-formed; scheduling must pass every rule. */
async function parsePost(c: Ctx, clientId: number): Promise<{ ok: true; post: Parsed } | { ok: false; error: string; errors?: string[] }> {
  const b: any = await c.req.json().catch(() => null);
  if (!b || typeof b !== "object") return { ok: false, error: "Body must be JSON." };
  if (!KINDS.includes(b.kind)) return { ok: false, error: "Unknown post type." };
  const caption = typeof b.caption === "string" ? b.caption : "";
  if (caption.length > 63_206) return { ok: false, error: "Caption is too long." };

  const channelIds: number[] = Array.isArray(b.channel_ids) ? [...new Set<number>(b.channel_ids)] : [];
  if (channelIds.length > 10 || !channelIds.every(Number.isInteger)) return { ok: false, error: "Invalid channels." };
  const channels = channelIds.length
    ? (
        await c.env.DB.prepare(
          `SELECT id, platform FROM channels WHERE client_id=? AND status='active' AND id IN (${channelIds.map(() => "?").join(",")})`
        )
          .bind(clientId, ...channelIds)
          .all<{ id: number; platform: Platform }>()
      ).results
    : [];
  if (channels.length !== channelIds.length) return { ok: false, error: "A selected channel does not belong to this client." };

  const rawMedia: any[] = Array.isArray(b.media) ? b.media : [];
  if (rawMedia.length > MAX_CAROUSEL) return { ok: false, error: `At most ${MAX_CAROUSEL} media items.` };
  const media: MediaBody[] = [];
  for (const m of rawMedia) {
    if (typeof m?.r2_key !== "string" || !m.r2_key.startsWith(`c${clientId}/`) || !FILE_RE.test(m.r2_key.slice(`c${clientId}/`.length)))
      return { ok: false, error: "Invalid media." };
    if (m.type !== "image" && m.type !== "video") return { ok: false, error: "Invalid media." };
    media.push({ r2_key: m.r2_key, type: m.type, bytes: num(m.bytes) ?? 0, width: num(m.width), height: num(m.height), duration_sec: num(m.duration_sec) });
  }

  const schedule = b.schedule === true;
  let scheduledAt: string | null = null;
  if (schedule) {
    const errors = validatePost({
      kind: b.kind,
      caption,
      media: media.map((m) => ({ type: m.type, bytes: m.bytes, width: m.width, height: m.height, durationSec: m.duration_sec })),
      platforms: [...new Set(channels.map((ch) => ch.platform))],
    });
    const when = parseScheduledAt(b.scheduled_at, Date.now());
    if (!when.ok) errors.push(when.error);
    else scheduledAt = when.sql;
    if (errors.length) return { ok: false, error: errors[0], errors };
  }
  return { ok: true, post: { kind: b.kind, caption, channelIds, media, schedule, scheduledAt } };
}

/** Targets and media rows for a post, in the status the post ends up in. */
function children(c: Ctx, postId: number, p: Parsed) {
  const status = p.schedule ? "scheduled" : "draft";
  return [
    ...p.channelIds.map((id) => c.env.DB.prepare("INSERT INTO post_targets (post_id, channel_id, status) VALUES (?,?,?)").bind(postId, id, status)),
    ...p.media.map((m, i) =>
      c.env.DB.prepare("INSERT INTO post_media (post_id, position, r2_key, type, bytes, width, height, duration_sec) VALUES (?,?,?,?,?,?,?,?)").bind(
        postId, i, m.r2_key, m.type, m.bytes, m.width, m.height, m.duration_sec
      )
    ),
  ];
}

publish.get("/posts", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.status, p.kind, p.caption, p.scheduled_at, p.last_error,
            (SELECT COUNT(*) FROM post_media m WHERE m.post_id=p.id) AS media_count,
            (SELECT r2_key FROM post_media m WHERE m.post_id=p.id ORDER BY position LIMIT 1) AS cover_key,
            (SELECT type FROM post_media m WHERE m.post_id=p.id ORDER BY position LIMIT 1) AS cover_type,
            (SELECT group_concat(DISTINCT ch.platform) FROM post_targets t JOIN channels ch ON ch.id=t.channel_id WHERE t.post_id=p.id) AS platforms
       FROM posts p WHERE p.client_id=? ORDER BY p.scheduled_at, p.id DESC LIMIT 200`
  )
    .bind(clientOf(c))
    .all<any>();
  return c.json({ posts: results.map((r) => ({ ...r, platforms: r.platforms ? String(r.platforms).split(",") : [] })) });
});

publish.get("/posts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const post = await c.env.DB.prepare("SELECT id, status, kind, caption, scheduled_at, last_error FROM posts WHERE id=? AND client_id=?").bind(id, clientOf(c)).first<any>();
  if (!post) return c.json({ error: "Post not found" }, 404);
  const [targets, media] = await Promise.all([
    c.env.DB.prepare("SELECT channel_id FROM post_targets WHERE post_id=?").bind(id).all<{ channel_id: number }>(),
    c.env.DB.prepare("SELECT r2_key, type, bytes, width, height, duration_sec FROM post_media WHERE post_id=? ORDER BY position").bind(id).all(),
  ]);
  return c.json({ ...post, channel_ids: targets.results.map((t) => t.channel_id), media: media.results });
});

publish.post("/posts", async (c) => {
  const clientId = clientOf(c);
  const parsed = await parsePost(c, clientId);
  if (!parsed.ok) return c.json({ error: parsed.error, errors: parsed.errors }, 400);
  const p = parsed.post;
  const status = p.schedule ? "scheduled" : "draft";
  const a = c.get("access");
  const r = await c.env.DB.prepare("INSERT INTO posts (client_id, status, kind, caption, scheduled_at, created_by) VALUES (?,?,?,?,?,?)")
    .bind(clientId, status, p.kind, p.caption, p.scheduledAt, a.type === "user" ? a.user.id : null)
    .run();
  const id = r.meta.last_row_id as number;
  const rows = children(c, id, p);
  try {
    if (rows.length) await c.env.DB.batch(rows);
  } catch (e) {
    await c.env.DB.prepare("DELETE FROM posts WHERE id=?").bind(id).run();
    throw e;
  }
  return c.json({ id, status }, 201);
});

publish.put("/posts/:id", async (c) => {
  const clientId = clientOf(c);
  const id = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT status FROM posts WHERE id=? AND client_id=?").bind(id, clientId).first<{ status: PostStatus }>();
  if (!existing) return c.json({ error: "Post not found" }, 404);
  if (!can(existing.status, "edit")) return c.json({ error: "This post can no longer be edited." }, 409);
  const parsed = await parsePost(c, clientId);
  if (!parsed.ok) return c.json({ error: parsed.error, errors: parsed.errors }, 400);
  const p = parsed.post;
  const status = p.schedule ? "scheduled" : "draft";

  const before = await c.env.DB.prepare("SELECT r2_key FROM post_media WHERE post_id=?").bind(id).all<{ r2_key: string }>();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE posts SET status=?, kind=?, caption=?, scheduled_at=?, attempts=0, last_error=NULL, updated_at=datetime('now') WHERE id=?").bind(
      status, p.kind, p.caption, p.scheduledAt, id
    ),
    c.env.DB.prepare("DELETE FROM post_targets WHERE post_id=?").bind(id),
    c.env.DB.prepare("DELETE FROM post_media WHERE post_id=?").bind(id),
    ...children(c, id, p),
  ]);
  const kept = new Set(p.media.map((m) => m.r2_key));
  const dropped = before.results.map((r) => r.r2_key).filter((k) => !kept.has(k));
  if (dropped.length) await c.env.MEDIA.delete(dropped);
  return c.json({ id, status });
});

publish.delete("/posts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT status FROM posts WHERE id=? AND client_id=?").bind(id, clientOf(c)).first<{ status: PostStatus }>();
  if (!existing) return c.json({ error: "Post not found" }, 404);
  if (!can(existing.status, "delete")) return c.json({ error: "This post can no longer be deleted." }, 409);
  const keys = (await c.env.DB.prepare("SELECT r2_key FROM post_media WHERE post_id=?").bind(id).all<{ r2_key: string }>()).results.map((r) => r.r2_key);
  await c.env.DB.prepare("DELETE FROM posts WHERE id=?").bind(id).run(); // targets and media rows cascade
  if (keys.length) await c.env.MEDIA.delete(keys);
  return c.json({ ok: true });
});

// -------------------------------------------------------------------- media
// The body is streamed straight into R2 (never buffered), so a 100 MB video fits the Worker's memory.
publish.post("/media", async (c) => {
  const clientId = clientOf(c);
  const contentType = (c.req.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const length = Number(c.req.header("content-length"));
  const check = checkUpload(contentType, length);
  if (!check.ok) return c.json({ error: check.error }, 400);
  if (!c.req.raw.body) return c.json({ error: "The file is empty." }, 400);
  const file = `${crypto.randomUUID()}.${check.ext}`;
  const key = `c${clientId}/${file}`;
  const obj = await c.env.MEDIA.put(key, c.req.raw.body, { httpMetadata: { contentType } });
  return c.json({ key, file, type: check.type, bytes: obj.size }, 201);
});

publish.get("/media/:file", async (c) => {
  const file = c.req.param("file");
  if (!FILE_RE.test(file)) return c.json({ error: "Not found" }, 404);
  const key = `c${clientOf(c)}/${file}`;
  let obj: R2ObjectBody | null;
  try {
    obj = await c.env.MEDIA.get(key, { range: c.req.raw.headers });
  } catch (e) {
    // an unsatisfiable Range makes R2 throw; anything else is a real error
    if (!c.req.header("range")) throw e;
    const head = await c.env.MEDIA.head(key);
    if (!head) return c.json({ error: "Not found" }, 404);
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${head.size}` } });
  }
  if (!obj) return c.json({ error: "Not found" }, 404);
  const headers = new Headers({
    "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
    etag: obj.httpEtag,
  });
  let status = 200;
  // some runtimes serve the whole object for a start past the end instead of throwing
  const startAt = /^bytes=(\d+)-/.exec(c.req.header("range") ?? "");
  if (startAt && Number(startAt[1]) >= obj.size) {
    await obj.body.cancel();
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${obj.size}` } });
  }
  const r = obj.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (r && c.req.header("range")) {
    const start = r.suffix != null ? Math.max(0, obj.size - r.suffix) : Math.min(r.offset ?? 0, obj.size);
    const end = r.suffix != null ? obj.size : Math.min(start + (r.length ?? obj.size - start), obj.size);
    headers.set("content-range", `bytes ${start}-${end - 1}/${obj.size}`);
    headers.set("content-length", String(end - start));
    status = 206;
  } else {
    headers.set("content-length", String(obj.size));
  }
  return new Response(obj.body, { status, headers });
});

export default publish;
