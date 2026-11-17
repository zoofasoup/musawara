// Two-way sync between planning cards (content_plans) and the team's Notion board "Content Plan + Projects".
//
// Rules that keep two writers from fighting:
//  - Each side stamps a card; the side edited last wins, and we remember Notion's last_edited_time after our
//    own write so our echo is never mistaken for a human edit.
//  - The app has 3 manual stages, Notion has finer ones. A Notion status only moves a card between the manual
//    stages; Scheduled/Posted/Failed in Notion never move an app card (a linked Publish post owns those).
//  - We push a Progress only when the Notion status does not already mean the same stage, so Notion's finer
//    steps (Production, Design / Editing...) are not flattened.
//  - Nothing is ever deleted on either side.

import type { Env } from "../types";
import { SYNC_SQL, type Stage } from "./planning";

export const NOTION_VERSION = "2022-06-28";
const DEFAULT_DB = "30d6097e-9d00-4034-ad2a-e0f397d5e219";
const API = "https://api.notion.com/v1";

export type NotionCfg = { token: string; databaseId: string };
export const notionCfg = (env: Env): NotionCfg | null =>
  env.NOTION_TOKEN ? { token: env.NOTION_TOKEN, databaseId: env.NOTION_DATABASE_ID || DEFAULT_DB } : null;

// ----------------------------------------------------------------- mapping (pure)
/** Notion Progress -> the app stage it means, or null when the app must not move (Scheduled, Posted, Failed). */
const PROGRESS_TO_STAGE: Record<string, Stage | null> = {
  "Ideation": "idea",
  "Copy / Script": "drafting", "Production": "drafting", "Ready to Edit": "drafting", "Design / Editing": "drafting",
  "Review Copy": "in_review", "Review Visual": "in_review", "Ready to Post": "in_review",
  "Scheduled": null, "Posted": null, "Failed": null,
};
export const stageFromProgress = (p: string | null | undefined): Stage | null => (p ? PROGRESS_TO_STAGE[p] ?? null : null);

const STAGE_TO_PROGRESS: Record<Stage, string> = { idea: "Ideation", drafting: "Copy / Script", in_review: "Review Copy", scheduled: "Scheduled", published: "Posted" };
/** The Progress to write for an app stage, or null when Notion's current status already means that stage. */
export function progressToPush(stage: Stage, current: string | null | undefined): string | null {
  if (current === STAGE_TO_PROGRESS[stage]) return null;
  if (stage !== "scheduled" && stage !== "published" && stageFromProgress(current) === stage) return null;
  if (stage === "scheduled" && current === "Posted") return null; // never walk a posted item back
  return STAGE_TO_PROGRESS[stage];
}

const KIND_TO_FORMAT: Record<string, string> = { feed: "Single Post", carousel: "Carousel", reel: "Short-form video", story: "Story" };
const FORMAT_TO_KIND: Record<string, string> = { "Single Post": "feed", "Carousel": "carousel", "Short-form video": "reel", "Long-form Video": "reel", "Story": "story", "IG Story Quiz": "story" };
export const formatFromKind = (k: string) => KIND_TO_FORMAT[k] ?? "Single Post";
export const kindFromFormat = (f: string | null | undefined) => (f && FORMAT_TO_KIND[f]) || "feed";

/** SQL "2026-11-12 17:30:00" or ISO -> epoch ms. */
export const toMs = (s: string | null | undefined) => (s ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z") : 0);
const sqlNow = () => new Date().toISOString().slice(0, 19).replace("T", " ");

export type NotionPage = {
  id: string; last_edited_time: string; archived?: boolean; in_trash?: boolean;
  properties: Record<string, any>;
};
type Parsed = { title: string; client: string | null; progress: string | null; format: string | null; target: string | null; pillar: string | null };
export function parsePage(p: NotionPage): Parsed {
  const pr = p.properties ?? {};
  return {
    title: (pr["Content Name/Idea"]?.title ?? []).map((t: any) => t.plain_text ?? "").join("").trim(),
    client: pr["Client"]?.select?.name ?? null,
    progress: pr["Progress"]?.status?.name ?? null,
    format: pr["Format"]?.select?.name ?? null,
    target: pr["Target Post"]?.date?.start?.slice(0, 10) ?? null,
    pillar: pr["Pillar"]?.select?.name ?? null,
  };
}

/** Same client under two spellings: equal ignoring case, or one name is the other plus more words ("Musafar" / "Musafar Tour & Travel"). */
export function sameClient(a: string, b: string): boolean {
  const x = a.trim().toLowerCase(), y = b.trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.startsWith(y + " ") || y.startsWith(x + " ");
}

// ----------------------------------------------------------------- HTTP
export class NotionError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
async function call(cfg: NotionCfg, f: typeof fetch, method: string, path: string, body?: unknown): Promise<any> {
  const r = await f(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new NotionError(r.status, j?.message ?? `Notion ${r.status}`);
  return j;
}

// ----------------------------------------------------------------- sync
type Card = {
  id: number; client_id: number; client_name: string; title: string; brief: string; kind: string; stage: Stage; planned_date: string | null;
  updated_at: string; notion_page_id: string | null; notion_edited_at: string | null; notion_synced_at: string | null; posted_at: string | null;
};
export type SyncResult = { pulled_new: number; pulled_updated: number; pushed_new: number; pushed_updated: number; skipped: number };

export async function syncNotion(env: Env, f: typeof fetch = fetch): Promise<SyncResult> {
  const cfg = notionCfg(env);
  if (!cfg) throw new NotionError(503, "Notion belum dikonfigurasi (NOTION_TOKEN)");
  const DB = env.DB;
  const out: SyncResult = { pulled_new: 0, pulled_updated: 0, pushed_new: 0, pushed_updated: 0, skipped: 0 };
  await DB.batch(SYNC_SQL.map((s) => DB.prepare(s)));

  // Notion's Client options (names are case-sensitive in Notion; ours may differ in case) and our clients.
  const schema = await call(cfg, f, "GET", `/databases/${cfg.databaseId}`);
  const clientOpts: string[] = (schema.properties?.["Client"]?.select?.options ?? []).map((o: any) => o.name);
  const notionClientFor = (name: string) => clientOpts.find((o) => sameClient(o, name)) ?? null;
  const clients = ((await DB.prepare("SELECT id, name FROM clients").all()).results as { id: number; name: string }[]);
  const appClientFor = (notionName: string | null) => (notionName ? clients.find((c) => sameClient(c.name, notionName)) ?? null : null);

  const cardsSql = `SELECT cp.id, cp.client_id, cl.name AS client_name, cp.title, cp.brief, cp.kind, cp.stage, cp.planned_date, cp.updated_at,
      cp.notion_page_id, cp.notion_edited_at, cp.notion_synced_at,
      (SELECT MIN(pt.published_at) FROM post_targets pt WHERE pt.post_id=cp.post_id AND pt.published_at IS NOT NULL) AS posted_at
    FROM content_plans cp JOIN clients cl ON cl.id=cp.client_id`;
  const loadCards = async () => (await DB.prepare(cardsSql).all()).results as Card[];

  // ---- pull: every page edited since the last run (everything on the first run)
  const state = await DB.prepare("SELECT last_run FROM notion_sync WHERE id=1").first<{ last_run: string | null }>();
  const since = state?.last_run ? new Date(toMs(state.last_run) - 3_600_000).toISOString() : null;
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const body: any = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
    if (since) body.filter = { timestamp: "last_edited_time", last_edited_time: { on_or_after: since } };
    const res = await call(cfg, f, "POST", `/databases/${cfg.databaseId}/query`, body);
    pages.push(...res.results);
    cursor = res.has_more && pages.length < 1000 ? res.next_cursor : undefined;
  } while (cursor);

  const byPage = new Map((await loadCards()).filter((c) => c.notion_page_id).map((c) => [c.notion_page_id!, c]));
  const seen = new Set<string>();
  for (const p of pages) {
    seen.add(p.id);
    if (p.archived || p.in_trash) { out.skipped++; continue; }
    const n = parsePage(p);
    const card = byPage.get(p.id);
    if (card) {
      if (toMs(p.last_edited_time) <= toMs(card.notion_edited_at)) continue; // our own echo or unchanged
      if (toMs(card.updated_at) > toMs(p.last_edited_time)) continue; // the app edited it later: the push below wins
      const stage = stageFromProgress(n.progress);
      const lockedByPost = ["scheduled", "published"].includes(card.stage);
      await DB.prepare(
        `UPDATE content_plans SET title=?, kind=?, planned_date=?, stage=?, updated_at=datetime('now'), notion_edited_at=?, notion_synced_at=datetime('now') WHERE id=?`
      ).bind(n.title || card.title, n.format ? kindFromFormat(n.format) : card.kind, n.target, stage && !lockedByPost ? stage : card.stage, p.last_edited_time, card.id).run();
      out.pulled_updated++;
      continue;
    }
    const client = appClientFor(n.client);
    if (!client || !n.title || n.pillar === "Projects" || n.progress === "Posted" || n.progress === "Failed") { out.skipped++; continue; }
    const r = await DB.prepare(
      `INSERT OR IGNORE INTO content_plans (client_id, title, kind, stage, planned_date, notion_page_id, notion_edited_at, notion_synced_at) VALUES (?,?,?,?,?,?,?,datetime('now'))`
    ).bind(client.id, n.title.slice(0, 200), kindFromFormat(n.format), stageFromProgress(n.progress) ?? "idea", n.target, p.id, p.last_edited_time).run();
    if (r.meta.changes) out.pulled_new++;
  }

  // ---- push: new cards, and cards the app changed since their last sync
  const progressByPage = new Map(pages.map((p) => [p.id, parsePage(p).progress]));
  for (const card of await loadCards()) {
    const dirty = !card.notion_page_id || toMs(card.updated_at) > toMs(card.notion_synced_at);
    if (!dirty) continue;
    const notionClient = notionClientFor(card.client_name);
    let current = card.notion_page_id ? progressByPage.get(card.notion_page_id) : null;
    if (card.notion_page_id && current === undefined) {
      current = parsePage(await call(cfg, f, "GET", `/pages/${card.notion_page_id}`)).progress;
    }
    const progress = progressToPush(card.stage, current);
    const properties: Record<string, any> = {
      "Content Name/Idea": { title: [{ text: { content: card.title.slice(0, 200) } }] },
      "Format": { select: { name: formatFromKind(card.kind) } },
      "Target Post": { date: card.planned_date ? { start: card.planned_date } : null },
      ...(progress ? { Progress: { status: { name: progress } } } : {}),
      ...(card.posted_at ? { "Posted Date": { date: { start: new Date(toMs(card.posted_at)).toISOString() } } } : {}),
    };
    let saved: NotionPage;
    if (card.notion_page_id) {
      saved = await call(cfg, f, "PATCH", `/pages/${card.notion_page_id}`, { properties });
      out.pushed_updated++;
    } else {
      saved = await call(cfg, f, "POST", "/pages", {
        parent: { database_id: cfg.databaseId },
        properties: {
          ...properties,
          "Platform": { multi_select: [{ name: "Instagram" }] },
          ...(notionClient ? { Client: { select: { name: notionClient } } } : {}),
        },
        ...(card.brief ? { children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: card.brief.slice(0, 1900) } }] } }] } : {}),
      });
      out.pushed_new++;
    }
    await DB.prepare("UPDATE content_plans SET notion_page_id=?, notion_edited_at=?, notion_synced_at=? WHERE id=?")
      .bind(saved.id, saved.last_edited_time, sqlNow(), card.id).run();
  }
  return out;
}

/** Records the outcome so the UI can show when it last worked. */
export async function runNotionSync(env: Env, f: typeof fetch = fetch): Promise<{ ok: true; result: SyncResult } | { ok: false; error: string; status: number }> {
  try {
    const result = await syncNotion(env, f);
    await env.DB.prepare("UPDATE notion_sync SET last_run=datetime('now'), last_error=NULL, summary=? WHERE id=1").bind(JSON.stringify(result)).run();
    return { ok: true, result };
  } catch (e: any) {
    const status = e instanceof NotionError ? e.status : 500;
    await env.DB.prepare("UPDATE notion_sync SET last_error=? WHERE id=1").bind(String(e?.message ?? e).slice(0, 300)).run();
    return { ok: false, error: String(e?.message ?? e), status };
  }
}
