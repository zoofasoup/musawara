import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { sign } from "hono/jwt";
import type { Env, Vars } from "../types";
import { hashPassword, SESSION_COOKIE, SESSION_TTL_SECONDS, verifyPassword } from "../lib/auth";
import { requireAuth } from "../middleware";

const auth = new Hono<{ Bindings: Env; Variables: Vars }>();

async function startSession(c: any, user: any) {
  const token = await sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      client_id: user.client_id ?? null,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    },
    c.env.JWT_SECRET
  );
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

auth.post("/login", async (c) => {
  const { email, password } = await c.req.json().catch(() => ({}));
  if (!email || !password) return c.json({ error: "Email and password are required" }, 400);
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE email=?").bind(email.trim()).first<any>();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: "Invalid email or password" }, 401);
  }
  await startSession(c, user);
  return c.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, client_id: user.client_id } });
});

auth.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

auth.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  let client = null;
  if (user.client_id) {
    client = await c.env.DB.prepare("SELECT id, name, slug, logo_url, brand_color FROM clients WHERE id=?")
      .bind(user.client_id)
      .first();
  }
  return c.json({ user, client });
});

// First-run bootstrap: create the initial admin only while the users table is empty.
auth.post("/bootstrap", async (c) => {
  const count = await c.env.DB.prepare("SELECT COUNT(*) n FROM users").first<{ n: number }>();
  if ((count?.n ?? 0) > 0) return c.json({ error: "Already initialized" }, 403);
  const { email, password, name } = await c.req.json().catch(() => ({}));
  if (!email || !password || password.length < 8) return c.json({ error: "Email and a password of 8+ chars required" }, 400);
  const hash = await hashPassword(password);
  const user = await c.env.DB.prepare(
    "INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,'admin') RETURNING *"
  )
    .bind(email.trim(), hash, name || "Admin")
    .first<any>();
  await startSession(c, user);
  return c.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, client_id: null } });
});

auth.get("/invites/:token", async (c) => {
  const invite = await c.env.DB.prepare(
    `SELECT i.token, i.email, i.role, i.client_id, c.name AS client_name
     FROM invites i LEFT JOIN clients c ON c.id = i.client_id
     WHERE i.token=? AND i.used=0`
  )
    .bind(c.req.param("token"))
    .first();
  if (!invite) return c.json({ error: "Invite not found or already used" }, 404);
  return c.json({ invite });
});

auth.post("/invites/:token/accept", async (c) => {
  const invite = await c.env.DB.prepare("SELECT * FROM invites WHERE token=? AND used=0")
    .bind(c.req.param("token"))
    .first<any>();
  if (!invite) return c.json({ error: "Invite not found or already used" }, 404);
  const { name, email, password } = await c.req.json().catch(() => ({}));
  const finalEmail = (invite.email || email || "").trim();
  if (!finalEmail || !name || !password || password.length < 8) {
    return c.json({ error: "Name, email and a password of 8+ chars are required" }, 400);
  }
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email=?").bind(finalEmail).first();
  if (existing) return c.json({ error: "An account with this email already exists" }, 409);
  const hash = await hashPassword(password);
  const user = await c.env.DB.prepare(
    "INSERT INTO users (email, password_hash, name, role, client_id) VALUES (?,?,?,?,?) RETURNING *"
  )
    .bind(finalEmail, hash, name, invite.role, invite.client_id)
    .first<any>();
  await c.env.DB.prepare("UPDATE invites SET used=1 WHERE id=?").bind(invite.id).run();
  await startSession(c, user);
  return c.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, client_id: user.client_id } });
});

export default auth;
