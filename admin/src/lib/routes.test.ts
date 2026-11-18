import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const app = readFileSync(fileURLToPath(new URL("../App.tsx", import.meta.url)), "utf8");

test("team-only pages (style guide, settings, spend...) are only routed inside the AdminOnly block", () => {
  const adminOnly = app.indexOf("<Route element={<AdminOnly />}>");
  assert.ok(adminOnly > 0, "AdminOnly block not found");
  for (const path of ["/styleguide", "/settings", "/spend", "/planning", "/board", "/clients"]) {
    const at = [...app.matchAll(new RegExp(`path="${path}"`, "g"))].map((m) => m.index!);
    assert.ok(at.length >= 1, `${path} is not routed`);
    for (const i of at) assert.ok(i > adminOnly, `${path} is routed outside AdminOnly (public)`);
  }
});

test("only the login, invite and share pages are public", () => {
  const protectedAt = app.indexOf("<Route element={<ProtectedLayout />}>");
  const before = app.slice(0, protectedAt);
  const publicPaths = [...before.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(publicPaths, ["/login", "/invite/:token", "/share/:token", "/share/:token/report"]);
});
