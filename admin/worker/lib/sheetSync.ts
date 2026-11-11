// Google Sheet -> dashboard sales. A small Apps Script inside the sheet posts the
// raw cell text of the closing tabs; this side runs the SAME parser as the manual
// upload (src/lib/conversions.ts), so column mapping, sale keys and hashing match
// exactly. Dashboard only: nothing here ever sends anything to Meta.

import { buildSales, guessMapping, REQUIRED, toSheet, type Field, type Mapping } from "../../src/lib/conversions.ts";
import type { Env } from "../types";
import { saveSales, todayWib, validateSale } from "./sales.ts";

export type RawSheet = { name: string; rows: string[][] };

export type SyncResult = {
  at: string;
  sheets: number;
  inserted: number;
  updated: number;
  skipped: number; // rows the parser rejected (bad date, missing price, duplicate across tabs)
  future: number;  // dated after today (Jakarta)
  error?: string;
};

export const syncKey = (clientId: number) => `sheet_sync:${clientId}`;

/** Parse raw tabs into rows ready for saveSales. Pure apart from hashing, so it is testable. */
export async function sheetsToSales(raw: RawSheet[], clientId: number, nowSec?: number) {
  const sheets = raw.map((s) => toSheet(s.name, s.rows)).filter((s) => s.body.length > 0);
  if (sheets.length === 0) return { sheets: 0, rows: [], skipped: 0, future: 0, error: "No sheet with a recognisable header row" };

  // Tabs may differ slightly (a "Diskon" column appears mid-year): take each field from the first tab that has it.
  const map = {} as Mapping;
  for (const f of Object.keys(guessMapping([])) as Field[]) map[f] = null;
  for (const s of sheets) {
    const g = guessMapping(s.headers);
    for (const f of Object.keys(g) as Field[]) if (!map[f] && g[f]) map[f] = g[f];
  }
  const missing = REQUIRED.filter((f) => !map[f]);
  if (missing.length) return { sheets: sheets.length, rows: [], skipped: 0, future: 0, error: `Missing column for: ${missing.join(", ")}` };

  const built = await buildSales(sheets, map, { clientId, nowSec });
  const today = todayWib();
  const rows: any[] = [];
  let skipped = 0, future = 0;
  for (const r of built) {
    if (r.status !== "new") { skipped++; continue; }
    const row = {
      sale_key: r.sale_key, sale_date: r.date, value: r.value, label: r.label, source: r.source, consultant: r.consultant,
      group_key: r.group_key, has_contact: r.has_contact, departure_date: r.departure, package_name: r.package, room_type: r.room,
      down_payment: r.dp, pay_status: r.pay_status,
    };
    if (row.sale_date > today) { future++; continue; }
    if (validateSale(row, today)) { skipped++; continue; }
    rows.push(row);
  }
  return { sheets: sheets.length, rows, skipped, future };
}

export async function syncSheet(env: Env, clientId: number, raw: RawSheet[]): Promise<SyncResult> {
  const parsed = await sheetsToSales(raw, clientId);
  let inserted = 0, updated = 0;
  if (!parsed.error && parsed.rows.length) ({ inserted, updated } = await saveSales(env, clientId, parsed.rows));
  const result: SyncResult = {
    at: new Date().toISOString().slice(0, 19).replace("T", " "), sheets: parsed.sheets, inserted, updated, skipped: parsed.skipped, future: parsed.future,
    ...(parsed.error ? { error: parsed.error } : {}),
  };
  await env.DB.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind(syncKey(clientId), JSON.stringify(result))
    .run();
  return result;
}

/** True when "Sync now" can also ask the sheet to push: the trigger is set up and this client's sheet has synced before. */
export async function sheetTriggerReady(env: Env, clientId: number): Promise<boolean> {
  if (!env.SHEET_TRIGGER_URL || !env.SHEET_SYNC_TOKEN) return false;
  const row = await env.DB.prepare("SELECT 1 FROM app_settings WHERE key=?").bind(syncKey(clientId)).first();
  return row != null;
}

/** Asks the Apps Script web app in the sheet to push now. Never throws: the hourly push is the safety net. */
export async function triggerSheetSync(env: Env): Promise<void> {
  try {
    const res = await fetch(env.SHEET_TRIGGER_URL!, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: env.SHEET_SYNC_TOKEN }),
    });
    if (!res.ok) console.error(`sheet trigger answered ${res.status}`);
  } catch (e) {
    console.error("sheet trigger failed:", e);
  }
}

/** Constant-time check of the shared token (both sides hashed first so lengths match). */
export async function tokenMatches(given: string, expected: string): Promise<boolean> {
  const h = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([h(given), h(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
