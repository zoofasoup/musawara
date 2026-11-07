import test from "node:test";
import assert from "node:assert/strict";
import { csvCell } from "./csv.ts";

test("plain values pass through, null becomes empty", () => {
  assert.equal(csvCell("Budi S."), "Budi S.");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(30900000), "30900000");
});

test("commas, quotes and newlines are quoted", () => {
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("a\nb"), '"a\nb"');
});

test("formula prefixes are neutralised", () => {
  assert.equal(csvCell("=SUM(A1:A9)"), "'=SUM(A1:A9)");
  assert.equal(csvCell("+62812"), "'+62812");
  assert.equal(csvCell("@cmd"), "'@cmd");
  assert.equal(csvCell("-5"), "'-5");
});
