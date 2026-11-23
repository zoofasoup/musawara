// The one place Better Auth is configured. Passwords are verified by our own PBKDF2 code (so every existing hash keeps working),
// users live in the existing `users` table (integer ids, our role columns), and the platform's own checks stay in middleware.
import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import type { Env } from "../types";
import { hashPassword, verifyPassword, SESSION_TTL_SECONDS } from "./auth";
import { roleAllowedOnHost } from "./audience";

const cache = new WeakMap<object, Map<string, ReturnType<typeof build>>>();

function build(env: Env, origin: string) {
  const secure = origin.startsWith("https:");
  return betterAuth({
    baseURL: origin,
    basePath: "/api/auth",
    secret: env.AUTH_SECRET ?? env.JWT_SECRET,
    database: env.DB as any,
    trustedOrigins: ["https://app.musawara.id", "https://portal.musawara.id", origin],
    user: {
      modelName: "users",
      fields: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" },
      additionalFields: {
        role: { type: "string", input: false },
        client_id: { type: "number", required: false, input: false },
        staff_role: { type: "string", required: false, input: false },
        client_role: { type: "string", required: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // accounts are made by invite or bootstrap only
      minPasswordLength: 8,
      maxPasswordLength: 256,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: (password) => hashPassword(password),
        verify: ({ hash, password }) => verifyPassword(password, hash),
      },
    },
    session: { expiresIn: SESSION_TTL_SECONDS, updateAge: 24 * 60 * 60 },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
    advanced: {
      cookiePrefix: "ma",
      useSecureCookies: secure,
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      // users.password_hash (NOT NULL, kept so the previous release can still read it) is never written by Better Auth; we create every user ourselves.
      database: { validateSchema: false, generateId: ({ model }) => (model === "user" || model === "users" ? false : crypto.randomUUID()) as any },
    },
    databaseHooks: {
      session: {
        create: {
          // Wrong host: no session is ever created (team accounts sign in at app., client accounts at portal.).
          before: async (session, ctx) => {
            const host = ctx?.request ? new URL(ctx.request.url).hostname : new URL(origin).hostname;
            const row = await env.DB.prepare("SELECT role FROM users WHERE id=?").bind(Number(session.userId)).first<{ role: "admin" | "client" }>();
            if (!row || !roleAllowedOnHost(row.role, host)) return false;
          },
        },
      },
    },
    plugins: [
      twoFactor({
        issuer: "Musawara",
        schema: { user: { fields: { twoFactorEnabled: "two_factor_enabled" } } },
      }),
    ],
  });
}

/** One instance per (env, origin): cheap to ask for on every request. */
export function makeAuth(env: Env, origin: string) {
  let byOrigin = cache.get(env as object);
  if (!byOrigin) cache.set(env as object, (byOrigin = new Map()));
  let a = byOrigin.get(origin);
  if (!a) byOrigin.set(origin, (a = build(env, origin)));
  return a;
}
