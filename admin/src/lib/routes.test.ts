import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const app = readFileSync(fileURLToPath(new URL("../App.tsx", import.meta.url)), "utf8");

// Each team page must sit inside the gate for its feature. The Worker refuses the data anyway; this keeps the page itself out of reach.
const GATE = /<Route element=\{<(Needs feature="(\w+)"[^/]*|StaffOnly )\/>\}>/g;
function gateBefore(index: number, source = app): string | null {
  let last: string | null = null;
  for (const m of source.matchAll(GATE)) {
    if (m.index! > index) break;
    last = m[2] ?? "staff";
  }
  return last;
}

test("team pages are only routed inside the gate for their feature", () => {
  const expected: Array<[string, string]> = [
    ["/styleguide", "settings"], ["/settings", "settings"], ["/spend", "spend"], ["/planning", "content"], ["/board", "content"],
    ["/approvals", "approvals"], ["/crm/inbox", "crm"], ["/shopee", "sales"], ["/conversions", "sales"], ["/clients", "staff"],
  ];
  for (const [path, feature] of expected) {
    const at = [...app.matchAll(new RegExp(`path="${path}"`, "g"))].map((m) => m.index!);
    assert.ok(at.length >= 1, `${path} is not routed`);
    for (const i of at) assert.equal(gateBefore(i), feature, `${path} must sit inside the ${feature} gate`);
  }
  for (const [path, feature] of [["onboarding", "settings"], ["assets", "content"], ["organic", "content"], ["sales", "sales"], ["shopee", "sales"]]) {
    const i = app.indexOf(`<Route path="${path}"`);
    assert.ok(i > 0, `client tab ${path} is not routed`);
    assert.equal(gateBefore(i), feature, `client tab ${path} must sit inside the ${feature} gate`);
  }
});

test("only the login, invite and share pages are public", () => {
  const protectedAt = app.indexOf("<Route element={<ProtectedLayout pages={PAGES} />}>");
  assert.ok(protectedAt > 0, "protected layout route not found");
  const before = app.slice(0, protectedAt);
  const publicPaths = [...before.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(publicPaths, ["/login", "/invite/:token", "/reset/:token", "/share/:token", "/share/:token/report"]);
});

// The CRM copy has its own route table (CrmApp.tsx); the same two rules hold there.
const crmApp = readFileSync(fileURLToPath(new URL("../CrmApp.tsx", import.meta.url)), "utf8");

test("CRM copy: only the login, invite and reset pages are public", () => {
  const protectedAt = crmApp.indexOf("<Route element={<ProtectedLayout />}>");
  assert.ok(protectedAt > 0, "protected layout route not found");
  const publicPaths = [...crmApp.slice(0, protectedAt).matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(publicPaths, ["/login", "/invite/:token", "/reset/:token"]);
});

test("CRM copy: settings and CRM pages sit inside their gates", () => {
  const paths = [...crmApp.matchAll(/path="(\/settings|\/crm(?:\/[a-z]+)?)"/g)];
  assert.ok(paths.some((m) => m[1] === "/settings") && paths.some((m) => m[1] === "/crm/inbox"));
  for (const m of paths) assert.equal(gateBefore(m.index!, crmApp), m[1] === "/settings" ? "settings" : "crm", m[1]);
});
