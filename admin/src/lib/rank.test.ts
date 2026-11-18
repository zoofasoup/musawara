import test from "node:test";
import assert from "node:assert/strict";
import { budgetHint, rank } from "./rank.ts";

const rows = [
  { id: "a", name: "A", spend: 1_000_000, leads: 40 }, // cpl 25k
  { id: "b", name: "B", spend: 1_000_000, leads: 25 }, // cpl 40k, the typical one
  { id: "c", name: "C", spend: 1_500_000, leads: 25 }, // cpl 60k, 1.5x typical
  { id: "d", name: "D", spend: 400_000, leads: 0 },
  { id: "e", name: "E", spend: 0, leads: 0 },
];

test("typical cost per lead is the median of items with leads, ratios decide the label", () => {
  const { ranked, typical } = rank(rows);
  assert.equal(typical, 40_000);
  const by = Object.fromEntries(ranked.map((r) => [r.id, r.label]));
  assert.deepEqual(by, { a: "Winning", b: "On par", c: "Weak", d: "No leads" });
});

test("items without spend are left out and the rest are sorted by spend", () => {
  assert.deepEqual(rank(rows).ranked.map((r) => r.id), ["c", "a", "b", "d"]);
});

test("budget hint pairs the biggest weak spender with the best winner, and is null without a real pair", () => {
  const h = budgetHint(rank(rows).ranked);
  assert.equal(h?.from.id, "c");
  assert.equal(h?.to.id, "a");
  assert.equal(budgetHint(rank([{ id: "x", name: "X", spend: 1, leads: 1 }]).ranked), null);
});
