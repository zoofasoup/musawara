# CRM-Only Mode Implementation Plan (Plan 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The same repo can run as a CRM-only app (Worker + web) that exposes nothing of the agency platform, without changing how the platform behaves.

**Architecture:** One env var (`APP_MODE=crm`) turns on a single allowlist in the Hono app and a smaller cron. A second web entry (`CrmApp`) imports only CRM pages, built with `VITE_APP_MODE=crm` into `dist-crm`. The request hardening now in the root `worker/index.ts` moves into a shared module that both entry points use.

**Tech Stack:** Cloudflare Workers + D1, Hono, Better Auth, React 19 + React Router 7, Vite 6, `node --test`.

Spec: `docs/superpowers/specs/2026-11-26-crm-only-mode-design.md`. Terms: `GLOSSARY.md`. Already true, no task needed: an Owner can delete another Owner (`DELETE /users/:id` only refuses oneself), so Akun bantuan can be removed.

## Not in this plan

| Plan | Covers | Needs |
|---|---|---|
| 2 | Indonesian text for every screen of the CRM build | Plan 1 |
| 3 | Gateway API-only switch, first number no longer named "Nuralive" (`~/Projects/wa-crm`) | nothing |
| 4 | Install script per Salinan (D1, secrets, gateway, backup, Owner, internal `clients` row, linking the first number, Akun bantuan) and the finished-criteria test on a trial Salinan | Plans 1–3 |

## Carried over after Plan 1 (executed 26-27 Nov 2026, commits 658c0db..bb17740)

Plan 4 (install script) must:
- create the internal `clients` row, and link the gateway's first number to it (nothing in the CRM copy can link it later);
- give each copy its own `AUTH_LIMITER` `namespace_id` and its own secrets;
- check after install that an agency route answers 404;
- never reuse a platform database, and never point a copy at the agency's gateway URL or token.

Open, owner decides:
- Existing before this plan and live: a percent-encoded sign-in path (`/api/%61uth/login`) skips `AUTH_LIMITER` (`admin/worker/lib/edge.ts`).

Deferred minors:
- Plan 2: most CRM text is still English.
- CRM staff are still told to use the hidden Numbers tab; a client account on `/profile` still sees `/c/` links.
- `betterAuth.ts` still lists the agency origins in `trustedOrigins`; "CRM" shows twice in the phone header; `index.html` keeps `lang="en"`.
- Tests: `crmAllows` false per closed entry; positive checks for pipeline, crm-ads and auth; edge logout exemption, same-origin and `X-Robots-Tag`; no route-level preset test.
- `crmPresets.ts` picks the travel set by array position.

## Global Constraints

- Without `APP_MODE` / `VITE_APP_MODE`, behaviour is unchanged.
- The server is the lock: hiding a menu is never the only protection.
- CRM mode has two roles only: Owner (`owner`) and Staf CRM (`crm`). No client logins.
- No Meta token needed. No ad, planning, approvals, spend, Shopee, Jubelio, Notion or share pages.
- Default language of the CRM build is Indonesian; the language switch stays.
- Temporary product name `CRM`, defined in one file.
- Read `admin/CLAUDE.md` before touching any screen. Check screens at 375px and desktop.
- Node 24+: `export PATH=/opt/homebrew/bin:$PATH`.
- Commit locally per task. No push, no deploy, no migration against remote.
- Before starting: `git status` must show no modified tracked files (settle the pending `NewBroadcast.tsx` change first).

---

### Task 1: Server lock and cron

**Files:**
- Create: `admin/shared/mode.ts`
- Create: `admin/worker/routes/crmMode.test.ts`
- Modify: `admin/worker/index.ts`, `admin/worker/types.ts`, `admin/package.json` (test list)

**Interfaces:**
- Produces: `isCrmMode(v: unknown): boolean`, `crmAllows(method: string, path: string): boolean`, `Env.APP_MODE?: string`

- [ ] **Step 1: Write the failing test** — `admin/worker/routes/crmMode.test.ts`

```ts
// APP_MODE=crm: only the CRM, sign-in and team routes answer; everything of the agency platform is 404.
import test from "node:test";
import assert from "node:assert/strict";
import { sessionCookie } from "../testkit/session.ts";
import { makeDb } from "../testkit/d1.ts";
import { app } from "../index.ts";
import { crmAllows } from "../../shared/mode.ts";

const SECRET = "test-secret";
const HOST = "https://toko.crm.test";

async function setup(mode?: string) {
  const DB = makeDb();
  await DB.prepare("INSERT INTO clients (id,name,slug) VALUES (1,'Toko','toko')").run();
  await DB.prepare(
    `INSERT INTO users (id,email,password_hash,name,role,staff_role) VALUES
     (1,'o@x.test','h','Owner','admin','owner'), (2,'crm@x.test','h','Crm','admin','crm')`
  ).run();
  await DB.prepare("INSERT INTO user_clients (user_id, client_id) VALUES (2,1)").run();
  const env: any = { DB, JWT_SECRET: SECRET, APP_MODE: mode };
  const call = async (id: number, method: string, path: string, body?: unknown) =>
    app.request(HOST + path, {
      method,
      headers: { "content-type": "application/json", cookie: await sessionCookie(env, id, HOST) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, env);
  return { DB, env, call };
}

const CLOSED: Array<[string, string]> = [
  ["GET", "/api/admin/overview"], ["GET", "/api/admin/accounts"], ["GET", "/api/admin/spend"], ["POST", "/api/admin/token"],
  ["GET", "/api/admin/conversions/sales?client_id=1"], ["GET", "/api/admin/plan/board"], ["POST", "/api/admin/clients"],
  ["PUT", "/api/admin/clients/1"], ["POST", "/api/admin/clients/1/share"], ["GET", "/api/clients/1/summary"], ["GET", "/api/report/1"],
  ["GET", "/api/approvals"], ["GET", "/api/shopee/status?client_id=1"], ["GET", "/api/jubelio/status"], ["GET", "/api/notion/status"],
  ["GET", "/api/share/x"], ["POST", "/api/sheet-sync/x"],
];

test("agency routes are 404 in CRM mode, even for an Owner", async () => {
  const { call } = await setup("crm");
  for (const [method, path] of CLOSED) {
    const res = await call(1, method, path, method === "GET" ? undefined : {});
    assert.equal(res.status, 404, `${method} ${path}`);
  }
});

test("CRM, team and health routes still answer", async () => {
  const { call, env } = await setup("crm");
  assert.equal((await call(1, "GET", "/api/admin/users")).status, 200);
  assert.equal((await call(2, "GET", "/api/admin/clients")).status, 200);
  assert.equal((await call(2, "GET", "/api/admin/users")).status, 403, "team management stays Owner-only");
  assert.equal((await call(2, "GET", "/api/crm/status")).status, 503, "gateway not configured, but the route exists");
  assert.equal((await app.request(HOST + "/api/health?deep=1", {}, env)).status, 200);
});

test("the allowlist does not open look-alike paths", () => {
  assert.equal(crmAllows("GET", "/api/crm-tasks/summary"), true);
  assert.equal(crmAllows("GET", "/api/crmx"), false);
  assert.equal(crmAllows("GET", "/api/admin/usersx"), false);
  assert.equal(crmAllows("DELETE", "/api/admin/clients"), false);
});

test("without APP_MODE nothing is closed", async () => {
  const { call } = await setup();
  assert.notEqual((await call(1, "GET", "/api/admin/overview")).status, 404);
});
```

Add `worker/routes/crmMode.test.ts` to the `node --test` file list in `admin/package.json`.

- [ ] **Step 2: Run it, expect failure** — `cd admin && npm test 2>&1 | grep -A3 crmMode` → cannot find module `../../shared/mode.ts`.

- [ ] **Step 3: Implement** — `admin/shared/mode.ts`

```ts
// One code base, two products. APP_MODE=crm is the CRM sold to other businesses: only these routes exist there.
export const isCrmMode = (v: unknown): boolean => v === "crm";

const OPEN: RegExp[] = [
  /^\/api\/health$/,
  /^\/api\/auth(\/|$)/,
  /^\/api\/(crm|pipeline|crm-tasks|crm-ads)(\/|$)/,
  /^\/api\/admin\/(users|invites)(\/|$)/,
];

/** An allowlist, so a route added to the platform later stays closed in CRM mode until someone opens it here. */
export function crmAllows(method: string, path: string): boolean {
  if (path === "/api/admin/clients") return method === "GET" || method === "HEAD";
  return OPEN.some((r) => r.test(path));
}
```

In `admin/worker/types.ts`, add to `Env`:

```ts
  /** "crm" = a CRM-only copy sold to a business (shared/mode.ts). Unset = the agency platform. */
  APP_MODE?: string;
```

In `admin/worker/index.ts`, add the import and put the gate directly after `new Hono()`, before the first `app.route`:

```ts
import { crmAllows, isCrmMode } from "../shared/mode";

app.use("*", async (c, next) => {
  if (isCrmMode(c.env.APP_MODE) && !crmAllows(c.req.method, c.req.path)) return c.json({ error: "Not found" }, 404);
  await next();
});
```

and make this the first statement of `scheduled`:

```ts
  if (isCrmMode(env.APP_MODE)) {
    ctx.waitUntil(trackCron(env, "inbox", () => syncAllInboxLeads(env)));
    return;
  }
```

- [ ] **Step 4: Run** — `npm test` and `npm run check` (in `admin/`). Expected: all pass, including the existing `roles.test.ts`.

- [ ] **Step 5: Commit** — `git add admin/shared/mode.ts admin/worker admin/package.json && git commit -m "CRM mode: server allowlist and CRM-only cron"`

---

### Task 2: Team rules and the travel field set

**Files:**
- Modify: `admin/worker/routes/admin.ts` (`POST /invites`, `PUT /users/:id`), `admin/worker/lib/crmPresets.ts`, `admin/worker/routes/pipeline.ts` (`/presets`, `/fields/preset`)
- Test: `admin/worker/routes/crmMode.test.ts`

**Interfaces:**
- Consumes: `isCrmMode`
- Produces: `presetsFor(mode?: string): Preset[]`; in CRM mode a `crm` invite or edit is always assigned to the first `clients` row.

- [ ] **Step 1: Add failing tests**

```ts
import { presetsFor } from "../lib/crmPresets.ts";

test("only Owner and CRM staff exist, and CRM staff get the business automatically", async () => {
  const { call, DB } = await setup("crm");
  for (const body of [{ audience: "client", client_role: "viewer", client_id: 1 }, { audience: "team", staff_role: "ads", client_ids: [1] }, { audience: "team", staff_role: "content", client_ids: [1] }]) {
    assert.equal((await call(1, "POST", "/api/admin/invites", body)).status, 400);
  }
  assert.equal((await call(1, "POST", "/api/admin/invites", { audience: "team", staff_role: "crm" })).status, 200);
  const invite = await DB.prepare("SELECT client_ids_json FROM invites").first<{ client_ids_json: string }>();
  assert.equal(invite!.client_ids_json, "[1]");
  assert.equal((await call(1, "PUT", "/api/admin/users/2", { staff_role: "ads", client_ids: [1] })).status, 400);
  assert.equal((await call(1, "PUT", "/api/admin/users/2", { staff_role: "crm" })).status, 200);
  const rows = await DB.prepare("SELECT client_id FROM user_clients WHERE user_id=2").all<{ client_id: number }>();
  assert.deepEqual(rows.results.map((r) => r.client_id), [1]);
});

test("the CRM copy offers one travel field set without agency names", () => {
  const crm = presetsFor("crm");
  assert.deepEqual(crm.map((p) => p.id), ["travel"]);
  assert.doesNotMatch(JSON.stringify(crm), /musafar|nuralive/i);
  assert.deepEqual(crm[0].fields, presetsFor().find((p) => p.id === "musafar")!.fields);
});
```

- [ ] **Step 2: Run, expect failure** — `presetsFor` is not exported.

- [ ] **Step 3: Implement.** Append to `crmPresets.ts` (add `import { isCrmMode } from "../../shared/mode";` at the top):

```ts
/** The CRM sold to other businesses offers the umrah fields under a neutral name and nothing brand-specific. */
const TRAVEL: Preset = { ...PRESETS[0], id: "travel", name: "Travel umroh" };
export const presetsFor = (mode?: string): Preset[] => (isCrmMode(mode) ? [TRAVEL] : PRESETS);
```

In `pipeline.ts`, import `presetsFor` instead of `PRESETS`; use `presetsFor(c.env.APP_MODE)` in both `GET /presets` and `POST /fields/preset`.

In `admin.ts`, import `isCrmMode` from `../../shared/mode` and add below `existingClientIds`:

```ts
/** A CRM copy has one internal `clients` row standing for the business; its CRM staff are always assigned to it. */
async function businessClientIds(c: Context<{ Bindings: Env; Variables: Vars }>): Promise<number[]> {
  const row = await c.env.DB.prepare("SELECT id FROM clients ORDER BY id LIMIT 1").first<{ id: number }>();
  return row ? [row.id] : [];
}
const crmRole = (v: unknown) => v === "owner" || v === "crm";
```

In `POST /invites`, after reading the body:

```ts
  const crmOnly = isCrmMode(c.env.APP_MODE);
  if (crmOnly && (audience === "client" || !crmRole(staff_role))) return c.json({ error: "Pick Owner or CRM" }, 400);
```

and replace the assignment line inside `if (staff_role !== "owner")` with:

```ts
      assigned = crmOnly ? await businessClientIds(c) : await existingClientIds(c, safeIds(client_ids));
```

In `PUT /users/:id`, after the `target` lookup:

```ts
  const crmOnly = isCrmMode(c.env.APP_MODE);
  if (crmOnly && !crmRole(staff_role)) return c.json({ error: "Pick Owner or CRM" }, 400);
```

and replace its assignment line the same way.

- [ ] **Step 4: Run** — `npm test && npm run check`. Expected: pass.
- [ ] **Step 5: Commit** — `git commit -am "CRM mode: two roles, automatic business assignment, travel field set"`

---

### Task 3: Shared request hardening and the CRM Worker entry

**Files:**
- Create: `admin/worker/lib/edge.ts`, `admin/worker/lib/edge.test.ts`, `admin/worker/crmEntry.ts`, `admin/wrangler.crm.example.jsonc`
- Modify: `worker/index.ts` (root), `admin/package.json` (test list)

**Interfaces:**
- Produces: `apiResponse(r: Response): Response`; `serveApi(request, env: { AUTH_LIMITER?: RateLimit }, ctx, api: { fetch(request, env, ctx): Response | Promise<Response> }): Promise<Response>`

- [ ] **Step 1: Failing test** — `admin/worker/lib/edge.test.ts` (add to the test list)

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { serveApi } from "./edge.ts";

const ok = { fetch: () => Response.json({ ok: true }) };
const ctx: any = { waitUntil() {} };
const post = (path: string, origin?: string) => new Request("https://toko.crm.test" + path, { method: "POST", headers: origin ? { origin } : {} });
const limiter = (success: boolean): any => ({ AUTH_LIMITER: { limit: async () => ({ success }) } });

test("a foreign origin cannot write", async () => {
  assert.equal((await serveApi(post("/api/pipeline", "https://evil.test"), limiter(true), ctx, ok)).status, 403);
});

test("sign-in is rate limited and refuses to run without the limiter", async () => {
  assert.equal((await serveApi(post("/api/auth/login"), {}, ctx, ok)).status, 503);
  const blocked = await serveApi(post("/api/auth/login"), limiter(false), ctx, ok);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("Retry-After"), "60");
});

test("answers carry the private headers", async () => {
  const res = await serveApi(post("/api/pipeline"), limiter(true), ctx, ok);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
});
```

- [ ] **Step 2: Run, expect failure** (module missing).

- [ ] **Step 3: Implement** — `admin/worker/lib/edge.ts` (moved from root `worker/index.ts`, same behaviour)

```ts
// What every public entry does before a request reaches the API: same-origin writes only, a limit on sign-in attempts,
// and headers that keep answers private. Shared by the platform Worker and the CRM-only Worker.
type EdgeEnv = { AUTH_LIMITER?: RateLimit };
type Api<E> = { fetch(request: Request, env: E, ctx: ExecutionContext): Response | Promise<Response> };

export function apiResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(response.body, { status: response.status, headers });
}

export async function serveApi<E extends EdgeEnv>(request: Request, env: E, ctx: ExecutionContext, api: Api<E>): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && origin && origin !== url.origin) {
    return apiResponse(Response.json({ error: "Forbidden origin" }, { status: 403 }));
  }
  if (request.method === "POST" && url.pathname.startsWith("/api/auth/") && url.pathname !== "/api/auth/logout") {
    if (!env.AUTH_LIMITER) return apiResponse(Response.json({ error: "Authentication unavailable" }, { status: 503 }));
    const { success } = await env.AUTH_LIMITER.limit({ key: request.headers.get("CF-Connecting-IP") ?? "unknown" });
    if (!success) return apiResponse(Response.json({ error: "Try again in one minute" }, { status: 429, headers: { "Retry-After": "60" } }));
  }
  return apiResponse(await api.fetch(request, env, ctx));
}
```

In root `worker/index.ts`: delete the local `apiResponse`, import `{ apiResponse, serveApi }` from `'../admin/worker/lib/edge'`, and replace the whole `if (pathname.startsWith('/api/')) { ... }` block with:

```ts
    if (pathname.startsWith('/api/')) return serveApi(request, env, ctx, adminApi)
```

Leave the `/api/apply` branch as is (it uses the imported `apiResponse`).

`admin/worker/crmEntry.ts`:

```ts
// The Worker of a CRM-only copy (APP_MODE=crm): the same API behind the same hardening, plus the CRM build as static files.
import { app, scheduled, type AdminEnv } from "./index";
import { serveApi } from "./lib/edge";

type Env = AdminEnv & { AUTH_LIMITER?: RateLimit };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/api/")) return serveApi(request, env, ctx, app);
    return env.ASSETS.fetch(request);
  },
  scheduled,
} satisfies ExportedHandler<Env>;
```

`admin/wrangler.crm.example.jsonc`:

```jsonc
// Template for one Salinan of the CRM. The install script (plan 4) writes a real copy per business.
{
  "name": "crm-salinan-contoh",
  "main": "worker/crmEntry.ts",
  "compatibility_date": "2026-08-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": "./dist-crm", "binding": "ASSETS", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
  "d1_databases": [{ "binding": "DB", "database_name": "crm-salinan-contoh", "migrations_dir": "./migrations", "database_id": "00000000-0000-0000-0000-000000000000" }],
  "ratelimits": [{ "name": "AUTH_LIMITER", "namespace_id": "12001", "simple": { "limit": 30, "period": 60 } }],
  "triggers": { "crons": ["0 * * * *"] },
  "vars": { "APP_MODE": "crm", "APP_NAME": "CRM" },
  "observability": { "enabled": true, "logs": { "invocation_logs": false } }
}
```

- [ ] **Step 4: Run** from the repo root: `npm test --prefix admin && npm run check && npm run build && npx wrangler deploy --dry-run -c wrangler.noR2.jsonc`. Expected: pass; the dry run only reports bindings.
- [ ] **Step 5: Commit** — `git add admin/worker admin/wrangler.crm.example.jsonc admin/package.json worker/index.ts && git commit -m "Share API hardening; add the CRM-only Worker entry"`

---

### Task 4: CRM web entry

**Files:**
- Create: `admin/src/lib/product.ts`, `admin/src/components/frames.tsx`, `admin/src/CrmApp.tsx`, `admin/src/main.crm.tsx`, `admin/src/pages/CrmSettings.tsx`, `admin/public-crm/favicon.svg`, `admin/public-crm/login-sky.jpg` (copy of `public/login-sky.jpg`)
- Modify: `admin/src/App.tsx`, `admin/vite.config.ts`, `admin/package.json`, `admin/.gitignore`, `admin/src/components/AdminShell.tsx`, `admin/src/components/Layout.tsx`, `admin/src/pages/Login.tsx`, `admin/src/pages/Invite.tsx`, `admin/src/pages/Profile.tsx`, `admin/src/context/LangContext.tsx`

**Interfaces:**
- Produces: `CRM_ONLY: boolean`, `PRODUCT_NAME: string`; `frames.tsx` exports `MfaRequired`, `ProtectedLayout({ pages }: { pages?: Array<() => Promise<unknown>> })`, `Needs({ feature, clients })`, `CrmFrame`; script `build:crm` → `admin/dist-crm`.

- [ ] **Step 1: Product constants** — `src/lib/product.ts`

```ts
// The CRM sold to other businesses. Name and mark live here only; the platform build never reads PRODUCT_NAME.
export const CRM_ONLY: boolean = import.meta.env?.VITE_APP_MODE === "crm";
export const PRODUCT_NAME = "CRM";
```

- [ ] **Step 2: Move the shared frames.** Create `src/components/frames.tsx` and move into it, unchanged, from `App.tsx`: `MfaRequired`, `ProtectedLayout`, `Needs`, `CrmFrame`, `usePrefetchPages`, with their imports; export the first four. Two edits: `ProtectedLayout` takes `{ pages = NONE }: { pages?: Array<() => Promise<unknown>> }` with `const NONE: Array<() => Promise<unknown>> = [];` and calls `usePrefetchPages(user?.role === "admin", pages)`; `usePrefetchPages(enabled, pages)` iterates `pages` and lists `[enabled, pages]` as dependencies. In `App.tsx`, import them, keep the `PAGES` constant there, and use `<Route element={<ProtectedLayout pages={PAGES} />}>`.

In `src/lib/routes.test.ts`, the second test finds the public routes by the literal protected route; change it to `app.indexOf("<Route element={<ProtectedLayout pages={PAGES} />}>")` and add `assert.ok(protectedAt > 0, "protected layout route not found");` below it, so a later rename fails loudly. Then run `npm run check && npm test` → pass. Commit: `git commit -am "Move the app frames out of App.tsx"` (add the new file).

- [ ] **Step 3: The CRM app** — `src/CrmApp.tsx`

```tsx
// The CRM sold to other businesses: only these pages are imported, so nothing of the agency platform ships in this build.
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { BASE } from "./lib/api";
import { ClientScopeProvider } from "./context/ClientScope";
import { CrmFrame, Needs, ProtectedLayout } from "./components/frames";
import { Login } from "./pages/Login";

const Reset = lazy(() => import("./pages/Reset").then((m) => ({ default: m.Reset })));
const Invite = lazy(() => import("./pages/Invite").then((m) => ({ default: m.Invite })));
const Profile = lazy(() => import("./pages/Profile").then((m) => ({ default: m.Profile })));
const CrmSettings = lazy(() => import("./pages/CrmSettings").then((m) => ({ default: m.CrmSettings })));
const CrmInbox = lazy(() => import("./pages/crm/CrmInbox").then((m) => ({ default: m.CrmInbox })));
const CrmPipeline = lazy(() => import("./pages/crm/pipeline/CrmPipeline").then((m) => ({ default: m.CrmPipeline })));
const CrmTasks = lazy(() => import("./pages/crm/CrmTasks").then((m) => ({ default: m.CrmTasks })));
const CrmContacts = lazy(() => import("./pages/crm/CrmContacts").then((m) => ({ default: m.CrmContacts })));
const CrmTemplates = lazy(() => import("./pages/crm/CrmTemplates").then((m) => ({ default: m.CrmTemplates })));
const CrmCampaigns = lazy(() => import("./pages/crm/CrmCampaigns").then((m) => ({ default: m.CrmCampaigns })));
const CrmConnection = lazy(() => import("./pages/crm/CrmConnection").then((m) => ({ default: m.CrmConnection })));

export function CrmApp() {
  return (
    <BrowserRouter basename={BASE}>
      <ClientScopeProvider>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/invite/:token" element={<Invite />} />
            <Route path="/reset/:token" element={<Reset />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/profile" element={<Profile />} />
              <Route element={<Needs feature="settings" />}>
                <Route path="/settings" element={<CrmSettings />} />
              </Route>
              <Route element={<Needs feature="crm" />}>
                <Route path="/crm" element={<Navigate to="/crm/inbox" replace />} />
                <Route element={<CrmFrame />}>
                  <Route path="/crm/inbox" element={<CrmInbox />} />
                  <Route path="/crm/pipeline" element={<CrmPipeline />} />
                  <Route path="/crm/tasks" element={<CrmTasks />} />
                  <Route path="/crm/contacts" element={<CrmContacts />} />
                  <Route path="/crm/templates" element={<CrmTemplates />} />
                  <Route path="/crm/broadcasts" element={<CrmCampaigns />} />
                  <Route path="/crm/connection" element={<CrmConnection />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/crm" replace />} />
          </Routes>
        </Suspense>
      </ClientScopeProvider>
    </BrowserRouter>
  );
}
```

`Needs` sends an Owner without the feature to `homePathFor` ("/"), which the catch-all turns into `/crm`.

`src/main.crm.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { CrmApp } from "./CrmApp";
import { AuthProvider } from "./context/AuthContext.tsx";
import { LangProvider } from "./context/LangContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LangProvider>
      <AuthProvider>
        <CrmApp />
      </AuthProvider>
    </LangProvider>
  </StrictMode>
);
```

`src/pages/CrmSettings.tsx`:

```tsx
// Settings of a CRM copy: only the team. Numbers live on the CRM's own Numbers tab.
import { PageHeader } from "../components/PageHeader";
import { useApi } from "../lib/api";
import { useNotify } from "../components/kit";
import { TeamSection } from "./settings/TeamSection";

export function CrmSettings() {
  const clients = useApi<{ clients: any[] }>("/admin/clients");
  const team = useApi<{ users: any[]; invites: any[] }>("/admin/users");
  const { notify, node } = useNotify();
  return (
    <div className="max-w-4xl pb-24">
      <PageHeader title="Settings" subtitle="Invite your team." />
      <TeamSection state={team} clients={clients.data?.clients ?? []} notify={notify} />
      {node}
    </div>
  );
}
```

- [ ] **Step 4: Build config.** `vite.config.ts` becomes:

```ts
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

/** The CRM copy has its own entry, name and icon; the HTML file itself stays shared. */
const crmHtml = (): Plugin => ({
  name: "crm-html",
  transformIndexHtml: {
    order: "pre",
    handler: (html) =>
      html
        .replace("/src/main.tsx", "/src/main.crm.tsx")
        .replace(/<title>.*<\/title>/, "<title>CRM</title>")
        .replace(/\s*<link rel="(apple-touch-icon|manifest)"[^>]*>/g, "")
        .replace(/<link rel="icon"[^>]*>/, '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />'),
  },
});

const crm = process.env.VITE_APP_MODE === "crm";

export default defineConfig({
  // Platform: served under musawara.id/admin (see ../wrangler.jsonc). CRM copy: at the root of its own host.
  base: crm ? "/" : "/admin/",
  publicDir: crm ? "public-crm" : "public",
  plugins: [react(), tailwindcss(), ...(crm ? [crmHtml()] : [])],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    proxy: {
      // during `vite dev`, forward API calls to `wrangler dev`
      "/api": "http://localhost:8787",
    },
  },
  build: { outDir: crm ? "dist-crm" : "dist", emptyOutDir: true },
});
```

`package.json` script: `"build:crm": "VITE_APP_MODE=crm vite build"`. Append `dist-crm/` to `admin/.gitignore`. `public-crm/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#141826"/><path d="M8 10h16v10H14l-6 5z" fill="#fff"/></svg>
```

- [ ] **Step 5: Menu, brand and language.**

`AdminShell.tsx` — import `{ CRM_ONLY, PRODUCT_NAME }`; first line of `open` inside `useNav`:

```ts
      if (CRM_ONLY && i !== SETTINGS && !i.to.startsWith("/crm")) return false;
```

and the phone logo link's label: `aria-label={CRM_ONLY ? PRODUCT_NAME : t("Overview")}`.

`Layout.tsx` — first lines of `Wordmark`:

```tsx
  if (CRM_ONLY) return <span className="whitespace-nowrap text-base font-bold text-ink">{PRODUCT_NAME}</span>;
```

`Login.tsx` — render the `login-mark` span only when `!CRM_ONLY`; the paragraph becomes `<p>{CRM_ONLY ? "Welcome back." : "Welcome to your Musawara workspace."}</p>`; wrap the whole `login-caption` paragraph in `{!CRM_ONLY && ...}`.

`Invite.tsx` — the two Musawara strings become `CRM_ONLY ? "You've been invited to the team as:" : "You've been invited to the Musawara team as:"` and `CRM_ONLY ? "You've been invited." : "You've been invited to Musawara."`.

`Profile.tsx` — `subtitle={CRM_ONLY ? "Your account." : "Your account on Musawara."}`.

`LangContext.tsx` — `initialLang(localStorage.getItem(KEY), CRM_ONLY ? "id" : navigator.language)`, and the `catch` returns `CRM_ONLY ? "id" : "en"`.

- [ ] **Step 6: Verify both builds** (in `admin/`):

```bash
npm run check && npm test && npm run build && npm run build:crm
```

```bash
ls dist-crm dist-crm/assets | grep -ciE "AdminHome|ClientDashboard|Planning|Shopee|Spend|Approvals"
```

Expected: `0`.

```bash
grep -rlE "Musafar|NurAlive" dist-crm
```

Expected: no output. If a file is listed, find the visible string in `src/` and put it behind `CRM_ONLY`.

- [ ] **Step 7: Commit** — `git add admin && git commit -m "CRM build: own web entry, menu, name and Indonesian default"`

---

### Task 5: Team and number screens in the CRM build

**Files:**
- Modify: `admin/src/pages/settings/TeamSection.tsx`, `admin/src/pages/crm/CrmConnection.tsx`, `admin/src/pages/crm/AccountSwitcher.tsx`

**Interfaces:**
- Consumes: `CRM_ONLY`; server rules from Task 2.

- [ ] **Step 1: TeamSection.** Import `CRM_ONLY`. Add below the imports:

```ts
const ROLES: readonly StaffRole[] = CRM_ONLY ? ["owner", "crm"] : STAFF_ROLES;
const hint = (r: StaffRole) => (CRM_ONLY && r === "crm" ? "WhatsApp inbox, contacts, pipeline and broadcasts." : CRM_ONLY && r === "owner" ? "Everything: team, numbers and settings." : STAFF_HINT[r]);
```

Then: map `ROLES` instead of `STAFF_ROLES` in `AccessFields`; use `hint(role)` instead of `STAFF_HINT[role]`; the client fieldset condition is `role !== "owner" && !CRM_ONLY`; initial `staffRole` is `CRM_ONLY ? "crm" : "ads"`; the edit button sets `u.staff_role ?? (CRM_ONLY ? "crm" : "ads")`; `needsClients` starts with `!CRM_ONLY &&`; hide the `Segmented label="Who"` with `{!CRM_ONLY && ...}`; the legend list is `(CRM_ONLY ? ["owner", "crm"] : ["owner", "ads", "content", "crm", "approver", "viewer"]) as AnyRole[]`; the user line is `{CRM_ONLY ? u.email : <>{u.email} · {u.role === "admin" ? reach(u.staff_role, u.client_ids, clients) : u.client_name}</>}`; the invite line hides its reach `span` when `CRM_ONLY`; `Section` gets `step={CRM_ONLY ? 1 : 4}` and `hint={CRM_ONLY ? "Owners manage the team and numbers. CRM staff work the chats." : <existing string>}`; the empty state hint is `CRM_ONLY ? "Invite your teammates." : <existing string>`.

- [ ] **Step 2: Numbers.** In `CrmConnection.tsx`: wrap the "Brand" block of the account card (the `div` holding `label htmlFor={`brand-${account.id}`}`) and the "Brand (optional)" block of `AddNumber` in `{!CRM_ONLY && ...}`; the card's subline becomes:

```tsx
            {CRM_ONLY ? (isDefault ? "Default number" : null) : [brand, isDefault ? "Default number" : null].filter(Boolean).join(" · ") || "Not linked to a brand"}
```

In `AddNumber.submit`, link a new number to the business:

```ts
      const owner = CRM_ONLY ? clients[0]?.id ?? null : client;
      await crm("/accounts", { method: "POST", body: { name: n, ...(owner !== null ? { client_id: owner } : {}) } });
```

In `AccountSwitcher.tsx`: `const brand = CRM_ONLY ? null : clientName(clients, a.client_id);` in `Text`, and in `Logo` `const brand = CRM_ONLY || a.client_id == null ? undefined : clients.find(...)`.

- [ ] **Step 3: Verify** — `npm run check && npm test && npm run build && npm run build:crm` → pass.
- [ ] **Step 4: Commit** — `git commit -am "CRM build: two-role team screen and numbers without brands"`

---

### Task 6: Local end-to-end check with made-up data

**Files:** none committed. Use a scratch directory `$S` outside the repo.

- [ ] **Step 1:** Copy `admin/wrangler.crm.example.jsonc` to `admin/wrangler.crm.local.jsonc` (delete it afterwards). Apply migrations: `npx wrangler d1 migrations apply crm-salinan-contoh --local --persist-to "$S/wr" -c wrangler.crm.local.jsonc`. Insert the business row: `npx wrangler d1 execute crm-salinan-contoh --local --persist-to "$S/wr" -c wrangler.crm.local.jsonc --command "INSERT INTO clients (id,name,slug) VALUES (1,'Toko Contoh','toko-contoh')"`.
- [ ] **Step 2:** Start a gateway with WhatsApp off: in `~/Projects/wa-crm`, `DATA_DIR="$S/gw" WA_DISABLE_CLIENTS=1 GATEWAY_TOKEN=<random> HOST=127.0.0.1 PORT=3999 node server.js`. Link its first number: `PATCH /api/accounts/1 {"name":"Nomor Utama","client_id":"1"}` with the bearer token.
- [ ] **Step 3:** `npm run build:crm`, then `npx wrangler dev -c wrangler.crm.local.jsonc --local --persist-to "$S/wr" --port 8799 --var JWT_SECRET:<random> --var ADMIN_BOOTSTRAP_TOKEN:<random, 32+> --var WA_GATEWAY_URL:http://127.0.0.1:3999 --var WA_GATEWAY_TOKEN:<same>`. Start both servers through the Browser pane's preview config; restore `.claude/launch.json` afterwards.
- [ ] **Step 4:** Bootstrap a test Owner, invite a CRM user, accept the invite. For each role at 1280px and 375px: sign in, open every CRM tab, Profile, and (Owner) Settings; confirm no agency menu or name, no horizontal scroll, no console error caused by a 404 on an agency route. Confirm `/spend` and `/clients` land on `/crm/inbox`.
- [ ] **Step 5:** Run the platform build locally once and confirm its menu is unchanged.
- [ ] **Step 6:** Delete `wrangler.crm.local.jsonc`, stop servers, `git status` clean. Report what was checked and what was not (real QR, sending and media need plan 4's trial Salinan).
