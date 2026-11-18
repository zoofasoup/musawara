// CRM (WhatsApp) — thin proxy to the WhatsApp gateway.
//
// WhatsApp Web needs a long-lived Chrome, which a Worker cannot host, so contacts,
// templates, broadcasts and the inbox live in the gateway service (wa-gateway on a VPS).
// This route only adds the platform's admin session check and the gateway token:
//   /api/crm/<path>  ->  <WA_GATEWAY_URL>/api/<path>
// The browser never sees the gateway URL or its token.

import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { requireAdmin } from "../middleware";

const crm = new Hono<{ Bindings: Env; Variables: Vars }>();
crm.use("*", requireAdmin);

crm.all("/*", async (c) => {
  const base = c.env.WA_GATEWAY_URL?.replace(/\/$/, "");
  if (!base || !c.env.WA_GATEWAY_TOKEN) {
    return c.json({ error: "WhatsApp gateway is not configured", code: "gateway_unconfigured" }, 503);
  }
  const url = new URL(c.req.url);
  const target = base + "/api" + url.pathname.slice("/api/crm".length) + url.search;

  const headers = new Headers();
  const type = c.req.header("content-type");
  if (type) headers.set("content-type", type); // keeps the multipart boundary for uploads
  headers.set("authorization", `Bearer ${c.env.WA_GATEWAY_TOKEN}`);
  const range = c.req.header("range");
  if (range && /^bytes=\d*-\d*(,\s*\d*-\d*)*$/.test(range)) headers.set("range", range); // lets video seek and play on Safari
  const account = c.req.header("x-wa-account");
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
    return new Response(res.body, { status: res.status, headers: out });
  } catch {
    return c.json({ error: "WhatsApp gateway is unreachable", code: "gateway_down" }, 502);
  }
});

export default crm;
