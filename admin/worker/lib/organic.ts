// Organic Instagram: find the accounts the token can see and record stories.
// Meta does not say who uploaded a story, so counts are per account.

import type { Env } from "../types";
import { metaGet, metaGetAll } from "./meta";
import { ymdInTz } from "./dates";

const TZ = "Asia/Jakarta";

export type IgCandidate = { ig_user_id: string; ig_username: string | null; page_id: string; page_name: string };

/** Pages the token can see, each with its linked Instagram business account. */
export async function discoverInstagram(env: Env): Promise<IgCandidate[]> {
  const pages = await metaGetAll(env, "me/accounts", {
    fields: "id,name,instagram_business_account{id,username}",
    limit: "100",
  });
  return pages
    .filter((p) => p.instagram_business_account?.id)
    .map((p) => ({
      ig_user_id: p.instagram_business_account.id,
      ig_username: p.instagram_business_account.username ?? null,
      page_id: p.id,
      page_name: p.name,
    }));
}

/** Stories live for 24h; record the ones not seen before. Returns how many were new. */
export async function pollStories(env: Env, account: { id: number; ig_user_id: string }): Promise<number> {
  try {
    const res = await metaGet(env, `${account.ig_user_id}/stories`, {
      fields: "id,media_type,timestamp,permalink,caption",
      limit: "100",
    });
    const items: any[] = res.data ?? [];
    let added = 0;
    for (const s of items) {
      const r = await env.DB.prepare(
        "INSERT OR IGNORE INTO organic_stories (media_id, ig_user_id, posted_at, day, media_type, permalink, caption) VALUES (?,?,?,?,?,?,?)"
      )
        .bind(s.id, account.ig_user_id, s.timestamp, ymdInTz(TZ, new Date(s.timestamp)), s.media_type ?? null, s.permalink ?? null, s.caption ?? null)
        .run();
      added += r.meta.changes ?? 0;
    }
    await env.DB.prepare("UPDATE organic_accounts SET last_poll_at=datetime('now'), last_error=NULL WHERE id=?").bind(account.id).run();
    return added;
  } catch (e: any) {
    await env.DB.prepare("UPDATE organic_accounts SET last_poll_at=datetime('now'), last_error=? WHERE id=?")
      .bind(String(e.message).slice(0, 300), account.id)
      .run();
    throw e;
  }
}

const DAY_MS = 86_400_000;

function postFormat(m: any): string {
  if (m.media_product_type === "REELS") return "reel";
  if (m.media_type === "CAROUSEL_ALBUM") return "carousel";
  return m.media_type === "VIDEO" ? "video" : "image";
}

async function mediaInsights(env: Env, mediaId: string, reel: boolean) {
  const out: Record<string, number> = {};
  const read = async (metrics: string) => {
    const r = await metaGet(env, `${mediaId}/insights`, { metric: metrics }, 1);
    for (const d of r.data ?? []) out[d.name] = d.values?.[0]?.value ?? 0;
  };
  await read("reach,saved,shares,total_interactions,views");
  if (reel) {
    try {
      await read("ig_reels_avg_watch_time");
    } catch {
      /* not offered for this media: leave empty */
    }
  }
  return out;
}

/**
 * Record the latest posts and refresh their insights. Posts under 3 days old are
 * refreshed every run, older ones (up to 30 days) only on the daily deep run.
 */
export async function pollPosts(env: Env, account: { id: number; ig_user_id: string }, deep: boolean): Promise<number> {
  const prof = await metaGet(env, account.ig_user_id, { fields: "followers_count" }, 1);
  if (prof.followers_count != null) await env.DB.prepare("UPDATE organic_accounts SET followers=? WHERE id=?").bind(prof.followers_count, account.id).run();

  const media = await metaGetAll(
    env,
    `${account.ig_user_id}/media`,
    { fields: "id,media_type,media_product_type,timestamp,permalink,caption,like_count,comments_count,thumbnail_url,media_url", limit: "50" },
    1
  );
  let touched = 0;
  for (const m of media) {
    const age = Date.now() - new Date(m.timestamp).getTime();
    if (age > 30 * DAY_MS) continue;
    const fmt = postFormat(m);
    // Videos expose a still in thumbnail_url; photos and carousels use media_url. Both CDN links expire, hence the refresh.
    const thumb = (fmt === "reel" || fmt === "video" ? m.thumbnail_url : m.media_url) ?? m.thumbnail_url ?? null;
    await env.DB.prepare(
      `INSERT INTO organic_posts (media_id, ig_user_id, posted_at, day, format, permalink, caption, likes, comments, thumbnail_url)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(media_id) DO UPDATE SET likes=excluded.likes, comments=excluded.comments, caption=excluded.caption, thumbnail_url=excluded.thumbnail_url`
    )
      .bind(m.id, account.ig_user_id, m.timestamp, ymdInTz(TZ, new Date(m.timestamp)), fmt, m.permalink ?? null, m.caption ?? null, m.like_count ?? null, m.comments_count ?? null, thumb)
      .run();
    if (age > 3 * DAY_MS && !deep) continue;
    try {
      const i = await mediaInsights(env, m.id, fmt === "reel");
      await env.DB.prepare(
        "UPDATE organic_posts SET reach=?, views=?, saves=?, shares=?, interactions=?, avg_watch_ms=?, insights_at=datetime('now') WHERE media_id=?"
      )
        .bind(i.reach ?? null, i.views ?? null, i.saved ?? null, i.shares ?? null, i.total_interactions ?? null, i.ig_reels_avg_watch_time ?? null, m.id)
        .run();
      touched++;
    } catch (e) {
      console.error("insights failed", m.id, e);
    }
  }
  return touched;
}

export async function pollAllOrganic(env: Env, deep: boolean): Promise<void> {
  const { results } = await env.DB.prepare("SELECT id, ig_user_id FROM organic_accounts").all<{ id: number; ig_user_id: string }>();
  for (const a of results) {
    for (const [name, fn] of [
      ["story", () => pollStories(env, a)],
      ["post", () => pollPosts(env, a, deep)],
    ] as const) {
      try {
        await fn();
      } catch (e) {
        console.error(`${name} poll failed`, a.ig_user_id, e);
      }
    }
  }
}
