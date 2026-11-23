import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import type { AuthUser, Env, Vars } from "./types";
import { SESSION_COOKIE } from "./lib/auth";
import { roleAllowedOnHost } from "./lib/audience";
import { staffCan, type Feature } from "../shared/permissions";

type Ctx = { Bindings: Env; Variables: Vars };

/** Everything about the signed-in person comes from the database on every request, never from the cookie, so a changed role or assignment applies at once. */
async function userFromCookie(c: any): Promise<AuthUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || !c.env.JWT_SECRET) return null;
  let userId: unknown;
  try {
    userId = (await verify(token, c.env.JWT_SECRET, "HS256")).sub;
  } catch {
    return null;
  }
  if (typeof userId !== "number" || !Number.isSafeInteger(userId)) return null;
  const row = await c.env.DB.prepare("SELECT id, email, name, role, client_id, staff_role, client_role FROM users WHERE id=?").bind(userId).first();
  if (!row || !roleAllowedOnHost(row.role, new URL(c.req.url).hostname)) return null;
  let client_ids: number[] | null;
  if (row.role === "client") client_ids = row.client_id == null ? [] : [row.client_id];
  else if (row.staff_role === "owner") client_ids = null;
  else {
    const r = await c.env.DB.prepare("SELECT client_id FROM user_clients WHERE user_id=?").bind(userId).all();
    client_ids = (r.results as Array<{ client_id: number }>).map((x) => x.client_id);
  }
  return { ...row, client_ids } as AuthUser;
}

/** May this person reach this client's data at all? Owners: any. Everyone else: only their own or assigned clients. */
export const canReachClient = (user: AuthUser, clientId: number) => user.client_ids === null || user.client_ids.includes(clientId);

/** SQL for "only my clients": an AND fragment on `column`, empty for owners. Ids come from our own database, so inlining them is safe. */
export function scopeSql(user: AuthUser, column: string): string {
  if (user.client_ids === null) return "";
  if (user.client_ids.length === 0) return " AND 0";
  return ` AND ${column} IN (${user.client_ids.map((n) => Math.trunc(Number(n))).join(",")})`;
}

/** A gate earlier in the same request may already have loaded the user; reuse it instead of asking the database again. */
const currentUser = async (c: any): Promise<AuthUser | null> => c.get("user") ?? (await userFromCookie(c));

export const requireAuth = createMiddleware<Ctx>(async (c, next) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", user);
  await next();
});

/** Any signed-in team member. Their role decides the rest. */
export const requireStaff = createMiddleware<Ctx>(async (c, next) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "admin" || !user.staff_role) return c.json({ error: "Forbidden" }, 403);
  c.set("user", user);
  await next();
});

/** A team member whose role includes this feature. */
export const requirePerm = (feature: Feature) =>
  createMiddleware<Ctx>(async (c, next) => {
    const user = await currentUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (user.role !== "admin" || !staffCan(user.staff_role, feature)) return c.json({ error: "Forbidden" }, 403);
    c.set("user", user);
    await next();
  });

/**
 * For routes addressed by a row id (account, task, alert...): a scoped team member may only touch rows of their own clients.
 * `sql` selects that row's client_id from the id. Owners pass straight through (the handler reports a missing row itself).
 */
export const reachVia = (param: string, sql: string) =>
  createMiddleware<Ctx>(async (c, next) => {
    const user = c.get("user");
    if (user.client_ids === null) return next();
    const row = await c.env.DB.prepare(sql).bind(c.req.param(param)).first<{ client_id: number }>();
    if (!row) return c.json({ error: "Not found" }, 404);
    if (!canReachClient(user, row.client_id)) return c.json({ error: "Forbidden" }, 403);
    await next();
  });

/** Same, when the path parameter is the client id itself. */
export const reachClient = (param: string) =>
  createMiddleware<Ctx>(async (c, next) => {
    const id = Number(c.req.param(param));
    if (!Number.isInteger(id)) return c.json({ error: "Bad client id" }, 400);
    if (!canReachClient(c.get("user"), id)) return c.json({ error: "Forbidden" }, 403);
    await next();
  });

/** The strictest gate (Owner). Anything not given a finer feature stays here. */
export const requireAdmin = requirePerm("settings");

/**
 * Tenant isolation for /api/clients/:clientId/* — every data query downstream is
 * scoped to the clientId resolved HERE, from the session or a valid share token,
 * never trusted from request parameters alone:
 *  - share token (X-Share-Token header): must map to this exact client, share_enabled=1
 *  - client user: their own client_id must equal the path param, else 403
 *  - team member: Owner any client, everyone else only assigned clients
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
  if (user.role === "admin" && !user.staff_role) return c.json({ error: "Forbidden" }, 403);
  if (!canReachClient(user, clientId)) return c.json({ error: "Forbidden" }, 403);
  c.set("access", { type: "user", user, clientId });
  await next();
});

/**
 * For routes behind clientAccess that belong to one feature. Team members need the feature in their role;
 * client logins and share links pass (those routes already decide what a client may do).
 */
export const clientFeature = (feature: Feature) =>
  createMiddleware<Ctx>(async (c, next) => {
    const a = c.get("access");
    if (a?.type === "user" && a.user.role === "admin" && !staffCan(a.user.staff_role, feature)) return c.json({ error: "Forbidden" }, 403);
    await next();
  });
