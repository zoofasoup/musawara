// Which platform client (brand) each WhatsApp number belongs to, as the gateway reports it. Shared by the CRM proxy and the
// CRM data routes (pipeline, fields) so both apply the same rule: Owners reach every number, everyone else only the numbers
// linked to one of their clients. Cached briefly per isolate.
import type { AuthUser, Env } from "../types";
import { canReachClient } from "../middleware";

export type GatewayAccount = { id: number; client_id: number | string | null };

let cache: { at: number; list: GatewayAccount[] } | null = null;

export async function gatewayAccounts(base: string, token: string): Promise<GatewayAccount[]> {
  if (cache && Date.now() - cache.at < 30_000) return cache.list;
  const res = await fetch(`${base}/api/accounts`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error("accounts");
  const list = (await res.json()) as GatewayAccount[];
  cache = { at: Date.now(), list };
  return list;
}

/** The numbers this person may use. The gateway stores client_id as text ("1"), so compare as numbers. */
export function accountsOf(user: AuthUser, known: GatewayAccount[]): GatewayAccount[] {
  return known.filter((a) => {
    const cid = a.client_id == null ? NaN : Number(a.client_id);
    return Number.isInteger(cid) && canReachClient(user, cid);
  });
}

/**
 * May this person use WhatsApp number `id`? Owners: any positive id (no gateway call). Everyone else: only a number linked to
 * one of their clients. Returns an error code instead of throwing so routes can answer in their own words.
 */
export async function mayUseAccount(env: Env, user: AuthUser, id: number): Promise<"ok" | "forbidden" | "gateway"> {
  if (user.client_ids === null) return "ok";
  const base = env.WA_GATEWAY_URL?.replace(/\/$/, "");
  if (!base || !env.WA_GATEWAY_TOKEN) return "gateway";
  try {
    return accountsOf(user, await gatewayAccounts(base, env.WA_GATEWAY_TOKEN)).some((a) => a.id === id) ? "ok" : "forbidden";
  } catch {
    return "gateway";
  }
}
