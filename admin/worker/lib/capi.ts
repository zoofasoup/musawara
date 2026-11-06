// Meta Conversions API: offline events. A separate write token (ads_management)
// is kept apart from the read-only insights token.

import type { Env } from "../types";
import { getMetaToken, META_API_VERSION } from "./meta";
import { decryptString } from "./secretbox";

export const CAPI_TOKEN_KEY = "meta_capi_token_enc";
/** Meta's guidance: offline (physical_store) events should be uploaded within 62 days. */
export const MAX_EVENT_AGE_DAYS = 62;
export const SEND_CHUNK = 200;

/**
 * One token serves every Meta need: the connection token from Settings is used
 * for sending events too (it needs the ads_management permission). A separate
 * Conversions token, if one was saved earlier, still wins.
 */
export async function getCapiToken(env: Env): Promise<string | null> {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key=?").bind(CAPI_TOKEN_KEY).first<{ value: string }>();
  if (row?.value) {
    try {
      return await decryptString(env.JWT_SECRET, row.value);
    } catch {
      /* unreadable separate token: fall through to the shared one */
    }
  }
  return getMetaToken(env);
}

export type CapiEvent = {
  event_name: string;
  event_time: number;
  action_source: string;
  event_id: string;
  user_data: Record<string, string[]>;
  custom_data: { currency?: string; value?: number; order_id?: string; num_items?: number };
};

export type CapiResult =
  | { kind: "ok"; received: number; fbtrace_id?: string }
  /** Meta refused the whole request: nothing was processed, safe to retry. */
  | { kind: "rejected"; error: string; fbtrace_id?: string }
  /** No usable answer (network/5xx): the events may or may not have arrived. */
  | { kind: "unknown"; error: string };

export async function sendCapiEvents(
  env: Env,
  token: string,
  datasetId: string,
  events: CapiEvent[],
  testEventCode?: string | null
): Promise<CapiResult> {
  const base = env.GRAPH_BASE ?? "https://graph.facebook.com";
  const body: Record<string, unknown> = { data: events };
  if (testEventCode) body.test_event_code = testEventCode;
  let res: Response;
  try {
    res = await fetch(`${base}/${META_API_VERSION}/${encodeURIComponent(datasetId)}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e: any) {
    return { kind: "unknown", error: `Network error: ${e?.message ?? e}` };
  }
  const json: any = await res.json().catch(() => null);
  if (res.ok && typeof json?.events_received === "number") {
    return { kind: "ok", received: json.events_received, fbtrace_id: json.fbtrace_id };
  }
  if (res.status >= 500 || !json) return { kind: "unknown", error: `Meta answered HTTP ${res.status}` };
  const err = json?.error;
  return {
    kind: "rejected",
    error: err ? `${err.message}${err.error_user_msg ? " — " + err.error_user_msg : ""}` : `HTTP ${res.status}`,
    fbtrace_id: err?.fbtrace_id,
  };
}
