// CRM (WhatsApp) — thin proxy to the WhatsApp gateway.
//
// WhatsApp Web needs a long-lived Chrome, which a Worker cannot host, so contacts,
// templates, broadcasts and the inbox live in the gateway service (wa-gateway on a VPS).
// This route only adds the platform's session check (roles with the CRM feature) and the gateway token:
//   /api/crm/<path>  ->  <WA_GATEWAY_URL>/api/<path>
// The browser never sees the gateway URL or its token.

import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { canReachClient, requirePerm } from "../middleware";

const crm = new Hono<{ Bindings: Env; Variables: Vars }>();
crm.use("*", requirePerm("crm"));

// Which platform client (brand) each WhatsApp number belongs to, as the gateway reports it. Cached briefly per isolate.
type GatewayAccount = { id: number; client_id: number | string | null };
let accountCache: { at: number; list: GatewayAccount[] } | null = null;
async function gatewayAccounts(base: string, token: string): Promise<GatewayAccount[]> {
  if (accountCache && Date.now() - accountCache.at < 30_000) return accountCache.list;
  const res = await fetch(`${base}/api/accounts`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error("accounts");
  const list = (await res.json()) as GatewayAccount[];
  accountCache = { at: Date.now(), list };
  return list;
}

/** What a team member who is not an Owner may ask the gateway for: only data of numbers whose brand is one of their clients. */
const SCOPED_AREAS = new Set(["contacts", "tags", "templates", "campaigns", "conversations", "messages", "media", "wa"]);

crm.all("/*", async (c) => {
  const base = c.env.WA_GATEWAY_URL?.replace(/\/$/, "");
  if (!base || !c.env.WA_GATEWAY_TOKEN) {
    return c.json({ error: "WhatsApp gateway is not configured", code: "gateway_unconfigured" }, 503);
  }
  const url = new URL(c.req.url);
  const path = url.pathname.slice("/api/crm".length);
  const user = c.get("user");
  let account = c.req.header("x-wa-account");
  let search = url.search;
  let filterList = false;
  let allowedIds: Set<number> | null = null;

  if (user.client_ids !== null) {
    // Owners may use any number (and the default one). Everyone else: an explicit number that belongs to one of their clients, nothing else.
    const area = path.split("/")[1] ?? "";
    let known: GatewayAccount[];
    try {
      known = await gatewayAccounts(base, c.env.WA_GATEWAY_TOKEN);
    } catch {
      return c.json({ error: "WhatsApp gateway is unreachable", code: "gateway_down" }, 502);
    }
    // The gateway stores client_id as text ("1"), so compare as numbers.
    const mine = known.filter((a) => {
      const cid = a.client_id == null ? NaN : Number(a.client_id);
      return Number.isInteger(cid) && canReachClient(user, cid);
    });
    if (area === "accounts" && c.req.method === "GET" && path === "/accounts") {
      filterList = true; // the list of numbers, cut down below
    } else {
      if (!SCOPED_AREAS.has(area)) return c.json({ error: "Forbidden" }, 403);
      const asked = account ?? url.searchParams.get("account");
      if (!asked || !/^\d+$/.test(asked)) return c.json({ error: "Pick a WhatsApp number first" }, 400);
      if (!mine.some((a) => String(a.id) === asked)) return c.json({ error: "Forbidden" }, 403);
      account = asked;
      url.searchParams.delete("account"); // one source of truth: the header we set below
      search = url.search;
    }
    allowedIds = new Set(mine.map((a) => a.id));
  }
  const target = base + "/api" + path + search;

  const headers = new Headers();
  const type = c.req.header("content-type");
  if (type) headers.set("content-type", type); // keeps the multipart boundary for uploads
  headers.set("authorization", `Bearer ${c.env.WA_GATEWAY_TOKEN}`);
  const range = c.req.header("range");
  if (range && /^bytes=\d*-\d*(,\s*\d*-\d*)*$/.test(range)) headers.set("range", range); // lets video seek and play on Safari
  if (account && /^\d+$/.test(account)) headers.set("x-wa-account", account); // which WhatsApp number (multi-account gateway)
  headers.set("x-platform-user", c.get("user").email); // audit trail on the gateway side

  const hasBody = !["GET", "HEAD"].includes(c.req.method);
  try {
    const res = await fetch(target, {
      method: c.req.method,
      headers,
      body: hasBody ? c.req.raw.body : undefined,
      signal: AbortSignal.timeout(25_000),
    });
    const out = new Headers();
    for (const h of ["content-type", "content-disposition", "cache-control", "content-range", "accept-ranges", "content-length"]) {
      const v = res.headers.get(h);
      if (v) out.set(h, v);
    }
    if (filterList && res.ok) {
      const list = ((await res.json()) as Array<{ id: number }>).filter((x) => allowedIds?.has(x.id));
      out.delete("content-length");
      return new Response(JSON.stringify(list), { status: 200, headers: out });
    }
    return new Response(res.body, { status: res.status, headers: out });
  } catch {
    return c.json({ error: "WhatsApp gateway is unreachable", code: "gateway_down" }, 502);
  }
});

export default crm;
