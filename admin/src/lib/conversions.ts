// Offline-conversion file handling, all in the browser: parse CSV/XLSX, guess the
// column mapping, normalise, validate, and hash identifiers (SHA-256) so raw
// phone numbers / emails never reach our server. Each sale also gets a stable
// row_key, which is what lets the server refuse to send the same sale twice.

export type Field = "phone" | "email" | "first_name" | "last_name" | "time" | "value" | "order_id";
export type Mapping = Record<Field, number>; // column index, -1 = not mapped

export const FIELD_LABEL: Record<Field, string> = {
  phone: "Phone / WhatsApp",
  email: "Email",
  first_name: "First name",
  last_name: "Last name",
  time: "Date of purchase",
  value: "Amount",
  order_id: "Order / invoice ID",
};

const SYNONYMS: Record<Field, string[]> = {
  phone: ["phone", "telepon", "telp", "no hp", "nomor hp", "hp", "whatsapp", "no wa", "nomor wa", "wa", "mobile", "ph", "no telepon", "nomor telepon"],
  email: ["email", "e-mail", "surel"],
  first_name: ["first name", "firstname", "nama depan", "fn"],
  last_name: ["last name", "lastname", "nama belakang", "ln"],
  time: ["date", "tanggal", "tgl", "tanggal transaksi", "tanggal bayar", "tgl bayar", "order date", "waktu", "datetime", "event time", "paid at", "purchase date", "tanggal pembelian"],
  value: ["value", "amount", "nominal", "total", "harga", "revenue", "nilai", "jumlah bayar", "pembayaran", "dp", "jumlah", "price"],
  order_id: ["order id", "orderid", "invoice", "no invoice", "id transaksi", "kode booking", "booking id", "transaction id", "no transaksi", "nomor transaksi", "kode transaksi", "id order"],
};

const norm = (s: string) => s.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

export function guessMapping(headers: string[]): Mapping {
  const used = new Set<number>();
  const m = {} as Mapping;
  (Object.keys(SYNONYMS) as Field[]).forEach((f) => {
    let idx = headers.findIndex((h, i) => !used.has(i) && SYNONYMS[f].includes(norm(h)));
    if (idx < 0) idx = headers.findIndex((h, i) => !used.has(i) && SYNONYMS[f].some((s) => s.length > 3 && norm(h).includes(s)));
    if (idx >= 0) used.add(idx);
    m[f] = idx;
  });
  return m;
}

// ---------------------------------------------------------------- parsing
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const first = t.split(/\r?\n/, 1)[0] ?? "";
  const delim = [";", "\t", ","].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') {
        if (t[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

const pad = (n: number) => String(n).padStart(2, "0");
// Excel stores times as floats, so 14:30:00 can arrive as 14:29:59.999: round to the nearest second.
const wall = (src: Date) => {
  const d = new Date(Math.round(src.getTime() / 1000) * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};

/** First sheet of a .csv / .xlsx file as rows of strings (Excel dates keep the wall-clock time typed in the sheet). */
export async function parseFile(file: File): Promise<string[][]> {
  if (/\.(csv|txt|tsv)$/i.test(file.name)) return parseCsv(await file.text());
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import("read-excel-file/universal");
    const data = await readSheet(file);
    return data
      .map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? wall(c) : typeof c === "number" ? String(c) : String(c).trim())))
      .filter((r) => r.some((c) => c !== ""));
  }
  throw new Error("Use a .csv or .xlsx file (for .xls, save it as .xlsx or CSV first).");
}

// ---------------------------------------------------------------- normalising
export function normPhone(raw: string, country = "62"): string | null {
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = country + d.slice(1);
  else if (d.startsWith("8") && country === "62") d = country + d; // 812… typed without the leading 0
  return d.length >= 9 && d.length <= 15 ? d : null;
}

export function normEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[^\d.,-]/g, "");
  if (!s || !/\d/.test(s)) return null;
  const dot = s.lastIndexOf("."), comma = s.lastIndexOf(",");
  if (dot >= 0 && comma >= 0) {
    const dec = dot > comma ? "." : ",";
    s = s.split(dec === "." ? "," : ".").join("").replace(dec, ".");
  } else if (dot >= 0 || comma >= 0) {
    const sep = dot >= 0 ? "." : ",";
    const parts = s.split(sep);
    const grouped = parts.length > 1 && parts.slice(1).every((p) => p.length === 3) && parts[0].length <= 3;
    s = grouped || parts.length > 2 ? parts.join("") : parts.join(".");
  }
  const n = Number(s);
  return isFinite(n) ? n : null;
}

const WIB_OFFSET_S = 7 * 3600;
/** Unix seconds for a wall-clock time typed in Asia/Jakarta. Date-only values become 12:00 WIB. */
export function parseTime(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  let y: number, mo: number, d: number, h = 12, mi = 0, se = 0;
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    [y, mo, d] = [+m[1], +m[2], +m[3]];
    if (m[4]) [h, mi, se] = [+m[4], +m[5], +(m[6] ?? 0)];
  } else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2})[:.](\d{2})(?::(\d{2}))?)?/))) {
    [d, mo, y] = [+m[1], +m[2], +m[3]];
    if (m[4]) [h, mi, se] = [+m[4], +m[5], +(m[6] ?? 0)];
  } else if (/^\d{5}(\.\d+)?$/.test(s)) {
    // Excel serial date
    const ms = Math.round((Number(s) - 25569) * 86400 * 1000);
    return Math.floor(ms / 1000) - WIB_OFFSET_S;
  } else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const t = Date.UTC(y, mo - 1, d, h, mi, se);
  const back = new Date(t);
  if (back.getUTCMonth() !== mo - 1) return null; // e.g. 31 Feb
  return Math.floor(t / 1000) - WIB_OFFSET_S;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- building rows
export type RowStatus = "new" | "sent" | "retry" | "uncertain" | "dup_in_file" | "invalid" | "too_old";

export type PreparedRow = {
  rowNo: number; // 1-based line in the file, header excluded
  status: RowStatus;
  reason?: string;
  preview: { who: string; time: string; value: string; order: string };
  payload?: {
    row_key: string;
    event_name: string;
    event_time: number;
    action_source: string;
    value: number | null;
    currency: string | null;
    order_id: string | null;
    user_data: Record<string, string[]>;
  };
};

export const MAX_AGE_DAYS = 62;

export type BuildOptions = { datasetId: string; eventName: string; actionSource: string; currency: string; nowSec?: number };

const maskPhone = (p: string) => (p.length > 5 ? `${p.slice(0, 4)}…${p.slice(-3)}` : p);
const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, "$1…$2");

export async function buildRows(rows: string[][], map: Mapping, opt: BuildOptions): Promise<PreparedRow[]> {
  const now = opt.nowSec ?? Math.floor(Date.now() / 1000);
  const cell = (r: string[], f: Field) => (map[f] >= 0 ? (r[map[f]] ?? "").trim() : "");
  const seen = new Set<string>();
  const out: PreparedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const phoneRaw = cell(r, "phone"), emailRaw = cell(r, "email");
    const phone = phoneRaw ? normPhone(phoneRaw) : null;
    const email = emailRaw ? normEmail(emailRaw) : null;
    const time = parseTime(cell(r, "time"));
    const needsValue = opt.eventName === "Purchase";
    const valueRaw = cell(r, "value");
    const value = valueRaw ? parseAmount(valueRaw) : null;
    const order = cell(r, "order_id") || null;
    const preview = {
      who: [phone ? maskPhone(phone) : phoneRaw ? `⚠ ${phoneRaw}` : "", email ? maskEmail(email) : ""].filter(Boolean).join(" · ") || "(none)",
      time: cell(r, "time"),
      value: valueRaw,
      order: order ?? "",
    };
    const base = { rowNo: i + 1, preview };

    let reason: string | null = null;
    if (!phone && !email) reason = phoneRaw || emailRaw ? "Phone/email not valid" : "No phone or email, Meta cannot match this person";
    else if (time == null) reason = "Date missing or not understood";
    else if (needsValue && (value == null || value <= 0)) reason = "Amount missing or not a positive number";
    if (reason) { out.push({ ...base, status: "invalid", reason }); continue; }
    if (time! > now + 300) { out.push({ ...base, status: "invalid", reason: "Date is in the future" }); continue; }
    if (time! < now - MAX_AGE_DAYS * 86400) { out.push({ ...base, status: "too_old", reason: `Older than ${MAX_AGE_DAYS} days, Meta will not accept it` }); continue; }

    const ph = phone ? await sha256Hex(phone) : null;
    const em = email ? await sha256Hex(email) : null;
    const user_data: Record<string, string[]> = {};
    if (ph) user_data.ph = [ph];
    if (em) user_data.em = [em];
    const fn = cell(r, "first_name").toLowerCase();
    const ln = cell(r, "last_name").toLowerCase();
    if (fn) user_data.fn = [await sha256Hex(fn)];
    if (ln) user_data.ln = [await sha256Hex(ln)];

    // An order/invoice ID identifies the sale on its own (so a corrected phone number
    // can't create a "new" sale); without one, identity + time + amount does.
    const ident = order ? `o:${order.toLowerCase()}` : `i:${ph ?? ""}|${em ?? ""}|t:${time}|v:${value ?? ""}`;
    const row_key = await sha256Hex(`v1|${opt.datasetId}|${opt.eventName}|${ident}`);
    if (seen.has(row_key)) { out.push({ ...base, status: "dup_in_file", reason: order ? "Same order ID appears earlier in this file" : "Identical row appears earlier in this file" }); continue; }
    seen.add(row_key);

    out.push({
      ...base,
      status: "new",
      payload: {
        row_key,
        event_name: opt.eventName,
        event_time: time!,
        action_source: opt.actionSource,
        value: value != null ? Math.round(value * 100) / 100 : null,
        currency: value != null ? opt.currency : null,
        order_id: order,
        user_data,
      },
    });
  }
  return out;
}
