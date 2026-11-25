import test from "node:test";
import assert from "node:assert/strict";
import { canonical, describeRules, effectiveRules, emptyCounts, suggestVars, tokenAtCaret, varGroup, emptyRules, hasSelection, NONE, pickAudience, renderMessage, slug, tokensIn, unknownTokens, valuesForPerson, variablesFor, type Contact, type Ctx } from "../pages/crm/broadcast/audience.ts";

const contacts: Contact[] = [
  { id: 1, phone: "6281", name: "Ani", tags: ["vip", "umroh"] },
  { id: 2, phone: "6282", name: "Budi", tags: ["umroh"] },
  { id: 3, phone: "6283", name: "", tags: ["optout", "umroh"] },
  { id: 4, phone: "6284", name: "Dewi", tags: [] },
];
const NOW = 1_800_000_000;
const ctx: Ctx = {
  stageOf: (p) => ({ "6281": 10, "6282": 11 } as Record<string, number>)[p],
  ownerOf: (p) => ({ "6281": 5, "6282": null } as Record<string, number | null>)[p],
  valuesOf: (p) => ({ "6281": { 7: "Plus" }, "6282": { 7: "Reguler" } } as Record<string, Record<string, string>>)[p],
  lastChatTs: (p) => ({ "6281": NOW - 2 * 86400, "6282": NOW - 60 * 86400 } as Record<string, number>)[p],
  now: NOW,
};
const ids = (r: ReturnType<typeof emptyRules>) => pickAudience(contacts, r, ctx).map((c) => c.id);

test("an empty form selects nobody, 'everyone' selects all, and every filter category must hold", () => {
  assert.equal(hasSelection(emptyRules()), false);
  assert.deepEqual(ids(emptyRules()), []);
  assert.deepEqual(ids({ ...emptyRules(), everyone: true }), [1, 2, 3, 4]);
  assert.deepEqual(ids({ ...emptyRules(), tags: ["umroh"] }), [1, 2, 3]);
  assert.deepEqual(ids({ ...emptyRules(), tags: ["umroh"], stages: [10] }), [1], "tag AND stage");
  assert.deepEqual(ids({ ...emptyRules(), stages: [NONE] }), [3, 4], "not on the board");
  assert.deepEqual(ids({ ...emptyRules(), owners: [NONE] }), [2, 3, 4], "nobody owns them (on the board or not)");
  assert.deepEqual(ids({ ...emptyRules(), owners: [5] }), [1]);
});

test("field rules, last conversation, exclusions and chosen contacts", () => {
  assert.deepEqual(ids({ ...emptyRules(), fields: [{ fieldId: 7, mode: "in", values: ["Plus"] }] }), [1]);
  assert.deepEqual(ids({ ...emptyRules(), fields: [{ fieldId: 7, mode: "empty", values: [] }] }), [3, 4]);
  assert.deepEqual(ids({ ...emptyRules(), fields: [{ fieldId: 7, mode: "filled", values: [] }] }), [1, 2]);
  assert.deepEqual(ids({ ...emptyRules(), chat: "within", chatDays: 7 }), [1]);
  assert.deepEqual(ids({ ...emptyRules(), chat: "never" }), [3, 4]);
  assert.deepEqual(ids({ ...emptyRules(), tags: ["umroh"], excludeTags: ["optout"] }), [1, 2], "opt-outs never receive it");
  assert.deepEqual(ids({ ...emptyRules([4]), tags: ["vip"] }), [1, 4], "chosen contacts are added to the filtered ones");
  assert.deepEqual(ids({ ...emptyRules([3]), excludeTags: ["optout"] }), [], "exclusions beat chosen contacts");
});

test("placeholders: field labels become tokens, unknown ones are flagged, rendering matches the gateway", () => {
  assert.equal(slug("Paket Umroh"), "paket_umroh");
  assert.equal(slug("Jumlah +1"), "jumlah_1");
  assert.equal(slug("Pernah Umroh?"), "pernah_umroh");
  const vars = variablesFor([{ id: 7, label: "Paket Umroh", type: "text", options: [] }, { id: 8, label: "Owner", type: "text", options: [] }]);
  assert.deepEqual(vars.map((v) => v.token), ["nama", "nomor", "stage", "owner", "paket_umroh"], "a field named like a built-in does not duplicate it");
  const msg = "{Halo|Hai} {nama}, paket {Paket_Umroh} kamu {typo} {name}";
  assert.deepEqual(tokensIn(msg), ["nama", "paket_umroh", "typo", "name"]);
  assert.deepEqual(unknownTokens(msg, vars), ["typo"], "name is an alias of nama");
  assert.equal(canonical("phone"), "nomor");
  assert.equal(renderMessage(msg, { name: "Budi", phone: "62", vars: { paket_umroh: "Plus {x|y}" } }, () => 0), "Halo Budi, paket Plus  x y kamu {typo} Budi");
  assert.equal(renderMessage("{nama}", { name: " ", phone: "1" }), "Kak");
});

test("per-person values and the empty-value warning", () => {
  const vars = variablesFor([{ id: 7, label: "Paket", type: "text", options: [] }]);
  const vals = (phone: string) => valuesForPerson(vars, { phone }, {
    stageName: () => "Interested", ownerName: (p) => (p === "6281" ? "Roro" : ""),
    fieldValue: (p, id) => ((ctx.valuesOf(p) ?? {})[id] ?? ""),
  });
  assert.deepEqual(vals("6281"), { stage: "Interested", owner: "Roro", paket: "Plus" });
  const people = contacts.slice(0, 3);
  assert.deepEqual(emptyCounts("Halo {nama}, {paket} {owner}", vars, people, vals).map((x) => [x.token, x.missing]), [["owner", 2], ["paket", 1]]);
  assert.deepEqual(emptyCounts("Halo {nama}", vars, people, vals), [], "nothing to warn about");
});

test("'Everyone' mode ignores the include filters but keeps exclusions and chosen contacts; the summary lists what is left", () => {
  const r = { ...emptyRules([4]), everyone: true, tags: ["vip"], stages: [10], excludeTags: ["optout"] };
  const e = effectiveRules(r);
  assert.deepEqual([e.everyone, e.tags, e.stages, e.excludeTags, e.chosen], [true, [], [], ["optout"], [4]]);
  assert.deepEqual(effectiveRules({ ...r, everyone: false }).tags, ["vip"], "filters come back when switched off");
  const names = { stage: (id: number | string) => (id === NONE ? "Not on the board" : `S${id}`), owner: () => "Roro", field: () => "Paket" };
  const d = describeRules({ ...emptyRules(), tags: ["a", "b"], stages: [10], chat: "within", chatDays: 7, fields: [{ fieldId: 1, mode: "filled", values: [] }], excludeTags: ["x"] }, names);
  assert.deepEqual(d.include.map((p) => [p.kind, p.values]), [["tag", ["a", "b"]], ["stage", ["S10"]], ["field", ["has a value"]], ["chat", ["chatted in the last 7 days"]]]);
  assert.deepEqual(d.exclude, ["x"]);
  assert.equal(describeRules({ ...emptyRules(), everyone: true }, names).everyone, true);
});

test("typing a placeholder: the open brace before the caret is found, anything else is not", () => {
  assert.deepEqual(tokenAtCaret("Halo {na", 8), { start: 5, query: "na" });
  assert.deepEqual(tokenAtCaret("Halo {", 6), { start: 5, query: "" });
  assert.equal(tokenAtCaret("Halo {Halo|", 11), null, "inside a spintax group");
  assert.equal(tokenAtCaret("Halo {a b", 9), null, "a space ends it");
  assert.equal(tokenAtCaret("Halo {nama} ok", 14), null, "after a closing brace");
  assert.equal(tokenAtCaret("Halo {x\nbaris", 13), null, "a new line ends it");
  const vars = variablesFor([{ id: 7, label: "Paket Umroh", type: "text", options: [] }, { id: 8, label: "Nama anak", type: "text", options: [] }]);
  assert.deepEqual(suggestVars(vars, "na").map((v) => v.token), ["nama", "nama_anak"], "prefix matches first");
  assert.deepEqual(suggestVars(vars, "umroh").map((v) => v.token), ["paket_umroh"], "then the label");
  assert.deepEqual(vars.map(varGroup), ["Contact", "Contact", "Pipeline", "Pipeline", "Custom fields", "Custom fields"]);
});
