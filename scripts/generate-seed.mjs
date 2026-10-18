#!/usr/bin/env node
// Generates realistic mock data as SQL so the UI is reviewable before a real
// Meta token is connected. Ad-level rows are generated first, then summed into
// adset and campaign rows, so drill-down totals are internally consistent.
//
// Deliberate anomaly patterns (so the alert engine finds real things):
//   - Musafar "Prospecting Broad" CPR spikes in the last 3 days
//   - Musafar ad "UGC Testimoni Bu Sari" fatigues (freq > 3.5, CTR drops)
//   - Habi "Retargeting Purchase" gets zero results on meaningful spend
//   - Musafar account paces ~25% over its monthly budget
//
// Usage: node scripts/generate-seed.mjs [outfile]

import { pbkdf2Sync, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const q = (s) => (s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);
const n = (v) => (v == null ? "NULL" : Number.isFinite(v) ? String(v) : "NULL");

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100000, 32, "sha256");
  return `pbkdf2$100000$${salt.toString("base64")}$${hash.toString("base64")}`;
}

// --- dates (Asia/Jakarta) ---
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });
const todayJkt = fmt.format(new Date());
function addDays(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
const DAYS = 35;
const END = addDays(todayJkt, 0); // include today so "This month" pacing looks alive
const START = addDays(END, -(DAYS - 1));

// Deterministic PRNG so reseeding is reproducible
let seed = 42;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const jitter = (base, pct) => base * (1 + (rand() * 2 - 1) * pct);

const sql = [];
sql.push("PRAGMA foreign_keys=OFF;");
for (const t of [
  "alerts", "sync_jobs", "insights_daily", "entities", "campaign_result_overrides",
  "account_settings", "ad_accounts", "invites", "users", "clients", "app_settings",
]) sql.push(`DELETE FROM ${t};`);

// --- clients ---
sql.push(`INSERT INTO clients (id, name, slug, logo_url, brand_color, share_token, share_enabled) VALUES
  (1, 'Musafar', 'musafar', NULL, '#d4a24e', 'demo-musafar-share-token', 1),
  (2, 'Habi', 'habi', NULL, '#4ecb71', 'demo-habi-share-token', 0);`);

// --- users ---
sql.push(`INSERT INTO users (email, password_hash, name, role, client_id) VALUES
  ('admin@musawara.id', ${q(hashPassword("musawara123"))}, 'Musawara Admin', 'admin', NULL),
  ('team@musafar.id', ${q(hashPassword("client123"))}, 'Musafar Team', 'client', 1),
  ('team@habi.id', ${q(hashPassword("client123"))}, 'Habi Team', 'client', 2);`);

// --- ad accounts + settings ---
sql.push(`INSERT INTO ad_accounts (id, client_id, meta_account_id, account_name, currency, timezone) VALUES
  (1, 1, 'act_1084701112223334', 'Musafar Umroh — Main', 'IDR', 'Asia/Jakarta'),
  (2, 2, 'act_2095812223334445', 'Habi Herbal — Store', 'IDR', 'Asia/Jakarta');`);
sql.push(`INSERT INTO account_settings (ad_account_id, primary_result_type, primary_result_label, monthly_budget_idr, cpr_target) VALUES
  (1, 'onsite_conversion.messaging_conversation_started_7d', 'Chats Started', 60000000, 25000),
  (2, 'purchase', 'Purchases', 45000000, 60000);`);

// --- structure: account -> campaigns -> adsets -> ads, each ad has generation params ---
const accounts = [
  {
    id: 1,
    resultType: "onsite_conversion.messaging_conversation_started_7d",
    // spend levels sized so MTD projects ~25% over the Rp 60jt budget (pacing alert)
    campaigns: [
      {
        id: "c-msf-101", name: "CTWA — Prospecting Broad", objective: "OUTCOME_ENGAGEMENT", status: "ACTIVE",
        adsets: [
          { id: "as-msf-1011", name: "Broad 25-55 ID", ads: [
            { id: "ad-msf-10111", name: "Video Kabah 15s", spend: 900000, ctr: 1.9, cpm: 14000, resultRate: 0.022, freq: 2.0 },
            { id: "ad-msf-10112", name: "Carousel Paket Hemat", spend: 650000, ctr: 1.4, cpm: 15000, resultRate: 0.018, freq: 2.2 },
          ]},
          { id: "as-msf-1012", name: "Lookalike Jamaah 2%", ads: [
            // CPR spike driver: last 3 days spend up, results down sharply
            { id: "ad-msf-10121", name: "Hook Biaya Umroh 2026", spend: 800000, ctr: 1.7, cpm: 16000, resultRate: 0.02, freq: 2.1,
              lastDays: { from: -2, spendMult: 1.6, resultMult: 0.45 } },
          ]},
        ],
      },
      {
        id: "c-msf-102", name: "CTWA — Retargeting Engaged", objective: "OUTCOME_ENGAGEMENT", status: "ACTIVE",
        adsets: [
          { id: "as-msf-1021", name: "IG Engagers 30d", ads: [
            { id: "ad-msf-10211", name: "Testimoni Pak Haji Dedi", spend: 450000, ctr: 2.6, cpm: 12000, resultRate: 0.035, freq: 2.8 },
            // fatigue driver: frequency climbs > 3.5 and CTR halves over final week
            { id: "ad-msf-10212", name: "UGC Testimoni Bu Sari", spend: 500000, ctr: 2.8, cpm: 12500, resultRate: 0.03, freq: 2.6,
              fatigue: { from: -6, freq: 4.4, ctrMult: 0.45 } },
          ]},
        ],
      },
      {
        id: "c-msf-103", name: "Leads — Itinerary Download", objective: "OUTCOME_LEADS", status: "PAUSED",
        adsets: [
          { id: "as-msf-1031", name: "Interest Umroh + Travel", ads: [
            { id: "ad-msf-10311", name: "Ebook Panduan Umroh", spend: 250000, ctr: 1.1, cpm: 18000, resultRate: 0.012, freq: 1.8,
              stopAt: -7 }, // paused a week ago; keeps historical rows
          ]},
        ],
      },
    ],
  },
  {
    id: 2,
    resultType: "purchase",
    campaigns: [
      {
        id: "c-hab-201", name: "Sales — Prospecting Advantage+", objective: "OUTCOME_SALES", status: "ACTIVE",
        adsets: [
          { id: "as-hab-2011", name: "Advantage+ Broad", ads: [
            { id: "ad-hab-20111", name: "Before/After Madu Herbal", spend: 700000, ctr: 2.1, cpm: 17000, resultRate: 0.010, freq: 1.9 },
            { id: "ad-hab-20112", name: "Dokter Review 30s", spend: 550000, ctr: 1.6, cpm: 18000, resultRate: 0.008, freq: 2.0 },
          ]},
        ],
      },
      {
        id: "c-hab-202", name: "Sales — Retargeting Purchase", objective: "OUTCOME_SALES", status: "ACTIVE",
        adsets: [
          { id: "as-hab-2021", name: "ATC + Viewers 14d", ads: [
            // zero-results driver: pixel "breaks" for the last 3 days
            { id: "ad-hab-20211", name: "Promo Bundle 3 Botol", spend: 350000, ctr: 2.9, cpm: 14000, resultRate: 0.014, freq: 2.4,
              lastDays: { from: -2, spendMult: 1.0, resultMult: 0 } },
          ]},
        ],
      },
      {
        id: "c-hab-203", name: "Awareness — New Variant Launch", objective: "OUTCOME_AWARENESS", status: "ACTIVE",
        adsets: [
          { id: "as-hab-2031", name: "Reach ID Urban", ads: [
            { id: "ad-hab-20311", name: "Teaser Varian Jahe Merah", spend: 200000, ctr: 0.8, cpm: 9000, resultRate: 0.001, freq: 1.5 },
          ]},
        ],
      },
    ],
  },
];

// --- entities ---
const entityValues = [];
let thumbSeed = 11;
for (const acc of accounts) {
  for (const c of acc.campaigns) {
    entityValues.push(`(${acc.id}, 'campaign', ${q(c.id)}, ${q(c.name)}, ${q(c.status)}, ${q(c.status)}, ${q(c.objective)}, NULL, NULL, NULL)`);
    for (const as of c.adsets) {
      const dailyBudget = Math.round(as.ads.reduce((s, a) => s + a.spend, 0) / 20000) * 20000;
      entityValues.push(`(${acc.id}, 'adset', ${q(as.id)}, ${q(as.name)}, ${q(c.status)}, ${q(c.status)}, NULL, ${dailyBudget}, ${q(c.id)}, NULL)`);
      for (const ad of as.ads) {
        const thumb = `https://picsum.photos/seed/${thumbSeed++}/320/320`;
        entityValues.push(`(${acc.id}, 'ad', ${q(ad.id)}, ${q(ad.name)}, ${q(c.status)}, ${q(c.status)}, NULL, NULL, ${q(as.id)}, ${q(thumb)})`);
      }
    }
  }
}
sql.push(`INSERT INTO entities (ad_account_id, level, entity_id, name, status, effective_status, objective, daily_budget, parent_id, thumbnail_url) VALUES\n${entityValues.join(",\n")};`);

// --- daily insights, generated per ad then rolled up ---
const rows = []; // {acc, level, entityId, entityName, parentId, campaignId, date, spend, impressions, reach, clicks, linkClicks, results, actions}
for (const acc of accounts) {
  for (const c of acc.campaigns) {
    for (const as of c.adsets) {
      for (const ad of as.ads) {
        for (let i = 0; i < DAYS; i++) {
          const date = addDays(START, i);
          const offset = i - (DAYS - 1); // 0 = today, negative = days ago
          if (ad.stopAt != null && offset > ad.stopAt) continue;

          let spend = jitter(ad.spend, 0.25);
          let ctr = jitter(ad.ctr, 0.15);
          let cpm = jitter(ad.cpm, 0.12);
          let freq = jitter(ad.freq, 0.1);
          let resultRate = jitter(ad.resultRate, 0.2);

          // weekly rhythm: weekends dip ~15%
          const dow = new Date(date + "T00:00:00Z").getUTCDay();
          if (dow === 0 || dow === 6) spend *= 0.85;

          if (ad.lastDays && offset >= ad.lastDays.from) {
            spend *= ad.lastDays.spendMult;
            resultRate *= ad.lastDays.resultMult;
          }
          if (ad.fatigue && offset >= ad.fatigue.from) {
            freq = jitter(ad.fatigue.freq, 0.05);
            ctr *= ad.fatigue.ctrMult;
          }

          const impressions = Math.round((spend / cpm) * 1000);
          const reach = Math.max(1, Math.round(impressions / freq));
          const clicks = Math.round(impressions * (ctr / 100));
          const linkClicks = Math.round(clicks * 0.82);
          const results = Math.round(clicks * resultRate * 10) / 10 >= 0.5 ? Math.round(clicks * resultRate) : 0;

          const actions = [
            { action_type: "link_click", value: String(linkClicks) },
            { action_type: "landing_page_view", value: String(Math.round(linkClicks * 0.7)) },
            { action_type: "post_engagement", value: String(Math.round(clicks * 1.6)) },
            { action_type: acc.resultType, value: String(results) },
          ];
          if (acc.id === 2) actions.push({ action_type: "add_to_cart", value: String(Math.round(results * 2.4)) });
          if (acc.id === 1) actions.push({ action_type: "lead", value: String(Math.round(results * 0.3)) });

          rows.push({
            acc: acc.id, level: "ad", entityId: ad.id, entityName: ad.name, parentId: as.id,
            campaignId: c.id, date, spend: Math.round(spend), impressions, reach, clicks, linkClicks, results, actions,
          });
        }
      }
    }
  }
}

// roll up ad rows -> adset and campaign rows
function rollup(level, keyFn, nameFn, parentFn) {
  const map = new Map();
  for (const r of rows.filter((r) => r.level === "ad")) {
    const key = `${r.acc}|${keyFn(r)}|${r.date}`;
    const cur = map.get(key) ?? {
      acc: r.acc, level, entityId: keyFn(r), entityName: nameFn(r), parentId: parentFn(r),
      campaignId: r.campaignId, date: r.date, spend: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, results: 0, actions: null,
    };
    cur.spend += r.spend; cur.impressions += r.impressions; cur.reach += r.reach;
    cur.clicks += r.clicks; cur.linkClicks += r.linkClicks; cur.results += r.results;
    map.set(key, cur);
  }
  return [...map.values()];
}
const adsetName = new Map(), adsetParent = new Map(), campaignName = new Map();
for (const acc of accounts) for (const c of acc.campaigns) {
  campaignName.set(c.id, c.name);
  for (const as of c.adsets) { adsetName.set(as.id, as.name); adsetParent.set(as.id, c.id); }
}
const adsetRows = rollup("adset", (r) => r.parentId, (r) => adsetName.get(r.parentId), (r) => adsetParent.get(r.parentId));
const campaignRows = rollup("campaign", (r) => r.campaignId, (r) => campaignName.get(r.campaignId), () => null);
for (const r of [...adsetRows, ...campaignRows]) {
  // campaign/adset rows carry a representative actions array too (keeps the picker rich)
  const acc = accounts.find((a) => a.id === r.acc);
  r.actions = [
    { action_type: "link_click", value: String(r.linkClicks) },
    { action_type: "landing_page_view", value: String(Math.round(r.linkClicks * 0.7)) },
    { action_type: acc.resultType, value: String(r.results) },
  ];
  rows.push(r);
}

const insightValues = rows.map((r) => {
  const ctr = r.impressions > 0 ? (r.clicks / r.impressions) * 100 : null;
  const cpm = r.impressions > 0 ? (r.spend / r.impressions) * 1000 : null;
  const freq = r.reach > 0 ? r.impressions / r.reach : null;
  const cpr = r.results > 0 ? r.spend / r.results : null;
  return `(${r.acc}, ${q(r.level)}, ${q(r.entityId)}, ${q(r.entityName)}, ${q(r.parentId)}, ${q(r.campaignId)}, ${q(r.date)}, ${n(r.spend)}, ${n(r.impressions)}, ${n(r.reach)}, ${n(r.clicks)}, ${n(r.linkClicks)}, ${n(ctr)}, ${n(cpm)}, ${n(freq)}, ${n(r.results)}, ${n(cpr)}, ${q(JSON.stringify(r.actions))})`;
});
for (let i = 0; i < insightValues.length; i += 200) {
  sql.push(
    `INSERT INTO insights_daily (ad_account_id, level, entity_id, entity_name, parent_id, campaign_id, date, spend, impressions, reach, clicks, link_clicks, ctr, cpm, frequency, results, cost_per_result, actions_json) VALUES\n${insightValues.slice(i, i + 200).join(",\n")};`
  );
}

// --- sync jobs: nightly successes + one older failure for account 2 ---
const jobs = [];
for (let d = 6; d >= 0; d--) {
  for (const accId of [1, 2]) {
    const failed = accId === 2 && d === 3;
    jobs.push(
      `(${accId}, datetime('now', '-${d} days', '-2 hours'), datetime('now', '-${d} days', '-115 minutes'), ${q(failed ? "failed" : "success")}, ${failed ? 0 : 900 + Math.round(rand() * 300)}, ${failed ? q("(#17) User request limit reached") : "NULL"})`
    );
  }
}
sql.push(`INSERT INTO sync_jobs (ad_account_id, started_at, finished_at, status, rows_upserted, error) VALUES\n${jobs.join(",\n")};`);

const out = sql.join("\n\n") + "\n";
const outfile = process.argv[2];
if (outfile) {
  writeFileSync(outfile, out);
  console.error(`Wrote ${outfile} (${rows.length} insight rows, ${entityValues.length} entities)`);
} else {
  process.stdout.write(out);
}
