// People who write to a WhatsApp number are saved as contacts by the gateway (tag "inbox"). This puts those contacts on the number's
// pipeline, in its first stage, so a new chat shows up on the board without anyone adding it. Someone who was ever on the board
// (they have a stage move on record) is never added again, so removing a card sticks.

import type { Env } from "../types";
import { gatewayAccounts } from "./waAccounts";

export const DEFAULT_STAGES: Array<[string, string, string]> = [
  ["New", "neutral", "open"], ["Contacted", "blue", "open"], ["Interested", "violet", "open"],
  ["Proposal", "amber", "open"], ["Won", "green", "won"], ["Lost", "rose", "lost"],
];

/** A number's first visit gets the usual stages, so the board is never empty and nothing needs set-up. */
export async function ensureStageRows(db: D1Database, account: number) {
  const n = await db.prepare("SELECT COUNT(*) n FROM crm_stages WHERE wa_account_id=?").bind(account).first<{ n: number }>();
  if (n?.n) return;
  await db.batch(DEFAULT_STAGES.map(([name, color, kind], i) => db.prepare("INSERT OR IGNORE INTO crm_stages (wa_account_id, name, color, kind, position) VALUES (?,?,?,?,?)").bind(account, name, color, kind, i)));
}

const PER_RUN = 500;

/** Adds up to 500 not-yet-seen "inbox" contacts of one number to its first stage; returns how many. */
export async function syncInboxLeads(env: Env, account: number, phones: string[]): Promise<number> {
  if (!phones.length) return 0;
  await ensureStageRows(env.DB, account);
  const first = await env.DB.prepare("SELECT id FROM crm_stages WHERE wa_account_id=? ORDER BY position, id LIMIT 1").bind(account).first<{ id: number }>();
  if (!first) return 0;
  const seen = new Set((await env.DB.prepare("SELECT phone FROM crm_stage_events WHERE wa_account_id=? UNION SELECT phone FROM crm_leads WHERE wa_account_id=?").bind(account, account).all<{ phone: string }>()).results.map((r) => r.phone));
  const fresh = [...new Set(phones)].filter((p) => /^\d{6,20}$/.test(p) && !seen.has(p)).slice(0, PER_RUN);
  const stmts = fresh.flatMap((p) => [
    env.DB.prepare("INSERT OR IGNORE INTO crm_leads (wa_account_id, phone, stage_id) VALUES (?,?,?)").bind(account, p, first.id),
    env.DB.prepare("INSERT INTO crm_stage_events (wa_account_id, phone, from_stage_id, to_stage_id, user_id) VALUES (?,?,NULL,?,NULL)").bind(account, p, first.id),
  ]);
  for (let i = 0; i < stmts.length; i += 90) await env.DB.batch(stmts.slice(i, i + 90));
  return fresh.length;
}

/** The "inbox" contacts of a number, asked from the gateway. */
async function inboxPhones(env: Env, base: string, account: number): Promise<string[]> {
  const res = await fetch(`${base}/api/contacts?tag=inbox`, { headers: { authorization: `Bearer ${env.WA_GATEWAY_TOKEN}`, "x-wa-account": String(account) }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`contacts ${res.status}`);
  return ((await res.json()) as Array<{ phone: string }>).map((c) => String(c.phone));
}

/** Every number (the hourly job), or one number when `only` is given (opening the board). */
export async function syncAllInboxLeads(env: Env, only?: number): Promise<number> {
  const base = env.WA_GATEWAY_URL?.replace(/\/$/, "");
  if (!base || !env.WA_GATEWAY_TOKEN) return 0;
  const accounts = (await gatewayAccounts(base, env.WA_GATEWAY_TOKEN)).filter((a) => only === undefined || a.id === only);
  let added = 0;
  for (const a of accounts) added += await syncInboxLeads(env, a.id, await inboxPhones(env, base, a.id));
  return added;
}
