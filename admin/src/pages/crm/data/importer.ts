// Client-side preview of a contact import. The gateway does the real import (POST /contacts/import);
// this mirrors its column detection and phone rule so the preview matches what will happen.

import { parseCsv, parseWorkbook } from "../../../lib/conversions";
import { normalizePhone, parseTags } from "./shared";

const PHONE_KEYS = /\b(phone|nomor|no|nohp|hp|handphone|whatsapp|wa|telepon|telp|tlp|number|mobile)\b/;
const NAME_KEYS = /\b(nama|name)\b/;
const TAG_KEYS = /\b(tags?|label|grup|group|kategori)\b/;
const NOTE_KEYS = /\b(notes?|catatan|keterangan|ket)\b/;

const clean = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Index of the first header matching, like the gateway's pick(): a name-like header is never the phone column. */
function findCol(headers: string[], re: RegExp): number {
  return headers.findIndex((h) => {
    const c = clean(h);
    if (re === PHONE_KEYS && NAME_KEYS.test(c)) return false;
    return re.test(c);
  });
}

export type PreviewRow = { line: number; phone: string; name: string; tags: string[]; notes: string };
export type ImportPreview = {
  total: number;
  cols: { phone: string | null; name: string | null; tags: string | null; notes: string | null };
  valid: PreviewRow[];
  invalid: Array<{ line: number; value: string }>;
  duplicates: number;
};

export async function readRows(file: File | null, pasted: string): Promise<string[][]> {
  if (file) {
    if (/\.xls$/i.test(file.name)) throw new Error("PREVIEW_UNSUPPORTED");
    const sheets = await parseWorkbook(file);
    const s = sheets[0];
    if (!s) return [];
    return [s.headers, ...s.body.map((b) => b.cells)];
  }
  return parseCsv(pasted);
}

export function buildPreview(rows: string[][]): ImportPreview {
  if (!rows.length) throw new Error("The file is empty.");
  const headers = rows[0];
  const p = findCol(headers, PHONE_KEYS);
  if (p < 0) throw new Error('No phone column found. Put a header such as "Nomor", "No HP", "WA" or "Phone" in the first row.');
  const n = findCol(headers, NAME_KEYS), t = findCol(headers, TAG_KEYS), o = findCol(headers, NOTE_KEYS);
  const valid: PreviewRow[] = [];
  const invalid: ImportPreview["invalid"] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  rows.slice(1).forEach((cells, i) => {
    const raw = cells[p] ?? "";
    const phone = normalizePhone(raw);
    if (!phone) {
      if (String(raw).trim()) invalid.push({ line: i + 2, value: raw });
      return;
    }
    if (seen.has(phone)) duplicates++;
    seen.add(phone);
    valid.push({ line: i + 2, phone, name: n >= 0 ? cells[n] ?? "" : "", tags: t >= 0 ? parseTags(cells[t]) : [], notes: o >= 0 ? cells[o] ?? "" : "" });
  });
  return {
    total: rows.length - 1,
    cols: { phone: headers[p], name: n >= 0 ? headers[n] : null, tags: t >= 0 ? headers[t] : null, notes: o >= 0 ? headers[o] : null },
    valid,
    invalid,
    duplicates,
  };
}
