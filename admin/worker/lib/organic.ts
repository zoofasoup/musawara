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

export async function pollAllStories(env: Env): Promise<void> {
  const { results } = await env.DB.prepare("SELECT id, ig_user_id FROM organic_accounts").all<{ id: number; ig_user_id: string }>();
  for (const a of results) {
    try {
      await pollStories(env, a);
    } catch (e) {
      console.error("story poll failed", a.ig_user_id, e);
    }
  }
}
