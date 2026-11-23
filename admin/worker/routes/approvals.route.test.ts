// Route-level tests against a real SQLite database (node:sqlite) holding the real migrations,
// behind a small D1 shim. Covers tenant isolation, status transitions and history.
import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { sign } from "hono/jwt";
import { app } from "../index";

function d1(db: DatabaseSync) {
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    run: async () => {
      const r = db.prepare(sql).run(...(args as any[]));
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    all: async () => ({ results: db.prepare(sql).all(...(args as any[])) as any[], success: true, meta: {} }),
    first: async () => (db.prepare(sql).get(...(args as any[])) as any) ?? null,
  });
  return {
    prepare: (sql: string) => stmt(sql),
    batch: async (stmts: any[]) => {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

const SECRET = "test-secret";
let db: DatabaseSync;
let env: any;

async function cookie(u: { id: number; role: "admin" | "client"; client_id: number | null; name?: string }) {
  const token = await sign({ sub: u.id, email: `u${u.id}@x.test`, name: u.name ?? `User ${u.id}`, role: u.role, client_id: u.client_id, mfa_version: 1, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET, "HS256");
  return `ma_session=${token}`;
}
const ADMIN = { id: 1, role: "admin" as const, client_id: null };
const CLIENT_A = { id: 2, role: "client" as const, client_id: 1 };
const CLIENT_B = { id: 3, role: "client" as const, client_id: 2 };

async function call(user: Parameters<typeof cookie>[0] | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { ...headers };
  if (user) h.Cookie = await cookie(user);
  if (body !== undefined) h["Content-Type"] = "application/json";
  const res = await app.request("/api/approvals" + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }, env);
  return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
}

const URL1 = "https://drive.google.com/file/d/one/view";

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(f, dir), "utf8"));
  db.exec(`INSERT INTO clients (id,name,slug,share_token,share_enabled) VALUES (1,'Alpha','alpha','tok-a',1),(2,'Beta','beta','tok-b',1);
           INSERT INTO users (id,email,password_hash,name,role,client_id) VALUES
             (1,'a@x.test','x','Admin','admin',NULL),(2,'ca@x.test','x','Client A','client',1),(3,'cb@x.test','x','Client B','client',2);
           INSERT INTO posts (id,client_id,kind,caption) VALUES (10,1,'feed','hi'),(20,2,'feed','other');`);
  db.exec("INSERT INTO staff_mfa (user_id, secret_enc, confirmed, version) SELECT id, 'test', 1, 1 FROM users WHERE role='admin'");
  env = { DB: d1(db), JWT_SECRET: SECRET, APP_NAME: "t" };
});

async function seedRequest(clientId = 1, user = ADMIN) {
  const a = await call(user, "POST", `/${clientId}/assets`, { title: "Teaser", kind: "video", drive_url: URL1, tags: "reel" });
  expect(a.status).toBe(201);
  const r = await call(user, "POST", `/${clientId}/requests`, { title: "Teaser v1", message: "Please review", asset_ids: [a.json.id] });
  expect(r.status).toBe(201);
  return { assetId: a.json.id as number, requestId: r.json.id as number };
}

describe("asset library", () => {
  it("rejects non-Drive links at the API and stores valid ones", async () => {
    for (const bad of ["https://evil.com/x", "http://drive.google.com/x", "https://drive.google.com.evil.com/x", "javascript:alert(1)"]) {
      const r = await call(ADMIN, "POST", "/1/assets", { title: "x", drive_url: bad });
      expect(r.status).toBe(400);
      const u = await call(ADMIN, "PUT", "/1/assets/1", { title: "x", drive_url: bad });
      expect(u.status).toBe(400);
    }
    expect((await call(ADMIN, "POST", "/1/assets", { title: "ok", kind: "doc", drive_url: "https://docs.google.com/document/d/1/edit" })).status).toBe(201);
  });

  it("searches by text and filters by tag and type, scoped to the client", async () => {
    await call(ADMIN, "POST", "/1/assets", { title: "Padel teaser", kind: "video", drive_url: URL1, tags: "reel, padel" });
    await call(ADMIN, "POST", "/1/assets", { title: "Poster", kind: "image", drive_url: URL1, tags: "print" });
    await call(ADMIN, "POST", "/2/assets", { title: "Padel other brand", kind: "video", drive_url: URL1, tags: "padel" });
    const all = await call(ADMIN, "GET", "/1/assets");
    expect(all.json.assets.map((a: any) => a.title).sort()).toEqual(["Padel teaser", "Poster"]);
    expect((await call(ADMIN, "GET", "/1/assets?q=padel")).json.assets).toHaveLength(1);
    expect((await call(ADMIN, "GET", "/1/assets?tag=print")).json.assets[0].title).toBe("Poster");
    expect((await call(ADMIN, "GET", "/1/assets?tag=ree")).json.assets).toHaveLength(0);
    expect((await call(ADMIN, "GET", "/1/assets?kind=image")).json.assets).toHaveLength(1);
    expect((await call(ADMIN, "GET", "/1/assets?q=%25")).json.assets).toHaveLength(0);
  });

  it("edit, delete, and delete is refused while the asset is in a request", async () => {
    const { assetId } = await seedRequest();
    expect((await call(ADMIN, "DELETE", `/1/assets/${assetId}`)).status).toBe(409);
    const other = (await call(ADMIN, "POST", "/1/assets", { title: "Temp", drive_url: URL1 })).json.id;
    expect((await call(ADMIN, "PUT", `/1/assets/${other}`, { title: "Renamed", drive_url: URL1 })).status).toBe(200);
    expect((await call(ADMIN, "DELETE", `/1/assets/${other}`)).status).toBe(200);
    expect((await call(ADMIN, "DELETE", `/1/assets/${other}`)).status).toBe(404);
  });

  it("is team only", async () => {
    expect((await call(CLIENT_A, "GET", "/1/assets")).status).toBe(403);
    expect((await call(CLIENT_A, "POST", "/1/assets", { title: "x", drive_url: URL1 })).status).toBe(403);
    expect((await call(null, "GET", "/1/assets")).status).toBe(401);
    expect((await call(null, "GET", "/1/assets", undefined, { "X-Share-Token": "tok-a" })).status).toBe(403);
  });
});

describe("tenant isolation", () => {
  it("a client user cannot reach another client's rows", async () => {
    const { requestId } = await seedRequest(1);
    const other = await seedRequest(2);
    // own list shows only own rows
    const own = await call(CLIENT_A, "GET", "/1/requests");
    expect(own.json.requests.map((r: any) => r.id)).toEqual([requestId]);
    // path of another client: blocked by clientAccess
    expect((await call(CLIENT_A, "GET", "/2/requests")).status).toBe(403);
    expect((await call(CLIENT_A, "GET", `/2/requests/${other.requestId}`)).status).toBe(403);
    expect((await call(CLIENT_A, "POST", `/2/requests/${other.requestId}/decision`, { decision: "approved" })).status).toBe(403);
    // own path but another client's request id: not found, nothing changes
    expect((await call(CLIENT_A, "GET", `/1/requests/${other.requestId}`)).status).toBe(404);
    expect((await call(CLIENT_A, "POST", `/1/requests/${other.requestId}/decision`, { decision: "approved" })).status).toBe(404);
    expect(db.prepare("SELECT status FROM approval_requests WHERE id=?").get(other.requestId)).toEqual({ status: "pending" });
  });

  it("a client_id in the body is ignored", async () => {
    const { requestId } = await seedRequest(1);
    const r = await call(CLIENT_B, "POST", `/2/requests/${requestId}/decision`, { decision: "approved", client_id: 1 });
    expect(r.status).toBe(404);
    expect(db.prepare("SELECT status FROM approval_requests WHERE id=?").get(requestId)).toEqual({ status: "pending" });
    const c = await call(ADMIN, "POST", "/1/requests", { title: "t", asset_ids: [999], client_id: 2 });
    expect(c.status).toBe(400); // unknown asset; client_id in the body never moves the row
  });

  it("assets and posts of another client cannot be attached", async () => {
    const b = await call(ADMIN, "POST", "/2/assets", { title: "B asset", drive_url: URL1 });
    expect((await call(ADMIN, "POST", "/1/requests", { title: "x", asset_ids: [b.json.id] })).status).toBe(400);
    const a = await call(ADMIN, "POST", "/1/assets", { title: "A asset", drive_url: URL1 });
    expect((await call(ADMIN, "POST", "/1/requests", { title: "x", asset_ids: [a.json.id], post_id: 20 })).status).toBe(400);
    expect((await call(ADMIN, "POST", "/1/requests", { title: "x", asset_ids: [a.json.id], post_id: 10 })).status).toBe(201);
    expect((await call(ADMIN, "PUT", `/2/assets/${a.json.id}`, { title: "hijack", drive_url: URL1 })).status).toBe(404);
    expect((await call(ADMIN, "DELETE", `/2/assets/${a.json.id}`)).status).toBe(404);
  });

  it("share links and anonymous callers get nothing", async () => {
    const { requestId } = await seedRequest(1);
    expect((await call(null, "GET", "/1/requests", undefined, { "X-Share-Token": "tok-a" })).status).toBe(403);
    expect((await call(null, "POST", `/1/requests/${requestId}/decision`, { decision: "approved" }, { "X-Share-Token": "tok-a" })).status).toBe(403);
    expect((await call(null, "GET", "/1/requests")).status).toBe(401);
    expect((await call(null, "GET", "")).status).toBe(401);
    expect((await call(CLIENT_A, "GET", "")).status).toBe(403);
  });

  it("only the team can create or resubmit, and the team lists all clients", async () => {
    const { assetId, requestId } = await seedRequest(1);
    await seedRequest(2);
    expect((await call(CLIENT_A, "POST", "/1/requests", { title: "x", asset_ids: [assetId] })).status).toBe(403);
    expect((await call(CLIENT_A, "POST", `/1/requests/${requestId}/resubmit`, {})).status).toBe(403);
    const all = await call(ADMIN, "GET", "");
    expect(all.json.requests).toHaveLength(2);
    expect(all.json.requests.map((r: any) => r.client_name).sort()).toEqual(["Alpha", "Beta"]);
    expect((await call(ADMIN, "GET", "?status=approved")).json.requests).toHaveLength(0);
    expect((await call(ADMIN, "GET", "?status=bogus")).status).toBe(400);
  });
});

describe("status transitions and history", () => {
  it("approve once; a second approval or a later change request is refused", async () => {
    const { requestId } = await seedRequest();
    const ok = await call(CLIENT_A, "POST", `/1/requests/${requestId}/decision`, { decision: "approved", comment: "Looks great" });
    expect(ok.status).toBe(200);
    expect(ok.json.status).toBe("approved");
    expect((await call(CLIENT_A, "POST", `/1/requests/${requestId}/decision`, { decision: "approved" })).status).toBe(409);
    expect((await call(CLIENT_A, "POST", `/1/requests/${requestId}/decision`, { decision: "changes_requested", comment: "wait" })).status).toBe(409);
    expect((await call(ADMIN, "POST", `/1/requests/${requestId}/resubmit`, {})).status).toBe(409);
    const hist = db.prepare("SELECT action, actor_name, comment FROM approval_history WHERE request_id=? ORDER BY id").all(requestId);
    expect(hist).toEqual([
      { action: "submitted", actor_name: "Admin", comment: "Please review" },
      { action: "approved", actor_name: "Client A", comment: "Looks great" },
    ]);
  });

  it("the team cannot approve on the client's behalf", async () => {
    const { requestId } = await seedRequest();
    expect((await call(ADMIN, "POST", `/1/requests/${requestId}/decision`, { decision: "approved" })).status).toBe(403);
  });

  it("changes need a comment, resubmit bumps the version and keeps history", async () => {
    const { requestId, assetId } = await seedRequest();
    expect((await call(CLIENT_A, "POST", `/1/requests/${requestId}/decision`, { decision: "changes_requested" })).status).toBe(400);
    expect((await call(CLIENT_A, "POST", `/1/requests/${requestId}/decision`, { decision: "dunno" })).status).toBe(400);
    expect((await call(ADMIN, "POST", `/1/requests/${requestId}/resubmit`, {})).status).toBe(409); // still pending
    expect((await call(CLIENT_A, "POST", `/1/requests/${requestId}/decision`, { decision: "changes_requested", comment: "Bigger logo" })).status).toBe(200);
    expect((await call(CLIENT_A, "POST", `/1/requests/${requestId}/decision`, { decision: "approved" })).status).toBe(409);

    const second = (await call(ADMIN, "POST", "/1/assets", { title: "Teaser v2", kind: "video", drive_url: "https://drive.google.com/file/d/two/view" })).json.id;
    const re = await call(ADMIN, "POST", `/1/requests/${requestId}/resubmit`, { message: "Logo is bigger now", asset_ids: [assetId, second] });
    expect(re.status).toBe(200);
    expect(re.json.version).toBe(2);
    expect((await call(ADMIN, "POST", `/1/requests/${requestId}/resubmit`, {})).status).toBe(409); // no double resubmit

    expect((await call(CLIENT_A, "POST", `/1/requests/${requestId}/decision`, { decision: "approved" })).status).toBe(200);
    const detail = (await call(CLIENT_A, "GET", `/1/requests/${requestId}`)).json.request;
    expect(detail.status).toBe("approved");
    expect(detail.version).toBe(2);
    expect(detail.assets.map((a: any) => a.title)).toEqual(["Teaser", "Teaser v2"]);
    expect(detail.history.map((h: any) => `${h.version}:${h.action}`)).toEqual(["1:submitted", "1:changes_requested", "2:resubmitted", "2:approved"]);
    expect(detail.history[1].comment).toBe("Bigger logo");
  });

  it("client lists show pending first and honour the status filter", async () => {
    const one = await seedRequest();
    const two = await seedRequest();
    await call(CLIENT_A, "POST", `/1/requests/${one.requestId}/decision`, { decision: "approved" });
    const list = await call(CLIENT_A, "GET", "/1/requests");
    expect(list.json.requests.map((r: any) => r.id)).toEqual([two.requestId, one.requestId]);
    expect((await call(CLIENT_A, "GET", "/1/requests?status=pending")).json.requests).toHaveLength(1);
    expect((await call(CLIENT_A, "GET", "/1/requests?status=nope")).status).toBe(400);
  });

  it("creation validates input", async () => {
    expect((await call(ADMIN, "POST", "/1/requests", { title: "", asset_ids: [1] })).status).toBe(400);
    expect((await call(ADMIN, "POST", "/1/requests", { title: "x", asset_ids: [] })).status).toBe(400);
    expect((await call(ADMIN, "POST", "/1/requests", { title: "x" })).status).toBe(400);
  });
});
