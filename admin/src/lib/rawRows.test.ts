import test from "node:test";
import assert from "node:assert/strict";
import { parseRawRows, withoutBom } from "./conversions.ts";

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

test("a byte-order mark is removed from a CSV before it goes to the gateway; other files are left alone", async () => {
  const csv = await withoutBom(new File(["\ufeff\"Nama\",\"Nomor\"\r\n\"A\",\"6281\"\r\n"], "k.csv", { type: "text/csv" }));
  assert.equal((await csv.text()).charCodeAt(0), 0x22, "starts with the first quote, not the mark");
  assert.equal(csv.name, "k.csv");
  const plain = new File(['"Nama"\r\n'], "p.csv");
  assert.equal(await withoutBom(plain), plain, "nothing to remove: the same file");
  const xlsx = new File([new Uint8Array([0xef, 0xbb, 0xbf])], "a.xlsx");
  assert.equal(await withoutBom(xlsx), xlsx);
});
