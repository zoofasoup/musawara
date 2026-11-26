import test from "node:test";
import assert from "node:assert/strict";
import { FLAG, ID, initialLang, translate } from "./i18n.ts";

test("English is the source text and Indonesian falls back to it when there is no entry", () => {
  assert.equal(translate("en", "Overview"), "Overview");
  assert.equal(translate("id", "Overview"), "Ringkasan");
  assert.equal(translate("id", "A sentence nobody translated yet"), "A sentence nobody translated yet");
});

test("every Indonesian entry has real text that differs from its English key", () => {
  for (const [k, v] of Object.entries(ID)) {
    assert.ok(v.trim().length > 0, `empty translation for "${k}"`);
    if (!["Email", "Menu", "CRM", "Shopee", "Onboarding"].includes(k)) assert.notEqual(v, k, `"${k}" is translated to itself`);
  }
});

test("first visit: stored choice wins, then an Indonesian browser, otherwise English", () => {
  assert.equal(initialLang("en", "id-ID"), "en");
  assert.equal(initialLang("id", "en-US"), "id");
  assert.equal(initialLang(null, "id"), "id");
  assert.equal(initialLang(null, "id-ID"), "id");
  assert.equal(initialLang(null, "en-GB"), "en");
  assert.equal(initialLang("fr", undefined), "en");
});

test("the CRM copy's translated sentences have Indonesian entries", () => {
  for (const text of ["Your account.", "Invite your team.", "Welcome back.", "Invite your teammates.", "No WhatsApp number is available to you yet. Please tell an Owner."]) {
    assert.notEqual(translate("id", text), text, text);
  }
});

test("each language has a flag and a code for the switch", () => {
  assert.equal(FLAG.id.emoji, "🇮🇩");
  assert.equal(FLAG.en.code, "EN");
});
