// Daily ad cost out of a marketplace ad report (TikTok campaign overview: "Per Hari", "Biaya", "Mata Uang").
// Read in the browser; only date and amount are sent to the server.

export type AdDay = { date: string; amount: number; revenue?: number; orders?: number };

const DATE_HEADS = ["per hari", "tanggal"];
const COST_HEADS = ["biaya"];
const text = (v: unknown) => String(v ?? "").trim();

function ymd(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  return /^(\d{4}-\d{2}-\d{2})([ T]|$)/.exec(text(v))?.[1] ?? null;
}

/** A whole or two-decimal number. "1.234" is refused: it could mean one thousand or one and a bit. */
function money(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  const s = text(v);
  return /^\d+(\.\d{1,2})?$/.test(s) ? Math.round(Number(s)) : null;
}

/** Rows of the first sheet, header first. Rows without a date (totals, blanks) are skipped; a date with an unreadable cost stops the import. */
export function parseAdReport(rows: unknown[][]): AdDay[] {
  const head = (rows[0] ?? []).map((h) => text(h).toLowerCase());
  const at = head.findIndex((h) => DATE_HEADS.includes(h));
  const cost = head.findIndex((h) => COST_HEADS.includes(h));
  const currency = head.indexOf("mata uang");
  const revenue = head.findIndex((h) => h.startsWith("penghasilan bruto"));
  const orders = head.findIndex((h) => h.startsWith("pesanan sku"));
  if (at < 0 || cost < 0) throw new Error('This file needs a "Per Hari" (or "Tanggal") column and a "Biaya" column.');
  const days = new Map<string, AdDay>();
  for (const row of rows.slice(1)) {
    const date = ymd(row[at]);
    if (!date) continue;
    if (currency >= 0 && text(row[currency]) && text(row[currency]) !== "IDR") throw new Error("Only IDR reports can be imported.");
    const amount = money(row[cost]);
    if (amount === null) throw new Error(`The cost on ${date} cannot be read: "${text(row[cost])}".`);
    const day = days.get(date) ?? { date, amount: 0 };
    day.amount += amount;
    if (revenue >= 0) day.revenue = (day.revenue ?? 0) + (money(row[revenue]) ?? 0);
    if (revenue >= 0 && orders >= 0) day.orders = (day.orders ?? 0) + (money(row[orders]) ?? 0); // results come as a pair
    days.set(date, day);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Comma separated text with quoted cells (Shopee's ad names contain commas and quotes). */
function csvRows(source: string): string[][] {
  const rows: string[][] = [[]];
  let cell = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") { rows[rows.length - 1].push(cell); cell = ""; }
    else if (c === "\n") { rows[rows.length - 1].push(cell); rows.push([]); cell = ""; }
    else if (c !== "\r") cell += c;
  }
  rows[rows.length - 1].push(cell);
  return rows;
}

const dmy = (v: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

/**
 * Shopee's "all ads" report has one row per ad for the whole period and no dates, so it is only accepted for a single month
 * and stored as that month's total on the last day of the period.
 */
export function parseShopeeCsv(source: string): { from: string; to: string; days: AdDay[] } {
  const rows = csvRows(source.replace(/^\uFEFF/, ""));
  const period = rows.find((r) => r[0] === "Periode")?.[1]?.split(" - ") ?? [];
  const from = dmy(period[0] ?? ""), to = dmy(period[1] ?? "");
  const at = rows.findIndex((r) => r[0] === "Urutan");
  const head = (rows[at] ?? []).map((h) => h.trim());
  const cost = head.indexOf("Biaya"), revenue = head.indexOf("Omzet Penjualan"), orders = head.indexOf("Konversi");
  if (!from || !to || at < 0 || cost < 0 || revenue < 0 || orders < 0) throw new Error("This is not a Shopee ad report (Data Keseluruhan Iklan).");
  if (from.slice(0, 7) !== to.slice(0, 7)) throw new Error("Download the Shopee report for one month at a time: it has no dates per row.");
  const total = { date: to, amount: 0, revenue: 0, orders: 0 };
  for (const row of rows.slice(at + 1)) {
    if (!/^\d+$/.test((row[0] ?? "").trim())) continue;
    const values = [money(row[cost]), money(row[revenue]), money(row[orders])];
    if (values.some((v) => v === null)) throw new Error(`Ad ${row[0]} has a number that cannot be read.`);
    total.amount += values[0]!;
    total.revenue += values[1]!;
    total.orders += values[2]!;
  }
  return { from, to, days: [total] };
}
