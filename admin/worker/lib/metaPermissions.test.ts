import test from "node:test";
import assert from "node:assert/strict";
import { missingPermissions, REQUIRED_PUBLISH_PERMISSIONS } from "./metaPermissions.ts";

test("lists every required permission that is not granted", () => {
  const all = REQUIRED_PUBLISH_PERMISSIONS.map((permission) => ({ permission, status: "granted" }));
  assert.deepEqual(missingPermissions(all), []);
  assert.deepEqual(missingPermissions([]), [...REQUIRED_PUBLISH_PERMISSIONS]);
  const declined = all.map((r) => (r.permission === "instagram_content_publish" ? { ...r, status: "declined" } : r));
  assert.deepEqual(missingPermissions(declined), ["instagram_content_publish"]);
});
