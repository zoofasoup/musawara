import test from "node:test";
import assert from "node:assert/strict";
import { cleanFieldCell, keepKnownOwners, pipelineRows, toYmd } from "../pages/crm/pipeline/importMap.ts";

const norm = (raw: unknown) => { const d = String(raw ?? "").replace(/\D/g, ""); return /^\d{9,15}$/.test(d) ? (d.startsWith("0") ? "62" + d.slice(1) : d) : null; };

test("dates in Indonesian and ISO form become YYYY-MM-DD; impossible dates do not", () => {
  assert.equal(toYmd("2026-12-20"), "2026-12-20");
  assert.equal(toYmd("20/12/2026"), "2026-12-20");
  assert.equal(toYmd("5-1-2027"), "2027-01-05");
  assert.equal(toYmd("2026-12-20 10:30"), "2026-12-20");
  assert.equal(toYmd("31/02/2026"), null);
  assert.equal(toYmd("soon"), null);
});

test("pipeline columns and field columns are picked out by their headers", () => {
  const rows = [
    ["Nama", "Nomor WhatsApp", "Tag", "Tahap", "Nilai deal (Rp)", "Perkiraan closing", "Pemilik", "Domisili (contact)", "Package", "Other"],
    ["Budi", "081234567890", "umroh", "Interested", "Rp 28.000.000", "20/12/2026", "Cris Crm", "Bekasi", "VIP", "ignored"],
    ["Siti", "081298765432", "", "", "", "", "", "Depok", "", "x"],
    ["No number", "", "", "Won", "", "", "", "", "", ""],
    ["Plain", "081200000000", "", "", "", "", "", "", "", ""],
  ];
  const r = pipelineRows(rows, "Nomor WhatsApp", ["Domisili", "Package"], norm);
  assert.deepEqual(r.usedColumns, ["Tahap", "Nilai deal (Rp)", "Perkiraan closing", "Pemilik", "Domisili (contact)", "Package"]);
  assert.deepEqual(r.rows, [
    { phone: "6281234567890", stage: "Interested", value_idr: 28000000, expected_close: "2026-12-20", owner: "Cris Crm", fields: { Domisili: "Bekasi", Package: "VIP" } },
    { phone: "6281298765432", fields: { Domisili: "Depok" } },
  ]);
});

test("Kommo's header for the owner is understood, and a file without pipeline columns yields nothing", () => {
  const r = pipelineRows([["Name", "Work phone", "Responsible user"], ["A", "081200000001", "Roro"]], "Work phone", [], norm);
  assert.deepEqual(r.rows, [{ phone: "6281200000001", owner: "Roro" }]);
  assert.deepEqual(pipelineRows([["Nama", "Nomor", "Tag"], ["A", "081200000001", "x"]], "Nomor", ["Domisili"], norm), { rows: [], usedColumns: [] });
});

test("yes/no cells: ya, x, yes, 1 are yes; anything else is no", () => {
  for (const y of ["ya", "Ya", "X", "yes", "1", "true"]) assert.equal(cleanFieldCell("checkbox", y), "1");
  for (const n of ["", "tidak", "0", "no"]) assert.equal(cleanFieldCell("checkbox", n), "");
  assert.equal(cleanFieldCell("text", "ya"), "ya");
});

test("owner names that are not on this number's team are dropped, and rows that said nothing else disappear", () => {
  const r = keepKnownOwners([
    { phone: "1", owner: "Roro" }, { phone: "2", owner: "Cris Crm" }, { phone: "3", owner: "Gone", stage: "New" }, { phone: "4", owner: "cris crm", value_idr: 5 },
  ], ["Cris Crm"]);
  assert.deepEqual(r.rows, [{ phone: "2", owner: "Cris Crm" }, { phone: "3", stage: "New" }, { phone: "4", owner: "cris crm", value_idr: 5 }]);
  assert.deepEqual(r.unknown.sort(), ["Gone", "Roro"]);
});
