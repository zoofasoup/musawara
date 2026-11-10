import test from "node:test";
import assert from "node:assert/strict";
import { sheetsToSales, tokenMatches } from "./sheetSync.ts";

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
