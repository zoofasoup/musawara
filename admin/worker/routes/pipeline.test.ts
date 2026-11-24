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
     (1,'owner@x.test','h','Owner','admin','owner'), (2,'crm@x.test','h','Crm','admin','crm'), (3,'ads@x.test','h','Ads','admin','ads')`
  ).run();
  await DB.prepare("INSERT INTO user_clients (user_id, client_id) VALUES (2,1),(3,1)").run();
  const env: any = { DB, JWT_SECRET: "test-secret-test-secret-test-secret-00", WA_GATEWAY_URL: "https://gw.test", WA_GATEWAY_TOKEN: "t" };
  const real = globalThis.fetch;
  // number 2 belongs to Musafar (client 1), number 3 to NurAlive (client 2); the real gateway sends client_id as text
  globalThis.fetch = (async () => Response.json([{ id: 2, client_id: "1" }, { id: 3, client_id: "2" }])) as any;
  const call = async (uid: number, method: string, path: string, body?: unknown) =>
    app.request(TEAM + "/api/pipeline" + path, {
      method,
      headers: { "content-type": "application/json", cookie: await sessionCookie(env, uid, TEAM) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, env);
  return { DB, call, done: () => { globalThis.fetch = real; } };
}
const json = async (r: Response) => (await r.json()) as any;

test("a number's pipeline starts with default stages, and only people with CRM access and that number's brand reach it", async () => {
  const { call, done } = await setup();
  try {
    const ov = await json(await call(2, "GET", "?account=2"));
    assert.deepEqual(ov.stages.map((s: any) => [s.name, s.kind]), [["New", "open"], ["Contacted", "open"], ["Interested", "open"], ["Proposal", "open"], ["Won", "won"], ["Lost", "lost"]]);
    assert.equal((await call(2, "GET", "?account=3")).status, 403, "another brand's number");
    assert.equal((await call(2, "GET", "")).status, 400, "no number picked");
    assert.equal((await call(3, "GET", "?account=2")).status, 403, "Ads has no CRM feature");
    assert.equal((await call(1, "GET", "?account=3")).status, 200, "Owner reaches every number");
    assert.notDeepEqual((await json(await call(1, "GET", "?account=3"))).stages.map((s: any) => s.id), ov.stages.map((s: any) => s.id), "each number has its own stages");
  } finally { done(); }
});

test("a contact joins the board, moves between stages with history, and the card keeps its value", async () => {
  const { call, DB, done } = await setup();
  try {
    const { stages } = await json(await call(2, "GET", "?account=2"));
    const [neu, contacted, , , won] = stages;
    assert.equal((await call(2, "PUT", "/leads/6281917403797?account=2", { value_idr: 15000000 })).status, 200);
    let lead = (await json(await call(2, "GET", "?account=2"))).leads[0];
    assert.deepEqual([lead.phone, lead.stage_id, lead.value_idr], ["6281917403797", neu.id, 15000000], "new cards start in the first stage");
    await call(2, "PUT", "/leads/6281917403797?account=2", { stage_id: contacted.id });
    await call(2, "PUT", "/leads/6281917403797?account=2", { stage_id: won.id, expected_close: "2026-12-20" });
    lead = (await json(await call(2, "GET", "?account=2"))).leads[0];
    assert.deepEqual([lead.stage_id, lead.value_idr, lead.expected_close], [won.id, 15000000, "2026-12-20"], "moving keeps the value");
    const hist = (await json(await call(2, "GET", "/leads/6281917403797/history?account=2"))).events;
    assert.deepEqual(hist.map((e: any) => [e.from_name, e.to_name]), [["Contacted", "Won"], ["New", "Contacted"], [null, "New"]]);
    assert.equal(hist[0].user_name, "Crm");
    await call(2, "PUT", "/leads/6281917403797?account=2", { stage_id: won.id });
    assert.equal((await DB.prepare("SELECT COUNT(*) n FROM crm_stage_events").first<any>())!.n, 3, "saving the same stage is not a move");
    assert.equal((await call(2, "PUT", "/leads/6281917403797?account=2", { stage_id: 99999 })).status, 404);
    assert.equal((await call(2, "PUT", "/leads/abc?account=2", {})).status, 400);
    assert.equal((await call(2, "PUT", "/leads/6281917403797?account=2", { value_idr: -5 })).status, 400);
    assert.equal((await call(2, "PUT", "/leads/6281917403797?account=2", { expected_close: "soon" })).status, 400);
    // a stage of another number cannot be used
    const other = (await json(await call(1, "GET", "?account=3"))).stages[0];
    assert.equal((await call(2, "PUT", "/leads/6281917403797?account=2", { stage_id: other.id })).status, 404);
    assert.equal((await call(2, "DELETE", "/leads/6281917403797?account=2")).status, 200);
    assert.equal((await json(await call(2, "GET", "?account=2"))).leads.length, 0);
  } finally { done(); }
});

test("stages: add, rename, reorder, and a stage with cards cannot be deleted without somewhere to move them", async () => {
  const { call, done } = await setup();
  try {
    const first = await json(await call(2, "POST", "/stages?account=2", { name: "Visa", color: "blue" }));
    assert.equal(first.stage.position, 6);
    assert.equal((await call(2, "POST", "/stages?account=2", { name: "Visa" })).status, 409, "names are unique per number");
    assert.equal((await call(2, "POST", "/stages?account=2", { name: "X", color: "#ff0000" })).status, 201, "an unknown colour falls back to neutral, never raw CSS");
    assert.equal((await call(2, "PATCH", `/stages/${first.stage.id}?account=2`, { color: "javascript:alert(1)" })).status, 400);
    assert.equal((await call(2, "PATCH", `/stages/${first.stage.id}?account=2`, { name: "Visa ready" })).status, 200);
    const { stages } = await json(await call(2, "GET", "?account=2"));
    const ids = stages.map((s: any) => s.id).reverse();
    assert.equal((await call(2, "POST", "/stages/reorder?account=2", { ids: ids.slice(1) })).status, 400, "every stage exactly once");
    assert.equal((await call(2, "POST", "/stages/reorder?account=2", { ids })).status, 200);
    assert.deepEqual((await json(await call(2, "GET", "?account=2"))).stages.map((s: any) => s.id), ids);
    await call(2, "PUT", "/leads/6281000000001?account=2", { stage_id: first.stage.id });
    const refused = await call(2, "DELETE", `/stages/${first.stage.id}?account=2`);
    assert.equal(refused.status, 409);
    assert.equal((await json(refused)).cards, 1);
    assert.equal((await call(2, "DELETE", `/stages/${first.stage.id}?account=2&move_to=${ids[0]}`)).status, 200);
    assert.equal((await json(await call(2, "GET", "?account=2"))).leads[0].stage_id, ids[0], "the card moved with it");
    assert.equal((await call(2, "PATCH", `/stages/${ids[0]}?account=3`, { name: "hijack" })).status, 403);
  } finally { done(); }
});

test("custom fields: typed values are checked, choice values must be an option, removing a field removes its values", async () => {
  const { call, done } = await setup();
  try {
    const f = async (body: unknown) => json(await call(2, "POST", "/fields?account=2", body));
    const budget = (await f({ label: "Budget", type: "number" })).field;
    const month = (await f({ label: "Departure", type: "date" })).field;
    const pkg = (await f({ label: "Package", type: "select", options: ["Reguler", "VIP", "Reguler"] })).field;
    const vip = (await f({ label: "Visited office", type: "checkbox" })).field;
    assert.deepEqual(pkg.options, ["Reguler", "VIP"]);
    assert.equal((await call(2, "POST", "/fields?account=2", { label: "Budget", type: "text" })).status, 409);
    assert.equal((await call(2, "POST", "/fields?account=2", { label: "Z", type: "select" })).status, 400, "a choice field needs options");
    assert.equal((await call(2, "POST", "/fields?account=2", { label: "Z", type: "formula" })).status, 400);
    const put = (values: unknown) => call(2, "PUT", "/values/6281917403797?account=2", { values });
    assert.equal((await put({ [budget.id]: "25000000", [month.id]: "2027-01-10", [pkg.id]: "VIP", [vip.id]: true })).status, 200);
    assert.equal((await put({ [budget.id]: "lots" })).status, 400);
    assert.equal((await put({ [month.id]: "next year" })).status, 400);
    assert.equal((await put({ [pkg.id]: "Platinum" })).status, 400);
    assert.equal((await put({ 99999: "x" })).status, 400);
    const got = (await json(await call(2, "GET", "/values?account=2"))).values["6281917403797"];
    assert.deepEqual(got, { [budget.id]: "25000000", [month.id]: "2027-01-10", [pkg.id]: "VIP", [vip.id]: "1" });
    assert.equal((await put({ [budget.id]: null, [vip.id]: false })).status, 200, "empty clears");
    assert.deepEqual((await json(await call(2, "GET", "/values?account=2"))).values["6281917403797"], { [month.id]: "2027-01-10", [pkg.id]: "VIP" });
    assert.equal((await call(2, "PATCH", `/fields/${pkg.id}?account=2`, { options: ["Reguler", "VIP", "Plus"] })).status, 200);
    assert.equal((await call(2, "PATCH", `/fields/${budget.id}?account=2`, { options: ["a"] })).status, 400, "only choice fields have options");
    assert.equal((await call(2, "DELETE", `/fields/${month.id}?account=2`)).status, 200);
    assert.deepEqual((await json(await call(2, "GET", "/values?account=2"))).values["6281917403797"], { [pkg.id]: "VIP" });
    // another brand's number cannot read or write them
    assert.equal((await call(2, "GET", "/values?account=3")).status, 403);
  } finally { done(); }
});

test("report: cards now, cards that ever reached a stage, wins, losses and win rate", async () => {
  const { call, done } = await setup();
  try {
    const { stages } = await json(await call(2, "GET", "?account=2"));
    const byName = (n: string) => stages.find((s: any) => s.name === n).id;
    const put = (phone: string, stage: number, value?: number) => call(2, "PUT", `/leads/${phone}?account=2`, { stage_id: stage, ...(value ? { value_idr: value } : {}) });
    await put("6281000000001", byName("New"), 1_000_000);
    await put("6281000000002", byName("New")); await put("6281000000002", byName("Interested"), 5_000_000);
    await put("6281000000003", byName("Interested")); await put("6281000000003", byName("Won"), 20_000_000);
    await put("6281000000004", byName("Interested")); await put("6281000000004", byName("Lost"));
    const r = await json(await call(2, "GET", "/report?account=2"));
    const row = (n: string) => r.stages.find((s: any) => s.name === n);
    assert.deepEqual([row("New").current, row("New").reached], [1, 2], "two cards started in New, one is still there");
    assert.deepEqual([row("Interested").current, row("Interested").reached], [1, 3]);
    assert.deepEqual([row("Won").current, row("Won").reached], [1, 1]);
    assert.deepEqual(r.open, { count: 2, value: 6_000_000 });
    assert.equal(r.won.count, 1);
    assert.equal(r.won.value, 20_000_000);
    assert.equal(r.won.this_month_value, 20_000_000);
    assert.equal(r.lost.count, 1);
    assert.equal(r.win_rate, 50);
    assert.equal((await call(2, "GET", "/report?account=3")).status, 403);
  } finally { done(); }
});

test("import: stage, value, date, owner and field columns land on the board and in the fields; bad cells are reported, not guessed", async () => {
  const { call, done } = await setup();
  try {
    const f = async (body: unknown) => json(await call(2, "POST", "/fields?account=2", body));
    const pkg = (await f({ label: "Package", type: "select", options: ["Reguler", "VIP"] })).field;
    const budget = (await f({ label: "Budget", type: "number" })).field;
    const imp = (rows: unknown[]) => call(2, "POST", "/import?account=2", { rows });
    const r = await json(await imp([
      { phone: "6281000000001", stage: "interested", value_idr: 28000000, expected_close: "2026-12-20", owner: "CRM", fields: { package: "VIP", BUDGET: "25000000" } },
      { phone: "6281000000002", fields: { Package: "Reguler" } },
      { phone: "6281000000003", stage: "Nonexistent" },
      { phone: "6281000000004", stage: "New", expected_close: "20/12/2026", owner: "Stranger", fields: { Package: "Platinum", Budget: "lots", Unknown: "x" } },
      { phone: "abc", stage: "New" },
    ]));
    assert.deepEqual([r.cards, r.values], [2, 3]);
    const msgs = r.errors.map((e: any) => `${e.phone}: ${e.message}`);
    assert.ok(msgs.some((m: string) => m.startsWith("6281000000003: Unknown stage")), msgs.join("\n"));
    assert.ok(msgs.some((m: string) => m.includes("closing date must be YYYY-MM-DD")));
    assert.ok(msgs.some((m: string) => m.includes('"Stranger" cannot own')));
    assert.ok(msgs.some((m: string) => m.includes("Package: Pick one of the options")));
    assert.ok(msgs.some((m: string) => m.includes("Budget: Enter a number")));
    assert.ok(msgs.some((m: string) => m.startsWith("abc: Invalid phone")));
    const ov = await json(await call(2, "GET", "?account=2"));
    const byPhone = Object.fromEntries(ov.leads.map((l: any) => [l.phone, l]));
    assert.deepEqual(Object.keys(byPhone).sort(), ["6281000000001", "6281000000004"], "only rows with pipeline data (and a valid stage) become cards; the unknown-stage row is skipped");
    const a = byPhone["6281000000001"];
    assert.deepEqual([ov.stages.find((s: any) => s.id === a.stage_id).name, a.value_idr, a.expected_close, a.owner_user_id], ["Interested", 28000000, "2026-12-20", 2]);
    const vals = (await json(await call(2, "GET", "/values?account=2"))).values;
    assert.deepEqual(vals["6281000000001"], { [pkg.id]: "VIP", [budget.id]: "25000000" });
    assert.deepEqual(vals["6281000000002"], { [pkg.id]: "Reguler" });
    // an empty cell never erases what is saved
    await imp([{ phone: "6281000000001", fields: { Package: "" } }]);
    assert.equal((await json(await call(2, "GET", "/values?account=2"))).values["6281000000001"][pkg.id], "VIP");
    assert.equal((await imp([])).status, 400);
    assert.equal((await imp(Array.from({ length: 101 }, () => ({ phone: "6281000000009" })))).status, 400);
    assert.equal((await call(2, "POST", "/import?account=3", { rows: [{ phone: "6281000000001" }] })).status, 403);
  } finally { done(); }
});
