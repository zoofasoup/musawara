import test from "node:test";
import assert from "node:assert/strict";
import { canDelete, planEdit } from "./saleEdit.ts";

const TODAY = "2026-11-07";
const open = { meta_state: "dashboard" };
const sent = { meta_state: "sent" };

test("a dashboard-only sale can change value and date", () => {
  const r = planEdit(open, { value: 30900000, sale_date: "2026-11-01" }, TODAY);
  assert.deepEqual(r, { ok: true, set: { value: 30900000, sale_date: "2026-11-01" } });
});

test("a sent sale locks date and value but not the rest, including cancelling", () => {
  assert.equal(planEdit(sent, { value: 1 }, TODAY).ok, false);
  assert.equal(planEdit(sent, { sale_date: "2026-11-01" }, TODAY).ok, false);
  const r = planEdit(sent, { pay_status: "cancelled", consultant: " Roro ", package_name: "Umroh Ramadhan" }, TODAY);
  assert.deepEqual(r, { ok: true, set: { pay_status: "cancelled", consultant: "Roro", package_name: "Umroh Ramadhan" } });
});

test("bad values are rejected", () => {
  assert.equal(planEdit(open, { value: 0 }, TODAY).ok, false);
  assert.equal(planEdit(open, { value: "100" }, TODAY).ok, false);
  assert.equal(planEdit(open, { sale_date: "2026-12-01" }, TODAY).ok, false);
  assert.equal(planEdit(open, { sale_date: "01/11/2026" }, TODAY).ok, false);
  assert.equal(planEdit(open, { pay_status: "refunded" }, TODAY).ok, false);
  assert.equal(planEdit(open, { down_payment: -5 }, TODAY).ok, false);
  assert.equal(planEdit(open, { departure_date: "soon" }, TODAY).ok, false);
});

test("empty strings clear optional text, null clears optional fields, unknown keys are ignored", () => {
  const r = planEdit(open, { source: "  ", down_payment: null, pay_status: null, departure_date: null, hacker: "x" }, TODAY);
  assert.deepEqual(r, { ok: true, set: { source: null, down_payment: null, pay_status: null, departure_date: null } });
  assert.equal(planEdit(open, { hacker: "x" }, TODAY).ok, false);
});

test("only unsent sales can be deleted", () => {
  assert.equal(canDelete(open).ok, true);
  assert.equal(canDelete(sent).ok, false);
});
