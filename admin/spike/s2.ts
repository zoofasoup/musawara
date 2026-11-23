import { makeDb } from "../worker/testkit/d1.ts";
import { hashPassword, verifyPassword } from "../worker/lib/auth.ts";
import { makeAuth } from "../worker/lib/betterAuth.ts";

const DB = makeDb();
const env: any = { DB, JWT_SECRET: "spike-secret-spike-secret-spike-secret" };
const legacy = await hashPassword("correct-horse-1");
await DB.prepare("INSERT INTO clients (id,name,slug) VALUES (1,'A','a')").run();
await DB.prepare("INSERT INTO users (id,email,password_hash,name,role,staff_role) VALUES (7,'team@x.test',?,'Team','admin','owner'),(8,'cli@x.test',?,'Cli','client',NULL)").bind(legacy, legacy).run();
await DB.prepare("INSERT INTO account (id,accountId,providerId,userId,password,createdAt,updatedAt) SELECT 'legacy-'||id,CAST(id AS TEXT),'credential',CAST(id AS TEXT),password_hash,created_at,datetime('now') FROM users").run();

const TEAM = "https://app.musawara.id", PORTAL = "https://portal.musawara.id";
let ip = 0;
const call = (origin: string, path: string, body?: unknown, cookie?: string, method = body ? "POST" : "GET") =>
  makeAuth(env, origin).handler(new Request(origin + "/api/auth" + path, { method, headers: { "content-type": "application/json", origin, "cf-connecting-ip": "203.0.113." + (++ip % 250), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }));
const ck = (r: Response) => r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const out = (n: string, v: unknown) => console.log(n.padEnd(34), typeof v === "string" ? v : JSON.stringify(v));

// 2/3: sign in with a LEGACY pbkdf2 hash
let r = await call(TEAM, "/sign-in/email", { email: "team@x.test", password: "correct-horse-1" });
const cookie = ck(r);
out("legacy login status", r.status);
out("cookie names", r.headers.getSetCookie().map((c) => c.split("=")[0]));
const sess = await (await call(TEAM, "/get-session", undefined, cookie)).json() as any;
out("session user", { id: sess?.user?.id, idType: typeof sess?.user?.id, role: sess?.user?.role, staff_role: sess?.user?.staff_role, client_id: sess?.user?.client_id });
out("wrong password", (await call(TEAM, "/sign-in/email", { email: "team@x.test", password: "nope-nope-1" })).status);

// host gate: client account on team host, team account on portal host
r = await call(TEAM, "/sign-in/email", { email: "cli@x.test", password: "correct-horse-1" });
out("client on app. host", { status: r.status, cookie: ck(r) });
r = await call(PORTAL, "/sign-in/email", { email: "team@x.test", password: "correct-horse-1" });
out("team on portal. host", { status: r.status, cookie: ck(r) });
out("sessions rows after refusals", (await DB.prepare("SELECT COUNT(*) n FROM session").first<any>()).n);
r = await call(PORTAL, "/sign-in/email", { email: "cli@x.test", password: "correct-horse-1" });
out("client on portal. host", r.status);

// 3: change password writes pbkdf2 + revokes others
const second = ck(await call(TEAM, "/sign-in/email", { email: "team@x.test", password: "correct-horse-1" }));
r = await call(TEAM, "/change-password", { currentPassword: "correct-horse-1", newPassword: "new-horse-battery-2", revokeOtherSessions: true }, cookie);
out("change-password", r.status);
const row = await DB.prepare("SELECT password FROM account WHERE userId='7'").first<any>();
out("new hash format", row.password.split("$").slice(0, 2).join("$"));
out("verify new hash", await verifyPassword("new-horse-battery-2", row.password));
out("old session after change", (await (await call(TEAM, "/get-session", undefined, second)).text()).slice(0, 40));

// 4: server-side user creation with disableSignUp
r = await call(TEAM, "/sign-up/email", { email: "evil@x.test", password: "whatever-123", name: "Evil" });
out("open sign-up status", r.status);
try {
  const ctx = await makeAuth(env, TEAM).$context;
  const u = await ctx.internalAdapter.createUser({ email: "inv@x.test", name: "Inv", role: "admin", staff_role: "ads" } as any);
  out("internalAdapter.createUser id", { id: u.id, type: typeof u.id });
} catch (e: any) { out("createUser ERR", e.message.slice(0, 200)); }

// 5: 2FA
const login2 = ck(await call(TEAM, "/sign-in/email", { email: "team@x.test", password: "new-horse-battery-2" }));
r = await call(TEAM, "/two-factor/enable", { password: "new-horse-battery-2" }, login2);
const en = await r.json() as any;
out("2fa enable", { status: r.status, hasUri: !!en.totpURI, backup: en.backupCodes?.length });
const secret = new URL(en.totpURI).searchParams.get("secret")!;
const { generate } = await import("otplib");
const code = await generate({ secret });
r = await call(TEAM, "/two-factor/verify-totp", { code }, login2);
out("2fa verify-totp", r.status);
r = await call(TEAM, "/sign-in/email", { email: "team@x.test", password: "new-horse-battery-2" });
out("login after 2fa", { status: r.status, body: await r.clone().json(), cookie: ck(r) });

// 6: timing known vs unknown email
const t = async (email: string) => { const s = performance.now(); for (let i = 0; i < 5; i++) await call(TEAM, "/sign-in/email", { email, password: "wrong-wrong-1" }); return Math.round((performance.now() - s) / 5); };
out("avg ms known email", await t("cli@x.test"));
out("avg ms unknown email", await t("nobody@x.test"));
