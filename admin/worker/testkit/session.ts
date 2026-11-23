// A real signed-in session for a seeded user: a session row made by Better Auth's own adapter and its signed cookie, so tests use the
// same cookie and session table the app does. Passwords are not touched. `origin` must be the origin the test requests use: it decides
// the cookie's name (https adds a prefix).
import { makeAuth } from "../lib/betterAuth.ts";

const cache = new WeakMap<object, Map<string, string>>();
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));

export async function sessionCookie(env: any, userId: number, origin = "http://localhost"): Promise<string> {
  const key = `${userId}@${origin}`;
  const mine = cache.get(env) ?? new Map<string, string>();
  cache.set(env, mine);
  const hit = mine.get(key);
  if (hit) return hit;
  const ctx = await makeAuth(env, origin).$context;
  const session = await ctx.internalAdapter.createSession(String(userId));
  const hmac = await crypto.subtle.importKey("raw", new TextEncoder().encode(ctx.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = b64(await crypto.subtle.sign("HMAC", hmac, new TextEncoder().encode(session.token)));
  const cookie = `${ctx.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`;
  mine.set(key, cookie);
  return cookie;
}

/** Give every seeded user a credential account from users.password_hash, as migration 0026 does for real users. */
export async function backfillAccounts(DB: any) {
  await DB.prepare(
    `INSERT OR IGNORE INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
     SELECT 'legacy-' || id, CAST(id AS TEXT), 'credential', CAST(id AS TEXT), password_hash, datetime('now'), datetime('now') FROM users`
  ).run();
}
