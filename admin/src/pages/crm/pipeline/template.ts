// The downloadable contacts template for one number: the columns the importer understands, with this number's own stages and
// custom fields filled in as examples. Plain UTF-8 CSV without a byte-order mark (the gateway's reader loses the first header's name when one is present).
import type { FieldDef, Stage } from "./api";

const q = (v: string) => `"${v.replace(/"/g, '""')}"`;

export function templateCsv(stages: Stage[], fields: FieldDef[], owner: string): string {
  const base = ["Nama", "Nomor WhatsApp", "Tag", "Catatan", "Tahap", "Nilai deal (Rp)", "Perkiraan closing", "Pemilik"];
  const head = [...base, ...fields.map((f) => f.label)];
  const sample = (f: FieldDef, n: number) =>
    f.type === "number" ? String(n * 2) : f.type === "date" ? "2026-12-15" : f.type === "select" ? (f.options[n % Math.max(1, f.options.length)] ?? "") : f.type === "checkbox" ? (n ? "ya" : "") : f.type === "url" ? "https://" : n ? "contoh isi" : "";
  const stage = (i: number) => stages.filter((s) => s.kind === "open")[i]?.name ?? stages[i]?.name ?? "";
  const rows = [
    ["Budi Santoso", "6281234567890", "umroh, webinar", "Tanya paket Desember", stage(1), "28000000", "2026-12-20", owner, ...fields.map((f) => sample(f, 0))],
    ["Siti Aminah", "6281298765432", "referral", "", stage(0), "", "", "", ...fields.map((f) => sample(f, 1))],
  ];
  return [head, ...rows].map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
}

/** What each column means, shown next to the download button. */
export const TEMPLATE_HELP = [
  "Nomor WhatsApp is the only required column (08…, 628… or +62…).",
  "Tahap must be one of this number's stages (spelled as on the board); the contact then appears on the pipeline.",
  "Nilai deal is a whole amount in Rp; Perkiraan closing is a date (2026-12-20 or 20/12/2026).",
  "Pemilik is the name of a team member who can own leads on this number.",
  "Each custom field is a column named exactly like the field; choice fields must use one of their options; yes/no fields use ya or empty.",
  "Empty cells never erase what is already saved.",
];
