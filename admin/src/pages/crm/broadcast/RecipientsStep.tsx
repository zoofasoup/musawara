// Step 1: who gets it. Pick by tag, pipeline stage, owner, custom field or last conversation (a person must match every group
// you use), add people by hand, and skip groups such as opt-outs. The count and a few names update as you click.
import { Callout } from "../../../components/Callout";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { X } from "lucide-react";
import { Segmented } from "../../../components/Segmented";
import { Btn, Panel } from "../../../components/kit";
import { fmtNum } from "../../../lib/format";
import { Field, fmtPhone } from "../data/shared";
import { NONE, hasSelection, type Contact, type FieldRule, type Rules } from "./audience";
import type { AudienceData } from "./useAudienceData";
import { Chip } from "./Chip";

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink2">{title}</p>
      {hint && <p className="mb-1.5 text-xs text-muted">{hint}</p>}
      <div className="mt-1.5 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function RecipientsStep({ data, rules, setRules, numbers, setNumbers, name, setName, picked, extraCount, invalid }: {
  data: AudienceData; rules: Rules; setRules: (r: Rules) => void; numbers: string; setNumbers: (v: string) => void;
  name: string; setName: (v: string) => void; picked: Contact[]; extraCount: number; invalid: string[];
}) {
  const set = (patch: Partial<Rules>) => setRules({ ...rules, ...patch });
  const usable = data.fields.filter((f) => !rules.fields.some((r) => r.fieldId === f.id));
  const patchField = (i: number, patch: Partial<FieldRule>) => set({ fields: rules.fields.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const total = picked.length + extraCount;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-4">
        <Field label="Broadcast name" hint="Only for you, recipients never see it.">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Promo 11.11" autoComplete="off" />
        </Field>

        <Group title="Start from" hint="Nothing is sent to anyone you do not select.">
          <Chip on={rules.everyone} onClick={() => set({ everyone: !rules.everyone })} count={data.contacts.length}>Everyone in this number</Chip>
        </Group>

        {data.tags.length > 0 && (
          <Group title="Has any of these tags">
            {data.tags.map((t) => <Chip key={t.tag} on={rules.tags.includes(t.tag)} count={t.count} onClick={() => set({ tags: toggle(rules.tags, t.tag) })}>{t.tag}</Chip>)}
          </Group>
        )}

        {data.stages.length > 0 && (
          <Group title="Pipeline stage is" hint="Where the card is on the board.">
            {data.stages.map((s) => <Chip key={s.id} on={rules.stages.includes(s.id)} onClick={() => set({ stages: toggle(rules.stages, s.id) })}>{s.name}</Chip>)}
            <Chip on={rules.stages.includes(NONE)} onClick={() => set({ stages: toggle(rules.stages, NONE) })}>Not on the board</Chip>
          </Group>
        )}

        {data.owners.length > 0 && (
          <Group title="Owner is">
            {data.owners.map((o) => <Chip key={o.id} on={rules.owners.includes(o.id)} onClick={() => set({ owners: toggle(rules.owners, o.id) })}>{o.name}</Chip>)}
            <Chip on={rules.owners.includes(NONE)} onClick={() => set({ owners: toggle(rules.owners, NONE) })}>Nobody</Chip>
          </Group>
        )}

        {data.fields.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink2">Custom fields</p>
            {rules.fields.map((r, i) => {
              const f = data.fields.find((x) => x.id === r.fieldId)!;
              return (
                <div key={r.fieldId} className="rounded-2xl bg-surface2/60 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{f.label}</span>
                    <Btn tone="ghost" size="sm" aria-label={`Remove the ${f.label} filter`} onClick={() => set({ fields: rules.fields.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Btn>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {f.type === "select" ? (
                      f.options.map((o) => <Chip key={o} on={r.mode === "in" && r.values.includes(o)} onClick={() => patchField(i, { mode: "in", values: r.mode === "in" ? toggle(r.values, o) : [o] })}>{o}</Chip>)
                    ) : null}
                    <Chip on={r.mode === "filled"} onClick={() => patchField(i, { mode: "filled", values: [] })}>Has a value</Chip>
                    <Chip on={r.mode === "empty"} onClick={() => patchField(i, { mode: "empty", values: [] })}>Is empty</Chip>
                  </div>
                  {r.mode === "in" && r.values.length === 0 && <p className="mt-1 text-xs text-warn">Pick at least one option, or this filter matches nobody.</p>}
                </div>
              );
            })}
            {usable.length > 0 && (
              <NativeSelect aria-label="Add a field filter" className="w-full sm:w-72" value="" onChange={(e) => {
                const f = data.fields.find((x) => String(x.id) === e.target.value);
                if (f) set({ fields: [...rules.fields, { fieldId: f.id, mode: f.type === "select" ? "in" : "filled", values: [] }] });
              }}>
                <option value="">Add a field filter…</option>
                {usable.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </NativeSelect>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-ink2">Last conversation with us</p>
          <Segmented label="Last conversation" value={rules.chat} onChange={(v) => set({ chat: v })} options={[{ value: "any", label: "Anyone" }, { value: "never", label: "Never chatted" }, { value: "within", label: "Chatted within" }]} />
          {rules.chat === "within" && (
            <NativeSelect aria-label="Within how many days" size="sm" value={String(rules.chatDays)} onChange={(e) => set({ chatDays: Number(e.target.value) })}>
              {[7, 14, 30, 90, 180].map((d) => <option key={d} value={d}>the last {d} days</option>)}
            </NativeSelect>
          )}
        </div>

        {data.tags.length > 0 && (
          <Group title="Never send to these tags" hint="For example opt-outs or people who already bought. This wins over every other choice.">
            {data.tags.map((t) => <Chip key={t.tag} on={rules.excludeTags.includes(t.tag)} count={t.count} onClick={() => set({ excludeTags: toggle(rules.excludeTags, t.tag) })}>{t.tag}</Chip>)}
          </Group>
        )}

        {rules.chosen.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface2 px-3 py-2 text-xs text-ink2">
            {fmtNum(rules.chosen.length)} contacts chosen on the Contacts page are included
            <Btn tone="ghost" onClick={() => set({ chosen: [] })}>Remove them</Btn>
          </div>
        )}

        <Field label="Extra numbers (optional)" hint='One per line, or "number, name". Numbers are cleaned the same way as contacts.'>
          <Textarea value={numbers} onChange={(e) => setNumbers(e.target.value)} rows={3} className="py-2" placeholder={"081234567890, Budi\n6285711112222"} />
        </Field>
      </div>

      <aside className="lg:sticky lg:top-2 lg:self-start">
        <Panel className="space-y-2 p-4" aria-live="polite">
          <p className="text-xs font-medium text-muted">Matches right now</p>
          <p className="text-3xl font-semibold text-ink tnum">{fmtNum(total)}</p>
          <p className="text-xs text-ink2">{total === 1 ? "person" : "people"}, duplicates removed.</p>
          {!hasSelection(rules) && !numbers.trim() && <p className="text-xs text-muted">Pick a tag, stage or another group on the left, or choose "Everyone".</p>}
          {data.loading && <p className="text-xs text-muted">Loading contacts…</p>}
          {!data.pipelineReady && <p className="text-xs text-muted">Stage, owner and field filters appear once the pipeline loads.</p>}
          {picked.length > 0 && (
            <ul className="divide-y divide-border text-xs">
              {picked.slice(0, 6).map((c) => <li key={c.id} className="flex justify-between gap-2 py-1.5"><span className="truncate text-ink">{c.name || "No name"}</span><span className="tnum shrink-0 text-muted">{fmtPhone(c.phone)}</span></li>)}
              {picked.length > 6 && <li className="py-1.5 text-muted">and {fmtNum(picked.length - 6)} more</li>}
            </ul>
          )}
          {invalid.length > 0 && <Callout tone="warn" compact>{fmtNum(invalid.length)} typed lines are not valid numbers and will be skipped.</Callout>}
        </Panel>
      </aside>
    </div>
  );
}
