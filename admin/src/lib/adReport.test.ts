import test from "node:test";
import assert from "node:assert/strict";
import { parseAdReport } from "./adReport.ts";

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
