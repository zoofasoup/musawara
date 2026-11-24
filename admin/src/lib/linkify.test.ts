import test from "node:test";
import assert from "node:assert/strict";
import { splitLinks } from "./linkify.ts";

const links = (t: string) => splitLinks(t).filter((p) => p.href).map((p) => p.href);

test("web addresses become links, the rest stays text", () => {
  assert.deepEqual(splitLinks("lihat https://musawara.id/x dulu"), [{ text: "lihat " }, { text: "https://musawara.id/x", href: "https://musawara.id/x" }, { text: " dulu" }]);
  assert.deepEqual(links("a www.musawara.id b"), ["https://www.musawara.id"]);
  assert.deepEqual(links("dua http://a.co dan https://b.id/p?q=1&r=2#h"), ["http://a.co", "https://b.id/p?q=1&r=2#h"]);
  assert.deepEqual(splitLinks("tanpa link"), [{ text: "tanpa link" }]);
});

test("punctuation that ends the sentence is not part of the link", () => {
  assert.deepEqual(links("cek https://a.id/x."), ["https://a.id/x"]);
  assert.deepEqual(links("(lihat https://a.id/x), ya!"), ["https://a.id/x"]);
  assert.deepEqual(links("https://a.id/x?y=1,"), ["https://a.id/x?y=1"]);
  assert.deepEqual(links("https://en.wikipedia.org/wiki/Foo_(bar)"), ["https://en.wikipedia.org/wiki/Foo_(bar)"]);
});

test("only http(s) addresses are ever linked", () => {
  assert.deepEqual(links("javascript:alert(1) data:text/html,x ftp://a.id file:///etc/passwd"), []);
  assert.deepEqual(links("https:// kosong"), []);
});
