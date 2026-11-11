import test from "node:test";
import assert from "node:assert/strict";
import { sheetsToSales, sheetTriggerReady, tokenMatches, triggerSheetSync } from "./sheetSync.ts";

// Layout of the real "Data Closing 2026" tabs: title rows above, header on row 4.
const head = ["No", "Nama", "No. Whatsapp", "Tanggal Closing", "Pax", "Paket Harga", "Diskon", "Tanggal Berangkat", "Sumber", "DP", "Umroh Consultant (UC)"];
const tab = (name: string, body: string[][]) => ({
  name,
  rows: [["Data Closing"], [""], [""], head, ...body],
});
const NOW = Date.parse("2026-11-10T05:00:00Z") / 1000;

test("parses a monthly tab with title rows above the header", async () => {
  const r = await sheetsToSales(
    [tab("Oktober", [["1", "Siti Aminah", "0812 3456 7890", "2026-10-05 09:00:00", "1", "30000000", "500000", "2027-03-01 12:00:00", "Instagram", "5000000", "Roro"]])],
    1, NOW
  );
  assert.equal(r.error, undefined);
  assert.equal(r.rows.length, 1);
  const s = r.rows[0];
  assert.equal(s.sale_date, "2026-10-05");
  assert.equal(s.value, 29500000);
  assert.equal(s.consultant, "Roro");
  assert.equal(s.label, "Siti A.");
  assert.equal(s.has_contact, true);
  assert.equal(s.down_payment, 5000000);
  assert.match(s.sale_key, /^[a-f0-9]{64}$/);
});

test("same input gives the same sale key (re-sync never duplicates)", async () => {
  const body = [["1", "Budi", "081234", "2026-10-06 10:00:00", "1", "28000000", "", "", "WA", "", "Alif"]];
  const a = await sheetsToSales([tab("Oktober", body)], 1, NOW);
  const b = await sheetsToSales([tab("Oktober", body)], 1, NOW);
  assert.equal(a.rows[0].sale_key, b.rows[0].sale_key);
});

test("rows without a price or date are skipped, not fatal", async () => {
  const r = await sheetsToSales(
    [tab("Oktober", [
      ["1", "Ani", "081", "2026-10-06 10:00:00", "1", "", "", "", "WA", "", "Roro"],
      ["2", "Ono", "082", "bukan tanggal", "1", "20000000", "", "", "WA", "", "Roro"],
      ["3", "Eko", "083", "2026-10-07 10:00:00", "1", "20000000", "", "", "WA", "", "Roro"],
    ])],
    1, NOW
  );
  assert.equal(r.rows.length, 1);
  assert.equal(r.skipped, 2);
});

test("future-dated rows are counted, not saved", async () => {
  const r = await sheetsToSales([tab("November", [["1", "Eko", "083", "2026-11-20 10:00:00", "1", "20000000", "", "", "WA", "", "Roro"]])], 1, NOW);
  assert.equal(r.rows.length, 0);
  assert.equal(r.future + r.skipped, 1);
});

test("the same sale in two tabs is saved once", async () => {
  const body = [["1", "Dewi", "081", "2026-10-06 10:00:00", "1", "25000000", "", "", "WA", "", "Roro"]];
  const r = await sheetsToSales([tab("Oktober", body), tab("November", body)], 1, NOW);
  assert.equal(r.rows.length, 1);
});

test("a tab without a header row is ignored; no usable tab gives an error", async () => {
  const r = await sheetsToSales([{ name: "Hasil", rows: [["Pax vs Closing"], ["x", "y"]] }], 1, NOW);
  assert.ok(r.error);
});

test("token check", async () => {
  assert.equal(await tokenMatches("abc", "abc"), true);
  assert.equal(await tokenMatches("abc", "abd"), false);
  assert.equal(await tokenMatches("", "abc"), false);
});

// "Sync now" can also ask the sheet's Apps Script web app to push right away.
// A fake env: only the app_settings lookup the readiness check makes.
const envWith = (over: Record<string, unknown>, connected: boolean) =>
  ({ DB: { prepare: () => ({ bind: () => ({ first: async () => (connected ? { 1: 1 } : null) }) }) }, ...over }) as any;
const READY = { SHEET_TRIGGER_URL: "https://script.example/exec", SHEET_SYNC_TOKEN: "tok" };

async function withFetch(status: number, fn: (calls: { url: string; init: any }[]) => Promise<void>) {
  const real = globalThis.fetch;
  const calls: { url: string; init: any }[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status });
  }) as any;
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = real;
  }
}

test("sheet trigger is ready only when configured and the client's sheet has synced before", async () => {
  assert.equal(await sheetTriggerReady(envWith(READY, true), 1), true);
  assert.equal(await sheetTriggerReady(envWith({ SHEET_SYNC_TOKEN: "tok" }, true), 1), false); // no URL
  assert.equal(await sheetTriggerReady(envWith({ SHEET_TRIGGER_URL: "https://x/exec" }, true), 1), false); // no token
  assert.equal(await sheetTriggerReady(envWith(READY, false), 1), false); // never synced
});

test("sheet trigger posts the shared token to the script", async () => {
  await withFetch(200, async (calls) => {
    await triggerSheetSync(envWith(READY, true));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://script.example/exec");
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].init.body), { token: "tok" });
  });
});

test("a failing or unreachable script is logged, never thrown", async () => {
  const log = console.error;
  console.error = () => {};
  try {
    await withFetch(500, async () => {
      await triggerSheetSync(envWith(READY, true));
    });
    const real = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as any;
    try {
      await triggerSheetSync(envWith(READY, true));
    } finally {
      globalThis.fetch = real;
    }
  } finally {
    console.error = log;
  }
});
