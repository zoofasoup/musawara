import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import type { AuthUser, Env, Vars } from "./types";
import { SESSION_COOKIE } from "./lib/auth";
import { roleAllowedOnHost } from "./lib/audience";

type Ctx = { Bindings: Env; Variables: Vars };

async function userFromCookie(c: any): Promise<AuthUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  try {
    const payload: any = await verify(token, c.env.JWT_SECRET, "HS256");
    // A session only counts on the host reserved for its role (app.* team, portal.* clients).
    if (!roleAllowedOnHost(payload.role, new URL(c.req.url).hostname)) return null;
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      client_id: payload.client_id ?? null,
    };
  } catch {
    return null;
  }
}

export const requireAuth = createMiddleware<Ctx>(async (c, next) => {
  const user = await userFromCookie(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", user);
  await next();
});

export const requireAdmin = createMiddleware<Ctx>(async (c, next) => {
  const user = await userFromCookie(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);
  c.set("user", user);
  await next();
});

/**
 * Tenant isolation for /api/clients/:clientId/* — every data query downstream is
 * scoped to the clientId resolved HERE, from the session or a valid share token,
 * never trusted from request parameters alone:
 *  - share token (X-Share-Token header): must map to this exact client, share_enabled=1
 *  - client user: their own client_id must equal the path param, else 403
 *  - admin: any client
 */
export const clientAccess = createMiddleware<Ctx>(async (c, next) => {
  const clientId = Number(c.req.param("clientId"));
  if (!Number.isInteger(clientId)) return c.json({ error: "Bad client id" }, 400);

  const shareToken = c.req.header("X-Share-Token");
  if (shareToken) {
    const row = await c.env.DB.prepare("SELECT id FROM clients WHERE share_token=? AND share_enabled=1")
      .bind(shareToken)
      .first<{ id: number }>();
    if (!row || row.id !== clientId) return c.json({ error: "Invalid share link" }, 401);
    c.set("access", { type: "share", clientId });
    return next();
  }

  const user = await userFromCookie(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "admin" && user.client_id !== clientId) return c.json({ error: "Forbidden" }, 403);
  c.set("access", { type: "user", user, clientId });
  await next();
});
