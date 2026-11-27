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

const aw = (id: string, spend: number, reach: number) => ({ id, name: id, spend, leads: 0, objective: "OUTCOME_AWARENESS", reach, impressions: reach, link_clicks: 0 });

test("each goal is compared only with itself, on its own cost", () => {
  const { ranked, typical } = rank([...rows, aw("w1", 100_000, 100_000), aw("w2", 100_000, 50_000), aw("w3", 100_000, 20_000)]);
  assert.equal(typical, 40_000, "awareness rows do not move the typical cost per lead");
  const by = Object.fromEntries(ranked.map((r) => [r.id, [r.goal, r.label]]));
  assert.deepEqual(by.w1, ["reach", "Winning"]);
  assert.deepEqual(by.w3, ["reach", "Weak"]);
  assert.deepEqual(by.a, ["lead", "Winning"]);
});

test("fewer than three of a goal get a number but no verdict", () => {
  const [only] = rank([aw("w1", 100_000, 100_000)]).ranked;
  assert.deepEqual([only.label, only.tone, only.cost], ["Not compared", "neutral", 1000]);
});

test("an engagement campaign counts as lead work only when it brings chats", () => {
  const e = (id: string, leads: number) => ({ id, name: id, spend: 100_000, leads, objective: "OUTCOME_ENGAGEMENT", impressions: 10_000, reach: 5_000, link_clicks: 0 });
  assert.deepEqual(rank([e("chats", 4), e("views", 0)]).ranked.map((r) => r.goal).sort(), ["lead", "view"]);
});
