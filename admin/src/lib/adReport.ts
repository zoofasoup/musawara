// Daily ad cost out of a marketplace ad report (TikTok campaign overview: "Per Hari", "Biaya", "Mata Uang").
// Read in the browser; only date and amount are sent to the server.

export type AdDay = { date: string; amount: number };

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
  if (at < 0 || cost < 0) throw new Error('This file needs a "Per Hari" (or "Tanggal") column and a "Biaya" column.');
  const days = new Map<string, number>();
  for (const row of rows.slice(1)) {
    const date = ymd(row[at]);
    if (!date) continue;
    if (currency >= 0 && text(row[currency]) && text(row[currency]) !== "IDR") throw new Error("Only IDR reports can be imported.");
    const amount = money(row[cost]);
    if (amount === null) throw new Error(`The cost on ${date} cannot be read: "${text(row[cost])}".`);
    days.set(date, (days.get(date) ?? 0) + amount);
  }
  return [...days].map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date));
}
