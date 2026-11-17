import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { sign } from "hono/jwt";
import type { Env, Vars } from "../types";
import { hashPassword, SESSION_COOKIE, SESSION_TTL_SECONDS, verifyPassword } from "../lib/auth";
import { requireAuth } from "../middleware";
import { homeHostFor, roleAllowedOnHost, type Role } from "../lib/audience";

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

/** 403 telling the user where their account signs in, or null when this host serves their role. */
function wrongHost(c: any, role: Role) {
  if (roleAllowedOnHost(role, new URL(c.req.url).hostname)) return null;
  return c.json({ error: `This account signs in at ${homeHostFor(role)}`, code: "wrong_host" }, 403);
}

auth.post("/login", async (c) => {
  const { email, password } = await c.req.json().catch(() => ({}));
  if (!email || !password) return c.json({ error: "Email and password are required" }, 400);
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE email=?").bind(email.trim()).first<any>();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: "Invalid email or password" }, 401);
  }
  const wrong = wrongHost(c, user.role);
  if (wrong) return wrong;
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

/** Your own display name. Email and role are not editable here. The session is re-issued so the new name shows at once. */
auth.patch("/profile", requireAuth, async (c) => {
  const { name } = await c.req.json().catch(() => ({}));
  const clean = typeof name === "string" ? name.trim() : "";
  if (!clean || clean.length > 80) return c.json({ error: "Enter a name of 1 to 80 characters." }, 400);
  const id = c.get("user").id;
  const user = await c.env.DB.prepare("UPDATE users SET name=? WHERE id=? RETURNING *").bind(clean, id).first<any>();
  if (!user) return c.json({ error: "Account not found" }, 404);
  await startSession(c, user);
  return c.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, client_id: user.client_id } });
});

/** Change your own password. Needs the current one, so a borrowed open session cannot take over the account. */
auth.post("/password", requireAuth, async (c) => {
  const { current, next } = await c.req.json().catch(() => ({}));
  if (typeof current !== "string" || typeof next !== "string" || !current) return c.json({ error: "Enter your current and new password." }, 400);
  if (next.length < 8 || next.length > 200) return c.json({ error: "The new password needs 8 or more characters." }, 400);
  if (next === current) return c.json({ error: "Pick a password different from the current one." }, 400);
  const id = c.get("user").id;
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first<any>();
  if (!user || !(await verifyPassword(current, user.password_hash))) return c.json({ error: "Your current password is not right." }, 403);
  await c.env.DB.prepare("UPDATE users SET password_hash=? WHERE id=?").bind(await hashPassword(next), id).run();
  return c.json({ ok: true });
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
  const wrong = wrongHost(c, invite.role);
  if (wrong) return wrong;
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
