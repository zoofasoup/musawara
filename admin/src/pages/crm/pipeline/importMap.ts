// Turns the columns of a contacts file into pipeline data: stage, deal value, closing date, owner, and the number's custom fields
// (a column whose header is a field's label, with a trailing "(contact)" from Kommo ignored). Pure, so it is tested without a browser.

export type PipelineImportRow = { phone: string; stage?: string; value_idr?: number; expected_close?: string; owner?: string; fields?: Record<string, string> };

const clean = (h: string) => h.toLowerCase().replace(/\(contact\)|\(lead\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const STAGE = /^(tahap|stage|status pipeline|pipeline)$/;
const VALUE = /^(nilai deal|nilai deal rp|deal value|deal value rp|nilai|value|budget deal|sale|price)$/;
const CLOSE = /^(perkiraan closing|expected close|expected closing|closing|tanggal closing|close date|closed at)$/;
const OWNER = /^(pemilik|owner|responsible user|penanggung jawab|pic)$/;

/** Accepts 2026-12-20, 20/12/2026, 20-12-2026; returns YYYY-MM-DD or null. */
export function toYmd(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(s);
  if (!m) { const d = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); if (d) m = [d[0], d[3], d[2].padStart(2, "0"), d[1].padStart(2, "0")] as unknown as RegExpExecArray; }
  if (!m) return null;
  const [, y, mo, da] = m;
  const t = Date.UTC(+y, +mo - 1, +da);
  return new Date(t).getUTCMonth() === +mo - 1 && new Date(t).getUTCDate() === +da ? `${y}-${mo}-${da}` : null;
}

const YES = new Set(["1", "ya", "yes", "y", "true", "x", "v", "iya", "sudah"]);

export function pipelineRows(rows: string[][], phoneHeader: string, fieldLabels: string[], normalize: (raw: unknown) => string | null): { rows: PipelineImportRow[]; usedColumns: string[] } {
  const headers = rows[0] ?? [];
  const col = (re: RegExp) => headers.findIndex((h) => re.test(clean(h)));
  const phoneCol = headers.indexOf(phoneHeader);
  const [st, va, cl, ow] = [col(STAGE), col(VALUE), col(CLOSE), col(OWNER)];
  const labels = new Map(fieldLabels.map((l) => [clean(l), l]));
  const fieldCols = headers.map((h, i) => ({ i, label: labels.get(clean(h)) })).filter((x): x is { i: number; label: string } => !!x.label && x.i !== phoneCol);
  const used = [st, va, cl, ow].filter((i) => i >= 0).map((i) => headers[i]).concat(fieldCols.map((f) => headers[f.i]));
  if (phoneCol < 0 || used.length === 0) return { rows: [], usedColumns: [] };
  const out: PipelineImportRow[] = [];
  for (const cells of rows.slice(1)) {
    const phone = normalize(cells[phoneCol]);
    if (!phone) continue;
    const r: PipelineImportRow = { phone };
    const stage = st >= 0 ? (cells[st] ?? "").trim() : "";
    if (stage) r.stage = stage;
    const value = va >= 0 ? (cells[va] ?? "").replace(/[^\d]/g, "") : "";
    if (value) r.value_idr = Number(value);
    const close = cl >= 0 ? (cells[cl] ?? "").trim() : "";
    if (close) r.expected_close = toYmd(close) ?? close; // an unreadable date is sent as is so the server can report it
    const owner = ow >= 0 ? (cells[ow] ?? "").trim() : "";
    if (owner) r.owner = owner;
    const fields: Record<string, string> = {};
    for (const f of fieldCols) {
      const raw = (cells[f.i] ?? "").toString().trim();
      if (raw) fields[f.label] = raw;
    }
    if (Object.keys(fields).length) r.fields = fields;
    if (r.stage || r.value_idr !== undefined || r.expected_close || r.owner || r.fields) out.push(r);
  }
  return { rows: out, usedColumns: used };
}

/** Checkbox cells written as "ya", "x", "yes" and so on become "1"; everything else is left for the server to check. */
export const cleanFieldCell = (type: string, raw: string) => (type === "checkbox" ? (YES.has(raw.trim().toLowerCase()) ? "1" : "") : raw);

/**
 * Owner names that are not a team member of this number are dropped (a Kommo file names every salesperson it ever had); the
 * contact is still imported, just without an owner. Rows left with nothing to say are removed. Returns the names that were not found.
 */
export function keepKnownOwners(rows: PipelineImportRow[], owners: string[]): { rows: PipelineImportRow[]; unknown: string[] } {
  const known = new Set(owners.map((o) => o.trim().toLowerCase()));
  const unknown = new Set<string>();
  const out: PipelineImportRow[] = [];
  for (const r of rows) {
    const next = { ...r };
    if (next.owner && !known.has(next.owner.trim().toLowerCase())) { unknown.add(next.owner); delete next.owner; }
    if (next.stage || next.value_idr !== undefined || next.expected_close || next.owner || next.fields) out.push(next);
  }
  return { rows: out, unknown: [...unknown] };
}
