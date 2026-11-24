import test from "node:test";
import assert from "node:assert/strict";
import { parseRawRows } from "./conversions.ts";

test("a contacts CSV reads as written: BOM, quoted cells, CRLF, and no search for a sales-style header row", async () => {
  const text = '﻿"Nama","Nomor WhatsApp","Tag","Catatan","Domisili"\r\n"Budi Santoso","6281234567890","umroh, webinar","Dari Kommo, dibuat 2025-03-12","Bekasi"\r\n"Siti","6281298765432","","Dari Kommo",""\r\n';
  const rows = await parseRawRows(new File([text], "kontak.csv"));
  assert.deepEqual(rows, [
    ["Nama", "Nomor WhatsApp", "Tag", "Catatan", "Domisili"],
    ["Budi Santoso", "6281234567890", "umroh, webinar", "Dari Kommo, dibuat 2025-03-12", "Bekasi"],
    ["Siti", "6281298765432", "", "Dari Kommo", ""],
  ]);
  await assert.rejects(parseRawRows(new File(["x"], "old.xls")), /\.xlsx/);
});
