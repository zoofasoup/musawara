// Who a broadcast goes to and what each person sees, worked out in the browser from data the CRM already has (contacts and their
// tags from the gateway; stage, owner and custom fields from the pipeline; the last conversation from the inbox list). Pure, so it
// is tested without a browser. The gateway only receives the final contact ids plus the named values the message uses.

export type Contact = { id: number; phone: string; name: string; tags: string[] };
export type StageRef = { id: number; name: string };
export type FieldRef = { id: number; label: string; type: "text" | "number" | "date" | "select" | "checkbox" | "url"; options: string[] };

export const NONE = "none"; // "not on the board" for stages, "nobody" for owners

export type FieldRule = { fieldId: number; mode: "in" | "filled" | "empty"; values: string[] };
export type Rules = {
  everyone: boolean;                 // start from all contacts instead of from the filters
  tags: string[];                    // has any of these tags
  stages: Array<number | typeof NONE>;
  owners: Array<number | typeof NONE>;
  fields: FieldRule[];               // every rule must hold
  chat: "any" | "never" | "within"; // last conversation with us
  chatDays: number;
  excludeTags: string[];             // never send to these (opt-outs, already customers…)
  chosen: number[];                  // contact ids picked on the Contacts page: always included
};
export const emptyRules = (chosen: number[] = []): Rules => ({ everyone: false, tags: [], stages: [], owners: [], fields: [], chat: "any", chatDays: 30, excludeTags: [], chosen });

export type Ctx = {
  stageOf: (phone: string) => number | undefined;
  ownerOf: (phone: string) => number | null | undefined; // undefined = not on the board
  valuesOf: (phone: string) => Record<string, string> | undefined;
  lastChatTs: (phone: string) => number | undefined;    // unix seconds of the latest message either way
  now: number;                                          // unix seconds
};

/** True when the rules select anyone by themselves (so an empty form never means "everybody"). */
export const hasSelection = (r: Rules) => r.everyone || r.tags.length > 0 || r.stages.length > 0 || r.owners.length > 0 || r.fields.length > 0 || r.chat !== "any" || r.chosen.length > 0;

function matchesField(rule: FieldRule, values: Record<string, string> | undefined): boolean {
  const v = (values?.[rule.fieldId] ?? "").trim();
  if (rule.mode === "filled") return v !== "";
  if (rule.mode === "empty") return v === "";
  return rule.values.includes(v);
}

/** Contacts matching every filter category that is set (a person must satisfy all of them), plus the chosen ones, minus excluded tags. */
export function pickAudience(contacts: Contact[], r: Rules, ctx: Ctx): Contact[] {
  const filtered = r.tags.length > 0 || r.stages.length > 0 || r.owners.length > 0 || r.fields.length > 0 || r.chat !== "any";
  const chosen = new Set(r.chosen);
  const out: Contact[] = [];
  for (const c of contacts) {
    if (r.excludeTags.length && c.tags.some((t) => r.excludeTags.includes(t))) continue;
    let ok = chosen.has(c.id);
    if (!ok && (r.everyone || filtered)) {
      ok = true;
      if (r.tags.length && !c.tags.some((t) => r.tags.includes(t))) ok = false;
      if (ok && r.stages.length) { const s = ctx.stageOf(c.phone); ok = r.stages.includes(s === undefined ? NONE : s); }
      if (ok && r.owners.length) { const o = ctx.ownerOf(c.phone); ok = r.owners.includes(o == null ? NONE : o); }
      if (ok && r.fields.length) ok = r.fields.every((f) => matchesField(f, ctx.valuesOf(c.phone)));
      if (ok && r.chat !== "any") {
        const ts = ctx.lastChatTs(c.phone);
        ok = r.chat === "never" ? ts === undefined : ts !== undefined && ctx.now - ts <= r.chatDays * 86400;
      }
    }
    if (ok) out.push(c);
  }
  return out;
}

// ------------------------------------------------------------------ placeholders

export type Variable = { token: string; label: string; hint: string; fieldId?: number; builtin?: "nama" | "nomor" | "stage" | "owner" };

/** The lower-case token of a field label: "Paket Umroh" becomes paket_umroh. */
export const slug = (label: string) => label.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

export function variablesFor(fields: FieldRef[]): Variable[] {
  const list: Variable[] = [
    { token: "nama", label: "Name", hint: "Contact name (\"Kak\" when empty)", builtin: "nama" },
    { token: "nomor", label: "Number", hint: "Phone number with country code", builtin: "nomor" },
    { token: "stage", label: "Stage", hint: "Stage on the pipeline", builtin: "stage" },
    { token: "owner", label: "Owner", hint: "Team member who owns the contact", builtin: "owner" },
  ];
  const used = new Set(list.map((v) => v.token));
  for (const f of fields) {
    const token = slug(f.label);
    if (!token || used.has(token)) continue;
    used.add(token);
    list.push({ token, label: f.label, hint: `Saved in the "${f.label}" field`, fieldId: f.id });
  }
  return list;
}

const TOKEN = /\{\s*([^{}|]+?)\s*\}/g;
/** Every {word} in a message that is not a spintax group, lower-cased and de-duplicated, in order of appearance. */
export function tokensIn(template: string): string[] {
  const seen: string[] = [];
  for (const m of template.matchAll(TOKEN)) { const k = m[1].toLowerCase(); if (!seen.includes(k)) seen.push(k); }
  return seen;
}
const ALIAS: Record<string, string> = { name: "nama", phone: "nomor" };
export const canonical = (token: string) => ALIAS[token] ?? token;

/** Tokens used in the message that no known placeholder answers (typos): they would reach people as typed. */
export function unknownTokens(template: string, vars: Variable[]): string[] {
  const known = new Set(vars.map((v) => v.token));
  return tokensIn(template).filter((t) => !known.has(canonical(t)));
}

/** What one person's values are for the named placeholders (everything except nama and nomor, which the gateway fills itself). */
export function valuesForPerson(vars: Variable[], person: { phone: string }, ctx: { stageName: (phone: string) => string; ownerName: (phone: string) => string; fieldValue: (phone: string, fieldId: number) => string }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of vars) {
    if (v.builtin === "stage") out[v.token] = ctx.stageName(person.phone);
    else if (v.builtin === "owner") out[v.token] = ctx.ownerName(person.phone);
    else if (v.fieldId !== undefined) out[v.token] = ctx.fieldValue(person.phone, v.fieldId);
  }
  return out;
}

/** Same as the gateway's renderTemplate (spintax is random there, so previews may differ in those choices). */
export function renderMessage(template: string, who: { name?: string; phone?: string; vars?: Record<string, string> }, pick: (n: number) => number = (n) => Math.floor(Math.random() * n)): string {
  const own = who.vars ?? {};
  let out = String(template ?? "").replace(TOKEN, (whole, key: string) => {
    const k = key.toLowerCase();
    if (k === "nama" || k === "name") return (who.name || "").trim() || "Kak";
    if (k === "nomor" || k === "phone") return who.phone || "";
    if (Object.hasOwn(own, k)) return String(own[k] ?? "").replace(/[{}|]/g, " ").trim();
    return whole;
  });
  const spin = /\{([^{}]*\|[^{}]*)\}/;
  while (spin.test(out)) out = out.replace(spin, (_, body: string) => { const o = body.split("|"); return o[pick(o.length)]; });
  return out;
}

/** For each named placeholder in the message: how many of these people have nothing to put there. */
export function emptyCounts(template: string, vars: Variable[], people: Array<{ phone: string; name: string }>, valuesOf: (phone: string) => Record<string, string>): Array<{ token: string; label: string; missing: number }> {
  const used = new Set(tokensIn(template).map(canonical));
  const out: Array<{ token: string; label: string; missing: number }> = [];
  for (const v of vars) {
    if (!used.has(v.token) || v.builtin === "nomor" || v.builtin === "nama") continue;
    const missing = people.filter((p) => !(valuesOf(p.phone)[v.token] ?? "").trim()).length;
    out.push({ token: v.token, label: v.label, missing });
  }
  return out;
}

// ------------------------------------------------------------------ builder helpers

/** What the audience really is: in "Everyone" mode the include filters are ignored (but kept in the form), exclusions and chosen contacts still apply. */
export function effectiveRules(r: Rules): Rules {
  return r.everyone ? { ...emptyRules(r.chosen), everyone: true, excludeTags: r.excludeTags } : { ...r, everyone: false };
}

export type RulePart = { kind: "tag" | "stage" | "owner" | "chat" | "field"; label: string; values: string[] };
export type Names = { stage: (id: number | typeof NONE) => string; owner: (id: number | typeof NONE) => string; field: (id: number) => string };

/** The include filters of a rule set as readable parts (for the one-sentence summary), plus excluded tags and chosen contacts. */
export function describeRules(r: Rules, n: Names): { everyone: boolean; include: RulePart[]; exclude: string[]; chosen: number } {
  const e = effectiveRules(r);
  const include: RulePart[] = [];
  if (e.tags.length) include.push({ kind: "tag", label: "tag", values: e.tags });
  if (e.stages.length) include.push({ kind: "stage", label: "stage", values: e.stages.map(n.stage) });
  if (e.owners.length) include.push({ kind: "owner", label: "owner", values: e.owners.map(n.owner) });
  for (const f of e.fields) include.push({ kind: "field", label: n.field(f.fieldId), values: f.mode === "in" ? f.values : [f.mode === "filled" ? "has a value" : "is empty"] });
  if (e.chat === "never") include.push({ kind: "chat", label: "conversation", values: ["never chatted"] });
  if (e.chat === "within") include.push({ kind: "chat", label: "conversation", values: [`chatted in the last ${e.chatDays} days`] });
  return { everyone: e.everyone, include, exclude: e.excludeTags, chosen: e.chosen.length };
}

/** The `{word` being typed right before the caret (for placeholder suggestions), or null when the caret is not inside one. */
export function tokenAtCaret(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const open = before.lastIndexOf("{");
  if (open < 0) return null;
  const typed = before.slice(open + 1);
  return /^[A-Za-z0-9_]{0,40}$/.test(typed) ? { start: open, query: typed.toLowerCase() } : null;
}

/** Placeholders matching what was typed: the ones whose token starts with it first, then those whose label contains it. */
export function suggestVars(vars: Variable[], q: string): Variable[] {
  const s = q.toLowerCase();
  if (!s) return vars;
  return [...vars.filter((v) => v.token.startsWith(s)), ...vars.filter((v) => !v.token.startsWith(s) && (v.token.includes(s) || v.label.toLowerCase().includes(s)))];
}

export type VarGroup = "Contact" | "Pipeline" | "Custom fields";
export const varGroup = (v: Variable): VarGroup => (v.builtin === "nama" || v.builtin === "nomor" ? "Contact" : v.builtin ? "Pipeline" : "Custom fields");
