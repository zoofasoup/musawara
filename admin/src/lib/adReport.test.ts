import test from "node:test";
import assert from "node:assert/strict";
import { parseAdReport, parseShopeeCsv } from "./adReport.ts";

const head = ["Per Hari", "Biaya", "Pesanan SKU (Toko saat ini)", "Mata Uang"];

test("reads one cost per day from a TikTok campaign overview", () => {
  const rows = [head, ["2026-09-01 00:00:00", "26749", "1", "IDR"], [new Date(Date.UTC(2026, 8, 2)), 0, 0, "IDR"], ["Total", "26749", "1", "IDR"]];
  assert.deepEqual(parseAdReport(rows), [{ date: "2026-09-01", amount: 26749 }, { date: "2026-09-02", amount: 0 }]);
});

test("adds up several rows of the same day", () => {
  assert.deepEqual(parseAdReport([head, ["2026-09-01", "100", "", "IDR"], ["2026-09-01", "50", "", "IDR"]]), [{ date: "2026-09-01", amount: 150 }]);
});

test("refuses a file without the two columns, another currency, or an unreadable cost", () => {
  assert.throws(() => parseAdReport([["GMV", "Pesanan"], ["1", "2"]]), /Per Hari/);
  assert.throws(() => parseAdReport([head, ["2026-09-01", "10", "", "USD"]]), /IDR/);
  assert.throws(() => parseAdReport([head, ["2026-09-01", "1.234", "", "IDR"]]), /2026-09-01/);
});

test("TikTok also gives the revenue and orders it attributes to its ads", () => {
  const rows = [[...head, "Penghasilan bruto (Toko saat ini)"], ["2026-09-01", "100", "2", "IDR", "350000"]];
  assert.deepEqual(parseAdReport(rows), [{ date: "2026-09-01", amount: 100, revenue: 350000, orders: 2 }]);
});

const shopee = (period: string) => [
  "Semua Laporan Iklan CPC - Shopee Indonesia", "Username,toko", `Periode,${period}`, "",
  "Urutan,Nama Iklan,Konversi,Omzet Penjualan,Biaya",
  '1,"Obat, 30ml ""asli""",3,852150,940326',
  "2,Paket,0,0,242435", "",
].join("\r\n");

test("a Shopee ad report becomes one total per month, dated its last day", () => {
  assert.deepEqual(parseShopeeCsv(shopee("01/09/2026 - 30/09/2026")), { from: "2026-09-01", to: "2026-09-30", days: [{ date: "2026-09-30", amount: 1182761, revenue: 852150, orders: 3 }] });
});

test("a Shopee report across months, or not a Shopee report, is refused", () => {
  assert.throws(() => parseShopeeCsv(shopee("30/08/2026 - 27/11/2026")), /one month/);
  assert.throws(() => parseShopeeCsv("a,b\n1,2"), /Shopee/);
});
