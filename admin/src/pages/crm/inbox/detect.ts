// Finds answers to the number's custom fields in a chat, so they can be saved with one click, already in the field's own format
// (a number, a year, one of the choices…). Plain rules, run in the browser: no message text leaves the app. It only ever suggests.

export type DetectField = { id: number; label: string; type: "text" | "number" | "date" | "select" | "checkbox" | "url"; options: string[] };
export type DetectMsg = { from_me: number; body: string; ts: number };
export type Suggestion = { fieldId: number; label: string; value: string; display: string; source: string };

type Kind = "people" | "adults" | "children" | "elderly" | "infants" | "month" | "year" | "age" | "city" | "before" | "generic";

function kindOf(f: DetectField): Kind {
  const l = f.label.toLowerCase();
  if (/jumlah|berapa orang|pax|peserta|jamaah/.test(l) && f.type === "number") return "people";
  if (/dewasa|adult/.test(l)) return "adults";
  if (/anak|child/.test(l)) return "children";
  if (/lansia|elderly/.test(l)) return "elderly";
  if (/infant|bayi/.test(l)) return "infants";
  if (/bulan|month/.test(l)) return "month";
  if (/tahun|year/.test(l)) return "year";
  if (/umur|usia|\bage\b/.test(l)) return "age";
  if (/domisili|kota|city|alamat/.test(l)) return "city";
  if (/pernah/.test(l)) return "before";
  return "generic";
}

/** Words in OUR message that mean we are asking about this field. */
const ASKS: Record<Kind, RegExp> = {
  people: /berapa (orang|jamaah|pax)|untuk berapa|jumlah (jamaah|orang|peserta)|berangkat berapa/,
  adults: /dewasa/,
  children: /\banak\b/,
  elderly: /lansia/,
  infants: /infant|bayi/,
  month: /bulan (apa|berapa)|rencana (bulan|keberangkatan|berangkat)|kapan (rencana|mau|ingin|berangkat)|(berangkat|keberangkatan)[^?.]{0,20}kapan|kira-?kira kapan|bulan dan tahun/,
  year: /tahun (apa|berapa)|bulan dan tahun|rencana (keberangkatan|berangkat)|kapan (rencana|mau|ingin|berangkat)|kira-?kira kapan/,
  age: /umur|usia/,
  city: /domisili|tinggal di (mana|kota)|dari (kota )?mana|kota mana/,
  before: /(sudah )?pernah (umroh|umrah)|pernah (ke )?(umroh|umrah)/,
  generic: /(?!)/,
};

export function asksAbout(text: string, f: DetectField): boolean {
  const t = text.toLowerCase();
  const k = kindOf(f);
  if (k !== "generic") return ASKS[k].test(t);
  const label = f.label.toLowerCase().trim();
  return label.length >= 4 && t.includes(label) && /\?|berapa|apa|mana|boleh|info|mohon/.test(t);
}

const WORDS: Record<string, number> = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11 };
const GROUPS: Record<string, number> = { sendiri: 1, sendirian: 1, berdua: 2, bertiga: 3, berempat: 4, berlima: 5, berenam: 6, bertujuh: 7 };
const MONTHS: Array<[string, RegExp]> = [
  ["Januari", /\b(januari|jan|january)\b/], ["Februari", /\b(februari|pebruari|feb|february)\b/], ["Maret", /\b(maret|mar|march)\b/], ["April", /\b(april|apr)\b/],
  ["Mei", /\b(mei|may)\b/], ["Juni", /\b(juni|jun|june)\b/], ["Juli", /\b(juli|jul|july)\b/], ["Agustus", /\b(agustus|agu|agt|ags|aug|august)\b/],
  ["September", /\b(september|sept?|sep)\b/], ["Oktober", /\b(oktober|okt|oct|october)\b/], ["November", /\b(november|nopember|nov)\b/], ["Desember", /\b(desember|des|dec|december)\b/],
];

const numberIn = (t: string, unit?: RegExp): number | null => {
  const word = "(\\d{1,3}|" + Object.keys(WORDS).join("|") + ")";
  if (unit) {
    const m = new RegExp(`${word}\\s*(?:${unit.source})`).exec(t);
    return m ? (WORDS[m[1]] ?? Number(m[1])) : null;
  }
  for (const [w, n] of Object.entries(GROUPS)) if (new RegExp(`\\b${w}\\b`).test(t)) return n;
  const m = new RegExp(`\\b${word}\\b`).exec(t);
  return m ? (WORDS[m[1]] ?? Number(m[1])) : null;
};
const yearIn = (t: string, now: Date): number | null => {
  const m = /\b(20[2-4]\d)\b/.exec(t);
  if (m) return Number(m[1]);
  if (/tahun depan/.test(t)) return now.getFullYear() + 1;
  if (/tahun ini/.test(t)) return now.getFullYear();
  return null;
};
const monthIn = (t: string): string | null => MONTHS.find(([, re]) => re.test(t))?.[0] ?? null;
const UNIT: Partial<Record<Kind, RegExp>> = { people: /orang|jamaah|pax|org\b/, adults: /dewasa/, children: /anak/, elderly: /lansia/, infants: /infant|bayi/ };

/** The value of one field inside an answer, in the format the field stores, or null. `asked`: we know this text answers that question. */
export function valueFrom(f: DetectField, answer: string, asked: boolean, now = new Date()): string | null {
  const t = answer.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t || t.length > 300) return null;
  const k = kindOf(f);
  const option = (v: string) => (f.type !== "select" ? v : f.options.find((o) => o.toLowerCase() === v.toLowerCase()) ?? null);

  if (k === "month") { const m = monthIn(t); return m ? option(m) : null; }
  if (k === "year") { const y = asked || monthIn(t) || /tahun/.test(t) ? yearIn(t, now) : null; return y ? option(String(y)) : null; }
  if (k === "people" || k === "adults" || k === "children" || k === "elderly" || k === "infants") {
    let n = numberIn(t, UNIT[k]);
    // A bare number or "berdua" only counts when we asked exactly this.
    if (n === null && asked && t.length <= 40 && !monthIn(t) && !yearIn(t, now)) n = numberIn(t);
    return n !== null && n >= (k === "people" ? 1 : 0) && n <= 200 ? String(n) : null;
  }
  if (k === "age") {
    const m = /(?:umur|usia)\D{0,10}(\d{1,3})/.exec(t) ?? (asked ? /^\D{0,12}(\d{1,3})\s*(tahun|thn|th)?\W*$/.exec(t) : null);
    const n = m ? Number(m[1]) : null;
    return n && n >= 1 && n <= 110 ? String(n) : null;
  }
  if (k === "before") {
    if (!asked && !/(umroh|umrah)/.test(t)) return null;
    if (/\b(belum|blm|blum|tidak|gak|nggak|ga)\b/.test(t)) return null; // the field is a tick box: "not yet" is the empty state
    return /\b(sudah|udah|sdh|pernah|iya|ya)\b/.test(t) ? "1" : null;
  }
  if (k === "city") {
    const m = /(?:domisili(?: saya)?(?: di)?|tinggal di|saya di|saya dari|asal(?: dari)?)\s*:?\s*([\p{L} .'-]{3,40})/u.exec(answer.toLowerCase());
    const raw = m ? m[1] : asked && /^(?:di |dari )?[\p{L} .'-]{3,30}$/u.test(t) && !/^(iya|ya|ok|oke|baik|siap|belum|sudah|halo|hai|terima kasih|makasih)\b/.test(t) ? t.replace(/^(di|dari) /, "") : null;
    if (!raw) return null;
    const city = raw.replace(/\b(kak|ya|min|aja|saja)\b.*$/, "").trim().replace(/(^|[ -])\p{L}/gu, (c) => c.toUpperCase());
    return city.length >= 3 ? option(city) : null;
  }
  if (f.type === "select") return f.options.find((o) => new RegExp(`(^|\\W)${o.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\W)`).test(t)) ?? null;
  if (f.type === "number") { const n = asked && t.length <= 40 ? numberIn(t) : null; return n === null ? null : String(n); }
  if (f.type === "date") {
    const d = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](20\d\d)\b/.exec(t);
    return d && Number(d[2]) <= 12 && Number(d[1]) <= 31 ? `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}` : null;
  }
  if (f.type === "url") return /https?:\/\/\S+/.exec(answer)?.[0] ?? null;
  if (f.type === "text") return asked && answer.trim().length <= 80 && !answer.includes("?") ? answer.trim() : null;
  return null;
}

/** "1. ... 2. ... 3. ..." split into its numbered items, or null when the text is not a numbered list. */
function numbered(text: string): Map<number, string> | null {
  const items = new Map<number, string>();
  for (const line of text.split(/\n+/)) {
    const m = /^\s*(\d{1,2})\s*[.)]\s*(.+)$/.exec(line);
    if (m) items.set(Number(m[1]), m[2].trim());
  }
  return items.size >= 2 ? items : null;
}

const show = (f: DetectField, value: string) => (f.type === "checkbox" ? "Yes" : value);

/**
 * What the recent conversation says about fields that are empty or different. Messages oldest first. Their replies to our question
 * are read for the field we asked about (a numbered answer is matched to our numbered questions); clear statements such as
 * "4 orang, Maret 2027" count even when we did not ask. A later answer replaces an earlier one.
 */
export function detectAnswers(messages: DetectMsg[], fields: DetectField[], current: Record<string, string>, now = new Date()): Suggestion[] {
  const found = new Map<number, Suggestion>();
  const put = (f: DetectField, value: string | null, source: string) => {
    if (value === null) return;
    found.set(f.id, { fieldId: f.id, label: f.label, value, display: show(f, value), source: source.length > 90 ? `${source.slice(0, 90)}…` : source });
  };
  let question = ""; // our latest message
  for (const m of messages.slice(-60)) {
    const body = (m.body ?? "").trim();
    if (!body) continue;
    if (m.from_me) { question = body; continue; }
    const asked = fields.filter((f) => asksAbout(question, f));
    const qList = numbered(question), aList = numbered(body);
    for (const f of fields) {
      if (qList && aList) {
        const n = [...qList].find(([, line]) => asksAbout(line, f))?.[0];
        if (n !== undefined && aList.has(n)) { put(f, valueFrom(f, aList.get(n)!, true, now), aList.get(n)!); continue; }
      }
      const isAsked = asked.includes(f);
      // Unprompted statements are only trusted for the unambiguous kinds.
      const k = kindOf(f);
      if (!isAsked && !["people", "month", "year", "city", "adults", "children", "elderly", "infants"].includes(k)) continue;
      put(f, valueFrom(f, body, isAsked && asked.filter((a) => a.type === f.type).length === 1, now) ?? (isAsked ? valueFrom(f, body, false, now) : null), body);
    }
  }
  return [...found.values()].filter((s) => (current[s.fieldId] ?? "") !== s.value);
}
