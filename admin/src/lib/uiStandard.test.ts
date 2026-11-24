// Guards the UI standard: screens are built from components/ui and components/kit, not from restyled raw HTML.
// If this fails, use <Input>, <Textarea>, <NativeSelect>, <Checkbox> or <Btn> (see /styleguide and admin/CLAUDE.md).
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = new URL("../", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

// Shared building blocks and vendored components are allowed to use raw elements.
const OWN = (p: string) => !/\/components\/(ui|reui)\//.test(p) && !p.endsWith("/pages/AstryxLab.tsx");
const screens = files(SRC).filter(OWN);

function offenders(re: RegExp, allow: (tag: string) => boolean = () => false): string[] {
  const out: string[] = [];
  for (const f of screens) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(re)) {
      if (allow(m[0])) continue;
      const line = src.slice(0, m.index).split("\n").length;
      out.push(`${relative(SRC, f)}:${line}  ${m[0].slice(0, 60).replace(/\s+/g, " ")}`);
    }
  }
  return out;
}

test("no raw <select> or <textarea>: use NativeSelect and Textarea", () => {
  assert.deepEqual(offenders(/<(select|textarea)\b/g), []);
});

test("no raw <input> except hidden file pickers: use Input and Checkbox", () => {
  const raw = offenders(/<input\b[^>]*>?/g, (tag) => /type="file"/.test(tag));
  assert.deepEqual(raw, []);
});

test("the old per-page style constants are gone", () => {
  assert.deepEqual(offenders(/\b(inputCls|fieldCls|selectCls|selectSmCls|btnCls)\b/g), []);
});

test("no hardcoded hex colours in screens (use the theme tokens), except a client's own brand colour fallback", () => {
  const hits = offenders(/#[0-9a-fA-F]{6}\b/g).filter((h) => !/brand_color/.test(h));
  // The two known fallbacks are for a client without a brand colour; anything new must use a token.
  const known = ["pages/ClientDashboard.tsx", "components/report/ReportView.tsx"];
  assert.deepEqual(hits.filter((h) => !known.some((k) => h.startsWith(k))), []);
});

test("every raw <button> is a deliberate custom control (tabs, chips, icon buttons), kept to a known list", () => {
  // Buttons should be Btn. Files below hold custom interactive widgets that are not plain buttons.
  const allowed = new Set([
    "components/AdminShell.tsx", "components/Kanban.tsx", "components/Layout.tsx", "components/kit.tsx", "components/ui.tsx", "components/MetricTrend.tsx", "pages/crm/inbox/MediaBlock.tsx", "components/Segmented.tsx",
    "components/DateRangePicker.tsx", "components/EntityTable.tsx", "components/AlertFeed.tsx", "pages/AdminHome.tsx",
    "pages/Planning.tsx", "pages/Approvals.tsx", "pages/Assets.tsx", "pages/Organic.tsx", "pages/BrandKnowledge.tsx", "pages/Conversions.tsx",
    "pages/SalesGrid.tsx", "pages/Login.tsx", "pages/Invite.tsx", "pages/Shopee.tsx", "pages/settings/MetaSection.tsx", "pages/settings/TeamSection.tsx",
    "pages/crm/AccountSwitcher.tsx", "pages/crm/CrmCampaigns.tsx", "pages/crm/broadcast/Chip.tsx", "pages/crm/broadcast/MessageStep.tsx", "pages/crm/broadcast/ReviewStep.tsx", "pages/crm/CrmContacts.tsx", "pages/crm/CrmTemplates.tsx",
    "pages/crm/inbox/ConversationList.tsx", "pages/crm/inbox/ThreadView.tsx", "pages/crm/pipeline/CrmPipeline.tsx",
  ]);
  const extra = offenders(/<button\b/g).filter((h) => !allowed.has(h.split(":")[0]));
  assert.deepEqual(extra, []);
});

test("cards use the soft panel look (rounded-2xl with the soft shadow), not the old flat rounded-xl card", () => {
  assert.deepEqual(offenders(/rounded-xl border border-border bg-surface(?! shadow)/g), []);
});

test("labelled form controls use FormField, not hand-written <label className=\"block …\"> markup", () => {
  assert.deepEqual(offenders(/<label className="block/g), []);
});

test("status colours come from lib/tone (Pill, Callout, TONE), not hand-written tint strings", () => {
  // kit.tsx keeps the Btn danger hover and the step badge; ThreadView floats a notice over the thread.
  const allowed = ["components/kit.tsx", "pages/crm/inbox/ThreadView.tsx"];
  const hits = offenders(/bg-(?:good|warn|crit)\/1\d\b/g).filter((h) => !allowed.some((a) => h.startsWith(a)));
  assert.deepEqual(hits, []);
});

test("in-page tabs use the pill Tabs (no underline variant) and chosen-value pickers use Segmented", () => {
  assert.deepEqual(offenders(/variant="line"/g), []);
  assert.deepEqual(offenders(/role="radiogroup"/g, () => false).filter((h) => !h.startsWith("components/Segmented.tsx")), []);
});
