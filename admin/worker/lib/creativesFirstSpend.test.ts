import test from "node:test";
import assert from "node:assert/strict";
import { makeDb } from "../testkit/d1.ts";
import { clientCreatives } from "./metrics.ts";

test("first_date is the first day an ad ever spent, even when the chosen range starts later", async () => {
  const DB = makeDb();
  await DB.prepare("INSERT INTO clients (id,name,slug) VALUES (1,'A','a')").run();
  await DB.prepare("INSERT INTO ad_accounts (id,client_id,meta_account_id,account_name) VALUES (1,1,'act_1','A')").run();
  const row = (id: string, date: string, spend: number) =>
    DB.prepare("INSERT INTO insights_daily (ad_account_id,level,entity_id,entity_name,date,spend,impressions) VALUES (1,'ad',?,?,?,?,100)").bind(id, id, date, spend).run();
  await row("old", "2026-10-01", 5000); await row("old", "2026-11-20", 5000);
  await row("new", "2026-11-19", 3000); await row("new", "2026-11-20", 3000);
  await row("zero", "2026-11-01", 0); await row("zero", "2026-11-20", 2000);
  const ads = await clientCreatives({ DB } as any, 1, "2026-11-15", "2026-11-21");
  const first = Object.fromEntries(ads.map((a: any) => [a.entity_id, a.first_date]));
  assert.deepEqual(first, { old: "2026-10-01", new: "2026-11-19", zero: "2026-11-20" });
});
