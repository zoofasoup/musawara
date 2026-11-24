import test from "node:test";
import assert from "node:assert/strict";
import { makeDb } from "../testkit/d1.ts";
import { sessionCookie } from "../testkit/session.ts";
import { app } from "../index.ts";

const TEAM = "https://app.musawara.id";

async function setup() {
  const DB = makeDb();
  await DB.prepare("INSERT INTO clients (id,name,slug) VALUES (1,'Musafar','m'),(2,'NurAlive','n')").run();
  await DB.prepare(
    `INSERT INTO users (id,email,password_hash,name,role,staff_role) VALUES
     (1,'owner@x.test','h','Olivia Owner','admin','owner'), (2,'crm@x.test','h','Cris Crm','admin','crm'), (3,'other@x.test','h','Other Crm','admin','crm'), (4,'ads@x.test','h','Ads','admin','ads')`
  ).run();
  await DB.prepare("INSERT INTO user_clients (user_id, client_id) VALUES (2,1),(3,2),(4,1)").run();
  const env: any = { DB, JWT_SECRET: "test-secret-test-secret-test-secret-00", WA_GATEWAY_URL: "https://gw.test", WA_GATEWAY_TOKEN: "t" };
  const real = globalThis.fetch;
  globalThis.fetch = (async () => Response.json([{ id: 2, client_id: "1" }, { id: 3, client_id: "2" }])) as any;
  const call = async (uid: number, method: string, path: string, body?: unknown, base = "/api/crm-tasks") =>
    app.request(TEAM + base + path, { method, headers: { "content-type": "application/json", cookie: await sessionCookie(env, uid, TEAM) }, body: body === undefined ? undefined : JSON.stringify(body) }, env);
  return { DB, call, done: () => { globalThis.fetch = real; } };
}
const json = async (r: Response) => (await r.json()) as any;
const P = "6281917403797";

test("tasks: add with a due date, group by today, finish, reopen, delete; only the right people and numbers", async () => {
  const { call, done } = await setup();
  try {
    const list = await json(await call(2, "GET", "?account=2"));
    const t0 = list.today;
    assert.match(t0, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(list.owners.map((o: any) => o.name), ["Cris Crm", "Olivia Owner"], "Owners and CRM members of this number's brand; not another brand's CRM member, not Ads");
    const day = (n: number) => new Date(Date.parse(t0) + n * 86_400_000).toISOString().slice(0, 10);
    for (const [title, due] of [["Call about visa", day(-2)], ["Send quote", t0], ["Check passport", day(5)], ["No date", null]] as const) {
      assert.equal((await call(2, "POST", "?account=2", { phone: P, title, due_date: due })).status, 201);
    }
    const open = (await json(await call(2, "GET", "?account=2"))).tasks;
    assert.deepEqual(open.map((t: any) => t.title), ["Call about visa", "Send quote", "Check passport", "No date"], "by due date, undated last");
    assert.equal(open[0].assignee_name, "Cris Crm", "a new task defaults to its author");
    const sum = await json(await call(2, "GET", "/summary?account=2"));
    assert.deepEqual([sum.overdue, sum.due_today], [1, 1]);
    assert.equal((await call(2, "PATCH", `/${open[0].id}?account=2`, { done: true })).status, 200);
    assert.equal((await json(await call(2, "GET", "/summary?account=2"))).overdue, 0);
    assert.deepEqual((await json(await call(2, "GET", "?account=2&scope=done"))).tasks.map((t: any) => t.title), ["Call about visa"]);
    assert.equal((await call(2, "PATCH", `/${open[0].id}?account=2`, { done: false })).status, 200);
    assert.equal((await call(2, "PATCH", `/${open[1].id}?account=2`, { due_date: day(1), title: "Send the quote" })).status, 200);
    assert.equal((await call(2, "PATCH", `/${open[1].id}?account=2`, { due_date: "tomorrow" })).status, 400);
    assert.equal((await call(2, "PATCH", `/${open[1].id}?account=2`, { assignee_user_id: 3 })).status, 400, "another brand's CRM member cannot be assigned");
    assert.equal((await call(2, "PATCH", `/${open[1].id}?account=2`, { assignee_user_id: 1 })).status, 200);
    assert.equal((await json(await call(2, "GET", `?account=2&mine=1`))).tasks.some((t: any) => t.id === open[1].id), false, "reassigned away from me");
    assert.equal((await call(2, "POST", "?account=2", { phone: P, title: "" })).status, 400);
    assert.equal((await call(2, "POST", "?account=2", { phone: "abc", title: "x" })).status, 400);
    assert.equal((await call(2, "DELETE", `/${open[3].id}?account=2`)).status, 200);
    // access: another brand's number, and a role without CRM
    assert.equal((await call(2, "GET", "?account=3")).status, 403);
    assert.equal((await call(4, "GET", "?account=2")).status, 403);
    assert.equal((await call(2, "PATCH", `/${open[0].id}?account=3`, { done: true })).status, 403);
    assert.equal((await call(1, "PATCH", `/${open[0].id}?account=3`, { done: true })).status, 404, "a task belongs to its number only");
  } finally { done(); }
});

test("notes and timeline: notes, stage moves and tasks appear together, newest first; only the author or an Owner removes a note", async () => {
  const { call, done } = await setup();
  try {
    const stages = (await json(await call(2, "GET", "?account=2", undefined, "/api/pipeline"))).stages;
    await call(2, "PUT", `/leads/${P}?account=2`, { stage_id: stages[0].id }, "/api/pipeline");
    await call(2, "PUT", `/leads/${P}?account=2`, { stage_id: stages[1].id, owner_user_id: 2 }, "/api/pipeline");
    const note = await json(await call(2, "POST", "/notes?account=2", { phone: P, body: "Wants VIP room, family of 4" }));
    await call(2, "POST", "?account=2", { phone: P, title: "Send itinerary" });
    const tl = (await json(await call(2, "GET", `/timeline/${P}?account=2`))).items;
    assert.deepEqual(tl.map((i: any) => i.kind).sort(), ["note", "stage", "stage", "task"]);
    assert.equal(tl.find((i: any) => i.kind === "note").user_name, "Cris Crm");
    assert.ok(tl.some((i: any) => i.text === "New → Contacted"));
    assert.equal((await call(2, "POST", "/notes?account=2", { phone: P, body: "  " })).status, 400);
    assert.equal((await call(2, "POST", "/notes?account=2", { phone: P, body: "x".repeat(2001) })).status, 400);
    // an Owner can remove any note; the author can remove their own
    assert.equal((await call(1, "DELETE", `/notes/${note.id}?account=2`)).status, 200, "an Owner");
    const again = await json(await call(2, "POST", "/notes?account=2", { phone: P, body: "second" }));
    assert.equal((await call(2, "DELETE", `/notes/${again.id}?account=2`)).status, 200, "the author");
    // the lead owner is checked against who may own on this number
    assert.equal((await call(2, "PUT", `/leads/${P}?account=2`, { owner_user_id: 3 }, "/api/pipeline")).status, 400);
    assert.equal((await json(await call(2, "GET", "?account=2", undefined, "/api/pipeline"))).leads[0].owner_user_id, 2);
  } finally { done(); }
});
