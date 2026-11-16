import test from "node:test";
import assert from "node:assert/strict";
import { hostAudience, homeHostFor, roleAllowedOnHost } from "./audience";

test("app. is reserved for the team and portal. for clients", () => {
  assert.equal(hostAudience("app.musawara.id"), "admin");
  assert.equal(hostAudience("portal.musawara.id"), "client");
  assert.equal(hostAudience("APP.Musawara.ID:443"), "admin");
});

test("other hosts serve everyone", () => {
  for (const h of ["musawara.id", "www.musawara.id", "musawara-id.grabsite.workers.dev", "localhost:8787", "example.com"]) {
    assert.equal(hostAudience(h), null, h);
    assert.equal(roleAllowedOnHost("admin", h), true, h);
    assert.equal(roleAllowedOnHost("client", h), true, h);
  }
});

test("a role is refused on the other audience's host", () => {
  assert.equal(roleAllowedOnHost("admin", "app.musawara.id"), true);
  assert.equal(roleAllowedOnHost("client", "app.musawara.id"), false);
  assert.equal(roleAllowedOnHost("client", "portal.musawara.id"), true);
  assert.equal(roleAllowedOnHost("admin", "portal.musawara.id"), false);
});

test("look-alike hosts are not treated as reserved", () => {
  assert.equal(hostAudience("app.musawara.id.evil.com"), null);
  assert.equal(hostAudience("notapp.musawara.id"), null);
});

test("each role has a home host", () => {
  assert.equal(homeHostFor("admin"), "app.musawara.id");
  assert.equal(homeHostFor("client"), "portal.musawara.id");
});
