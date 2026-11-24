// Edit the pipeline for this number: stages (name, colour, type, order, removal) and custom contact fields.
import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Segmented } from "../../../components/Segmented";
import { Btn, Sheet, type Notify } from "../../../components/kit";
import { Callout } from "../../../components/Callout";
import { Field } from "../data/shared";
import { FIELD_TYPE_LABEL, STAGE_BAR, STAGE_COLORS, type FieldDef, type Lead, type FieldType, type Stage, type StageKind } from "./api";

type Call = <T = any>(method: string, sub: string, body?: unknown) => Promise<T>;
const KIND_LABEL: Record<StageKind, string> = { open: "In progress", won: "Won", lost: "Lost" };

function move<T extends { id: number }>(list: T[], id: number, by: -1 | 1): number[] {
  const ids = list.map((x) => x.id);
  const i = ids.indexOf(id), j = i + by;
  if (j < 0 || j >= ids.length) return ids;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

function Stages({ stages, leads, call, done, notify }: { stages: Stage[]; leads: Lead[]; call: Call; done: () => void; notify: Notify }) {
  const [name, setName] = useState("");
  const [removing, setRemoving] = useState<{ stage: Stage; cards: number } | null>(null);
  const [target, setTarget] = useState("");
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); done(); } catch (e: any) { notify(e.message, "err"); } };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Cards move left to right. "Won" and "Lost" stages close a deal: they are not counted as open value.</p>
      <ul className="space-y-2">
        {stages.map((s, i) => (
          <li key={s.id} className="rounded-2xl bg-surface p-2.5 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-2">
              <span className={`h-6 w-1.5 shrink-0 rounded-full ${STAGE_BAR[s.color]}`} aria-hidden />
              <Input aria-label={`Name of stage ${s.name}`} defaultValue={s.name} maxLength={40} className="min-w-0 flex-1"
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.name) void run(() => call("PATCH", `/stages/${s.id}`, { name: v })); else e.target.value = s.name; }} />
              <Btn tone="ghost" size="sm" aria-label="Move up" disabled={i === 0} onClick={() => run(() => call("POST", "/stages/reorder", { ids: move(stages, s.id, -1) }))}><ArrowUp className="h-4 w-4" /></Btn>
              <Btn tone="ghost" size="sm" aria-label="Move down" disabled={i === stages.length - 1} onClick={() => run(() => call("POST", "/stages/reorder", { ids: move(stages, s.id, 1) }))}><ArrowDown className="h-4 w-4" /></Btn>
              <Btn tone="ghost" size="sm" aria-label={`Remove stage ${s.name}`} onClick={() => {
                const cards = leads.filter((l) => l.stage_id === s.id).length;
                if (cards > 0) { setRemoving({ stage: s, cards }); setTarget(""); } else void run(() => call("DELETE", `/stages/${s.id}`));
              }}><Trash2 className="h-4 w-4 text-crit" /></Btn>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 pl-3.5">
              <NativeSelect size="sm" aria-label="Colour" value={s.color} onChange={(e) => run(() => call("PATCH", `/stages/${s.id}`, { color: e.target.value }))}>
                {STAGE_COLORS.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
              </NativeSelect>
              <NativeSelect size="sm" aria-label="Stage type" value={s.kind} onChange={(e) => run(() => call("PATCH", `/stages/${s.id}`, { kind: e.target.value }))}>
                {(Object.keys(KIND_LABEL) as StageKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </NativeSelect>
            </div>
          </li>
        ))}
      </ul>
      {removing && (
        <Callout tone="warn" title={`"${removing.stage.name}" still has ${removing.cards} card(s)`}>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <NativeSelect size="sm" aria-label="Move cards to" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Move them to…</option>
              {stages.filter((s) => s.id !== removing.stage.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </NativeSelect>
            <Btn tone="danger" size="sm" disabled={!target} onClick={() => run(async () => { await call("DELETE", `/stages/${removing.stage.id}?move_to=${target}`); setRemoving(null); })}>Move and remove</Btn>
            <Btn tone="ghost" size="sm" onClick={() => setRemoving(null)}>Cancel</Btn>
          </div>
        </Callout>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (n) void run(async () => { await call("POST", "/stages", { name: n }); setName(""); }); }}>
        <Input aria-label="New stage name" placeholder="New stage, e.g. Visa check" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="min-w-0 flex-1" />
        <Btn type="submit" tone="primary" icon="plus" disabled={!name.trim()}>Add</Btn>
      </form>
    </div>
  );
}

function Fields({ fields, call, done, notify }: { fields: FieldDef[]; call: Call; done: () => void; notify: Notify }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [options, setOptions] = useState("");
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); done(); } catch (e: any) { notify(e.message, "err"); } };
  const opts = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Extra details you keep on every contact of this number, for example package, departure month, or budget. They show on the card and in the contact form.</p>
      <ul className="space-y-2">
        {fields.map((f, i) => (
          <li key={f.id} className="rounded-2xl bg-surface p-2.5 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-2">
              <Input aria-label={`Name of field ${f.label}`} defaultValue={f.label} maxLength={40} className="min-w-0 flex-1"
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== f.label) void run(() => call("PATCH", `/fields/${f.id}`, { label: v })); else e.target.value = f.label; }} />
              <span className="shrink-0 rounded-lg bg-surface3 px-2 py-1 text-xs text-ink2">{FIELD_TYPE_LABEL[f.type]}</span>
              <Btn tone="ghost" size="sm" aria-label="Move up" disabled={i === 0} onClick={() => run(() => call("POST", "/fields/reorder", { ids: move(fields, f.id, -1) }))}><ArrowUp className="h-4 w-4" /></Btn>
              <Btn tone="ghost" size="sm" aria-label="Move down" disabled={i === fields.length - 1} onClick={() => run(() => call("POST", "/fields/reorder", { ids: move(fields, f.id, 1) }))}><ArrowDown className="h-4 w-4" /></Btn>
              <Btn tone="ghost" size="sm" aria-label={`Remove field ${f.label}`} onClick={() => { if (window.confirm(`Remove "${f.label}" and everything saved in it?`)) void run(() => call("DELETE", `/fields/${f.id}`)); }}><Trash2 className="h-4 w-4 text-crit" /></Btn>
            </div>
            {f.type === "select" && (
              <Input aria-label={`Options of ${f.label}`} className="mt-2" defaultValue={f.options.join(", ")} placeholder="Options, separated by commas"
                onBlur={(e) => { const o = opts(e.target.value); if (o.length && o.join("|") !== f.options.join("|")) void run(() => call("PATCH", `/fields/${f.id}`, { options: o })); }} />
            )}
          </li>
        ))}
        {fields.length === 0 && <li className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">No fields yet.</li>}
      </ul>
      <form className="space-y-2 rounded-2xl bg-surface2/60 p-3" onSubmit={(e) => {
        e.preventDefault();
        const l = label.trim();
        if (l) void run(async () => { await call("POST", "/fields", { label: l, type, ...(type === "select" ? { options: opts(options) } : {}) }); setLabel(""); setOptions(""); });
      }}>
        <Field label="New field"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Departure month" maxLength={40} /></Field>
        <NativeSelect aria-label="Field type" className="w-full" value={type} onChange={(e) => setType(e.target.value as FieldType)}>
          {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
        </NativeSelect>
        {type === "select" && <Input aria-label="Options" value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Options, separated by commas" />}
        <Btn type="submit" tone="primary" icon="plus" disabled={!label.trim() || (type === "select" && opts(options).length === 0)}>Add field</Btn>
      </form>
    </div>
  );
}

export function CustomizeSheet({ stages, leads, fields, call, onChanged, onClose, notify }: { stages: Stage[]; leads: Lead[]; fields: FieldDef[]; call: Call; onChanged: () => void; onClose: () => void; notify: Notify }) {
  const [tab, setTab] = useState<"stages" | "fields">("stages");
  return (
    <Sheet title="Customize pipeline" onClose={onClose}>
      <div className="space-y-4">
        <Segmented label="Section" value={tab} onChange={setTab} fill options={[{ value: "stages", label: "Stages" }, { value: "fields", label: "Fields" }]} />
        {tab === "stages" ? <Stages stages={stages} leads={leads} call={call} done={onChanged} notify={notify} /> : <Fields fields={fields} call={call} done={onChanged} notify={notify} />}
      </div>
    </Sheet>
  );
}
