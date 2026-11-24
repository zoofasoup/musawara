// Sales-file handling, all in the browser: read CSV/XLSX (every sheet), find the
// header row, guess the column mapping, normalise, validate, and hash
// identifiers (SHA-256) so raw phone numbers / emails never reach our server.
//
// One file row = one traveller = one sale for the dashboard. For Meta, rows that
// share a booking (a "group" column) become ONE event worth the sum of their
// values, carried by whichever row has a phone number or email.

export type Field =
  | "name" | "time" | "value" | "discount" | "order_id" | "source" | "consultant" | "group"
  | "departure" | "package" | "room" | "dp" | "status"
  | "phone" | "email" | "first_name" | "last_name";
/** Field -> column TITLE (so one mapping works across sheets with the same titles). null = not mapped. */
export type Mapping = Record<Field, string | null>;

export const FIELD_LABEL: Record<Field, string> = {
  name: "Customer name",
  time: "Date of sale",
  value: "Package price",
  discount: "Discount",
  order_id: "Order / invoice ID",
  source: "Source",
  consultant: "Closer (UC)",
  group: "Booking / decision maker",
  departure: "Departure date",
  package: "Package",
  room: "Room type",
  dp: "Down payment (DP)",
  status: "Payment status",
  phone: "Phone / WhatsApp",
  email: "Email",
  first_name: "First name",
  last_name: "Last name",
};

export const FIELD_HINT: Partial<Record<Field, string>> = {
  name: "Used to tell sales apart. Only a short label (Budi S.) is stored.",
  group: "Same value on every member of one booking: they become one Meta event with the summed value.",
  discount: "Subtracted from the package price.",
  consultant: "The sales person who closed it (Umroh Consultant). Used for per-closer results.",
  status: "dp, lunas or batal. Cancelled sales stop counting in the dashboard.",
  room: "Triple, Quad, Sharing, Double...",
  order_id: "If present it identifies the sale on its own.",
};

export const REQUIRED: Field[] = ["time", "value"];

const SYNONYMS: Record<Field, string[]> = {
  name: ["nama", "name", "nama jamaah", "nama lengkap", "nama customer", "customer", "nama pelanggan"],
  time: ["tanggal closing", "tgl closing", "closing date", "date", "tanggal", "tgl", "tanggal transaksi", "tanggal bayar", "tgl bayar", "order date", "waktu", "datetime", "event time", "paid at", "purchase date", "tanggal pembelian"],
  value: ["paket harga", "harga paket", "value", "amount", "nominal", "total", "harga", "revenue", "nilai", "jumlah bayar", "pembayaran", "jumlah", "price"],
  discount: ["diskon", "discount", "potongan"],
  order_id: ["order id", "orderid", "invoice", "no invoice", "id transaksi", "transaction id", "no transaksi", "nomor transaksi", "kode transaksi", "id order"],
  source: ["sumber", "source", "channel"],
  consultant: ["closer uc", "closer", "umroh consultant uc", "umroh consultant", "consultant", "uc", "cs", "sales"],
  departure: ["tanggal berangkat", "tgl berangkat", "tanggal keberangkatan", "keberangkatan", "departure date", "departure", "berangkat"],
  package: ["nama paket", "paket", "package", "kode paket", "tipe paket"],
  room: ["tipe kamar", "jenis kamar", "kamar", "room", "room type", "pax"],
  dp: ["dp", "down payment", "uang muka", "deposit"],
  status: ["status", "status pembayaran", "status booking", "status bayar", "payment status"],
  group: ["kode booking", "booking id", "kode grup", "kode kelompok", "grup", "group", "kelompok", "pemesan", "decision maker", "dm", "penanggung jawab", "booking"],
  phone: ["phone", "telepon", "telp", "no hp", "nomor hp", "hp", "whatsapp", "no whatsapp", "no wa", "nomor wa", "wa", "mobile", "ph", "no telepon", "nomor telepon"],
  email: ["email", "e-mail", "surel"],
  first_name: ["first name", "firstname", "nama depan", "fn"],
  last_name: ["last name", "lastname", "nama belakang", "ln"],
};

// partial (substring) matching must never pick these as a date of sale
const NOT_A_SALE_DATE = /berangkat|lahir|keberangkatan|departure/;

export const norm = (s: string) =>
  s.toLowerCase().replace(/[()_\-.:]+/g, " ").replace(/\s+/g, " ").trim();

/** Best column title per field, from the titles of the selected sheets. */
export function guessMapping(headers: string[]): Mapping {
  const used = new Set<number>();
  const m = {} as Mapping;
  const order: Field[] = ["order_id", "group", "time", "departure", "value", "discount", "dp", "package", "room", "status", "name", "first_name", "last_name", "phone", "email", "source", "consultant"];
  const pick = (f: Field): number => {
    let idx = headers.findIndex((h, i) => !used.has(i) && SYNONYMS[f].includes(norm(h)));
    if (idx < 0) {
      idx = headers.findIndex(
        (h, i) =>
          !used.has(i) &&
          SYNONYMS[f].some((s) => s.length > 3 && norm(h).includes(s)) &&
          !(f === "time" && NOT_A_SALE_DATE.test(norm(h))) &&
          !(f === "value" && /^(dp|down payment)$/.test(norm(h)))
      );
    }
    return idx;
  };
  for (const f of order) {
    const idx = pick(f);
    if (idx >= 0) used.add(idx);
    m[f] = idx >= 0 ? headers[idx] : null;
  }
  return m;
}

/** How many distinct fields a row's cells look like (for header-row detection). */
function headerScore(cells: string[]): number {
  const fields = new Set<Field>();
  for (const c of cells) {
    const n = norm(c);
    if (!n) continue;
    for (const f of Object.keys(SYNONYMS) as Field[]) if (SYNONYMS[f].includes(n)) fields.add(f);
  }
  return fields.size;
}

// ---------------------------------------------------------------- template
/** Header row of the downloadable template; guessMapping recognises every title. */
export const TEMPLATE_HEADERS = ["Nama", "No Invoice", "Tanggal Closing", "Paket Harga", "Diskon", "DP", "Tanggal Berangkat", "Paket", "Tipe Kamar", "Status", "No WhatsApp", "Email", "Kode Booking", "Sumber", "Closer (UC)"];

/** Header-only CSV (UTF-8 BOM so Excel opens it cleanly). No example rows on purpose: a sample row uploaded by mistake would become a real sale. */
export function templateCsv(): string {
  return "﻿" + TEMPLATE_HEADERS.join(",") + "\r\n";
}

export const COLUMN_GUIDE: Array<{ title: string; need: "required" | "recommended" | "optional"; note: string; example: string }> = [
  { title: "Tanggal Closing", need: "required", note: "Tanggal penjualan. Format 27/10/2026, 2026-10-27, atau 27 Oktober 2026.", example: "27/10/2026" },
  { title: "Paket Harga", need: "required", note: "Harga paket penuh per orang, angka saja. Boleh 'Rp 30.000.000'.", example: "30000000" },
  { title: "Closer (UC)", need: "recommended", note: "Sales yang closing (Umroh Consultant). Dipakai untuk hasil per closer.", example: "Roro" },
  { title: "Nama", need: "recommended", note: "Membedakan satu penjualan dari yang lain. Yang disimpan hanya inisial singkat.", example: "Budi Santoso" },
  { title: "Tanggal Berangkat", need: "optional", note: "Tanggal keberangkatan paket yang dibeli.", example: "14 Januari 2027" },
  { title: "Paket / Tipe Kamar", need: "optional", note: "Nama paket dan tipe kamar (Triple, Quad, Sharing, Double).", example: "Umroh Garuda / Quad" },
  { title: "DP", need: "optional", note: "Uang muka yang sudah masuk, angka saja.", example: "5000000" },
  { title: "Status", need: "optional", note: "dp, lunas, atau batal. Penjualan batal tidak dihitung di dashboard.", example: "lunas" },
  { title: "Diskon", need: "optional", note: "Dikurangkan dari harga paket.", example: "1000000" },
  { title: "Kode Booking", need: "optional", note: "Isi sama untuk semua anggota satu pemesanan. Untuk Meta, mereka jadi satu event dengan nilai gabungan.", example: "Wira Adi Putra" },
  { title: "No WhatsApp / Email", need: "optional", note: "Cukup kontak decision maker, di salah satu baris. Tanpa kontak, penjualan hanya tersimpan di dashboard.", example: "081234567890" },
  { title: "Sumber", need: "optional", note: "Asal pelanggan, untuk analisis nanti.", example: "Ads IG" },
];

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

export type Sheet = {
  name: string;
  headers: string[];
  body: Array<{ line: number; cells: string[] }>; // line = 1-based row number in the sheet
  recognised: number;                              // how many known fields the header row has
};

/** Find the header row (a few title rows may sit above it) and keep the rows below. */
export function toSheet(name: string, rows: string[][]): Sheet {
  let best = -1, bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const sc = headerScore(rows[i]);
    if (sc > bestScore) { best = i; bestScore = sc; }
  }
  if (best < 0 || bestScore < 2) return { name, headers: [], body: [], recognised: 0 };
  const headers = rows[best].map((h) => h.trim());
  const body = rows
    .slice(best + 1)
    .map((cells, k) => ({ line: best + 2 + k, cells }))
    // numbered-but-empty rows and footers ("Prepared by") have one filled cell at most
    .filter((r) => r.cells.filter((c) => c.trim() !== "").length >= 2);
  return { name, headers, body, recognised: bestScore };
}

/**
 * The first table of a .csv or .xlsx exactly as written, row by row, header row first. The contacts import uses this: unlike
 * parseWorkbook it does not go looking for a sales-style header row, so any file with headers in its first row reads.
 */
export async function parseRawRows(file: File): Promise<string[][]> {
  if (/\.(csv|txt|tsv)$/i.test(file.name)) return parseCsv(await file.text());
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsxFile } = await import("read-excel-file/universal");
    const sheets = await readXlsxFile(file);
    const first = sheets[0];
    if (!first) return [];
    return first.data
      .map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? wall(c) : typeof c === "number" ? String(c) : String(c).trim())))
      .filter((r) => r.some((c) => c !== ""));
  }
  throw new Error("Use a .csv or .xlsx file (for .xls, save it as .xlsx or CSV first).");
}

/**
 * What the gateway's spreadsheet reader can take: a CSV starting with a byte-order mark (Excel's "CSV UTF-8" adds one, and so did our
 * own template) makes it mangle the first header, so the name column is silently lost. The mark is removed before upload; other files pass.
 */
export async function withoutBom(file: File): Promise<File> {
  if (!/\.(csv|txt|tsv)$/i.test(file.name)) return file;
  const text = await file.text();
  return text.charCodeAt(0) === 0xfeff ? new File([text.slice(1)], file.name, { type: file.type }) : file;
}

/** Every sheet of a .xlsx (or the single table of a .csv) as raw string rows. */
export async function parseWorkbook(file: File): Promise<Sheet[]> {
  if (/\.(csv|txt|tsv)$/i.test(file.name)) return [toSheet("CSV", parseCsv(await file.text()))];
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsxFile } = await import("read-excel-file/universal");
    const sheets = await readXlsxFile(file);
    return sheets.map((s) =>
      toSheet(
        s.sheet,
        s.data
          .map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? wall(c) : typeof c === "number" ? String(c) : String(c).trim())))
          .filter((r) => r.some((c) => c !== ""))
      )
    );
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

const MONTHS: Record<string, number> = {
  january: 1, januari: 1, jan: 1, february: 2, februari: 2, feb: 2, march: 3, maret: 3, mar: 3, april: 4, apr: 4,
  may: 5, mei: 5, june: 6, juni: 6, jun: 6, july: 7, juli: 7, jul: 7, august: 8, agustus: 8, agu: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oktober: 10, okt: 10, oct: 10, november: 11, nov: 11, december: 12, desember: 12, des: 12, dec: 12,
};

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
  } else if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})/))) {
    // "5 October 2026" / "5 Oktober 2026"
    const mm = MONTHS[m[2].toLowerCase()];
    if (!mm) return null;
    [d, mo, y] = [+m[1], mm, +m[3]];
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

export const ymdWib = (unix: number) => new Date((unix + WIB_OFFSET_S) * 1000).toISOString().slice(0, 10);

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Lowercase, no invisible characters, single spaces: so "Hamzar  Ali" and "⁠hamzar ali" are the same person. */
export const normName = (s: string) => s.replace(/[​-‏⁠﻿ ]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

/** "Pandhit Seno Aji" -> "Pandhit S." (enough to recognise a row, not enough to identify a person). */
export function shortLabel(name: string): string {
  const parts = name.replace(/[​-‏⁠﻿ ]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  return parts.length === 1 ? cap(parts[0]).slice(0, 24) : `${cap(parts[0]).slice(0, 18)} ${parts[1].charAt(0).toUpperCase()}.`;
}

/** "lunas" / "paid" -> paid, "dp"/"cicilan" -> dp, "batal"/"cancel"/"refund" -> cancelled; anything else = unknown. */
export function parsePayStatus(raw: string): SaleRow["pay_status"] {
  const n = norm(raw);
  if (!n) return null;
  if (/batal|cancel|refund|gagal/.test(n)) return "cancelled";
  if (/lunas|paid|full/.test(n)) return "paid";
  if (/^dp|cicil|angsur|booking|belum lunas/.test(n)) return "dp";
  return null;
}

// ---------------------------------------------------------------- building sales
export const MAX_AGE_DAYS = 62;

export type SaleStatus = "new" | "saved" | "dup_in_file" | "invalid";
export type MetaPlan = "send" | "sent" | "no_contact" | "too_old" | "already_event";

export type SaleRow = {
  sheet: string;
  line: number;
  status: SaleStatus;
  reason?: string;
  sale_key?: string;
  label: string;
  date: string;          // YYYY-MM-DD (Jakarta)
  time?: number;         // unix
  value?: number;
  source: string;
  consultant: string;
  group_key: string | null;
  has_contact: boolean;
  hashes: { ph?: string; em?: string; fn?: string; ln?: string };
  departure: string | null;   // YYYY-MM-DD
  package: string;
  room: string;
  dp: number | null;
  pay_status: "dp" | "paid" | "cancelled" | null;
  meta?: MetaPlan;       // filled by planMeta()
  metaReason?: string;
};

export type BuildOptions = { clientId: number; nowSec?: number };

/** Apply the mapping to one sheet's rows (columns found by TITLE, so sheets with the same titles share one mapping). */
export async function buildSales(sheets: Sheet[], map: Mapping, opt: BuildOptions): Promise<SaleRow[]> {
  const now = opt.nowSec ?? Math.floor(Date.now() / 1000);
  const out: SaleRow[] = [];
  const seen = new Set<string>();

  for (const sh of sheets) {
    const idx = {} as Record<Field, number>;
    (Object.keys(map) as Field[]).forEach((f) => {
      const t = map[f];
      idx[f] = t ? sh.headers.findIndex((h) => norm(h) === norm(t)) : -1;
    });
    const cell = (cells: string[], f: Field) => (idx[f] >= 0 ? (cells[idx[f]] ?? "").trim() : "");
    // identical name+date rows inside one sheet are different travellers (placeholders such as "Pak Isam" twice): count them by position
    const occurrence = new Map<string, number>();

    for (const r of sh.body) {
      const name = cell(r.cells, "name");
      const timeRaw = cell(r.cells, "time");
      const priceRaw = cell(r.cells, "value");
      // a row with nothing sale-like in it is just filler (numbered empty rows, "Prepared by", ...)
      if (!timeRaw && !priceRaw && !cell(r.cells, "order_id") && !cell(r.cells, "phone")) continue;

      const depTime = parseTime(cell(r.cells, "departure"));
      const dpRaw = cell(r.cells, "dp");
      const base = {
        sheet: sh.name, line: r.line, label: shortLabel(name), source: cell(r.cells, "source"), consultant: cell(r.cells, "consultant"),
        group_key: null as string | null, has_contact: false, hashes: {} as SaleRow["hashes"],
        departure: depTime != null ? ymdWib(depTime) : null,
        package: cell(r.cells, "package"), room: cell(r.cells, "room"),
        dp: dpRaw ? parseAmount(dpRaw) : null,
        pay_status: parsePayStatus(cell(r.cells, "status")),
      };
      const time = parseTime(timeRaw);
      const price = priceRaw ? parseAmount(priceRaw) : null;
      const discRaw = cell(r.cells, "discount");
      const disc = discRaw ? parseAmount(discRaw) ?? 0 : 0;
      const value = price != null ? Math.round((price - disc) * 100) / 100 : null;
      const date = time != null ? ymdWib(time) : "";

      if (time == null) { out.push({ ...base, date, status: "invalid", reason: timeRaw ? "Date not understood" : "Date missing" }); continue; }
      if (time > now + 86400) { out.push({ ...base, date, status: "invalid", reason: "Date is in the future" }); continue; }
      if (value == null || value <= 0) { out.push({ ...base, date, status: "invalid", reason: price == null ? "Price missing" : "Price minus discount is not positive" }); continue; }

      // identity of the sale
      const order = cell(r.cells, "order_id");
      let ident: string;
      if (order) ident = `o:${order.toLowerCase()}`;
      else {
        const nn = normName(name);
        if (!nn) { out.push({ ...base, date, status: "invalid", reason: "Name missing (needed to tell sales apart)" }); continue; }
        const k = `${nn}|${date}`;
        const n = (occurrence.get(k) ?? 0) + 1;
        occurrence.set(k, n);
        ident = `n:${nn}|${date}|${n}`;
      }
      const sale_key = await sha256Hex(`v2|${opt.clientId}|${ident}`);
      if (seen.has(sale_key)) { out.push({ ...base, date, time, value, sale_key, status: "dup_in_file", reason: "Same sale appears earlier in this file (another sheet?)" }); continue; }
      seen.add(sale_key);

      // contact + booking
      const phone = normPhone(cell(r.cells, "phone"));
      const email = normEmail(cell(r.cells, "email"));
      const hashes: SaleRow["hashes"] = {};
      if (phone) hashes.ph = await sha256Hex(phone);
      if (email) hashes.em = await sha256Hex(email);
      const fn = cell(r.cells, "first_name").toLowerCase(), ln = cell(r.cells, "last_name").toLowerCase();
      if (fn) hashes.fn = await sha256Hex(fn);
      if (ln) hashes.ln = await sha256Hex(ln);
      const grp = normName(cell(r.cells, "group"));
      const group_key = grp ? await sha256Hex(`v2|g|${opt.clientId}|${grp}`) : null;

      out.push({ ...base, date, time, value, sale_key, group_key, has_contact: Boolean(phone || email), hashes, status: "new" });
    }
  }
  return out;
}

// ---------------------------------------------------------------- Meta planning
export type MetaUnit = {
  unit_key: string;                       // group_key, or the sale's own key
  sale_keys: string[];
  value: number;
  count: number;
  event_time: number;                     // latest sale in the unit
  user_data: Record<string, string[]>;
  rows: SaleRow[];
};

/**
 * Decide, per booking (or per person when there is no group column), what can go
 * to Meta: it needs a phone/email on some row, a sale within the last 62 days, and
 * must not have been sent already. Everything else stays dashboard-only, with a reason.
 * `savedState` = what the server already knows per sale key ('dashboard' | 'sent').
 */
export function planMeta(rows: SaleRow[], savedState: Record<string, string>, now = Math.floor(Date.now() / 1000)): MetaUnit[] {
  const live = rows.filter((r) => r.sale_key && (r.status === "new" || r.status === "saved"));
  const units = new Map<string, SaleRow[]>();
  for (const r of live) {
    const k = r.group_key ?? r.sale_key!;
    (units.get(k) ?? units.set(k, []).get(k)!).push(r);
  }
  const out: MetaUnit[] = [];
  for (const [unit_key, members] of units) {
    const user_data: Record<string, string[]> = {};
    for (const m of members) {
      for (const [k, v] of Object.entries(m.hashes)) {
        if (!v) continue;
        const arr = (user_data[k] ??= []);
        if (!arr.includes(v) && arr.length < 5) arr.push(v);
      }
    }
    const event_time = Math.max(...members.map((m) => m.time ?? 0));
    const allSent = members.every((m) => savedState[m.sale_key!] === "sent");
    const hasContact = Boolean(user_data.ph || user_data.em);
    let plan: MetaPlan = "send", why = "";
    if (allSent) { plan = "sent"; why = "Already sent to Meta"; }
    else if (!hasContact) { plan = "no_contact"; why = "No phone or email in this booking"; }
    else if (event_time < now - MAX_AGE_DAYS * 86400) { plan = "too_old"; why = `Older than ${MAX_AGE_DAYS} days`; }
    for (const m of members) { m.meta = plan; m.metaReason = why; }
    if (plan === "send") {
      out.push({ unit_key, sale_keys: members.map((m) => m.sale_key!), value: members.reduce((s, m) => s + (m.value ?? 0), 0), count: members.length, event_time, user_data, rows: members });
    }
  }
  return out;
}

/** The Meta event for one unit. Its key is stable per booking, so the ledger never lets it go out twice. */
export async function unitEvent(u: MetaUnit, o: { datasetId: string; eventName: string; actionSource: string; currency: string }) {
  return {
    row_key: await sha256Hex(`v2|${o.datasetId}|${o.eventName}|u:${u.unit_key}`),
    event_name: o.eventName,
    event_time: u.event_time,
    action_source: o.actionSource,
    value: Math.round(u.value * 100) / 100,
    currency: o.currency,
    order_id: null as string | null,
    num_items: u.count,
    sale_keys: u.sale_keys,
    user_data: u.user_data,
  };
}
