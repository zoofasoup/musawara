import test from "node:test";
import assert from "node:assert/strict";
import { makeDb } from "../testkit/d1.ts";
import { sessionCookie } from "../testkit/session.ts";
import { app } from "../index.ts";

const TEAM = "https://app.musawara.id";

test("an ad id resolves to our ad, ad set and campaign names and picture, only inside the number's own brand", async () => {
  const DB = makeDb();
  await DB.prepare("INSERT INTO clients (id,name,slug) VALUES (1,'Musafar','m'),(2,'NurAlive','n')").run();
  await DB.prepare("INSERT INTO users (id,email,password_hash,name,role,staff_role) VALUES (1,'owner@x.test','h','Owner','admin','owner'),(2,'crm@x.test','h','Crm','admin','crm')").run();
  await DB.prepare("INSERT INTO user_clients (user_id, client_id) VALUES (2,1)").run();
  await DB.prepare("INSERT INTO ad_accounts (id,client_id,meta_account_id) VALUES (1,1,'act_1'),(2,2,'act_2')").run();
  await DB.prepare(
    `INSERT INTO entities (ad_account_id,level,entity_id,name,parent_id,effective_status,thumbnail_url) VALUES
     (1,'campaign','900001','Umroh Desember',NULL,'ACTIVE',NULL), (1,'adset','800001','Jakarta 30-55','900001','ACTIVE',NULL),
     (1,'ad','700001','Video jamaah','800001','ACTIVE','https://cdn/a.jpg'), (2,'ad','700002','Padel teaser',NULL,'ACTIVE',NULL)`
  ).run();
  const env: any = { DB, JWT_SECRET: "test-secret-test-secret-test-secret-00", WA_GATEWAY_URL: "https://gw.test", WA_GATEWAY_TOKEN: "t" };
  const real = globalThis.fetch;
  globalThis.fetch = (async () => Response.json([{ id: 2, client_id: "1" }, { id: 3, client_id: "2" }])) as any;
  const get = async (uid: number, q: string) => app.request(`${TEAM}/api/crm-ads?${q}`, { headers: { cookie: await sessionCookie(env, uid, TEAM) } }, env);
  try {
    const hit: any = await (await get(2, "account=2&id=700001")).json();
    assert.deepEqual(hit, { found: true, ad: "Video jamaah", status: "ACTIVE", thumbnail_url: "https://cdn/a.jpg", adset: "Jakarta 30-55", campaign: "Umroh Desember" });
    assert.deepEqual(await (await get(2, "account=2&id=700002")).json(), { found: false }, "another brand's ad is not revealed");
    assert.deepEqual(await (await get(2, "account=2&id=123456")).json(), { found: false });
    assert.equal((await get(2, "account=2&id=abc")).status, 400);
    assert.equal((await get(2, "account=3&id=700002")).status, 403, "a number of another brand");
    assert.equal(((await (await get(1, "account=3&id=700002")).json()) as any).ad, "Padel teaser", "Owner, number of that brand");
  } finally { globalThis.fetch = real; }
});
