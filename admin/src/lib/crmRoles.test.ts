import test from "node:test";
import assert from "node:assert/strict";
import { deniedPath, editStartRole } from "./crmRoles.ts";

const staff = (staff_role: any) => ({ role: "admin" as const, client_id: null, staff_role });
const client = { role: "client" as const, client_id: 7, staff_role: null };

test("CRM copy: a refused account goes to /profile unless it has the CRM, so nothing loops", () => {
  for (const u of [staff("ads"), staff("content"), staff(null), client]) assert.equal(deniedPath(u, true), "/profile");
  assert.equal(deniedPath(staff("crm"), true), "/crm");
  assert.equal(deniedPath(staff("owner"), true), "/crm");
  assert.equal(deniedPath(null, true), "/login");
});

test("platform: refused accounts go where they always went", () => {
  assert.equal(deniedPath(staff("ads"), false), "/");
  assert.equal(deniedPath(staff("content"), false), "/planning");
  assert.equal(deniedPath(staff("crm"), false), "/crm");
  assert.equal(deniedPath(staff(null), false), "/profile");
  assert.equal(deniedPath(client, false), "/c/7");
  assert.equal(deniedPath(null, false), "/login");
});

test("editing someone in the CRM copy never starts on a role it does not offer", () => {
  assert.equal(editStartRole("owner", true), "owner");
  for (const r of ["crm", "ads", "content", null] as const) assert.equal(editStartRole(r, true), "crm");
  assert.equal(editStartRole("content", false), "content");
  assert.equal(editStartRole(null, false), "ads");
});
