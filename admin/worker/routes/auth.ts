// Sign-in, sign-out, password, invites and first-run bootstrap. Sessions, two-factor codes and password changes are
// Better Auth's (worker/lib/betterAuth.ts); who may do what stays ours (middleware.ts, shared/permissions.ts).
import { Hono } from "hono";
import { timingSafeEqual } from "hono/utils/buffer";
import type { Env, Vars } from "../types";
import { hashPassword } from "../lib/auth";
import { requireAuth } from "../middleware";
import { CLIENT_HOST, homeHostFor, roleAllowedOnHost, type Role } from "../lib/audience";
import { isClientRole, isStaffRole } from "../../shared/permissions";
import { makeAuth } from "../lib/betterAuth";

const publicUser = (u: any) => ({
  id: u.id, email: u.email, name: u.name, role: u.role, client_id: u.client_id ?? null,
  staff_role: u.staff_role ?? null, client_role: u.client_role ?? null,
});

const auth = new Hono<{ Bindings: Env; Variables: Vars }>();
const ba = (c: any) => makeAuth(c.env, new URL(c.req.url).origin);

/** Pass the cookies Better Auth set (new session, cleared session) on to the browser. */
function forwardCookies(c: any, headers: Headers | undefined) {
  for (const v of headers?.getSetCookie() ?? []) c.header("Set-Cookie", v, { append: true });
}

/** Sign in with a password we already know is right (just created accounts) and return the user the way /login does. */
async function startSession(c: any, email: string, password: string) {
  const { headers } = await ba(c).api.signInEmail({ body: { email, password }, headers: c.req.raw.headers, returnHeaders: true });
  forwardCookies(c, headers);
  const user = await c.env.DB.prepare("SELECT id, email, name, role, client_id, staff_role, client_role FROM users WHERE email=?").bind(email).first();
  return c.json({ user: publicUser(user) });
}

/** The statement that gives a new user their credential account (the password Better Auth checks); it goes in the same batch as the user. */
const accountFor = (c: any, email: string, hash: string) =>
  c.env.DB.prepare(
    `INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
     SELECT 'acct-' || u.id, CAST(u.id AS TEXT), 'credential', CAST(u.id AS TEXT), ?, datetime('now'), datetime('now') FROM users u WHERE u.email=?`
  ).bind(hash, email);

/** 403 telling the user where their account signs in, or null when this host serves their role. */
function wrongHost(c: any, role: Role) {
  if (roleAllowedOnHost(role, new URL(c.req.url).hostname)) return null;
  return c.json({ error: `This account signs in at ${homeHostFor(role)}`, code: "wrong_host" }, 403);
}

auth.post("/login", async (c) => {
  const { email, password } = (await c.req.json().catch(() => null)) ?? {};
  if (typeof email !== "string" || !email.trim() || email.length > 254 ||
      typeof password !== "string" || !password || password.length > 256) {
    return c.json({ error: "Email and password are required" }, 400);
  }
  const cleanEmail = email.trim();
  try {
    const { headers, response } = await ba(c).api.signInEmail({ body: { email: cleanEmail, password }, headers: c.req.raw.headers, returnHeaders: true });
    forwardCookies(c, headers);
    if ((response as any)?.twoFactorRedirect) return c.json({ twoFactor: true, methods: (response as any).twoFactorMethods ?? ["totp"] });
    const user = await c.env.DB.prepare("SELECT id, email, name, role, client_id, staff_role, client_role FROM users WHERE id=?").bind(Number((response as any).user.id)).first();
    return c.json({ user: publicUser(user) });
  } catch (e: any) {
    // The error code tells the two refusals apart without hashing again (a second hash for known emails only would leak which exist):
    // FAILED_TO_CREATE_SESSION = the password was right but the host hook refused the session (wrong host); anything else = wrong credentials.
    if (e?.body?.code === "FAILED_TO_CREATE_SESSION") {
      const row = await c.env.DB.prepare("SELECT role FROM users WHERE email=?").bind(cleanEmail).first<{ role: Role }>();
      const wrong = row ? wrongHost(c, row.role) : null;
      if (wrong) return wrong;
    }
    return c.json({ error: "Invalid email or password" }, 401);
  }
});

auth.post("/logout", async (c) => {
  const { headers } = await ba(c).api.signOut({ headers: c.req.raw.headers, returnHeaders: true }).catch(() => ({ headers: undefined }));
  forwardCookies(c, headers);
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

/** Your own display name. Email and role are not editable here. */
auth.patch("/profile", requireAuth, async (c) => {
  const { name } = await c.req.json().catch(() => ({}));
  const clean = typeof name === "string" ? name.trim() : "";
  if (!clean || clean.length > 80) return c.json({ error: "Enter a name of 1 to 80 characters." }, 400);
  const id = c.get("user").id;
  const user = await c.env.DB.prepare("UPDATE users SET name=? WHERE id=? RETURNING *").bind(clean, id).first<any>();
  if (!user) return c.json({ error: "Account not found" }, 404);
  return c.json({ user: publicUser(user) });
});

/** Change your own password. Needs the current one, and signs every other device out. */
auth.post("/password", requireAuth, async (c) => {
  const { current, next } = await c.req.json().catch(() => ({}));
  if (typeof current !== "string" || typeof next !== "string" || !current || current.length > 256) return c.json({ error: "Enter your current and new password." }, 400);
  if (next.length < 8 || next.length > 200) return c.json({ error: "The new password needs 8 or more characters." }, 400);
  if (next === current) return c.json({ error: "Pick a password different from the current one." }, 400);
  const id = c.get("user").id;
  try {
    const { headers } = await ba(c).api.changePassword({ body: { currentPassword: current, newPassword: next, revokeOtherSessions: true }, headers: c.req.raw.headers, returnHeaders: true });
    forwardCookies(c, headers);
  } catch {
    return c.json({ error: "Your current password is not right." }, 403);
  }
  // Keep the old column in step, so a rollback to the previous release does not bring the old password back.
  await c.env.DB.prepare("UPDATE users SET password_hash=COALESCE((SELECT password FROM account WHERE userId=CAST(users.id AS TEXT) AND providerId='credential'), password_hash) WHERE id=?").bind(id).run();
  return c.json({ ok: true });
});

// First-run bootstrap: create the initial admin only while the users table is empty.
auth.post("/bootstrap", async (c) => {
  const bootstrapToken = c.env.ADMIN_BOOTSTRAP_TOKEN;
  if (new URL(c.req.url).hostname === CLIENT_HOST ||
      !bootstrapToken || bootstrapToken.length < 32 ||
      !(await timingSafeEqual(c.req.header("Authorization") ?? "", `Bearer ${bootstrapToken}`))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { email, password, name } = (await c.req.json().catch(() => null)) ?? {};
  if (typeof email !== "string" || !email.trim() || email.length > 254 ||
      typeof password !== "string" || password.length < 12 || password.length > 256 ||
      (name !== undefined && (typeof name !== "string" || name.length > 120))) {
    return c.json({ error: "Valid email and password of 12 to 256 characters required" }, 400);
  }
  const hash = await hashPassword(password);
  const cleanEmail = email.trim();
  const user = await c.env.DB.prepare(
    `INSERT INTO users (email, password_hash, name, role, staff_role)
     SELECT ?,?,?,'admin','owner' WHERE NOT EXISTS (SELECT 1 FROM users) RETURNING *`
  )
    .bind(cleanEmail, hash, name?.trim() || "Admin")
    .first<any>();
  if (!user) return c.json({ error: "Already initialized" }, 403);
  await accountFor(c, cleanEmail, hash).run();
  return startSession(c, cleanEmail, password);
});

auth.get("/invites/:token", async (c) => {
  const invite = await c.env.DB.prepare(
    `SELECT i.token, i.email, i.role, i.staff_role, i.client_role, i.client_id, c.name AS client_name
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
  const { name, email, password } = (await c.req.json().catch(() => null)) ?? {};
  const finalEmail = (invite.email || (typeof email === "string" ? email : "")).trim();
  if (!finalEmail || finalEmail.length > 254 || typeof name !== "string" || !name.trim() || name.length > 80 ||
      typeof password !== "string" || password.length < 8 || password.length > 256) {
    return c.json({ error: "Name, email and a password of 8+ chars are required" }, 400);
  }
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email=?").bind(finalEmail).first();
  if (existing) return c.json({ error: "An account with this email already exists" }, 409);
  const hash = await hashPassword(password);
  // The role comes from the invite and nowhere else. A team invite with no valid role, or a client invite without one, cannot be accepted.
  const staffRole = invite.role === "admin" ? invite.staff_role : null;
  const clientRole = invite.role === "client" ? invite.client_role : null;
  if (invite.role === "admin" ? !isStaffRole(staffRole) : !isClientRole(clientRole)) return c.json({ error: "This invite has no role. Ask for a new one." }, 400);
  let assigned: number[] = [];
  if (staffRole && staffRole !== "owner") {
    try { const v = JSON.parse(invite.client_ids_json ?? "[]"); if (Array.isArray(v)) assigned = v.filter((n) => Number.isSafeInteger(n) && n > 0); } catch { /* no assignments */ }
  }
  // One batch: the account, the used mark, the client assignments and the sign-in credential land together or not at all.
  const [inserted] = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users (email, password_hash, name, role, client_id, staff_role, client_role)
       SELECT ?,?,?,role,client_id,?,? FROM invites WHERE id=? AND used=0`
    ).bind(finalEmail, hash, name.trim(), staffRole, clientRole, invite.id),
    c.env.DB.prepare("UPDATE invites SET used=1 WHERE id=? AND used=0").bind(invite.id),
    ...assigned.map((cid) =>
      c.env.DB.prepare("INSERT OR IGNORE INTO user_clients (user_id, client_id) SELECT u.id, c.id FROM users u, clients c WHERE u.email=? AND c.id=?").bind(finalEmail, cid)
    ),
    accountFor(c, finalEmail, hash),
  ]);
  if (Number(inserted.meta.changes) !== 1) return c.json({ error: "Invite not found or already used" }, 404);
  return startSession(c, finalEmail, password);
});

/** Choose a new password with a one-time link from an Owner. Signs the account out everywhere. */
auth.post("/reset", async (c) => {
  const { token, password } = (await c.req.json().catch(() => null)) ?? {};
  if (typeof token !== "string" || !token || token.length > 200 || typeof password !== "string" || password.length < 8 || password.length > 256) {
    return c.json({ error: "Choose a password of 8 or more characters." }, 400);
  }
  const link = await c.env.DB.prepare("SELECT value FROM verification WHERE identifier=?").bind(`reset-password:${token}`).first<{ value: string }>();
  try {
    await ba(c).api.resetPassword({ body: { newPassword: password, token } });
  } catch {
    return c.json({ error: "This link has expired or was already used. Ask for a new one." }, 400);
  }
  if (link) await c.env.DB.prepare("UPDATE users SET password_hash=COALESCE((SELECT password FROM account WHERE userId=CAST(users.id AS TEXT) AND providerId='credential'), password_hash) WHERE id=?").bind(Number(link.value)).run();
  return c.json({ ok: true });
});

// Everything else Better Auth offers that this app uses: two-factor setup and codes, sessions, one-time reset links.
// An allow-list, so a new Better Auth endpoint is never reachable by accident (sign-up, account deletion, e-mail change stay shut).
const BA_PATHS = /^\/(two-factor\/[a-z-]+|get-session|list-sessions|revoke-session|revoke-sessions|revoke-other-sessions)$/;
auth.all("/*", async (c) => {
  const path = new URL(c.req.url).pathname.replace(/^\/api\/auth/, "");
  if (!BA_PATHS.test(path)) return c.json({ error: "Not found" }, 404);
  return ba(c).handler(c.req.raw);
});

export default auth;
